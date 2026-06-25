import { SimPosition, ExpertSignal, BotConfig } from './types';

export class RiskManager {
  /**
   * Calculates position size based on Stop Loss distance (Risk-to-Stop model)
   * with a budget cap based on maxConcurrent slots.
   */
  static calculatePositionSize(
    equity: number,
    cash: number,
    signal: ExpertSignal,
    botConfig: BotConfig,
    maxConcurrent: number,
    multiplier: number = 1.0,
    isShadow: boolean = false
  ): { quantity: number; cost: number; allowed: boolean; reason?: string } {
    if (signal.entry_price <= 0) {
      return { quantity: 0, cost: 0, allowed: false, reason: 'Invalid entry price (<= 0)' };
    }
    
    // Stop distance percentage
    const stopDistancePct = Math.abs(signal.entry_price - signal.stop_loss) / signal.entry_price;
    if (stopDistancePct === 0) {
      return { quantity: 0, cost: 0, allowed: false, reason: 'Invalid stop loss distance (0)' };
    }

    // Risk percentage of equity (scaled by bot health stats multiplier)
    const riskPct = botConfig.base_risk_pct * multiplier;
    if (riskPct <= 0) {
      return { quantity: 0, cost: 0, allowed: false, reason: 'Bot risk multiplier is zero (disabled or shadow)' };
    }

    // Capital risk in USD (amount we are willing to lose)
    const usdRisk = equity * riskPct;

    // Calculate raw position size based on risk
    // If stop is 2% and we risk $10, size = $10 / 0.02 = $500
    let sizeUsd = usdRisk / stopDistancePct;

    // Capital slot budget cap: we cannot allocate more than (1 / maxConcurrent) of equity to a single trade
    const safeMaxConcurrent = Math.max(1, maxConcurrent);
    const maxSlotUsd = equity / safeMaxConcurrent;
    if (sizeUsd > maxSlotUsd) {
      sizeUsd = maxSlotUsd;
    }

    // Verify cash availability
    if (!isShadow && cash < sizeUsd) {
      if (cash >= maxSlotUsd * 0.1) { // If we have at least 10% of a slot
        sizeUsd = cash; // Safely cap to remaining cash (it's less than what risk allows, so risk is still managed)
      } else {
        return { quantity: 0, cost: 0, allowed: false, reason: `Insufficient cash: needed ${sizeUsd.toFixed(2)} USD, available cash: ${cash.toFixed(2)} USD` };
      }
    }

    const quantity = sizeUsd / signal.entry_price;

    return {
      quantity,
      cost: sizeUsd,
      allowed: true
    };
  }

  /**
   * Enforces global portfolio limits
   */
  static checkGlobalLimits(
    openPositions: SimPosition[],
    signal: ExpertSignal,
    maxConcurrent: number,
    dailyLossPct: number,
    maxDailyLossLimit: number = 0.02, // Default 2.0% daily loss limit
    isShadow: boolean = false
  ): { allowed: boolean; reason?: string } {
    
    // 1. Max concurrent count limit
    const activeOpenCount = openPositions.filter(p => !p.isShadow).length;
    const shadowOpenCount = openPositions.filter(p => p.isShadow).length;

    if (!isShadow && activeOpenCount >= maxConcurrent) {
      return { allowed: false, reason: 'Max concurrent positions reached' };
    }
    if (isShadow && shadowOpenCount >= maxConcurrent) {
      return { allowed: false, reason: 'Max concurrent shadow positions reached' };
    }

    // 2. Exposure limit: no double trades on same symbol
    if (openPositions.some(p => p.symbol === signal.symbol && !!p.isShadow === isShadow)) {
      return { allowed: false, reason: `Already hold a ${isShadow ? 'shadow ' : ''}position in ${signal.symbol}` };
    }

    // 3. Daily loss limit check
    if (!isShadow && dailyLossPct >= maxDailyLossLimit) {
      return { allowed: false, reason: `Daily loss limit reached (${(dailyLossPct * 100).toFixed(2)}%)` };
    }

    return { allowed: true };
  }
}
