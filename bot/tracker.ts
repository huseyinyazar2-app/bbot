import WebSocket from 'ws';
import { StateDB, Position } from './database';
import { CONFIG } from './config';
import { getCurrentPrices, executeOrder, formatQuantity } from './binance';

export function getTimeframeMs(timeframe: string): number {
  const num = parseInt(timeframe);
  const unit = timeframe.replace(num.toString(), '');
  switch (unit) {
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    case 'w': return num * 7 * 24 * 60 * 60 * 1000;
    default: return num * 60 * 1000;
  }
}

export class TrackerEngine {
  private ws: WebSocket | null = null;
  private activeStreams: Set<string> = new Set();
  private realtimePrices: Map<string, number> = new Map();
  private processingPositions: Set<string> = new Set();
  
  constructor() {
    // Sync realtime prices to DB every 2 seconds for the frontend API
    setInterval(() => {
      if (this.realtimePrices.size > 0) {
        StateDB.setRealtimePrices(Object.fromEntries(this.realtimePrices));
      }
    }, 2000);
  }
  
  // Basic mock execute - replace with actual Binance Trade API
  private async executeSell(pos: Position, reason: string, currentPrice: number) {
    if (this.processingPositions.has(pos.id)) return;
    this.processingPositions.add(pos.id);
    try {
      console.log(`[TRACKER] 🚀 SELLING ${pos.symbol} @ ${currentPrice} | Reason: ${reason} | Strategy: ${pos.strategy}`);
      await executeOrder(pos.symbol, 'SELL', pos.quantity);
      
      // Calculate PNL
      const settings = StateDB.getSettings();
      const buyFeeRate = settings?.buyFeeRate !== undefined ? settings.buyFeeRate : 0.001;
      const sellFeeRate = settings?.sellFeeRate !== undefined ? settings.sellFeeRate : 0.001;
      const buyFee = pos.entryPrice * pos.quantity * buyFeeRate;
      const sellFee = currentPrice * pos.quantity * sellFeeRate;
      const fee = buyFee + sellFee; // Round-trip komisyon
      const initialCost = pos.entryPrice * pos.quantity;
      const revenue = currentPrice * pos.quantity;
      const remainingPnl = revenue - initialCost - fee;
      const totalPnl = (pos.realized_pnl || 0) + remainingPnl;
      
      console.log(`[TRACKER] 💰 NET PNL: ${totalPnl.toFixed(4)} ${CONFIG.QUOTE_ASSET} (Realized: ${(pos.realized_pnl || 0).toFixed(4)}, Remaining: ${remainingPnl.toFixed(4)})`);

      StateDB.closePosition(pos.id, currentPrice, totalPnl, reason);
      this.syncStreams(); // Refresh streams if active positions changed
      
      // Add to Blacklist if it was a SL or Time SL (loss)
      if (reason.includes('-SL') || reason.includes('Time Stop')) {
        const waitTime = CONFIG.BLACKLIST_CANDLES * getTimeframeMs(CONFIG.SCAN_TIMEFRAME);
        StateDB.addToBlacklist(pos.symbol, Date.now() + waitTime);
        console.log(`[TRACKER] 🛑 ${pos.symbol} Blacklisted for ${CONFIG.BLACKLIST_CANDLES} candles.`);
      }
    } catch (e) {
      console.error(`[TRACKER] Sell failed for ${pos.symbol}:`, e);
    } finally {
      this.processingPositions.delete(pos.id);
    }
  }

  public syncStreams() {
    const openPos = StateDB.getOpenPositions();
    const watchlist = StateDB.getWatchlist();
    const top50 = StateDB.getTopCoins();

    const symbols = new Set([
      ...openPos.map(p => p.symbol.toLowerCase()),
      ...watchlist.map(w => (w as any).symbol.toLowerCase()),
      ...top50.map((t: any) => t.symbol.toLowerCase())
    ]);

    const neededStreams = new Set([...symbols].map(s => `${s}@kline_${CONFIG.SCAN_TIMEFRAME}`));
    
    // If exact same streams, do nothing
    let isSame = neededStreams.size === this.activeStreams.size && 
                 [...neededStreams].every(x => this.activeStreams.has(x));
    
    if (isSame) return; // No change

    this.activeStreams = neededStreams;
    this.reconnect();
  }

