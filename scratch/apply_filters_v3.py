import os
import re

STRAT_DIR = "c:\\Users\\hyaza\\Documents\\antigravitiy\\borsabotu\\bot\\engine2\\strategies"

# Bot configurations
# Action: 'DISABLE', or a tuple (Indicator, Operator, Value)
FILTERS = {
    'b01_htf_trend.ts': ('adx', '<', 15),
    'b02_trend_pullback.ts': 'DISABLE',
    'b05_momentum_continuation.ts': 'REGIME_EXCLUDE',
    'b06_breakout_retest.ts': ('adx', '<', 15),
    'b07_volume_breakout.ts': 'DISABLE',
    'b08_squeeze_breakout.ts': ('rvol', '>=', 1.8),
    'b09_range_expansion.ts': ('rsi', '>=', 60),
    'b11_range_support.ts': 'DISABLE',
    'b12_vwap_reclaim.ts': 'DISABLE',
    'b13_bollinger_reclaim.ts': ('adx', '<', 35),
    'b14_rsi_reclaim.ts': 'DISABLE',
    'b15_failed_breakdown.ts': ('rsi', '>=', 70),
    'b16_capitulation_wick.ts': ('rsi', '>=', 30),
    'b17_btc_recovery.ts': 'REGIME_INCLUDE',
    'b18_oversold_leader.ts': ('rsi', '>=', 30),
    'b19_market_reclaim.ts': ('rsi', '>=', 65),
    'b20_4h_swing_trend.ts': ('rsi', '>=', 65),
    'b21_daily_trend.ts': ('rsi', '>=', 70),
    'b23_long_term_retest.ts': ('rsi', '>=', 60),
    'b24_portfolio_rebalance.ts': ('rsi', '>=', 55),
}

def clean_previous_edits(content):
    # Remove manual manual edits like "YZ UYARISI" and manual ADX/RSI logic
    lines = content.split('\n')
    new_lines = []
    skip = False
    for line in lines:
        if "YZ UYARISI: İstatistiksel başarısızlık nedeniyle bot geçici olarak kapatıldı." in line:
            continue
        if "YZ Filtresi: ADX < 15 olmalı" in line or "YZ Filtresi: RSI" in line or "YZ Filtresi: rvol" in line or "YZ Filtresi: BTC_RANGE" in line or "YZ Filtresi: BTC_BULL" in line or "YZ önerisi: Sadece PANIC" in line:
            skip = True
            continue
        if skip:
            if "if (currentAdx" in line or "if (currentRsi" in line or "const sl =" in line or "const tp =" in line or "return null;" in line:
                if "const sl =" in line or "const tp =" in line:
                    skip = False
                    # We still need the SL/TP lines! So we don't skip them.
                    pass
                else:
                    continue
            else:
                pass
        
        # We need a safer way. Let's just remove the exact blocks I added.
        pass

# Since regex cleanup is dangerous, I will just read original files from a backup or I'll just write the replace exactly.
# I will just write a function that injects the filter immediately before `return { bot_id:`
