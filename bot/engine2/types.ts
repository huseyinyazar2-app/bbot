export type MarketRegime = 
  | 'BTC_BULL' 
  | 'BTC_BEAR' 
  | 'BTC_RANGE' 
  | 'BTC_PANIC' 
  | 'BTC_RECOVERY';

export type BotStatus =
  | 'RESEARCH'
  | 'BACKTEST_PASS'
  | 'SHADOW'
  | 'PAPER'
  | 'MICRO_LIVE'
  | 'ACTIVE'
  | 'PRIME'
  | 'PROBATION'
  | 'DISABLED';

export interface ExpertSignal {
  bot_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  timeframe: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  trailing_stop?: number; // percent trailing stop distance (e.g. 1.0)
  max_hold_bars?: number;
  setup_score: number; // 0 to 100
  reason: string;
}

export interface BotConfig {
  bot_id: string;
  bot_name: string;
  enabled: boolean;
  status: BotStatus;
  allowed_regimes: MarketRegime[];
  base_risk_pct: number; // e.g. 0.005 for 0.5% risk
  min_score_to_trade: number; // e.g. 75
}

export interface BotStats {
  bot_id: string;
  trades_count: number;
  win_rate: number;
  pnl: number;
  rolling_pnl: number[]; // last N trades Pnl
  profit_factor: number;
  expectancy: number;
  status: BotStatus;
  capital_multiplier: number; // e.g. 0.5 for probation, 1.0 for active, 0.0 for disabled/shadow
}

export interface SimPosition {
  id: string;
  symbol: string;
  bot_id: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  entryTime: number;
  entryCandleTime: number;
  slPrice: number;
  tpPrice: number;
  trailingActivated?: number;
  trailingPrice?: number;
  trailingDistancePct?: number;
  realizedPnl?: number;
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitTime?: number;
  exitReason?: string;
  finalPnl?: number;
  setup_score: number;
  confluence_bonus?: number;
  isShadow?: boolean;
  entry_rsi?: number;
  entry_rvol?: number;
  entry_adx?: number;
  btc_regime?: string;
}
