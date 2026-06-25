import { fetchHistoricalKlines, Kline } from 'c:/Users/hyaza/Documents/antigravitiy/borsabotu/bot/binance';
import { ADX, EMA, RSI, BollingerBands, SMA } from 'technicalindicators';

// Local indicator calculation with EMA200
interface LocalIndicatorData {
  adx: number;
  ema50: number;
  ema20: number;
  ema200: number; // New trend filter
  rsi14: number;
  bbUpper: number;
  bbLower: number;
  bbMiddle: number;
  bbWidth: number;
  sma20Vol: number;
  rvol: number;
  prevAdx: number;
  prevBbWidths: number[];
}

function calculateLocalIndicators(klines: Kline[]): LocalIndicatorData | null {
  if (klines.length < 200) return null;
  
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);

  const adxResult = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
  const ema50Result = EMA.calculate({ period: 50, values: closes });
  const ema20Result = EMA.calculate({ period: 20, values: closes });
  const ema200Result = EMA.calculate({ period: 200, values: closes }); // 200 EMA
  const rsiResult = RSI.calculate({ period: 14, values: closes });
  const bbResult = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const volumeSmaResult = SMA.calculate({ period: 20, values: volumes });

  if (
    adxResult.length === 0 || 
    ema50Result.length === 0 || 
    ema20Result.length === 0 || 
    ema200Result.length === 0 || 
    rsiResult.length === 0 || 
    bbResult.length === 0
  ) {
    return null;
  }

  const currentAdx = adxResult[adxResult.length - 1];
  const currentEma = ema50Result[ema50Result.length - 1];
  const currentEma20 = ema20Result[ema20Result.length - 1];
  const currentEma200 = ema200Result[ema200Result.length - 1];
  const currentRsi = rsiResult[rsiResult.length - 1];
  const currentBb = bbResult[bbResult.length - 1];
  
  const prevBbWidths = bbResult.slice(-101, -1).map(b => (b.upper - b.lower) / b.middle);
  const prevAdx = adxResult.length > 1 ? adxResult[adxResult.length - 2].adx : currentAdx.adx;
  
  const currentVolSma = volumeSmaResult[volumeSmaResult.length - 1];
  const currentVolume = volumes[volumes.length - 1];
  const rvol = currentVolume / currentVolSma;

  return {
    adx: currentAdx.adx,
    ema50: currentEma,
    ema20: currentEma20,
    ema200: currentEma200,
    rsi14: currentRsi,
    bbUpper: currentBb.upper,
    bbLower: currentBb.lower,
    bbMiddle: currentBb.middle,
    bbWidth: (currentBb.upper - currentBb.lower) / currentBb.middle,
    sma20Vol: currentVolSma,
    rvol,
    prevAdx,
    prevBbWidths
  };
}

// Local strategies evaluation with EMA200 trend filter
interface LocalSignal {
  symbol: string;
  strategy: string;
  priority: number;
  rvol: number;
  rsi: number;
  quoteVol24h: number;
  slPrice: number;
  tpPrice: number;
  action: 'BUY' | 'WAIT';
}

