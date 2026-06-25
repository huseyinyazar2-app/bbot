import { HybridSignalGenerator, TierSignal } from './signal_generator';
import { SimulationEngine } from './execution_engine';
import { StateDB } from '../database';

interface Kline {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
    quoteVolume: number;
    trades: number;
    takerBuyBase: number;
    takerBuyQuote: number;
    btc_close?: number;
}

export class HybridMarketListener {
    private signalGenerator: HybridSignalGenerator;
    public simulationEngine: SimulationEngine;
    private klinesCache: Map<string, Kline[]> = new Map();
    private readonly MAX_KLINES = 250;
    
    constructor() {
        this.signalGenerator = new HybridSignalGenerator();
        this.simulationEngine = new SimulationEngine();
    }

    /**
     * Binance REST API uzerinden baslangic verilerini ceker
     */
    public async seedKlines(symbol: string) {
        try {
            const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=5m&limit=${this.MAX_KLINES}`;
            const res = await fetch(url);
            const data = await res.json();
            
            if (Array.isArray(data)) {
                const klines: Kline[] = data.map((d: any) => ({
                    openTime: d[0],
                    open: parseFloat(d[1]),
                    high: parseFloat(d[2]),
                    low: parseFloat(d[3]),
                    close: parseFloat(d[4]),
                    volume: parseFloat(d[5]),
                    closeTime: d[6],
                    quoteVolume: parseFloat(d[7]),
                    trades: d[8],
                    takerBuyBase: parseFloat(d[9]),
                    takerBuyQuote: parseFloat(d[10])
                }));
                this.klinesCache.set(symbol, klines);
            }
        } catch (e) {
            const errMsg = (e as Error).message;
            console.error(`[Market Listener] ${symbol} kline cekilemedi:`, errMsg);
            StateDB.addSystemLog("ERROR", "Market Listener", `${symbol} kline verisi çekilemedi: ${errMsg}`);
        }
    }

    /**
     * Binance WebSocket kline akisini isler
     */
    public async onWebSocketTick(symbol: string, newCandle: Kline, isCandleClosed: boolean) {
        let klines = this.klinesCache.get(symbol);
        if (!klines) return;

        const lastCandle = klines[klines.length - 1];
        let previousCandleClosedDetected = false;

        if (lastCandle && lastCandle.openTime === newCandle.openTime) {
            klines[klines.length - 1] = newCandle;
        } else if (lastCandle) {
            // Yeni bir mum başladığına göre önceki mum kesinlikle kapanmıştır!
            previousCandleClosedDetected = true;
            klines.push(newCandle);
            if (klines.length > this.MAX_KLINES) klines.shift();
        } else {
            klines.push(newCandle);
        }

        // Her tick'te SL, TP, Timeout kontrolleri yap (Guncel High/Low ve Mum Başlangıç Zamanı ile)
        this.simulationEngine.checkExits(symbol, newCandle.close, newCandle.high, newCandle.low, newCandle.openTime);

        // Değerlendirmeyi tetikle (Ya WebSocket kapanış sinyali vermiştir ya da yeni mum başlamıştır)
        if (isCandleClosed || previousCandleClosedDetected) {
            const targetKlines = previousCandleClosedDetected ? klines.slice(0, -1) : klines;
            const targetPrice = previousCandleClosedDetected ? lastCandle.close : newCandle.close;

            this.evaluateOnCandleClose(symbol, targetKlines, targetPrice).catch(err => {
                console.error(`[Market Listener] Error evaluating ${symbol}:`, err);
            });
        }
    }

    private async evaluateOnCandleClose(symbol: string, baseKlines: Kline[], currentPrice: number) {
        // Inject BTC close prices into baseKlines
        const btcKlines = this.klinesCache.get('BTCUSDT');
        let btcCloseList: number[] = [];
        
        if (symbol === 'BTCUSDT') {
            btcCloseList = baseKlines.map(k => k.close);
            baseKlines = baseKlines.map(k => ({ ...k, btc_close: k.close }));
        } else if (btcKlines) {
            const btcCloseMap = new Map<number, number>();
            for (const b of btcKlines) {
                btcCloseMap.set(b.openTime, b.close);
            }
            const fallbackBtcClose = btcKlines[btcKlines.length - 1].close;

            baseKlines = baseKlines.map((k) => {
                const btcClose = btcCloseMap.get(k.openTime) ?? fallbackBtcClose;
                btcCloseList.push(btcClose);
                return { ...k, btc_close: btcClose };
            });
        }

        try {
            const signals = await this.signalGenerator.evaluateOnCandleClose(symbol, baseKlines, btcCloseList);
            
            const alSignals = signals.filter(s => s.decision === 'AL');
            const lastKline = baseKlines[baseKlines.length - 1];
            const entryTime = lastKline ? lastKline.openTime : Date.now();
            
            // --- STRATEJY FILTRELERI ---
            
            // 1. Confluence (Birleşim) Filtresi: 
            // - Sadece micro_scalp AL veriyorsa gürültüyü önlemek için en az 2 farklı tier AL demeli.
            // - Daha uzun vadeli (scalp, swing_*) katmanlardan en az biri AL veriyorsa tek başına giriş yapılabilir.
            const hasLongerTermSignal = alSignals.some(s => s.tier !== 'micro_scalp');
            const hasConfluence = hasLongerTermSignal ? true : (alSignals.length >= 2);
            
            // 2. Volatilite (ATR) Filtresi: Piyasa çok durgunsa (ATR < %0.3) işleme girme
            const atrPct = signals.length > 0 ? signals[0].atr : 0;
            const hasGoodVolatility = atrPct > 0.003;
            
            // 3. BTC Trend Filtresi: BTC son 10 mumda %2'den fazla düşmüşse tehlike var, altcoin long girme
            let isBtcTrendOk = true;
            if (btcCloseList.length > 10) {
                const recentBtc = btcCloseList[btcCloseList.length - 1];
                const oldBtc = btcCloseList[btcCloseList.length - 10];
                isBtcTrendOk = recentBtc >= oldBtc * 0.98; // Max %2 düşüşe izin ver
            }

            if (hasConfluence && hasGoodVolatility && isBtcTrendOk && alSignals.length > 0) {
                // En yüksek beklenen değere (EV) sahip sinyali seç ve motora gönder
                const bestSignal = alSignals.reduce((prev, current) => {
                    const prevEV = (prev.probability * prev.tpPct) - ((1 - prev.probability) * prev.atr * prev.atrSlMultiplier * 100);
                    const currEV = (current.probability * current.tpPct) - ((1 - current.probability) * current.atr * current.atrSlMultiplier * 100);
                    return (currEV > prevEV) ? current : prev;
                });
                const chosenEV = (bestSignal.probability * bestSignal.tpPct) - ((1 - bestSignal.probability) * bestSignal.atr * bestSignal.atrSlMultiplier * 100);
                console.log(`[Market Listener] 🚀 En Yüksek Beklenen Değerli (EV) Sinyal Seçildi [${symbol} - ${bestSignal.tier}]: EV = %${chosenEV.toFixed(3)} | Prob = %${(bestSignal.probability * 100).toFixed(1)} | TP = %${bestSignal.tpPct.toFixed(2)}`);
                await this.simulationEngine.openPosition(bestSignal, currentPrice, entryTime);
            } else if (alSignals.length > 0) {
                 console.log(`[Market Listener] Sinyal Filtreye Takıldı [${symbol}]: Confluence(${hasConfluence}), ATR(${hasGoodVolatility} - ${atrPct.toFixed(4)}), BTC_Trend(${isBtcTrendOk})`);
            }
            
            // StateDB update for UI
            const probabilityPercentage = signals.length > 0 ? Math.max(...signals.map(s => s.probability * 100)) : 0;
            
            const prevClose = baseKlines.length > 0 ? baseKlines[baseKlines.length - 1].close : undefined;
            const prevClose2 = baseKlines.length > 1 ? baseKlines[baseKlines.length - 2].close : undefined;
            
            const btc10BarChange = btcCloseList.length > 10
                ? ((btcCloseList[btcCloseList.length - 1] - btcCloseList[btcCloseList.length - 10]) / btcCloseList[btcCloseList.length - 10]) * 100
                : 0;

            const uiData = {
                activeSignals: signals, // UI gets all signals to show them
                currentPrice: currentPrice,
                lastEvaluationTime: Date.now(),
                prevClose,
                prevClose2,
                btcTrendOk: isBtcTrendOk,
                btc10BarChange
            };
            
            StateDB.setHybridSignal(symbol, probabilityPercentage, JSON.stringify(uiData), currentPrice);

        } catch (e) {
            const errMsg = (e as Error).message;
            console.error(`[Market Listener] evaluateOnCandleClose failed for ${symbol}:`, errMsg);
            StateDB.addSystemLog("ERROR", "Market Listener", `evaluateOnCandleClose failed for ${symbol}: ${errMsg}`);
        }
    }

    /**
     * İlk başlangıçta veya REST Fallback anında veritabanını boş bırakmamak için 
     * son KAPANMIŞ mum üzerinden analiz çalıştırır.
     */
    public async runInitialEvaluation(symbol: string) {
        let klines = this.klinesCache.get(symbol);
        if (!klines || klines.length === 0) return;

        const lastKline = klines[klines.length - 1];
        const now = Date.now();
        const currentCandleBoundary = Math.floor(now / (5 * 60 * 1000)) * (5 * 60 * 1000);

        let completedKlines;
        if (lastKline.openTime >= currentCandleBoundary) {
            // Son mum şu an açık olan (kapanmamış) mumdur. Onu hariç tutuyoruz.
            completedKlines = klines.slice(0, -1);
        } else {
            completedKlines = klines;
        }

        if (completedKlines.length === 0) return;

        const lastClosedPrice = completedKlines[completedKlines.length - 1].close;
        await this.evaluateOnCandleClose(symbol, completedKlines, lastClosedPrice);
    }
}
