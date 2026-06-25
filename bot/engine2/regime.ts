import { Kline } from '../binance';
import { MarketRegime } from './types';
import { EMA } from 'technicalindicators';

export function detectMarketRegime(btcSlice: Kline[]): MarketRegime {
  if (btcSlice.length < 200) return 'BTC_RANGE'; // Fallback if not enough data

  const last = btcSlice[btcSlice.length - 1];
  const prev = btcSlice[btcSlice.length - 2];

  // 1. Check for Panic (loss percent in last closed candle > 1.2%)
  const lossPercent = last.open > 0 ? (last.open - last.close) / last.open : 0;
  
  const closes = btcSlice.map(k => k.close);
  const ema50Result = EMA.calculate({ period: 50, values: closes });
  const ema200Result = EMA.calculate({ period: 200, values: closes });
  const ema20Result = EMA.calculate({ period: 20, values: closes });

  const ema50 = ema50Result.length > 0 ? ema50Result[ema50Result.length - 1] : last.close;
  const ema200 = ema200Result.length > 0 ? ema200Result[ema200Result.length - 1] : last.close;
  const ema20 = ema20Result.length > 0 ? ema20Result[ema20Result.length - 1] : last.close;

  // Panic check:
  // - Single candle drop > 1.5%
  // - OR price is > 3.0% below EMA50
  const isBtcPanic = lossPercent > 0.015 || last.close < ema50 * 0.97;
  if (isBtcPanic) {
    return 'BTC_PANIC';
  }

  // Recovery check:
  // If price crossed above EMA20 from below, and last candle is green
  const isGreen = last.close > last.open;
  const closedAboveEma20 = last.close > ema20;
  const prevClosedBelowEma20 = prev ? prev.close < (ema20Result.length > 1 ? ema20Result[ema20Result.length - 2] : ema20) : false;
  if (isGreen && closedAboveEma20 && prevClosedBelowEma20 && last.close < ema200) {
    return 'BTC_RECOVERY';
  }

  // Bull regime: Price above 200 EMA and 50 EMA
  if (last.close > ema200 && last.close > ema50) {
    return 'BTC_BULL';
  }

  // Bear regime: Price below 200 EMA and 50 EMA
  if (last.close < ema200 && last.close < ema50) {
    return 'BTC_BEAR';
  }

  // Otherwise, Range (or Chop)
  return 'BTC_RANGE';
}