function evaluateLocalStrategies(
  symbol: string, 
  klines: Kline[], 
  ind: LocalIndicatorData, 
  quoteVol: number,
  enabledStrategies?: string[]
): LocalSignal {
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  
  const isGreen = last.close > last.open;
  
  const isBull = ind.adx > 25 && last.close > ind.ema50;
  const isBear = ind.adx > 25 && last.close < ind.ema50;
  const isChop = ind.adx <= 20;

  // New Trend Filter: Fiyat 200 EMA'nın üzerinde mi?
  const isTrendUp = last.close > ind.ema200;

  const base: LocalSignal = {
    symbol,
    strategy: 'WAIT',
    priority: 99,
    rvol: ind.rvol,
    rsi: ind.rsi14,
    quoteVol24h: quoteVol,
    slPrice: 0,
    tpPrice: 0,
    action: 'WAIT'
  };

  const candidates: LocalSignal[] = [];

  // 1. STRAT_1 (Hacim Sörfü) - Trend takipçidir, bu yüzden isTrendUp şartı ekliyoruz
  if (isBull && isTrendUp) {
    if (isGreen && ind.rvol >= 2.5) {
      const totalLength = last.high - last.low;
      const upperWick = last.high - last.close;
      const isOverextended = last.close > ind.bbUpper * 1.02;
      const hasBigWick = totalLength > 0 && (upperWick / totalLength) >= 0.35;
      
      if (!isOverextended && !hasBigWick) {
        candidates.push({ ...base, strategy: 'STRAT_1 (Hacim Sörfü)', priority: 1, slPrice: last.close * 0.980, action: 'BUY' });
      }
    }
  }

  // 2. STRAT_2 (Düzeltme Avcısı) - Trend takipçidir, isTrendUp şartı ekliyoruz
  if (isBull && isTrendUp) {
    if (isGreen && ind.rsi14 <= 48 && ind.rsi14 >= 35) {
      if (prev.close < prev.open) {
        candidates.push({ ...base, strategy: 'STRAT_2 (Düzeltme Avcısı)', priority: 3, slPrice: last.close * 0.980, action: 'BUY' });
      }
    }
  }

  // 3. STRAT_5 (Bıçak Yakalayıcı) - Trend tersi stildir, ayı piyasasında zaten düşüşü yakalamayı hedefler. Filtre gerekmez.
  if (isBear) {
    if (isGreen && ind.rsi14 < 25) {
      if (prev.close < prev.open) {
        const totalLength = last.high - last.low;
        const lowerWick = last.open - last.low;
        const isPinBar = totalLength > 0 && (lowerWick / totalLength) >= 0.5;

        if (isPinBar) {
          candidates.push({ ...base, strategy: 'STRAT_5 (Bıçak Yakalayıcı)', priority: 2, slPrice: Math.max(prev.low * 0.998, last.close * 0.980), action: 'BUY' });
        }
      }
    }
  }

  // 4. STRAT_4 (Yay Sıkışması) - Kırılımdır, yukarı kırılım olduğu için isTrendUp onay verirse daha güvenlidir.
  if (isChop && isTrendUp) {
    const minBBW = Math.min(...ind.prevBbWidths);
    if (ind.bbWidth <= minBBW * 1.05) {
      if (isGreen && last.close > ind.bbUpper && ind.rvol >= 1.5) {
        candidates.push({ ...base, strategy: 'STRAT_4 (Yay Sıkışması Kırılım)', priority: 1, slPrice: last.close * 0.980, action: 'BUY' });
      }
    }
  }

  // 5. STRAT_3 (Ping-Pong) - Yatay bant sekesidir. Trend filtresine gerek yok, fakat komisyon sonrası %0 kârı geçmeli.
  if (isChop) {
    if (ind.bbWidth >= 0.015) {
      if (last.low <= ind.bbLower && last.close > ind.bbLower) {
        if (isGreen) {
          const tpTarget = Math.max(ind.bbMiddle, last.close * 1.020);
          const slTarget = Math.min(ind.bbLower * 0.998, last.close * 0.985);
          candidates.push({ ...base, strategy: 'STRAT_3 (Ping-Pong)', priority: 4, slPrice: slTarget, tpPrice: tpTarget, action: 'BUY' });
        }
      }
    }
  }

  // 6. OPUS_VWAP - Trend bounce stratejisidir, isTrendUp şartı ekliyoruz
  if (isBull && isTrendUp) {
    const ema20 = ind.ema20;
    const belowVwap = last.low < ema20;
    const closedAboveVwap = last.close > ema20;
    const dip = (ema20 - last.low) / ema20;

    if (isGreen && belowVwap && closedAboveVwap && dip >= 0.002 && dip <= 0.008) {
      if (ind.rsi14 >= 35 && ind.rsi14 <= 60) {
        const tpTarget = last.close * 1.022;
        const slTarget = last.close * 0.985;
        candidates.push({ ...base, strategy: 'OPUS_VWAP (Bounce Scalper)', priority: 5, slPrice: slTarget, tpPrice: tpTarget, action: 'BUY' });
      }
    }
  }

  // 7. OPUS_MOMENTUM - Trend takipçidir, isTrendUp şartı ekliyoruz
  if (isBull && isTrendUp) {
    const prev2 = klines[klines.length - 3];
    const volIncreasing = last.volume > prev.volume && prev.volume > prev2.volume;
    const rvolHigh = ind.rvol > 1.8;
    const rsiOk = ind.rsi14 >= 50 && ind.rsi14 <= 70;
    
    // Local EMA9/EMA21
    const closes = klines.map(k => k.close);
    const calcEma = (period: number) => {
      const k = 2 / (period + 1);
      let ema = closes[0];
      for (let i = 1; i < closes.length; i++) {
        ema = (closes[i] * k) + (ema * (1 - k));
      }
      return ema;
    };
    const ema9 = calcEma(9);
    const ema21 = calcEma(21);
    
    const aboveEmas = last.close > ema9 && last.close > ema21;

    if (isGreen && volIncreasing && rvolHigh && rsiOk && aboveEmas) {
      const slTarget = Math.min(Math.min(last.low, prev.low, prev2.low) * 0.998, last.close * 0.985);
      const tpTarget = last.close * 1.018;
      candidates.push({ ...base, strategy: 'OPUS_MOMENTUM (Micro-Burst)', priority: 6, slPrice: slTarget, tpPrice: tpTarget, action: 'BUY' });
    }
  }

  // 8. OPUS_BBSQUEEZE - Breakouttur, isTrendUp şartı ekliyoruz
  if ((isChop || isBull) && isTrendUp) {
    const minBBW = Math.min(...ind.prevBbWidths);
    if (ind.bbWidth <= minBBW * 1.05) {
      const breakout = isGreen && last.close > ind.bbUpper;
      const volConfirm = ind.rvol > 1.5;
      const adxRising = ind.adx > ind.prevAdx;
      
      if (breakout && volConfirm && adxRising) {
        const slTarget = Math.min(ind.bbMiddle, last.close * 0.980);
        const tpTarget = last.close * 1.02;
        candidates.push({ ...base, strategy: 'OPUS_BBSQUEEZE (Breakout)', priority: 7, slPrice: slTarget, tpPrice: tpTarget, action: 'BUY' });
      }
    }
  }

  let filteredCandidates = candidates;
  if (enabledStrategies && enabledStrategies.length > 0) {
    filteredCandidates = candidates.filter(c => enabledStrategies.some(s => c.strategy.startsWith(s)));
  }

  if (filteredCandidates.length > 0) {
    filteredCandidates.sort((a, b) => a.priority - b.priority);
    return filteredCandidates[0];
  }

  return base;
}

