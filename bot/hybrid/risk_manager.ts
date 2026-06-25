export interface RiskConfig {
  totalCapital: number;       // Kasadaki toplam kullanılabilir para (Örn: 10000 USD)
  maxRiskPerTradePct: number; // İşlem başına riske edilecek maksimum kasa yüzdesi (Örn: %2.0 = 0.02)
  maxPositionSizePct: number; // Bir işlemin kasanın yüzde kaçını geçemeyeceği (Örn: %20)
}

export interface Signal {
  symbol: string;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  winProbability: number;     // XGBoost'un verdiği kazanma ihtimali (Örn: 0.75)
}

export interface ApprovedTrade {
  symbol: string;
  quantity: number;           // Kaç adet alınacağı (Örn: 40 SOL)
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  allocatedCapital: number;   // Bu işleme bağlanan toplam sermaye (Quantity * EntryPrice)
  riskAmount: number;         // Stop olursa kaybedilecek para (USD)
}

/**
 * Kantitatif (Quant) Risk Yöneticisi
 * İşlem başına Fixed Fractional Risk modelini kullanır.
 */
export class HybridRiskManager {
  private config: RiskConfig;

  constructor(config: RiskConfig) {
    this.config = config;
  }

  public updateCapital(newCapital: number) {
    this.config.totalCapital = newCapital;
  }

  public updateConfig(newConfig: Partial<RiskConfig>) {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }

  /**
   * Sinyal Motorundan gelen "Al" isteğini inceler ve miktar hesaplar.
   * Eğer risk çok yüksekse işlemi reddeder.
   */
  public evaluateSignal(signal: Signal): ApprovedTrade | null {
    if (signal.entryPrice <= 0 || signal.stopLossPrice <= 0) {
      console.warn(`[Risk Manager] REDDEDİLDİ: Geçersiz fiyat bilgisi (Entry: ${signal.entryPrice}, SL: ${signal.stopLossPrice}).`);
      return null;
    }

    if (signal.stopLossPrice >= signal.entryPrice) {
      console.warn(`[Risk Manager] REDDEDİLDİ: Stop Loss (${signal.stopLossPrice}) giriş fiyatından (${signal.entryPrice}) büyük veya eşit olamaz.`);
      return null;
    }

    // 1. İzin verilen maksimum dolar riski (Örn: 10000 * 0.02 = 200 Dolar)
    const maxRiskAmount = this.config.totalCapital * this.config.maxRiskPerTradePct;

    // 2. Bir adet coin alındığında stop olursa edilecek zarar
    const riskPerCoin = signal.entryPrice - signal.stopLossPrice;

    // 3. Alınması gereken miktar
    let quantity = maxRiskAmount / riskPerCoin;

    // 4. Kasa Yönetimi (Position Sizing) Kontrolü
    const totalCost = quantity * signal.entryPrice;
    const maxAllowedCost = this.config.totalCapital * this.config.maxPositionSizePct;

    if (totalCost > maxAllowedCost) {
      // Eğer hesaplanan miktar, "Kasadan en fazla %20 bağlanabilir" kuralını aşıyorsa miktarı kırp.
      // Bu durum genelde Stop-Loss çok dar (küçük) olduğunda miktar devasa çıkmasın diye kullanılır.
      const adjustedQuantity = maxAllowedCost / signal.entryPrice;
      
      console.log(`[Risk Manager] UYARI: ${signal.symbol} için hesaplanan miktar (${quantity}) kasa limitini aşıyor. Miktar ${adjustedQuantity} olarak kırpıldı.`);
      quantity = adjustedQuantity;
    }

    // Gerçek risk edilen tutar
    const finalRiskAmount = quantity * (signal.entryPrice - signal.stopLossPrice);

    return {
      symbol: signal.symbol,
      quantity: quantity,
      entryPrice: signal.entryPrice,
      stopLossPrice: signal.stopLossPrice,
      takeProfitPrice: signal.takeProfitPrice,
      allocatedCapital: quantity * signal.entryPrice,
      riskAmount: finalRiskAmount
    };
  }
}
