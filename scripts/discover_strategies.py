import sqlite3
import pandas as pd
import pandas_ta as ta
import numpy as np
from sklearn.tree import DecisionTreeClassifier, _tree
from sklearn.ensemble import RandomForestClassifier
import argparse
import json
import sys
import warnings
import traceback

warnings.filterwarnings('ignore')

def extract_rules(tree, feature_names, min_support, min_win_rate):
    tree_ = tree.tree_
    feature_name = [
        feature_names[i] if i != _tree.TREE_UNDEFINED else "undefined!"
        for i in tree_.feature
    ]

    rules_list = []

    def recurse(node, current_rule):
        if tree_.feature[node] != _tree.TREE_UNDEFINED:
            name = feature_name[node]
            threshold = tree_.threshold[node]
            
            # Left child (feature <= threshold)
            left_rule = current_rule.copy()
            left_rule.append(f"{name} <= {threshold:.4f}")
            recurse(tree_.children_left[node], left_rule)
            
            # Right child (feature > threshold)
            right_rule = current_rule.copy()
            right_rule.append(f"{name} > {threshold:.4f}")
            recurse(tree_.children_right[node], right_rule)
        else:
            # Leaf node
            samples = tree_.n_node_samples[node]
            value = tree_.value[node][0] # [loss_count, win_count]
            
            if len(value) > 1:
                total_val = sum(value)
                if total_val > 0:
                    win_rate = value[1] / total_val
                else:
                    win_rate = 0.0
                
                if samples >= min_support and win_rate >= min_win_rate:
                    rules_list.append({
                        "description": " AND ".join(current_rule),
                        "win_rate": float(win_rate),
                        "support": int(samples),
                        "wins": int(win_rate * samples),
                        "losses": int(samples - (win_rate * samples))
                    })

    recurse(0, [])
    return rules_list