interface SimPosition {
  id: string;
  symbol: string;
  strategy: string;
  entryPrice: number;
  quantity: number;
  entryTime: number;
  entryCandleTime: number;
  slPrice: number;
  tpPrice: number | null;
  trailingActivated: number;
  trailingPrice: number;
  realizedPnl: number;
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitTime?: number;
  exitReason?: string;
  finalPnl?: number;
}

const TIMEFRAME_MS = 5 * 60 * 1000;

async function runBacktest() {
  // Exact 10 coins group 11-20
  const symbols = [
    'SPCXBUSDT', 'XAUTUSDT', 'DOGEUSDT', 'UNIUSDT', 'XLMUSDT', 
    'TAOUSDT', 'TRXUSDT', 'JTOUSDT', 'SUIUSDT', 'ADAUSDT'
  ];
  
  const startDate = '2026-06-01T00:00:00Z';
  const endDate = '2026-06-06T23:59:59Z';
  const initialCapital = 10000.0;
  const maxConcurrent = 6;
  const feeRate = 0.0; // 0% FEE!

  // Strategies to test (excluding STRAT_3 Ping-Pong like in the screenshot)
  const enabledStrats = ['STRAT_1', 'STRAT_2', 'STRAT_4', 'STRAT_5', 'OPUS_VWAP', 'OPUS_MOMENTUM', 'OPUS_BBSQUEEZE'];

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const warmupMs = 250 * TIMEFRAME_MS;
  const fetchStartMs = startMs - warmupMs;

  console.log(`Starting Trend Filter Backtest at 0% fee...`);

  const klinesMap: Record<string, Kline[]> = {};
  for (const symbol of symbols) {
    try {
      const data = await fetchHistoricalKlines(symbol, '5m', fetchStartMs, endMs);
      if (data && data.length > 0) {
        klinesMap[symbol] = data.sort((a, b) => a.openTime - b.openTime);
      }
    } catch (e: any) {}
  }

  const openTimesSet = new Set<number>();
  for (const sym of Object.keys(klinesMap)) {
    const klines = klinesMap[sym];
    for (const k of klines) {
      if (k.openTime >= startMs && k.openTime <= endMs) {
        openTimesSet.add(k.openTime);
      }
    }
  }
  const timeline = Array.from(openTimesSet).sort((a, b) => a - b);
  console.log(`Timeline steps: ${timeline.length}`);

  const pointers: Record<string, number> = {};
  for (const sym of Object.keys(klinesMap)) {
    pointers[sym] = 0;
  }

  let cash = initialCapital;
  const openPositions: SimPosition[] = [];
  const closedTrades: SimPosition[] = [];
  const blacklistUntilMap = new Map<string, number>();

  const checkExits = (currentTime: number) => {
    for (let i = openPositions.length - 1; i >= 0; i--) {
      const pos = openPositions[i];
      const klines = klinesMap[pos.symbol];
      let ptr = pointers[pos.symbol];
      
      while (ptr < klines.length && klines[ptr].openTime < currentTime) {
        ptr++;
      }
      pointers[pos.symbol] = ptr;

      if (ptr >= klines.length || klines[ptr].openTime !== currentTime) {
        continue;
      }

      const kline = klines[ptr];
      const { high, low, close, open } = kline;

      // 1. HARD STOP LOSS
      if (low <= pos.slPrice) {
        const exitPrice = Math.min(pos.slPrice, open);
        const revenue = exitPrice * pos.quantity;
        const sellFee = revenue * feeRate;
        const buyFee = pos.entryPrice * pos.quantity * feeRate;
        const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);
        
        pos.status = 'CLOSED';
        pos.exitPrice = exitPrice;
        pos.exitTime = currentTime;
        pos.exitReason = 'Fixed-SL';
        pos.finalPnl = pos.realizedPnl + tradePnl;
        
        cash += revenue - sellFee;
        closedTrades.push(pos);
        openPositions.splice(i, 1);
        blacklistUntilMap.set(pos.symbol, currentTime + 3 * TIMEFRAME_MS);
        continue;
      }

      // 2. TRAILING STOP LOSS
      if (pos.trailingActivated === 1 && low <= pos.trailingPrice) {
        const exitPrice = Math.min(pos.trailingPrice, open);
        const revenue = exitPrice * pos.quantity;
        const sellFee = revenue * feeRate;
        const buyFee = pos.entryPrice * pos.quantity * feeRate;
        const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

        pos.status = 'CLOSED';
        pos.exitPrice = exitPrice;
        pos.exitTime = currentTime;
        pos.exitReason = 'Trailing-SL';
        pos.finalPnl = pos.realizedPnl + tradePnl;

        cash += revenue - sellFee;
        closedTrades.push(pos);
        openPositions.splice(i, 1);
        blacklistUntilMap.set(pos.symbol, currentTime + 3 * TIMEFRAME_MS);
        continue;
      }

      // 3. STRATEGY SPECIFIC LOGIC
      const closePnlPct = (close - pos.entryPrice) / pos.entryPrice;
      const highPnlPct = (high - pos.entryPrice) / pos.entryPrice;
      const candlesPassed = Math.round((currentTime - pos.entryCandleTime) / TIMEFRAME_MS);

      // STRAT_1 & STRAT_4
      if (pos.strategy.startsWith('STRAT_1') || pos.strategy.startsWith('STRAT_4')) {
        if (pos.trailingActivated === 0 && highPnlPct >= 0.022) {
          const hitPrice = Math.max(pos.entryPrice * 1.022, open);
          const soldQty = pos.quantity / 2;
          const revenue = hitPrice * soldQty;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * soldQty * feeRate;
          const partialPnl = revenue - (pos.entryPrice * soldQty) - (buyFee + sellFee);

          pos.quantity = pos.quantity - soldQty;
          pos.trailingActivated = 1;
          pos.slPrice = pos.entryPrice;
          pos.trailingPrice = hitPrice * 0.990;
          pos.realizedPnl += partialPnl;

          cash += revenue - sellFee;
        }

        if (pos.trailingActivated === 1) {
          const newTrail = high * 0.990;
          if (newTrail > pos.trailingPrice) {
            pos.trailingPrice = newTrail;
          }
        }

        if (candlesPassed >= 15 && closePnlPct < 0.005) {
          const exitPrice = close;
          const revenue = exitPrice * pos.quantity;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * pos.quantity * feeRate;
          const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

          pos.status = 'CLOSED';
          pos.exitPrice = exitPrice;
          pos.exitTime = currentTime;
          pos.exitReason = 'Time Stop (15 candles)';
          pos.finalPnl = pos.realizedPnl + tradePnl;

          cash += revenue - sellFee;
          closedTrades.push(pos);
          openPositions.splice(i, 1);
          blacklistUntilMap.set(pos.symbol, currentTime + 3 * TIMEFRAME_MS);
          continue;
        }

        if (open >= pos.entryPrice && close < pos.entryPrice && (open - close) / open > 0.005) {
          const exitPrice = close;
          const revenue = exitPrice * pos.quantity;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * pos.quantity * feeRate;
          const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

          pos.status = 'CLOSED';
          pos.exitPrice = exitPrice;
          pos.exitTime = currentTime;
          pos.exitReason = 'Cancel: Engulfing Red';
          pos.finalPnl = pos.realizedPnl + tradePnl;

          cash += revenue - sellFee;
          closedTrades.push(pos);
          openPositions.splice(i, 1);
          continue;
        }
      }

      // STRAT_2
      else if (pos.strategy.startsWith('STRAT_2')) {
        if (highPnlPct >= 0.022) {
          const exitPrice = Math.max(pos.entryPrice * 1.022, open);
          const revenue = exitPrice * pos.quantity;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * pos.quantity * feeRate;
          const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

          pos.status = 'CLOSED';
          pos.exitPrice = exitPrice;
          pos.exitTime = currentTime;
          pos.exitReason = 'TP +2.0%';
          pos.finalPnl = pos.realizedPnl + tradePnl;

          cash += revenue - sellFee;
          closedTrades.push(pos);
          openPositions.splice(i, 1);
          continue;
        }

        if (candlesPassed >= 25 && closePnlPct < 0.005) {
          const exitPrice = close;
          const revenue = exitPrice * pos.quantity;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * pos.quantity * feeRate;
          const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

          pos.status = 'CLOSED';
          pos.exitPrice = exitPrice;
          pos.exitTime = currentTime;
          pos.exitReason = 'Time Stop (25 candles)';
          pos.finalPnl = pos.realizedPnl + tradePnl;

          cash += revenue - sellFee;
          closedTrades.push(pos);
          openPositions.splice(i, 1);
          blacklistUntilMap.set(pos.symbol, currentTime + 3 * TIMEFRAME_MS);
          continue;
        }
      }

      // STRAT_5
      else if (pos.strategy.startsWith('STRAT_5')) {
        if (highPnlPct >= 0.025) {
          const exitPrice = Math.max(pos.entryPrice * 1.025, open);
          const revenue = exitPrice * pos.quantity;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * pos.quantity * feeRate;
          const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

          pos.status = 'CLOSED';
          pos.exitPrice = exitPrice;
          pos.exitTime = currentTime;
          pos.exitReason = 'TP +2.3%';
          pos.finalPnl = pos.realizedPnl + tradePnl;

          cash += revenue - sellFee;
          closedTrades.push(pos);
          openPositions.splice(i, 1);
          continue;
        }

        if (candlesPassed >= 10) {
          const exitPrice = close;
          const revenue = exitPrice * pos.quantity;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * pos.quantity * feeRate;
          const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

          pos.status = 'CLOSED';
          pos.exitPrice = exitPrice;
          pos.exitTime = currentTime;
          pos.exitReason = 'Time Stop (10 candles)';
          pos.finalPnl = pos.realizedPnl + tradePnl;

          cash += revenue - sellFee;
          closedTrades.push(pos);
          openPositions.splice(i, 1);
          blacklistUntilMap.set(pos.symbol, currentTime + 3 * TIMEFRAME_MS);
          continue;
        }
      }

      // OPUS_VWAP
      else if (pos.strategy.startsWith('OPUS_VWAP')) {
        if (pos.tpPrice && high >= pos.tpPrice) {
          const exitPrice = Math.max(pos.tpPrice, open);
          const revenue = exitPrice * pos.quantity;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * pos.quantity * feeRate;
          const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

          pos.status = 'CLOSED';
          pos.exitPrice = exitPrice;
          pos.exitTime = currentTime;
          pos.exitReason = 'OPUS TP Target';
          pos.finalPnl = pos.realizedPnl + tradePnl;

          cash += revenue - sellFee;
          closedTrades.push(pos);
          openPositions.splice(i, 1);
          continue;
        }

        if (highPnlPct >= 0.022) {
          const exitPrice = Math.max(pos.entryPrice * 1.022, open);
          const revenue = exitPrice * pos.quantity;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * pos.quantity * feeRate;
          const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

          pos.status = 'CLOSED';
          pos.exitPrice = exitPrice;
          pos.exitTime = currentTime;
          pos.exitReason = 'OPUS TP +2.0%';
          pos.finalPnl = pos.realizedPnl + tradePnl;

          cash += revenue - sellFee;
          closedTrades.push(pos);
          openPositions.splice(i, 1);
          continue;
        }

        if (candlesPassed >= 15 && closePnlPct < 0.005) {
          const exitPrice = close;
          const revenue = exitPrice * pos.quantity;
          const sellFee = revenue * feeRate;
          const buyFee = pos.entryPrice * pos.quantity * feeRate;
          const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

          pos.status = 'CLOSED';
          pos.exitPrice = exitPrice;
          pos.exitTime = currentTime;
          pos.exitReason = 'OPUS Time Stop (15 candles)';
          pos.finalPnl = pos.realizedPnl + tradePnl;

          cash += revenue - sellFee;
          closedTrades.push(pos);
          openPositions.splice(i, 1);
          blacklistUntilMap.set(pos.symbol, currentTime + 3 * TIMEFRAME_MS);
          continue;
        }
      }
    }
  };

  for (const currentTime of timeline) {
    checkExits(currentTime);

    let currentOpenValue = 0;
    for (const pos of openPositions) {
      const klines = klinesMap[pos.symbol];
      let ptr = pointers[pos.symbol];
      while (ptr < klines.length && klines[ptr].openTime < currentTime) {
        ptr++;
      }
      if (ptr < klines.length) {
        currentOpenValue += klines[ptr].close * pos.quantity;
      } else {
        currentOpenValue += pos.entryPrice * pos.quantity;
      }
    }
    const currentEquity = cash + currentOpenValue;

    if (openPositions.length < maxConcurrent) {
      for (const symbol of Object.keys(klinesMap)) {
        if (openPositions.some(p => p.symbol === symbol)) continue;

        const blacklistUntil = blacklistUntilMap.get(symbol) || 0;
        if (currentTime < blacklistUntil) continue;

        const klines = klinesMap[symbol];
        let ptr = pointers[symbol];
        while (ptr < klines.length && klines[ptr].openTime < currentTime) {
          ptr++;
        }
        pointers[symbol] = ptr;

        if (ptr >= klines.length || klines[ptr].openTime !== currentTime) {
          continue;
        }

        const historySlice = klines.slice(Math.max(0, ptr - 249), ptr + 1);
        if (historySlice.length < 200) continue;

        const ind = calculateLocalIndicators(historySlice);
        if (!ind) continue;

        const last288 = historySlice.slice(-288);
        const quoteVol24h = last288.reduce((sum, k) => sum + (k.quoteVolume || 0), 0);

        const signal = evaluateLocalStrategies(symbol, historySlice, ind, quoteVol24h, enabledStrats);

        if (signal.action === 'BUY') {
          const currentClose = klines[ptr].close;
          const tradeBudget = currentEquity / maxConcurrent;

          if (cash >= tradeBudget) {
            const buyFee = tradeBudget * feeRate;
            const quantity = (tradeBudget - buyFee) / currentClose;

            const newPos: SimPosition = {
              id: `${symbol}-${currentTime}`,
              symbol,
              strategy: signal.strategy,
              entryPrice: currentClose,
              quantity,
              entryTime: currentTime,
              entryCandleTime: currentTime,
              slPrice: signal.slPrice,
              tpPrice: signal.tpPrice || null,
              trailingActivated: 0,
              trailingPrice: 0,
              realizedPnl: 0,
              status: 'OPEN'
            };

            cash -= tradeBudget;
            openPositions.push(newPos);

            if (openPositions.length >= maxConcurrent) {
              break;
            }
          }
        }
      }
    }
  }

  for (const pos of openPositions) {
    const klines = klinesMap[pos.symbol];
    if (klines && klines.length > 0) {
      const lastKline = klines[klines.length - 1];
      const exitPrice = lastKline.close;
      const revenue = exitPrice * pos.quantity;
      const sellFee = revenue * feeRate;
      const buyFee = pos.entryPrice * pos.quantity * feeRate;
      const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

      pos.status = 'CLOSED';
      pos.exitPrice = exitPrice;
      pos.exitTime = lastKline.openTime;
      pos.exitReason = 'Force-Close';
      pos.finalPnl = pos.realizedPnl + tradePnl;
      cash += revenue - sellFee;
      closedTrades.push(pos);
    }
  }

  const totalTrades = closedTrades.length;
  const winTrades = closedTrades.filter(t => (t.finalPnl || 0) > 0).length;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const netPnl = cash - initialCapital;

  console.log('\n=================== TREND FILTER SIMULATION RESULTS ===================');
  console.log(`Initial Capital: ${initialCapital.toFixed(2)} USDT`);
  console.log(`Final Capital: ${cash.toFixed(2)} USDT`);
  console.log(`Net Profit/Loss: ${netPnl.toFixed(2)} USDT (${((netPnl / initialCapital) * 100).toFixed(2)}%)`);
  console.log(`Total Trades: ${totalTrades}`);
  console.log(`Win Trades: ${winTrades} (${winRate.toFixed(2)}%)`);
  console.log(`Loss Trades: ${totalTrades - winTrades} (${(100 - winRate).toFixed(2)}%)`);
  
  const strategyPerf: Record<string, { total: number; wins: number; pnl: number }> = {};
  for (const t of closedTrades) {
    if (!strategyPerf[t.strategy]) {
      strategyPerf[t.strategy] = { total: 0, wins: 0, pnl: 0 };
    }
    strategyPerf[t.strategy].total++;
    if ((t.finalPnl || 0) > 0) {
      strategyPerf[t.strategy].wins++;
    }
    strategyPerf[t.strategy].pnl += (t.finalPnl || 0);
  }

  console.log('\nStrategy Performance:');
  for (const [strat, perf] of Object.entries(strategyPerf)) {
    const wr = perf.total > 0 ? (perf.wins / perf.total) * 100 : 0;
    console.log(` - ${strat}: ${perf.total} trades, Win Rate: ${wr.toFixed(2)}%, PNL: ${perf.pnl.toFixed(2)} USDT`);
  }
  console.log('========================================================================');
}

runBacktest();