  private reconnect() {
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }

    if (this.activeStreams.size === 0) {
      console.log('[TRACKER] No active positions to track.');
      return;
    }

    const streamsPath = [...this.activeStreams].join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streamsPath}`;
    
    console.log(`[TRACKER] Connecting to WS: ${url}`);
    
    try {
      this.ws = new WebSocket(url);
      StateDB.setSystemStatus('WS', 'CONNECTING');
      this.ws.on('open', () => {
        console.log('[TRACKER] WS Connected. Tracking positions...');
        StateDB.setSystemStatus('WS', 'CONNECTED');
      });
      this.ws.on('message', (data: WebSocket.Data) => this.handleMessage(data));
      this.ws.on('close', async () => {
        StateDB.setSystemStatus('WS', 'DISCONNECTED');
        console.log('[TRACKER] WS Disconnected. Running REST fallback check...');
        const symbols = StateDB.getOpenPositions().map(p => p.symbol);
        if (symbols.length > 0) {
          const prices = await getCurrentPrices(symbols);
          for (const [symbol, price] of prices.entries()) {
            await this.evaluatePosition(symbol, price, false, { o: price, T: Date.now() }); 
          }
        }
        setTimeout(() => this.reconnect(), 2000);
      });
      this.ws.on('error', (err) => {
        console.error('[TRACKER] WS Error:', err.message);
        StateDB.setSystemStatus('WS', 'ERROR');
      });
    } catch(e) {
      console.error('[TRACKER] Failed to create WS:', e);
      StateDB.setSystemStatus('WS', 'ERROR');
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  private async handleMessage(data: WebSocket.Data) {
    try {
      const msg = JSON.parse(data.toString());
      if (!msg.data || !msg.data.k) return;
      
      const kline = msg.data.k;
      const symbol = kline.s; // e.g. BTCUSDT
      const closePrice = parseFloat(kline.c);
      const isClosed = kline.x; // true if candle is closed
      
      this.realtimePrices.set(symbol, closePrice);

      await this.evaluatePosition(symbol, closePrice, isClosed, kline);
    } catch (e) {
      // Ignored
    }
  }

  private async evaluatePosition(symbol: string, currentPrice: number, isClosed: boolean, kline: any) {
    const positions = StateDB.getOpenPositions().filter(p => p.symbol === symbol);
    if (positions.length === 0) return;

    const timeframeMs = getTimeframeMs(CONFIG.SCAN_TIMEFRAME);

    for (const pos of positions) {
      if (this.processingPositions.has(pos.id)) {
        continue;
      }
      // 1. HARD STOP LOSS (Instant Check)
      if (currentPrice <= pos.sl_price) {
        this.executeSell(pos, 'Fixed-SL', currentPrice);
        continue;
      }

      // 2. TRAILING STOP LOSS (Instant Check)
      if (pos.trailing_activated === 1 && currentPrice <= pos.trailing_price) {
        this.executeSell(pos, 'Trailing-SL', currentPrice);
        continue;
      }

      // 3. STRATEGY SPECIFIC LOGIC (TP or Adjust Trailing)
      if (pos.strategy.startsWith('STRAT_1') || pos.strategy.startsWith('STRAT_4')) {
        const pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice;
        
        // Target 1: Net +2.0%
        if (pos.trailing_activated === 0 && pnlPct >= 0.022) { // 2.2% covers 0.2% fee to get 2.0% net
          if (this.processingPositions.has(pos.id)) continue;
          this.processingPositions.add(pos.id);
          console.log(`[TRACKER] ${pos.symbol} +2.0% Reached. Selling 50% & Activating Trailing.`);
          
          try {
            const settings = StateDB.getSettings();
            const buyFeeRate = settings?.buyFeeRate !== undefined ? settings.buyFeeRate : 0.001;
            const sellFeeRate = settings?.sellFeeRate !== undefined ? settings.sellFeeRate : 0.001;
            const soldQty = formatQuantity(pos.symbol, pos.quantity / 2);
            const buyFee = pos.entryPrice * soldQty * buyFeeRate;
            const sellFee = currentPrice * soldQty * sellFeeRate;
            const fee = buyFee + sellFee;
            const initialCost = pos.entryPrice * soldQty;
            const revenue = currentPrice * soldQty;
            const partialPnl = revenue - initialCost - fee;

            await executeOrder(pos.symbol, 'SELL', soldQty);

            StateDB.updatePosition(pos.id, { 
              quantity: soldQty,
              trailing_activated: 1,
              sl_price: pos.entryPrice, // Breakeven
              trailing_price: currentPrice * (1 - 0.010), // 1.0% trailing distance
              realized_pnl: (pos.realized_pnl || 0) + partialPnl
            });
          } catch (err) {
            console.error(`[TRACKER] Failed target-1 partial sell for ${pos.symbol}:`, err);
          } finally {
            this.processingPositions.delete(pos.id);
          }
          continue;
        }

        // Trailing Update (if activated)
        if (pos.trailing_activated === 1) {
          const newTrailPrice = currentPrice * (1 - 0.010); // 1.0% trailing distance
          if (newTrailPrice > pos.trailing_price) {
            StateDB.updatePosition(pos.id, { trailing_price: newTrailPrice });
          }
        }

        // TIME STOP: 15 candles (75 mins) and not +0.5% profit
        // Check if candle just closed
        if (isClosed) {
          const passedMs = kline.T - pos.entry_candle_time;
          const candlesPassed = Math.round(passedMs / timeframeMs);
          if (candlesPassed >= 15 && pnlPct < 0.005) {
            this.executeSell(pos, 'Time Stop (15 candles, no +0.5%)', currentPrice);
            continue;
          }
          // Cancel: Engulfing red (Strict technical check vs entry close)
          const kOpen = parseFloat(kline.o || '0');
          if (kOpen >= pos.entryPrice && currentPrice < pos.entryPrice && (kOpen - currentPrice) / kOpen > 0.005) {
               this.executeSell(pos, 'Cancel: Engulfing Red', currentPrice);
               continue;
          }
        }
      }

      if (pos.strategy.startsWith('STRAT_2')) {
        const pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice;
        if (pnlPct >= 0.022) { // +2.0% Net
          this.executeSell(pos, 'TP +2.0% Net', currentPrice);
          continue;
        }

        if (isClosed) {
          const passedMs = kline.T - pos.entry_candle_time;
          const candlesPassed = Math.round(passedMs / timeframeMs);
          // 25 mum (125 dk) sonra %0.5 kâr yoksa çık — düzeltme geri dönmedi
          if (candlesPassed >= 25 && pnlPct < 0.005) {
            this.executeSell(pos, 'Time Stop (25 candles, no +0.5%)', currentPrice);
            continue;
          }
        }
      }

      if (pos.strategy.startsWith('STRAT_5')) {
        const pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice;
        if (pnlPct >= 0.025) { // +2.3% Net
          this.executeSell(pos, 'TP +2.3% Net', currentPrice);
          continue;
        }
        
        if (isClosed) {
          const passedMs = kline.T - pos.entry_candle_time;
          const candlesPassed = Math.round(passedMs / timeframeMs);
          if (candlesPassed >= 10) {
            this.executeSell(pos, 'Time Stop (10 candles)', currentPrice);
            continue;
          }
        }
      }

      if (pos.strategy.startsWith('STRAT_3')) {
        const pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice;

        // TP: BB Middle hedefine ulaştı
        if (pos.tp_price && currentPrice >= pos.tp_price) {
          this.executeSell(pos, 'TP BB-Middle', currentPrice);
          continue;
        }

        // Fallback TP: %1.8 net kâr
        if (pnlPct >= 0.020) {
          this.executeSell(pos, 'TP +1.8% Net', currentPrice);
          continue;
        }

        if (isClosed) {
          const passedMs = kline.T - pos.entry_candle_time;
          const candlesPassed = Math.round(passedMs / timeframeMs);
          if (candlesPassed >= 30) {
            this.executeSell(pos, 'Breakeven Time Stop (30 candles)', currentPrice);
            continue;
          }
        }
      }

      // -- OPUS_VWAP: Bounce Scalper Çıkış --
      if (pos.strategy.startsWith('OPUS_VWAP')) {
        const pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice;

        // TP: Hedef fiyata ulaştı (EMA20 + %0.3)
        if (pos.tp_price && currentPrice >= pos.tp_price) {
          this.executeSell(pos, 'OPUS TP Target', currentPrice);
          continue;
        }

        // Fallback TP: %2.0 net kâr
        if (pnlPct >= 0.022) {
          this.executeSell(pos, 'OPUS TP +2.0% Net', currentPrice);
          continue;
        }

        if (isClosed) {
          const passedMs = kline.T - pos.entry_candle_time;
          const candlesPassed = Math.round(passedMs / timeframeMs);
          // 15 mum (75 dk)
          if (candlesPassed >= 15 && pnlPct < 0.005) {
            this.executeSell(pos, 'OPUS Time Stop (15 candles)', currentPrice);
            continue;
          }
        }
      }

      // -- OPUS_MOMENTUM: Micro-Burst Çıkış --
      if (pos.strategy.startsWith('OPUS_MOMENTUM')) {
        const pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice;

        // TP: Hedef fiyata ulaştı (%1.8)
        if (pos.tp_price && currentPrice >= pos.tp_price) {
          // Trailing aktif et (Basit trailing simülasyonu için)
          if (pos.trailing_activated === 0) {
            StateDB.updatePosition(pos.id, { 
              trailing_activated: 1,
              sl_price: pos.entryPrice, // Breakeven
              trailing_price: currentPrice * 0.990 // %1.0 geriden takip et
            });
            console.log(`[TRACKER] ${pos.symbol} OPUS_MOMENTUM TP1 Reached. Trailing activated.`);
          }
          continue;
        }

        // Trailing Update
        if (pos.trailing_activated === 1) {
          const newTrailPrice = currentPrice * 0.990;
          if (newTrailPrice > pos.trailing_price) {
            StateDB.updatePosition(pos.id, { trailing_price: newTrailPrice });
          }
        }

        if (isClosed) {
          const passedMs = kline.T - pos.entry_candle_time;
          const candlesPassed = Math.round(passedMs / timeframeMs);
          // 16 mum içinde TP1'e ulaşmazsa çık
          if (candlesPassed >= 16 && pos.trailing_activated === 0) {
            this.executeSell(pos, 'OPUS_MOMENTUM Time Stop (16 candles)', currentPrice);
            continue;
          }
        }
      }

      // -- OPUS_BBSQUEEZE: Squeeze Breakout Çıkış --
      if (pos.strategy.startsWith('OPUS_BBSQUEEZE')) {
        const pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice;

        // TP: Hedef fiyata ulaştı (%2.0)
        if (pos.tp_price && currentPrice >= pos.tp_price) {
          if (pos.trailing_activated === 0) {
            StateDB.updatePosition(pos.id, { 
              trailing_activated: 1,
              sl_price: pos.entryPrice,
              trailing_price: currentPrice * 0.990 // %1.0 geriden takip
            });
            console.log(`[TRACKER] ${pos.symbol} OPUS_BBSQUEEZE TP1 Reached. Trailing activated.`);
          }
          continue;
        }

        // Trailing Update
        if (pos.trailing_activated === 1) {
          const newTrailPrice = currentPrice * 0.990;
          if (newTrailPrice > pos.trailing_price) {
            StateDB.updatePosition(pos.id, { trailing_price: newTrailPrice });
          }
        }

        if (isClosed) {
          const passedMs = kline.T - pos.entry_candle_time;
          const candlesPassed = Math.round(passedMs / timeframeMs);
          // 20 mum içinde %0.5 kâr yoksa çık
          if (candlesPassed >= 20 && pnlPct < 0.005 && pos.trailing_activated === 0) {
            this.executeSell(pos, 'OPUS_BBSQUEEZE Time Stop (20 candles)', currentPrice);
            continue;
          }
        }
      }

    }
  }
}
