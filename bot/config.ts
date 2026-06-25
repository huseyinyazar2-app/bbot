export const CONFIG = {
  MAX_CONCURRENT_TRADES: 3,
  TOTAL_CAPITAL_ALLOCATION: 1.0, // Toplam kasanın kullanılabilir yüzdesi
  TRADE_ALLOCATION: 0.33, // Her işlemde 1/3 (max 3 işlem)
  VIP_LIST_REFRESH_MINUTES: 240, // 4 Saat
  SCAN_TIMEFRAME: '5m',
  KILL_SWITCH_TIMEFRAME: '15m',
  QUOTE_ASSET: 'USDT',
  BLACKLIST_CANDLES: 3, // Zarar stobu sonrası 15 dk blacklist
  FEE_RATE: 0.001, // 0.1% per side (Binance standart taker). Round-trip = 0.2%
  EXCLUDED_COINS: ['USDCUSDT', 'FDUSDUSDT', 'TUSDUSDT', 'AEURUSDT', 'EURUSDT', 'BUSDUSDT', 'TRYUSDT']
};
