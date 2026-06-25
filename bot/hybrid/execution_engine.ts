import { TierSignal } from './signal_generator';
import { StateDB } from '../database';
import { HybridRiskManager } from './risk_manager';

export interface SimPosition {
    id: string;
    symbol: string;
    tier: string;
    entryPrice: number;
    entryTime: number;
    quantity: number;
    tp: number;
    sl: number;
    trailingActivation: number;
    trailingDistance: number;
    status: 'OPEN' | 'CLOSED';
    probability: number;
}

export class SimulationEngine {
    private positions: SimPosition[] = [];
    private capital = 1000; // Başlangıç sermayesi (Simülasyon)
    private riskManager: HybridRiskManager;

    constructor() {
        try {
            const settings = StateDB.getSettings();
            this.capital = settings.capital ?? 1000;
        } catch (e) {
            this.capital = 1000;
        }
        this.riskManager = new HybridRiskManager({
            totalCapital: this.capital,
            maxRiskPerTradePct: 0.02, // %2 risk per trade
            maxPositionSizePct: 0.10  // %10 max position size ($1000 for $10000 capital)
        });
        this.loadOpenPositions();
    }

    private loadOpenPositions() {
        try {
            const settings = StateDB.getSettings();
            this.capital = settings.capital ?? 1000;

            const openPos = StateDB.getOpenPositions().filter(p => p.strategy.startsWith('Hybrid_XGBoost'));
            this.positions = []; // Reset the in-memory array to match the DB
            for (const p of openPos) {
                // Tier is stored as 'Hybrid_XGBoost_micro_scalp'
                const tier = p.strategy.replace('Hybrid_XGBoost_', '') || 'unknown';
                const isSwing = !['micro_scalp', 'scalp'].includes(tier);
                this.positions.push({
                    id: p.id,
                    symbol: p.symbol,
                    tier: tier,
                    entryPrice: p.entryPrice,
                    entryTime: p.entry_candle_time * 1000,
                    quantity: p.quantity,
                    tp: p.tp_price,
                    sl: p.sl_price,
                    trailingActivation: isSwing ? (p.trailing_activation ?? (p.tp_price * 0.95)) : 0,
                    trailingDistance: isSwing ? (p.trailing_distance ?? (p.entryPrice * 0.01)) : 0,
                    status: 'OPEN',
                    probability: (p.setup_score || 0) / 100
                });
            }
            this.riskManager.updateCapital(this.capital);
        } catch (e) {
            console.log("StateDB okunamadı, yeni simülasyon başlatılıyor.");
        }
    }

    public calculateExitLevels(signal: TierSignal, currentPrice: number) {
        // Stop loss: ATR * multiplier kadar aşağıda
        const slDistance = signal.atr * signal.atrSlMultiplier;
        const sl = Math.max(currentPrice * 0.01, currentPrice * (1 - slDistance)); // Sorun #18: SL negatife düşme koruması
        
        // Take profit: hedef kar kadar yukarıda
        const tp = currentPrice * (1 + signal.tpPct / 100);
        
        // Trailing stop: Hedefin %50'sine gelince aktifleşir (Sadece swing işlemler için, yani hedef >= %2.0)
        // Scalp işlemlerinde dar hedefler nedeniyle komisyon kaybını önlemek için iz süren stop devre dışı bırakılır.
        const isSwing = signal.tpPct >= 2.0;
        const trailingActivation = isSwing ? currentPrice * (1 + (signal.tpPct * 0.5) / 100) : 0;
        
        // İz süren stop mesafesi: ATR * (multiplier - 0.5)
        const trailingDistance = isSwing ? currentPrice * (signal.atr * Math.max(0.5, signal.atrSlMultiplier - 0.5)) : 0;

        return { tp, sl, trailingActivation, trailingDistance };
    }

    public calculateSize(slDistancePct: number): number {
        // Girişleri doğrudan sermayenin %10'u yapıyoruz (10.000$ kasa için 1000$)
        return this.capital * 0.10;
    }

