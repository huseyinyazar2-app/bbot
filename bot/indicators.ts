import { ADX, BollingerBands, SMA, RSI, MACD, CCI, MFI } from 'technicalindicators';
import { Kline } from './binance';

export interface IndicatorData {
  rsi_14: number;
  rsi_7: number;
  adx_14: number;
  cci_14: number;
  mfi_14: number;
  sma_50: number;
  sma_200: number;
  price_vs_sma50: number;
  price_vs_sma200: number;
  macd: number;
  macd_hist: number;
  bb_width: number;
  price_vs_bb_lower: number;
  sma_vol_20: number;
  rvol: number;
}

export function calculateIndicators(klines: Kline[]): IndicatorData | null {
  if (klines.length < 200) return null; // Needs at least 200 klines for SMA200
  
  const slice = klines.length > 800 ? klines.slice(-800) : klines;
  
  const closes = slice.map(k => k.close);
  const highs = slice.map(k => k.high);
  const lows = slice.map(k => k.low);
  const volumes = slice.map(k => k.volume);
  
  const currentClose = closes[closes.length - 1];

  const adxResult = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
  const rsi14Result = RSI.calculate({ period: 14, values: closes });
  const rsi7Result = RSI.calculate({ period: 7, values: closes });
  const cciResult = CCI.calculate({ period: 14, high: highs, low: lows, close: closes });
  const mfiResult = MFI.calculate({ period: 14, high: highs, low: lows, close: closes, volume: volumes });

  const sma50Result = SMA.calculate({ period: 50, values: closes });
  const sma200Result = SMA.calculate({ period: 200, values: closes });
  
  const macdResult = MACD.calculate({ 
    fastPeriod: 12, 
    slowPeriod: 26, 
    signalPeriod: 9, 
    SimpleMAOscillator: false, 
    SimpleMASignal: false, 
    values: closes 
  });

  const bbResult = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const volumeSmaResult = SMA.calculate({ period: 20, values: volumes });

  if (
    adxResult.length === 0 || 
    rsi14Result.length === 0 || 
    rsi7Result.length === 0 ||
    cciResult.length === 0 ||
    mfiResult.length === 0 ||
    sma50Result.length === 0 || 
    sma200Result.length === 0 || 
    macdResult.length === 0 ||
    bbResult.length === 0 ||
    volumeSmaResult.length === 0
  ) {
    return null;
  }

  const currentAdx = adxResult[adxResult.length - 1].adx;
  const currentRsi14 = rsi14Result[rsi14Result.length - 1];
  const currentRsi7 = rsi7Result[rsi7Result.length - 1];
  const currentCci = cciResult[cciResult.length - 1];
  const currentMfi = mfiResult[mfiResult.length - 1];

  const currentSma50 = sma50Result[sma50Result.length - 1];
  const currentSma200 = sma200Result[sma200Result.length - 1];
  
  const price_vs_sma50 = ((currentClose - currentSma50) / currentSma50) * 100;
  const price_vs_sma200 = ((currentClose - currentSma200) / currentSma200) * 100;

  const currentMacd = macdResult[macdResult.length - 1];
  const macdVal = currentMacd.MACD || 0;
  const macdHist = currentMacd.histogram || 0;

  const currentBb = bbResult[bbResult.length - 1];
  const bbWidth = (currentBb.upper - currentBb.lower) / currentBb.middle;
  const price_vs_bb_lower = ((currentClose - currentBb.lower) / currentBb.lower) * 100;
  
  const currentVolSma = volumeSmaResult[volumeSmaResult.length - 1];
  const currentVolume = volumes[volumes.length - 1];
  const rvol = currentVolume / currentVolSma;

  return {
    rsi_14: currentRsi14,
    rsi_7: currentRsi7,
    adx_14: currentAdx,
    cci_14: currentCci,
    mfi_14: currentMfi,
    sma_50: currentSma50,
    sma_200: currentSma200,
    price_vs_sma50,
    price_vs_sma200,
    macd: macdVal,
    macd_hist: macdHist,
    bb_width: bbWidth,
    price_vs_bb_lower,
    sma_vol_20: currentVolSma,
    rvol
  };
}
