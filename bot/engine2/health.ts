import { BotStats, BotStatus } from './types';

export class BotHealthTracker {
  /**
   * Initializes health stats for a strategy bot.
   */
  static initBotStats(botId: string, initialStatus: BotStatus = 'ACTIVE'): BotStats {
    return {
      bot_id: botId,
      trades_count: 0,
      win_rate: 0,
      pnl: 0,
      rolling_pnl: [],
      profit_factor: 1.0,
      expectancy: 0.0,
      status: initialStatus,
      capital_multiplier: initialStatus === 'ACTIVE' ? 1.0 : (initialStatus === 'PRIME' ? 1.25 : 0.0)
    };
  }

  /**
   * Updates health stats based on the rolling window of the last 30 trades
   * and manages status promotions/demotions.
   */
  static updateStats(stats: BotStats, tradePnl: number): BotStats {
    stats.trades_count++;
    stats.pnl += tradePnl;
    
    // Add to rolling history (max 30 trades to keep stats responsive to recent market trends)
    stats.rolling_pnl.push(tradePnl);
    if (stats.rolling_pnl.length > 30) {
      stats.rolling_pnl.shift();
    }

    // Calculate metrics
    const wins = stats.rolling_pnl.filter(p => p > 0);
    const losses = stats.rolling_pnl.filter(p => p < 0);
    const winCount = wins.length;
    stats.win_rate = stats.rolling_pnl.length > 0 ? (winCount / stats.rolling_pnl.length) * 100 : 0;

    const totalWinsVal = wins.reduce((sum, v) => sum + v, 0);
    const totalLossesVal = Math.abs(losses.reduce((sum, v) => sum + v, 0));
    stats.profit_factor = totalLossesVal > 0 ? totalWinsVal / totalLossesVal : (totalWinsVal > 0 ? 99.9 : 1.0);

    const avgWin = wins.length > 0 ? totalWinsVal / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLossesVal / losses.length : 0;
    const wr = winCount / stats.rolling_pnl.length;
    stats.expectancy = (wr * avgWin) - ((1 - wr) * avgLoss);

    // Promote / Demote flow
    let nextStatus = stats.status;
    let nextMultiplier = stats.capital_multiplier;

    // Consecutive losses check (last 5 trades)
    const last5 = stats.rolling_pnl.slice(-5);
    const is5Losses = last5.length === 5 && last5.every(p => p < 0);

    if (stats.rolling_pnl.length >= 10) {
      let targetStatus: BotStatus = 'ACTIVE';
      if (stats.expectancy < 0) targetStatus = 'SHADOW';
      else if (stats.profit_factor < 1.0 || is5Losses) targetStatus = 'PROBATION';
      else if (stats.profit_factor >= 1.5 && stats.trades_count >= 20) targetStatus = 'PRIME';
      
      const ranks: BotStatus[] = ['SHADOW', 'PROBATION', 'ACTIVE', 'PRIME'];
      if (!ranks.includes(stats.status)) return stats;
      const currentRank = ranks.indexOf(stats.status);
      const targetRank = ranks.indexOf(targetStatus);
      
      let nextRank = currentRank;
      if (targetRank > currentRank) nextRank = currentRank + 1; // promote 1 level
      else if (targetRank < currentRank) nextRank = currentRank - 1; // demote 1 level
      
      nextStatus = ranks[nextRank];
      const mults: Record<string, number> = { 'SHADOW': 0.0, 'PROBATION': 0.5, 'ACTIVE': 1.0, 'PRIME': 1.25 };
      nextMultiplier = mults[nextStatus as keyof typeof mults] || 1.0;
    } else {
      // Warmup phase (fewer than 10 trades)
      if (is5Losses) {
        nextStatus = 'PROBATION';
        nextMultiplier = 0.5;
      } else {
        // Recover to Active if shadow was set initially
        nextStatus = stats.status === 'SHADOW' ? 'PROBATION' : 'ACTIVE';
        nextMultiplier = nextStatus === 'PROBATION' ? 0.5 : 1.0;
      }
    }

    stats.status = nextStatus;
    stats.capital_multiplier = nextMultiplier;

    return stats;
  }
}