    public async openPosition(signal: TierSignal, price: number, entryTimeMs?: number) {
        // Cooldown/Blacklist kontrolü (SL sonrası soğuma süresi)
        if (StateDB.isBlacklisted(signal.symbol)) {
            console.log(`[Engine] ⏳ Sinyal reddedildi: ${signal.symbol} şu an soğuma süresinde.`);
            return;
        }

        // Zaten aynı sembolden AYNI katmanda (tier) açık pozisyon var mı? (Farklı katmanlarda eşzamanlı pozisyonlara izin veriliyor)
        const existing = this.positions.find(p => p.symbol === signal.symbol && p.tier === signal.tier && p.status === 'OPEN');
        if (existing) {
            return; // Aynı coinde aynı katmanda zaten pozisyon var
        }

        // Global Max Açık Pozisyon Kontrolü
        // Kullanıcı isteği: Normalde maxConcurrent, çok güçlü fırsatlarda (prob >= 0.80) 2 katı
        const settings = StateDB.getSettings();
        const maxConcurrent = settings.maxConcurrent ?? 5;
        const openPositionsCount = this.positions.filter(p => p.status === 'OPEN').length;
        const maxLimit = signal.probability >= 0.80 ? maxConcurrent * 2 : maxConcurrent;

        if (openPositionsCount >= maxLimit) {
            console.log(`[Engine] 🛑 Maksimum açık pozisyon limitine (${maxLimit}) ulaşıldı. Sinyal atlanıyor: ${signal.symbol}`);
            return;
        }

        const exits = this.calculateExitLevels(signal, price);
        
        // Sorun #8: RiskManager Entegrasyonu & Dinamik Parametre Ayarlaması
        this.riskManager.updateConfig({
            totalCapital: this.capital,
            maxRiskPerTradePct: settings.maxRiskPerTradePct ?? 0.02, // Varsayılan %2 risk
            maxPositionSizePct: settings.maxPositionSizePct ?? 0.10   // Varsayılan %10 max bütçe
        });
        const approved = this.riskManager.evaluateSignal({
            symbol: signal.symbol,
            entryPrice: price,
            stopLossPrice: exits.sl,
            takeProfitPrice: exits.tp,
            winProbability: signal.probability
        });

        if (!approved) {
            console.log(`[Engine] 🛑 Risk Yönetimi sinyali reddetti: ${signal.symbol} (${signal.tier})`);
            return;
        }

        const quantity = approved.quantity;
        const entryTime = entryTimeMs || Date.now();

        const pos: SimPosition = {
            id: `SIM-HYB-${signal.symbol}-${signal.tier}-${entryTime}`,
            symbol: signal.symbol,
            tier: signal.tier,
            entryPrice: price,
            entryTime: entryTime,
            quantity: quantity,
            tp: exits.tp,
            sl: exits.sl,
            trailingActivation: exits.trailingActivation,
            trailingDistance: exits.trailingDistance,
            status: 'OPEN',
            probability: signal.probability
        };

        this.positions.push(pos);

        // Veritabanına kaydet
        try {
            StateDB.addPosition({
                id: pos.id,
                symbol: pos.symbol,
                strategy: `Hybrid_XGBoost_${pos.tier}`,
                entryPrice: pos.entryPrice,
                quantity: pos.quantity,
                side: 'LONG',
                status: 'OPEN',
                tp_price: pos.tp,
                sl_price: pos.sl,
                entry_candle_time: Math.floor(pos.entryTime / 1000),
                setup_score: Math.round(pos.probability * 100),
                trailing_activation: pos.trailingActivation,
                trailing_distance: pos.trailingDistance
            });
            console.log(`[Engine] 🟢 AL (${signal.tier}) ${signal.symbol} @ ${price} | Hedef: %${signal.tpPct.toFixed(2)} | Miktar: ${quantity.toFixed(4)} | SL ATR x${signal.atrSlMultiplier}`);
        } catch (e) {
            console.error("DB kayit hatasi:", e);
        }
    }

    public getOpenPositions(symbol?: string): SimPosition[] {
        this.loadOpenPositions(); // Always sync from DB
        if (symbol) {
            return this.positions.filter(p => p.symbol === symbol && p.status === 'OPEN');
        }
        return this.positions.filter(p => p.status === 'OPEN');
    }

    private closePosition(pos: SimPosition, closePrice: number, reason: string) {
        pos.status = 'CLOSED';
        
        const settings = StateDB.getSettings();
        const initialCost = pos.entryPrice * pos.quantity;
        const revenue = closePrice * pos.quantity;
        
        // Komisyon Hesabı (Dinamik Ayarlardan):
        const buyFeeRate = settings.buyFeeRate ?? 0.0010;
        const sellFeeRate = settings.sellFeeRate ?? 0.0015;
        
        const entryFee = initialCost * buyFeeRate;
        const exitFeeRate = reason === 'TP_HIT' ? buyFeeRate : sellFeeRate;
        const exitFee = revenue * exitFeeRate;
        
        const fee = entryFee + exitFee;
        const pnl = revenue - initialCost - fee;

        this.capital = Math.max(0, this.capital + pnl); // Sorun #22: Sermaye negatif olmama koruması
        this.riskManager.updateCapital(this.capital);

        try {
            StateDB.closePosition(pos.id, closePrice, pnl, reason);
            const icon = pnl > 0 ? '✅' : '❌';
            console.log(`[Engine] ${icon} KAPATILDI (${reason}): ${pos.symbol} [${pos.tier}] @ ${closePrice} | PnL: $${pnl.toFixed(4)}`);
            
            // SL_HIT durumunda 15 dakikalık soğuma süresi (blacklist) başlat
            if (reason === 'SL_HIT') {
                const cooldownMs = 15 * 60 * 1000; // 15 dakika
                StateDB.addToBlacklist(pos.symbol, Date.now() + cooldownMs);
                StateDB.addSystemLog("WARN", "Engine", `${pos.symbol} için SL sonrası 15 dakikalık soğuma süresi (cooldown) başlatıldı.`);
                console.log(`[Engine] ⏳ ${pos.symbol} için SL sonrası 15 dakikalık soğuma süresi başlatıldı.`);
            }

            // Sermayeyi veritabanına kaydet
            settings.capital = this.capital;
            StateDB.saveSettings(settings);
        } catch (e) {
            console.error("Kapanış DB kayıt hatası:", e);
        }
    }

