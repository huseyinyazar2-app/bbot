import sqlite3
import pandas as pd
import pandas_ta as ta
import numpy as np
import argparse
import json
import sys
import warnings
import traceback

warnings.filterwarnings('ignore')

def calculate_forward_target(df, tp_pct, sl_pct, buy_comm, sell_comm, lookahead=48):
    bc = buy_comm / 100.0
    sc = sell_comm / 100.0
    
    tp_mult = (1.0 + bc) * (1.0 + (tp_pct / 100.0)) / (1.0 - sc)
    sl_mult = (1.0 + bc) * (1.0 - (sl_pct / 100.0)) / (1.0 - sc)
    
    df['target_tp_price'] = df['close'] * tp_mult
    df['target_sl_price'] = df['close'] * sl_mult
    
    future_high = df['high'].rolling(window=lookahead, min_periods=1).max().shift(-lookahead)
    future_low = df['low'].rolling(window=lookahead, min_periods=1).min().shift(-lookahead)
    
    df['target'] = np.where((future_high >= df['target_tp_price']) & (future_low > df['target_sl_price']), 1, 0)
    return df
    
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tp', type=float, required=True)
    parser.add_argument('--sl', type=float, required=True)
    parser.add_argument('--rule', type=str, required=True)
    parser.add_argument('--limit', type=int, default=2000000)
    parser.add_argument('--buy-comm', type=float, default=0.1)
    parser.add_argument('--sell-comm', type=float, default=0.1)
    parser.add_argument('--lookahead', type=int, default=48)
    args = parser.parse_args()

    conn = None
    try:
        conn = sqlite3.connect('file:historical_klines.db?mode=ro', uri=True)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT symbol FROM klines")
        symbols = [row[0] for row in cursor.fetchall()]
        
        btc_df = None
        if 'BTCUSDT' in symbols:
            btc_query = "SELECT openTime, close as btc_close FROM klines WHERE symbol = 'BTCUSDT' ORDER BY openTime DESC"
            btc_df = pd.read_sql_query(btc_query, conn)
            if not btc_df.empty:
                btc_df.sort_values('openTime', inplace=True)
                btc_df.reset_index(drop=True, inplace=True)
                btc_df['btc_rsi_14'] = ta.rsi(btc_df['btc_close'], length=14)
                btc_sma_200 = ta.sma(btc_df['btc_close'], length=200)
                btc_df['btc_price_vs_sma200'] = (btc_df['btc_close'] - btc_sma_200) / btc_sma_200 * 100
                btc_df['btc_change_1h'] = btc_df['btc_close'].pct_change(periods=12) * 100
        
        eth_df = None
        if 'ETHUSDT' in symbols:
            eth_query = "SELECT openTime, close as eth_close FROM klines WHERE symbol = 'ETHUSDT' ORDER BY openTime DESC"
            eth_df = pd.read_sql_query(eth_query, conn)
            if not eth_df.empty:
                eth_df.sort_values('openTime', inplace=True)
                eth_df.reset_index(drop=True, inplace=True)
                eth_df['eth_rsi_14'] = ta.rsi(eth_df['eth_close'], length=14)
                eth_sma_200 = ta.sma(eth_df['eth_close'], length=200)
                eth_df['eth_price_vs_sma200'] = (eth_df['eth_close'] - eth_sma_200) / eth_sma_200 * 100
                eth_df['eth_change_1h'] = eth_df['eth_close'].pct_change(periods=12) * 100
        
        all_dfs = []
        limit_per_symbol = int(args.limit / len(symbols)) if len(symbols) > 0 else args.limit
        
        for sym in symbols:
            query = f"SELECT symbol, openTime, open, high, low, close, volume FROM klines WHERE symbol = '{sym}' ORDER BY openTime DESC LIMIT {limit_per_symbol}"
            grp = pd.read_sql_query(query, conn)
            
            if grp.empty:
                continue
                
            grp.sort_values('openTime', inplace=True)
            grp.reset_index(drop=True, inplace=True)
            if len(grp) < 100:
                continue
                
            try:
                grp['rsi_14'] = ta.rsi(grp['close'], length=14)
                grp['rsi_7'] = ta.rsi(grp['close'], length=7)
                grp['adx_14'] = ta.adx(grp['high'], grp['low'], grp['close'], length=14)['ADX_14']
                grp['cci_14'] = ta.cci(grp['high'], grp['low'], grp['close'], length=14)
                grp['mfi_14'] = ta.mfi(grp['high'], grp['low'], grp['close'], grp['volume'], length=14)
                
                grp['sma_50'] = ta.sma(grp['close'], length=50)
                grp['sma_200'] = ta.sma(grp['close'], length=200)
                grp['price_vs_sma50'] = (grp['close'] - grp['sma_50']) / grp['sma_50'] * 100
                grp['price_vs_sma200'] = (grp['close'] - grp['sma_200']) / grp['sma_200'] * 100
                
                macd = ta.macd(grp['close'])
                grp['macd'] = macd['MACD_12_26_9']
                grp['macd_hist'] = macd['MACDh_12_26_9']
                
                bb = ta.bbands(grp['close'], length=20)
                grp['bb_width'] = bb['BBB_20_2.0_2.0']
                grp['price_vs_bb_lower'] = (grp['close'] - bb['BBL_20_2.0_2.0']) / bb['BBL_20_2.0_2.0'] * 100
                
                grp['sma_vol_20'] = ta.sma(grp['volume'], length=20)
                grp['rvol'] = grp['volume'] / grp['sma_vol_20']
                
                if btc_df is not None:
                    grp = pd.merge(grp, btc_df[['openTime', 'btc_rsi_14', 'btc_price_vs_sma200', 'btc_change_1h']], on='openTime', how='left')
                
                if eth_df is not None:
                    grp = pd.merge(grp, eth_df[['openTime', 'eth_rsi_14', 'eth_price_vs_sma200', 'eth_change_1h']], on='openTime', how='left')
                
                grp = calculate_forward_target(grp, args.tp, args.sl, args.buy_comm, args.sell_comm, lookahead=args.lookahead)
                all_dfs.append(grp)
            except Exception as e:
                pass
                
        if not all_dfs:
            print(json.dumps({"success": False, "error": "Veri bulunamadı veya işlenemedi."}))
            return
            
        final_df = pd.concat(all_dfs).replace([np.inf, -np.inf], np.nan).dropna()
        
        query_str = args.rule.replace('AND', 'and')
        try:
            matched_df = final_df.query(query_str)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Kural sorgusu hatalı: {e}"}))
            return
            
        total_matched = len(matched_df)
        wins = int(matched_df['target'].sum())
        losses = total_matched - wins
        win_rate = wins / total_matched if total_matched > 0 else 0.0
        
        print(json.dumps({
            "success": True,
            "total_scanned_samples": len(final_df),
            "support": total_matched,
            "wins": wins,
            "losses": losses,
            "win_rate": float(win_rate)
        }))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "trace": traceback.format_exc()
        }))
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

if __name__ == "__main__":
    main()
