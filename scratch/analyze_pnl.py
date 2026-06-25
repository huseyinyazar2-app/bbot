import sqlite3
import pandas as pd
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bot_state.db")

def main():
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT strategy, pnl, entry_rsi, entry_rvol, entry_adx, btc_regime FROM positions WHERE status = 'CLOSED'", conn)
    conn.close()

    if len(df) == 0:
        print("Veri bulunamadı.")
        return

    total_trades_before = len(df)
    win_rate_before = (df['pnl'] > 0).mean() * 100
    pnl_before = df['pnl'].sum()

    print(f"=== ÖNCESİ (MEVCUT DURUM) ===")
    print(f"Toplam İşlem: {total_trades_before}")
    print(f"Kazanma Oranı (WR): %{win_rate_before:.2f}")
    print(f"Toplam Kâr/Zarar: ${pnl_before:.2f}\n")

    # Filtreleri Uygula
    # Kapatılacaklar
    disabled_bots = ['B02_TREND_PULLBACK', 'B07_VOLUME_BREAKOUT', 'B11_RANGE_SUPPORT', 'B12_VWAP_RECLAIM', 'B14_RSI_RECLAIM']
    df_after = df[~df['strategy'].isin(disabled_bots)]

    # Nokta atışı filtreler
    # B01 -> adx < 15
    b01_mask = (df_after['strategy'] == 'B01_HTF_TREND_RETEST') & ~(df_after['entry_adx'] < 15)
    df_after = df_after[~b01_mask]

    # B05 -> BTC_BULL hariç
    b05_mask = (df_after['strategy'] == 'B05_MOMENTUM_CONTINUATION') & (df_after['btc_regime'] == 'BTC_BULL')
    df_after = df_after[~b05_mask]

    # B08 -> rvol >= 1.8
    b08_mask = (df_after['strategy'] == 'B08_SQUEEZE_BREAKOUT') & ~(df_after['entry_rvol'] >= 1.8)
    df_after = df_after[~b08_mask]

    # B13 -> adx < 35
    b13_mask = (df_after['strategy'] == 'B13_BOLLINGER_RECLAIM') & ~(df_after['entry_adx'] < 35)
    df_after = df_after[~b13_mask]

    # B15 -> rsi >= 70
    b15_mask = (df_after['strategy'] == 'B15_FAILED_BREAKDOWN') & ~(df_after['entry_rsi'] >= 70)
    df_after = df_after[~b15_mask]

    # B17 -> Sadece BTC_PANIC
    b17_mask = (df_after['strategy'] == 'B17_BTC_RECOVERY') & ~(df_after['btc_regime'] == 'BTC_PANIC')
    df_after = df_after[~b17_mask]

    # B19 -> rsi >= 65
    b19_mask = (df_after['strategy'] == 'B19_MARKET_RECLAIM') & ~(df_after['entry_rsi'] >= 65)
    df_after = df_after[~b19_mask]

    # B21 -> rsi >= 70
    b21_mask = (df_after['strategy'] == 'B21_DAILY_TREND') & ~(df_after['entry_rsi'] >= 70)
    df_after = df_after[~b21_mask]

    # B23 -> rsi >= 60
    b23_mask = (df_after['strategy'] == 'B23_LONG_TERM_RETEST') & ~(df_after['entry_rsi'] >= 60)
    df_after = df_after[~b23_mask]

    # B24 -> rsi >= 55
    b24_mask = (df_after['strategy'] == 'B24_PORTFOLIO_REBALANCE') & ~(df_after['entry_rsi'] >= 55)
    df_after = df_after[~b24_mask]

    # İyileştirilecekler
    # B06 -> adx < 15
    b06_mask = (df_after['strategy'] == 'B06_BREAKOUT_RETEST') & ~(df_after['entry_adx'] < 15)
    df_after = df_after[~b06_mask]

    # B09 -> rsi >= 60
    b09_mask = (df_after['strategy'] == 'B09_RANGE_EXPANSION') & ~(df_after['entry_rsi'] >= 60)
    df_after = df_after[~b09_mask]

    # B16 -> rsi >= 30
    b16_mask = (df_after['strategy'] == 'B16_CAPITULATION_WICK') & ~(df_after['entry_rsi'] >= 30)
    df_after = df_after[~b16_mask]

    # B18 -> rsi >= 30
    b18_mask = (df_after['strategy'] == 'B18_OVERSOLD_LEADER') & ~(df_after['entry_rsi'] >= 30)
    df_after = df_after[~b18_mask]

    # B20 -> rsi >= 65
    b20_mask = (df_after['strategy'] == 'B20_4H_SWING_TREND') & ~(df_after['entry_rsi'] >= 65)
    df_after = df_after[~b20_mask]

    total_trades_after = len(df_after)
    win_rate_after = (df_after['pnl'] > 0).mean() * 100 if total_trades_after > 0 else 0
    pnl_after = df_after['pnl'].sum()

    print(f"=== SONRASI (SADECE YAPAY ZEKA ONAYLI İŞLEMLER) ===")
    print(f"Toplam İşlem: {total_trades_after}")
    print(f"Kazanma Oranı (WR): %{win_rate_after:.2f}")
    print(f"Toplam Kâr/Zarar: ${pnl_after:.2f}")
    
    diff_pnl = pnl_after - pnl_before
    print(f"\nNet Finansal İyileşme: ${diff_pnl:.2f}")

if __name__ == '__main__':
    main()