    public checkExits(symbol: string, currentPrice: number, currentHigh: number, currentLow: number, currentCandleTime?: number) {
        const openPos = this.getOpenPositions(symbol);
        if (openPos.length > 0) {
            console.log(`[Engine] checkExits for ${symbol} | Price: ${currentPrice} | High: ${currentHigh} | Low: ${currentLow} | Open Positions: ${openPos.length}`);
        }
        
        for (const pos of openPos) {
            // 1. Stop Loss Kontrolü
            if (currentLow <= pos.sl) {
                // Eger slippage simule etmek istersek pos.sl fiyati ile kapatabiliriz
                this.closePosition(pos, pos.sl, 'SL_HIT');
                continue;
            }
            
            // 2. Take Profit Kontrolü
            if (currentHigh >= pos.tp) {
                this.closePosition(pos, pos.tp, 'TP_HIT');
                continue;
            }
            
            // 2.5 Başabaş (Breakeven - BE) Koruması:
            // Fiyat hedefin %30'una ulaştığında, Stop Loss'u giriş fiyatına çekerek işlemi risksiz hale getir.
            // Sadece Stop Loss hala giriş fiyatının altındaysa devreye girer.
            const targetDistance = pos.tp - pos.entryPrice;
            const beThreshold = pos.entryPrice + targetDistance * 0.30;
            if (currentHigh >= beThreshold && pos.sl < pos.entryPrice) {
                pos.sl = pos.entryPrice; // SL'yi giriş fiyatına eşitle
                try {
                    StateDB.updatePosition(pos.id, { sl_price: pos.entryPrice });
                    StateDB.addSystemLog("INFO", "Engine", `${pos.symbol} [${pos.tier}] için hedefin %30'una ulaştı. SL giriş fiyatına (${pos.entryPrice}) taşınarak Başabaş (Breakeven) aktif edildi.`);
                    console.log(`[Engine] 🛡️ ${pos.symbol} [${pos.tier}] için Başabaş (Breakeven) aktif edildi: SL = ${pos.entryPrice}`);
                } catch (e) {}
            }
            
            // 3. Trailing Stop Aktivasyonu ve Guncellemesi
            if (pos.trailingActivation && currentHigh >= pos.trailingActivation) {
                const newSl = currentHigh - pos.trailingDistance; // Sorun #19: Trailing stop currentHigh kullanmalı
                if (newSl > pos.sl) {
                    pos.sl = newSl; // SL'yi yukarı çek
                    try {
                        StateDB.updatePosition(pos.id, { sl_price: newSl, trailing_activated: 1 });
                    } catch (e) {}
                }
            }
            
            // 4. Timeout Kontrolü (Max Hold Bars)
            // tier'dan max_hold_bars'ı tahmin et veya conf'dan al
            let maxHoldBars = 96; // default
            if (pos.tier === 'micro_scalp') maxHoldBars = 9;
            else if (pos.tier === 'scalp') maxHoldBars = 24;
            else if (pos.tier === 'swing_short') maxHoldBars = 48;
            else if (pos.tier === 'swing_mid') maxHoldBars = 96;
            else if (pos.tier === 'swing_long') maxHoldBars = 288;
            
            let currentMs = currentCandleTime ? currentCandleTime : Date.now();
            
            // Saat düzeltmeleri veya timezone uyuşmazlığı nedeniyle giriş zamanı gelecekten geliyorsa, şu anki zamana çek
            if (pos.entryTime > currentMs) {
                console.warn(`[Engine] UYARI: ${pos.symbol} [${pos.tier}] giriş zamanı (${pos.entryTime}) gelecekten geliyor (${currentMs}). Düzeltiliyor.`); // Sorun #17: Zaman düzeltme uyarısı
                pos.entryTime = currentMs;
                try {
                    StateDB.updatePosition(pos.id, { entry_candle_time: Math.floor(currentMs / 1000) });
                } catch (e) {}
            }

            const holdMs = currentMs - pos.entryTime;
            const holdingBars = holdMs / (5 * 60 * 1000);
            
            if (holdingBars >= maxHoldBars) {
                this.closePosition(pos, currentPrice, 'TIMEOUT');
            }
        }
    }
}
