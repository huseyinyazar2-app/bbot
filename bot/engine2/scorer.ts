import { ExpertSignal, MarketRegime, BotStats } from './types';
import { IndicatorData } from '../indicators';

export class SignalScorer {
  /**
   * Scores a single signal from 0 to 100.
   * For Dynamic bots, the setup_score is already the Out-Of-Sample win rate (e.g. 80.5)
   */
  static scoreSignal(
    signal: ExpertSignal,
    regime: MarketRegime,
    ind: IndicatorData,
    botStats?: BotStats
  ): number {
    let score = signal.setup_score;

    // We can add dynamic penalty/bonus logic here if needed in the future
    // For now, the AI out-of-sample win rate is the ultimate source of truth

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Resolves collisions and conflunces between raw signals.
   * Returns a clean array of scored signals sorted by score.
   */
  static resolveCollisions(
    signals: { signal: ExpertSignal; score: number }[]
  ): { signal: ExpertSignal; score: number; confluence_bonus: number }[] {
    
    // Group signals by symbol
    const grouped = new Map<string, { signal: ExpertSignal; score: number }[]>();
    for (const item of signals) {
      const list = grouped.get(item.signal.symbol) || [];
      list.push(item);
      grouped.set(item.signal.symbol, list);
    }

    const resolved: { signal: ExpertSignal; score: number; confluence_bonus: number }[] = [];

    for (const [symbol, list] of grouped.entries()) {
      const hasLong = list.some(i => i.signal.direction === 'LONG');
      const hasShort = list.some(i => i.signal.direction === 'SHORT');
      if (hasLong && hasShort) {
        // Skip both due to conflict
        continue; 
      }

      // Sort by score desc, highest score is the LEAD signal
      list.sort((a, b) => b.score - a.score);
      const lead = list[0];
      
      const bonus = (list.length - 1) * 2; // +2 bonus for each overlapping dynamic rule
      const finalScore = Math.min(100, lead.score + bonus);

      resolved.push({
        signal: lead.signal,
        score: finalScore,
        confluence_bonus: bonus
      });
    }

    // Sort all resolved signals by score desc
    return resolved.sort((a, b) => b.score - a.score);
  }

  static getBotAllowedRegimes(botId: string): MarketRegime[] {
    // Dynamic bots are regime-agnostic by default, their rules handle market state
    return ['BTC_BULL', 'BTC_BEAR', 'BTC_RANGE', 'BTC_PANIC', 'BTC_RECOVERY'];
  }
}
