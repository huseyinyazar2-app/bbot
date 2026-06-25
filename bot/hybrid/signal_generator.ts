

import { StateDB } from '../database';

export interface TierSignal {
    tier: string;
    probability: number;
    threshold: number;
    atr: number;
    tpPct: number;
    atrSlMultiplier: number;
    confluenceBonus?: number;
    symbol: string;
    decision: "AL" | "BEKLE";
}

export interface PredictionResponse {
    symbol: string;
    atr_value: number;
    tiers: {
        [key: string]: {
            probability: number;
            decision: "AL" | "BEKLE";
            threshold: number;
            tp: number;
            atr_sl_multiplier: number;
        }
    };
    error?: string;
}

export class HybridSignalGenerator {
    private inferenceUrl = 'http://127.0.0.1:5005/predict';

    // A static queue to serialize all requests to the Python inference server,
    // avoiding connection flooding (e.g. 46 simultaneous socket requests).
    private static requestQueue: {
        symbol: string;
        klines: any[];
        btcClose: number[];
        resolve: (signals: TierSignal[]) => void;
        reject: (err: any) => void;
    }[] = [];
    private static isProcessingQueue = false;

    private static async runQueue(inferenceUrl: string) {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const item = this.requestQueue.shift();
            if (!item) continue;

            const { symbol, klines, btcClose, resolve } = item;
            try {
                const response = await fetch(inferenceUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        symbol,
                        klines,
                        btc_close: btcClose,
                        funding_rate: []
                    })
                });

                if (!response.ok) {
                    throw new Error(`Inference Server Error: ${response.statusText}`);
                }

                const data = await response.json() as PredictionResponse;
                if (data.error) {
                    console.error(`[Signal Generator] Prediction error for ${symbol}: ${data.error}`);
                    resolve([]);
                    continue;
                }

                const signals: TierSignal[] = [];
                for (const [tier, result] of Object.entries(data.tiers)) {
                    signals.push({
                        symbol,
                        tier,
                        probability: result.probability,
                        threshold: result.threshold,
                        atr: data.atr_value,
                        tpPct: result.tp,
                        atrSlMultiplier: result.atr_sl_multiplier,
                        decision: result.decision
                    });
                }

                // Confluence bonus
                const alSignals = signals.filter(s => s.decision === "AL");
                if (alSignals.length >= 2) {
                    signals.forEach(s => {
                        if (s.decision === "AL") {
                            s.confluenceBonus = alSignals.length * 2;
                            s.probability = Math.min(1.0, s.probability + (s.confluenceBonus / 100));
                        }
                    });
                }

                resolve(signals);
            } catch (error) {
                const errMsg = (error as Error).message;
                console.error(`[Signal Generator] Tahmin motorunda hata [${symbol}]:`, errMsg);
                StateDB.addSystemLog("ERROR", "Signal Generator", `Tahmin motorunda hata [${symbol}]: ${errMsg}`);
                resolve([]);
            }

            // Pause for 40ms to let the Python server breathe before next request
            await new Promise(r => setTimeout(r, 40));
        }

        this.isProcessingQueue = false;
    }

    /**
     * Python XGBoost HTTP Microservice'ine istek atar (sıralı kuyruk aracılığıyla).
     */
    public async evaluateOnCandleClose(symbol: string, klines: any[], btcClose: number[]): Promise<TierSignal[]> {
        return new Promise<TierSignal[]>((resolve, reject) => {
            HybridSignalGenerator.requestQueue.push({
                symbol,
                klines,
                btcClose,
                resolve,
                reject
            });
            HybridSignalGenerator.runQueue(this.inferenceUrl).catch(reject);
        });
    }
}
