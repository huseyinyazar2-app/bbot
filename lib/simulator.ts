import { fetchHistoricalKlines, Kline } from '../bot/binance';
import { calculateIndicators } from '../bot/indicators';
import { detectMarketRegime } from '../bot/engine2/regime';
import { RiskManager } from '../bot/engine2/risk';
import { SignalScorer } from '../bot/engine2/scorer';
import { BotHealthTracker } from '../bot/engine2/health';
import { loadDynamicBots, evaluateRule, DynamicBot } from '../bot/engine2/dynamic_loader';
import { BotStats, BotConfig, SimPosition, ExpertSignal, MarketRegime } from '../bot/engine2/types';
import { StateDB } from '../bot/database';

const TIMEFRAME_MS = 5 * 60 * 1000; // 5m timeframe

export interface SimulationParams {
  startDate: string;
  endDate: string;
  symbols: string[];
  enabledBots?: string[];
  maxConcurrent?: number;
  buyFeeRate?: number;
  sellFeeRate?: number;
  initialCapital?: number;
}

export async function runSimulation(params: SimulationParams) {
  const { startDate, endDate, symbols } = params;

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
    throw new Error('Invalid date range.');
  }

  const settings = StateDB.getSettings();
  const maxConcurrent = params.maxConcurrent || settings?.maxConcurrent || 3;
  const buyFeeRate = params.buyFeeRate !== undefined ? params.buyFeeRate : (settings?.buyFeeRate !== undefined ? settings.buyFeeRate : 0.001);
  const sellFeeRate = params.sellFeeRate !== undefined ? params.sellFeeRate : (settings?.sellFeeRate !== undefined ? settings.sellFeeRate : 0.001);
  const initialCapital = params.initialCapital || settings?.capital || 10000.0;

  // 1. Fetch Altcoin 5m klines with 3000 candles warmup
  const warmupMs = 3000 * TIMEFRAME_MS;
  const fetchStartMs = startMs - warmupMs;

  const klinesMap: Record<string, Kline[]> = {};
  const fetchLimit = 5;
  for (let i = 0; i < symbols.length; i += fetchLimit) {
    const chunk = symbols.slice(i, i + fetchLimit);
    await Promise.all(
      chunk.map(async (symbol) => {
        try {
          const data = await fetchHistoricalKlines(symbol, '5m', fetchStartMs, endMs);
          if (data && data.length > 0) {
            klinesMap[symbol] = data.sort((a, b) => a.openTime - b.openTime);
          }
        } catch (e: any) {
          console.error(`[SIMULATOR] Failed to fetch klines for ${symbol}:`, e.message);
        }
      })
    );
    await new Promise(r => setTimeout(r, 60));
  }

  // Generate Timeline
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

  if (timeline.length === 0) {
    return { summary: { totalTrades: 0, winRate: 0, totalPnl: 0, initialCapital, finalCapital: initialCapital, totalPnlPercent: 0 }, botPerformance: {}, trades: [] };
  }

  // Load Dynamic Bots
  let dynamicBots = loadDynamicBots();
  if (params.enabledBots && params.enabledBots.length > 0) {
    dynamicBots = dynamicBots.filter(bot => params.enabledBots!.includes(bot.id));
  }
  
  if (dynamicBots.length === 0) {
    throw new Error("Aktif bot bulunamadı. Lütfen önce kural havuzuna bot kaydedin veya test edilecek botları seçin.");
  }

  const botStatsMap = new Map<string, BotStats>();
  const botConfigsMap = new Map<string, BotConfig>();

  for (const dbot of dynamicBots) {
    botConfigsMap.set(dbot.id, {
      bot_id: dbot.id,
      bot_name: `${dbot.profile} (${(dbot.winRate * 100).toFixed(1)}%)`,
      enabled: true,
      status: 'ACTIVE',
      allowed_regimes: ['BTC_BULL', 'BTC_BEAR', 'BTC_RANGE', 'BTC_PANIC', 'BTC_RECOVERY'], // Dinamik botlar her şeye girebilir, risk yönetimi skora bakar
      base_risk_pct: 0.005,
      min_score_to_trade: 50 // Dinamik botların kendi test başarıları olduğu için esnek davranıyoruz
    });
    botStatsMap.set(dbot.id, BotHealthTracker.initBotStats(dbot.id));
  }

  let cash = initialCapital;
  let equity = initialCapital;
  const openPositions: SimPosition[] = [];
  const closedTrades: SimPosition[] = [];
  
  let currentDayStamp = '';
  let dailyStartEquity = initialCapital;
  let dailyLossPct = 0;

  const pointers: Record<string, number> = {};
  for (const sym of Object.keys(klinesMap)) {
    pointers[sym] = 0;
  }

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

      const hitSL = low <= pos.slPrice;
      const hitTP = high >= pos.tpPrice;

      if (hitSL && hitTP) {
        const exitPrice = Math.min(pos.slPrice, open);
        const revenue = exitPrice * pos.quantity;
        const sellFee = revenue * sellFeeRate;
        const buyFee = pos.entryPrice * pos.quantity * buyFeeRate;
        const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

        pos.status = 'CLOSED';
        pos.exitPrice = exitPrice;
        pos.exitTime = currentTime;
        pos.exitReason = 'Double-Trigger (SL First)';
        pos.finalPnl = (pos.realizedPnl || 0) + tradePnl;

        cash += revenue - sellFee;
        closedTrades.push(pos);
        openPositions.splice(i, 1);

        const stats = botStatsMap.get(pos.bot_id);
        if (stats) botStatsMap.set(pos.bot_id, BotHealthTracker.updateStats(stats, pos.finalPnl));
        continue;
      }

      if (hitSL) {
        const exitPrice = Math.min(pos.slPrice, open);
        const revenue = exitPrice * pos.quantity;
        const sellFee = revenue * sellFeeRate;
        const buyFee = pos.entryPrice * pos.quantity * buyFeeRate;
        const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

        pos.status = 'CLOSED';
        pos.exitPrice = exitPrice;
        pos.exitTime = currentTime;
        pos.exitReason = 'Fixed-SL';
        pos.finalPnl = (pos.realizedPnl || 0) + tradePnl;

        cash += revenue - sellFee;
        closedTrades.push(pos);
        openPositions.splice(i, 1);

        const stats = botStatsMap.get(pos.bot_id);
        if (stats) botStatsMap.set(pos.bot_id, BotHealthTracker.updateStats(stats, pos.finalPnl));
        continue;
      }

      if (hitTP) {
        const exitPrice = pos.tpPrice;
        const revenue = exitPrice * pos.quantity;
        const sellFee = revenue * sellFeeRate;
        const buyFee = pos.entryPrice * pos.quantity * buyFeeRate;
        const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

        pos.status = 'CLOSED';
        pos.exitPrice = exitPrice;
        pos.exitTime = currentTime;
        pos.exitReason = 'Take Profit';
        pos.finalPnl = (pos.realizedPnl || 0) + tradePnl;

        cash += revenue - sellFee;
        closedTrades.push(pos);
        openPositions.splice(i, 1);

        const stats = botStatsMap.get(pos.bot_id);
        if (stats) botStatsMap.set(pos.bot_id, BotHealthTracker.updateStats(stats, pos.finalPnl));
        continue;
      }

      // Dinamik Zaman Aşımı (Max Hold 48 bar = 4 hours, can be optimized later)
      const candlesPassed = Math.round((currentTime - pos.entryCandleTime) / TIMEFRAME_MS);
      if (candlesPassed >= 48) {
        const exitPrice = close;
        const revenue = exitPrice * pos.quantity;
        const sellFee = revenue * sellFeeRate;
        const buyFee = pos.entryPrice * pos.quantity * buyFeeRate;
        const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

        pos.status = 'CLOSED';
        pos.exitPrice = exitPrice;
        pos.exitTime = currentTime;
        pos.exitReason = `Time-Stop`;
        pos.finalPnl = (pos.realizedPnl || 0) + tradePnl;

        cash += revenue - sellFee;
        closedTrades.push(pos);
        openPositions.splice(i, 1);

        const stats = botStatsMap.get(pos.bot_id);
        if (stats) botStatsMap.set(pos.bot_id, BotHealthTracker.updateStats(stats, pos.finalPnl));
        continue;
      }
    }
  };

  let lastYieldTime = Date.now();

  for (const currentTime of timeline) {
    if (Date.now() - lastYieldTime > 100) {
      await new Promise(resolve => setTimeout(resolve, 1));
      lastYieldTime = Date.now();
    }

    const dayStamp = new Date(currentTime).toISOString().split('T')[0];
    if (dayStamp !== currentDayStamp) {
      currentDayStamp = dayStamp;
      dailyStartEquity = equity;
      dailyLossPct = 0;
    }

    checkExits(currentTime);

    let openValue = 0;
    for (const pos of openPositions) {
      const klines = klinesMap[pos.symbol];
      let ptr = pointers[pos.symbol];
      while (ptr < klines.length && klines[ptr].openTime < currentTime) {
        ptr++;
      }
      if (ptr < klines.length) {
        openValue += klines[ptr].close * pos.quantity;
      } else {
        openValue += pos.entryPrice * pos.quantity;
      }
    }
    equity = cash + openValue;

    if (equity < dailyStartEquity) {
      dailyLossPct = (dailyStartEquity - equity) / dailyStartEquity;
    } else {
      dailyLossPct = 0;
    }

    const activeCount = openPositions.length;
    if (activeCount < maxConcurrent) {
      
      const symbolIndicatorsMap = new Map<string, any>();
      const candidateSignals: { signal: ExpertSignal; score: number; winRate: number }[] = [];

      // BTC and ETH tracking for dynamic rules
      const btcKlines = klinesMap['BTCUSDT'];
      const ethKlines = klinesMap['ETHUSDT'];
      let btcVars: any = {};
      let ethVars: any = {};

      if (btcKlines) {
        let bPtr = pointers['BTCUSDT'];
        const bHistorySlice = btcKlines.slice(Math.max(0, bPtr - 2999), bPtr + 1);
        if (bHistorySlice.length >= 200) {
            const bInd = calculateIndicators(bHistorySlice);
            if (bInd) {
              const currentBtcClose = bHistorySlice[bHistorySlice.length - 1].close;
              const pastBtcClose = bHistorySlice[bHistorySlice.length - 13]?.close || currentBtcClose;
              const btcChange1h = ((currentBtcClose - pastBtcClose) / pastBtcClose) * 100;
              btcVars = {
                btc_rsi_14: bInd.rsi_14,
                btc_price_vs_sma200: bInd.price_vs_sma200,
                btc_change_1h: btcChange1h
              };
            }
        }
      }

      if (ethKlines) {
        let ePtr = pointers['ETHUSDT'];
        const eHistorySlice = ethKlines.slice(Math.max(0, ePtr - 2999), ePtr + 1);
        if (eHistorySlice.length >= 200) {
            const eInd = calculateIndicators(eHistorySlice);
            if (eInd) {
              const currentEthClose = eHistorySlice[eHistorySlice.length - 1].close;
              const pastEthClose = eHistorySlice[eHistorySlice.length - 13]?.close || currentEthClose;
              const ethChange1h = ((currentEthClose - pastEthClose) / pastEthClose) * 100;
              ethVars = {
                eth_rsi_14: eInd.rsi_14,
                eth_price_vs_sma200: eInd.price_vs_sma200,
                eth_change_1h: ethChange1h
              };
            }
        }
      }

      for (const symbol of Object.keys(klinesMap)) {
        if (openPositions.some(p => p.symbol === symbol)) continue;

        const klines = klinesMap[symbol];
        let ptr = pointers[symbol];
        
        if (ptr >= klines.length || klines[ptr].openTime !== currentTime) {
          continue;
        }

        const historySlice = klines.slice(Math.max(0, ptr - 2999), ptr + 1);
        if (historySlice.length < 200) continue;

        const ind = calculateIndicators(historySlice);
        if (!ind) continue;
        
        // Build variables for the string parser
        const vars = {
          ...ind,
          ...btcVars,
          ...ethVars
        };

        symbolIndicatorsMap.set(symbol, vars);

        const currentClose = historySlice[historySlice.length - 1].close;

        for (const dbot of dynamicBots) {
          const isMatch = evaluateRule(dbot.rule, vars);
          if (isMatch) {
            const tpPrice = currentClose * (1 + (dbot.tp / 100));
            const slPrice = currentClose * (1 - (dbot.sl / 100));
            
            const signal: ExpertSignal = {
              bot_id: dbot.id,
              symbol: symbol,
              direction: 'LONG',
              timeframe: '5m',
              entry_price: currentClose,
              stop_loss: slPrice,
              take_profit: tpPrice,
              setup_score: dbot.winRate * 100, // OutOfSample WinRate becomes the setup score
              reason: dbot.profile
            };
            
            candidateSignals.push({ signal, score: signal.setup_score, winRate: dbot.winRate });
          }
        }
      }

      // Resolve collisions (if multiple bots signal on same or different coins at the exact same minute)
      // Sort by out-of-sample win rate descending!
      candidateSignals.sort((a, b) => b.score - a.score);
      const chosenSignals: typeof candidateSignals = [];
      const usedSymbols = new Set<string>();

      for (const cs of candidateSignals) {
        if (!usedSymbols.has(cs.signal.symbol)) {
          chosenSignals.push(cs);
          usedSymbols.add(cs.signal.symbol);
        }
      }

      for (const item of chosenSignals) {
        const { signal, score } = item;
        const config = botConfigsMap.get(signal.bot_id)!;
        const stats = botStatsMap.get(signal.bot_id)!;

        const currentActiveCount = openPositions.length;
        if (currentActiveCount >= maxConcurrent) continue;

        const limitCheck = RiskManager.checkGlobalLimits(openPositions, signal, maxConcurrent, dailyLossPct, 0.02, false);
        if (!limitCheck.allowed) continue;

        const sizeCheck = RiskManager.calculatePositionSize(
          equity,
          cash,
          signal,
          config,
          maxConcurrent,
          stats.capital_multiplier || 1.0,
          false
        );

        if (sizeCheck.allowed && sizeCheck.quantity > 0) {
          const indicators = symbolIndicatorsMap.get(signal.symbol);
          const newPos: SimPosition = {
            id: `${signal.bot_id}-${signal.symbol}-${currentTime}`,
            symbol: signal.symbol,
            bot_id: signal.bot_id,
            direction: signal.direction,
            entryPrice: signal.entry_price,
            quantity: sizeCheck.quantity,
            entryTime: currentTime,
            entryCandleTime: currentTime,
            slPrice: signal.stop_loss,
            tpPrice: signal.take_profit,
            realizedPnl: 0,
            status: 'OPEN',
            setup_score: score,
            entry_rsi: indicators?.rsi_14,
            entry_rvol: indicators?.rvol,
            entry_adx: indicators?.adx_14,
            btc_regime: 'DYNAMIC'
          };

          const buyFee = sizeCheck.cost * buyFeeRate;
          cash -= (sizeCheck.cost + buyFee);
          openPositions.push(newPos);
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
      const sellFee = revenue * sellFeeRate;
      const buyFee = pos.entryPrice * pos.quantity * buyFeeRate;
      const tradePnl = revenue - (pos.entryPrice * pos.quantity) - (buyFee + sellFee);

      pos.status = 'CLOSED';
      pos.exitPrice = exitPrice;
      pos.exitTime = lastKline.openTime;
      pos.exitReason = 'Force-Close (End)';
      pos.finalPnl = (pos.realizedPnl || 0) + tradePnl;

      cash += revenue - sellFee;
      closedTrades.push(pos);

      const stats = botStatsMap.get(pos.bot_id);
      if (stats) botStatsMap.set(pos.bot_id, BotHealthTracker.updateStats(stats, pos.finalPnl));
    }
  }

  const realTrades = closedTrades.filter(t => !t.isShadow);
  const totalTrades = realTrades.length;
  const winTrades = realTrades.filter(t => (t.finalPnl || 0) > 0).length;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const netPnl = cash - initialCapital;
  const netPnlPct = (netPnl / initialCapital) * 100;

  const botPerformance: Record<string, BotStats> = {};
  botStatsMap.forEach((v, k) => {
    botPerformance[k] = v;
  });

  return {
    summary: {
      initialCapital,
      finalCapital: cash,
      totalPnl: netPnl,
      totalPnlPercent: netPnlPct,
      totalTrades,
      winTrades,
      lossTrades: totalTrades - winTrades,
      winRate,
    },
    botPerformance,
    trades: closedTrades.map(t => ({
      id: t.id,
      symbol: t.symbol,
      bot_id: t.bot_id,
      direction: t.direction,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      pnl: t.finalPnl,
      exitReason: t.exitReason,
      setup_score: t.setup_score,
      isShadow: false,
      entry_rsi: t.entry_rsi,
      entry_rvol: t.entry_rvol,
      entry_adx: t.entry_adx,
      btc_regime: t.btc_regime
    }))
  };
}