def calculate_forward_target(df, tp_pct, sl_pct, buy_comm, sell_comm, lookahead=48):
    # Fees as decimals
    bc = buy_comm / 100.0
    sc = sell_comm / 100.0
    
    # We want Net Profit >= tp_pct
    # Target TP Price = Close * (1 + buy_comm) * (1 + tp_pct) / (1 - sell_comm)
    tp_mult = (1.0 + bc) * (1.0 + (tp_pct / 100.0)) / (1.0 - sc)
    
    # We want Net Loss <= sl_pct
    # Target SL Price = Close * (1 + buy_comm) * (1 - sl_pct) / (1 - sell_comm)
    sl_mult = (1.0 + bc) * (1.0 - (sl_pct / 100.0)) / (1.0 - sc)
    
    # Target values
    df['target_tp_price'] = df['close'] * tp_mult
    df['target_sl_price'] = df['close'] * sl_mult
    
    future_high = df['high'].rolling(window=lookahead, min_periods=1).max().shift(-lookahead)
    future_low = df['low'].rolling(window=lookahead, min_periods=1).min().shift(-lookahead)
    
    # Label 1 if high >= tp AND low > sl
    df['target'] = np.where((future_high >= df['target_tp_price']) & (future_low > df['target_sl_price']), 1, 0)
    return df
    
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tp', type=float, default=2.0)
    parser.add_argument('--sl', type=float, default=1.0)
    parser.add_argument('--min-win-rate', type=float, default=60.0)
    parser.add_argument('--limit', type=int, default=500000)
    parser.add_argument('--buy-comm', type=float, default=0.1)
    parser.add_argument('--sell-comm', type=float, default=0.1)
    parser.add_argument('--mode', type=str, default='manual')  # manual veya auto
    parser.add_argument('--lookahead', type=int, default=48)
    parser.add_argument('--base-rule', type=str, default="")
    args = parser.parse_args()

    # 1. Load Data
    conn = None
    try:
        # SQLite bağlantısını SADECE OKUNUR (read-only) açıyoruz.
        conn = sqlite3.connect('file:historical_klines.db?mode=ro', uri=True)
        
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT symbol FROM klines")
        symbols = [row[0] for row in cursor.fetchall()]
        
        # Load BTCUSDT as reference
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
        
        # Load ETHUSDT as reference
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
        total_fetched = 0
        
        limit_per_symbol = int(args.limit / len(symbols)) if len(symbols) > 0 else args.limit
        
        for sym in symbols:
            query = f"SELECT symbol, openTime, open, high, low, close, volume FROM klines WHERE symbol = '{sym}' ORDER BY openTime DESC LIMIT {limit_per_symbol}"
            grp = pd.read_sql_query(query, conn)
            
            if grp.empty:
                continue
                
            grp.sort_values('openTime', inplace=True)
            grp.reset_index(drop=True, inplace=True)
            total_fetched += len(grp)
            if len(grp) < 100:
                continue
                
            # Add indicators
            try:
                # Oscillators
                grp['rsi_14'] = ta.rsi(grp['close'], length=14)
                grp['rsi_7'] = ta.rsi(grp['close'], length=7)
                grp['adx_14'] = ta.adx(grp['high'], grp['low'], grp['close'], length=14)['ADX_14']
                grp['cci_14'] = ta.cci(grp['high'], grp['low'], grp['close'], length=14)
                grp['mfi_14'] = ta.mfi(grp['high'], grp['low'], grp['close'], grp['volume'], length=14)
                
                # Moving averages
                grp['sma_50'] = ta.sma(grp['close'], length=50)
                grp['sma_200'] = ta.sma(grp['close'], length=200)
                grp['price_vs_sma50'] = (grp['close'] - grp['sma_50']) / grp['sma_50'] * 100
                grp['price_vs_sma200'] = (grp['close'] - grp['sma_200']) / grp['sma_200'] * 100
                
                # MACD
                macd = ta.macd(grp['close'])
                grp['macd'] = macd['MACD_12_26_9']
                grp['macd_hist'] = macd['MACDh_12_26_9']
                
                # Bollinger Bands
                bb = ta.bbands(grp['close'], length=20)
                grp['bb_width'] = bb['BBB_20_2.0_2.0']
                grp['price_vs_bb_lower'] = (grp['close'] - bb['BBL_20_2.0_2.0']) / bb['BBL_20_2.0_2.0'] * 100
                
                # Volume
                grp['sma_vol_20'] = ta.sma(grp['volume'], length=20)
                grp['rvol'] = grp['volume'] / grp['sma_vol_20']
                           # Merge with BTC
                if btc_df is not None:
                    grp = pd.merge(grp, btc_df[['openTime', 'btc_rsi_14', 'btc_price_vs_sma200', 'btc_change_1h']], on='openTime', how='left')
                
                # Merge with ETH
                if eth_df is not None:
                    grp = pd.merge(grp, eth_df[['openTime', 'eth_rsi_14', 'eth_price_vs_sma200', 'eth_change_1h']], on='openTime', how='left')
                
                all_dfs.append(grp)
            except Exception as e:
                pass
                
        if not all_dfs:
            print(json.dumps({"success": False, "error": "İndikatör hesaplanırken yeterli veri bulunamadı."}))
            return
            
        features = [
            'rsi_14', 'rsi_7', 'adx_14', 'cci_14', 'mfi_14', 
            'price_vs_sma50', 'price_vs_sma200', 'macd', 'macd_hist', 
            'bb_width', 'price_vs_bb_lower', 'rvol',
            'btc_rsi_14', 'btc_price_vs_sma200', 'btc_change_1h',
            'eth_rsi_14', 'eth_price_vs_sma200', 'eth_change_1h'
        ]
        
        rules = []
        total_samples = 0
        target_hits = 0
        
        if args.mode == 'auto':
            PROFILES = [
                {"name": "Scalp (4 Saat Sınır)", "tp": 1.0, "sl": 1.0, "lookahead": 48},
                {"name": "Günlük (12 Saat Sınır)", "tp": 2.0, "sl": 1.5, "lookahead": 144},
                {"name": "Kısa Swing (24 Saat Sınır)", "tp": 3.5, "sl": 2.5, "lookahead": 288},
                {"name": "Swing (48 Saat Sınır)", "tp": 5.0, "sl": 3.5, "lookahead": 576},
                {"name": "Makro Swing (96 Saat Sınır)", "tp": 8.0, "sl": 5.0, "lookahead": 1152}
            ]
            all_rules = []
            for prof in PROFILES:
                prof_dfs = []
                for df in all_dfs:
                    df_copy = df.copy()
                    df_copy = calculate_forward_target(df_copy, prof["tp"], prof["sl"], args.buy_comm, args.sell_comm, lookahead=prof["lookahead"])
                    df_copy = df_copy.replace([np.inf, -np.inf], np.nan).dropna()
                    if not df_copy.empty:
                        if len(df_copy) > 4000:
                            df_copy = df_copy.sample(4000, random_state=42)
                        prof_dfs.append(df_copy)
                
                if not prof_dfs:
                    continue
                final_df = pd.concat(prof_dfs)
                if final_df.empty:
                    continue
                
                X = final_df[features]
                y = final_df['target']
                if len(y) == 0 or y.sum() == 0:
                    continue
                
                clf = RandomForestClassifier(n_estimators=6, max_depth=4, min_samples_leaf=50, random_state=42)
                clf.fit(X, y)
                
                for estimator in clf.estimators_:
                    tree_rules = extract_rules(estimator, features, min_support=50, min_win_rate=args.min_win_rate / 100.0)
                    for r in tree_rules:
                        r["profile"] = prof["name"]
                        r["tp"] = prof["tp"]
                        r["sl"] = prof["sl"]
                        r["lookahead"] = prof["lookahead"]
                        all_rules.append(r)
            
            unique_rules = []
            seen_desc = set()
            for r in sorted(all_rules, key=lambda x: x['win_rate'], reverse=True):
                key = (r['description'], r['profile'])
                if key not in seen_desc:
                    unique_rules.append(r)
                    seen_desc.add(key)
            rules = unique_rules
            total_samples = len(all_dfs) * len(all_dfs[0]) if all_dfs and len(all_dfs[0]) > 0 else 0
            target_hits = 0
            
        else:
            # Manual mode
            manual_dfs = []
            for df in all_dfs:
                df_copy = df.copy()
                df_copy = calculate_forward_target(df_copy, args.tp, args.sl, args.buy_comm, args.sell_comm, lookahead=args.lookahead)
                df_copy = df_copy.replace([np.inf, -np.inf], np.nan).dropna()
                if not df_copy.empty:
                    manual_dfs.append(df_copy)
                
            if not manual_dfs:
                print(json.dumps({"success": False, "error": "Filtreleme sonrası veri kalmadı"}))
                return
            final_df = pd.concat(manual_dfs)
            
            if args.base_rule:
                query_str = args.base_rule.replace('AND', 'and')
                try:
                    final_df = final_df.query(query_str)
                except Exception as e:
                    print(json.dumps({"success": False, "error": f"Base rule hatası: {e}"}))
                    return
            
            
            if len(final_df) > 200000:
                final_df = final_df.sample(200000, random_state=42)

            X = final_df[features]
            y = final_df['target']
            
            total_samples = len(final_df)
            target_hits = int(y.sum())
            
            min_leaf = 50
            min_sup = 50
            if args.base_rule:
                min_leaf = max(2, int(len(final_df) * 0.05))
                min_sup = max(2, int(len(final_df) * 0.05))
            
            if len(y) > 0 and y.sum() > 0:
                clf = RandomForestClassifier(n_estimators=10, max_depth=4, min_samples_leaf=min_leaf, random_state=42)
                clf.fit(X, y)
                
                all_rules = []
                for estimator in clf.estimators_:
                    tree_rules = extract_rules(estimator, features, min_support=min_sup, min_win_rate=args.min_win_rate / 100.0)
                    for r in tree_rules:
                        r["profile"] = "Manuel"
                        r["tp"] = args.tp
                        r["sl"] = args.sl
                        if args.base_rule:
                            r["original_rule"] = args.base_rule
                            r["added_condition"] = r["description"]
                            r["description"] = f"{args.base_rule} AND {r['description']}"
                        all_rules.append(r)
                
                unique_rules = []
                seen_desc = set()
                for r in sorted(all_rules, key=lambda x: x['win_rate'], reverse=True):
                    if r['description'] not in seen_desc:
                        unique_rules.append(r)
                        seen_desc.add(r['description'])
                rules = unique_rules
        
        print(json.dumps({
            "success": True,
            "rules": rules,
            "total_samples": total_samples,
            "target_hits": target_hits
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
