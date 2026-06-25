import sqlite3
import pandas as pd
import numpy as np
import time
import json
import argparse
import sys
import os
import requests
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import NearestNeighbors

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'historical_klines.db')
URL = "https://api.binance.com/api/v3/klines"

def get_last_timestamp(symbol):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT MAX(openTime) FROM klines WHERE symbol = ?', (symbol,))
    result = cursor.fetchone()
    conn.close()
    return result[0] if result and result[0] else None

def save_klines(symbol, klines):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    data_to_insert = []
    for k in klines:
        data_to_insert.append((
            symbol, int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5]), int(k[6])
        ))
    cursor.executemany('''
        INSERT OR IGNORE INTO klines (symbol, openTime, open, high, low, close, volume, closeTime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', data_to_insert)
    conn.commit()
    conn.close()
    return len(data_to_insert)

def micro_sync(symbol, days=365):
    # Bu fonksiyon eger veri yoksa 2 yillik, varsa aradaki eksik kismi anlik ceker.
    now = int(time.time() * 1000)
    last_ts = get_last_timestamp(symbol)
    
    if last_ts is None:
        start_time = now - (days * 24 * 60 * 60 * 1000)
    else:
        start_time = last_ts + (5 * 60 * 1000)
        
    if start_time < now - (5 * 60 * 1000):
        fetch_start = start_time
        while fetch_start < now:
            params = {"symbol": symbol, "interval": "5m", "limit": 1000, "startTime": fetch_start, "endTime": now}
            try:
                response = requests.get(URL, params=params, timeout=10)
                if response.status_code == 429:
                    time.sleep(5)
                    continue
                response.raise_for_status()
                data = response.json()
                if not data:
                    break
                save_klines(symbol, data)
                fetch_start = data[-1][0] + 1
                time.sleep(0.1)
            except Exception as e:
                break

    # Simdi DB'den 1 yillik veriyi oku
    target_start = now - (days * 24 * 60 * 60 * 1000)
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(f"SELECT * FROM klines WHERE symbol = '{symbol}' AND openTime >= {target_start} ORDER BY openTime ASC", conn)
    conn.close()
    
    df['open_time'] = pd.to_datetime(df['openTime'], unit='ms')
    df.set_index('open_time', inplace=True)
    return df

def calculate_rsi(series, period=14):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def calculate_atr(df, period=14):
    high_low = df['high'] - df['low']
    high_close = np.abs(df['high'] - df['close'].shift())
    low_close = np.abs(df['low'] - df['close'].shift())
    ranges = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = np.max(ranges, axis=1)
    return true_range.rolling(period).mean()

def calculate_adx(df, period=14):
    plus_dm = df['high'].diff()
    minus_dm = df['low'].diff()
    plus_dm[plus_dm < 0] = 0
    minus_dm[minus_dm > 0] = 0
    
    atr = calculate_atr(df, period)
    plus_di = 100 * (plus_dm.ewm(alpha=1/period).mean() / atr)
    minus_di = abs(100 * (minus_dm.ewm(alpha=1/period).mean() / atr))
    dx = (abs(plus_di - minus_di) / abs(plus_di + minus_di)) * 100
    adx = ((dx.shift(1) * (period - 1)) + dx) / period
    adx.smooth = dx.ewm(alpha=1/period).mean()
    return adx.smooth

def prepare_features(df, prefix=""):
    df = df.copy()
    if df.empty:
        return df
    df[f'{prefix}rsi'] = calculate_rsi(df['close'], 14)
    df[f'{prefix}adx'] = calculate_adx(df, 14)
    df[f'{prefix}sma20'] = df['close'].rolling(20).mean()
    df[f'{prefix}price_vs_sma'] = (df['close'] - df[f'{prefix}sma20']) / df[f'{prefix}sma20'] * 100
    
    df[f'{prefix}vol_sma'] = df['volume'].rolling(20).mean()
    df[f'{prefix}rvol'] = df['volume'] / df[f'{prefix}vol_sma']
    
    df[f'{prefix}mom_1h'] = df['close'].pct_change(12) * 100
    
    return df

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbol', type=str, required=True)
    parser.add_argument('--tp', type=float, default=0.02)
    parser.add_argument('--sl', type=float, default=0.01)
    parser.add_argument('--days', type=int, default=365)
    args = parser.parse_args()

    # 1. Micro-sync & Read Data
    target_df = micro_sync(args.symbol, days=args.days)
    btc_df = micro_sync("BTCUSDT", days=args.days)
    eth_df = micro_sync("ETHUSDT", days=args.days)
    
    if target_df.empty or btc_df.empty or eth_df.empty:
        print(json.dumps({"error": "Veri yok"}))
        return

    # 2. Calculate features
    target_feat = prepare_features(target_df)
    btc_feat = prepare_features(btc_df, prefix="btc_")
    eth_feat = prepare_features(eth_df, prefix="eth_")
    
    # 3. Merge
    merged = pd.concat([
        target_feat[['close', 'rsi', 'adx', 'price_vs_sma', 'rvol', 'mom_1h']],
        btc_feat[['btc_rsi', 'btc_price_vs_sma', 'btc_mom_1h']],
        eth_feat[['eth_rsi', 'eth_price_vs_sma']]
    ], axis=1)
    
    merged.dropna(inplace=True)
    
    if len(merged) < 1000:
        print(json.dumps({"error": "Yeterli veri yok (Minimum 1000 mum gerekli)"}))
        return
        
    feature_cols = [
        'rsi', 'adx', 'price_vs_sma', 'rvol', 'mom_1h',
        'btc_rsi', 'btc_price_vs_sma', 'btc_mom_1h',
        'eth_rsi', 'eth_price_vs_sma'
    ]
    
    X = merged[feature_cols].values
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    current_state = X_scaled[-1].reshape(1, -1)
    
    X_history = X_scaled[:-48]
    history_closes = merged['close'].values[:-48]
    full_closes = merged['close'].values
    
    # 4. Find Nearest Neighbors
    k_neighbors = 100
    knn = NearestNeighbors(n_neighbors=k_neighbors, metric='euclidean')
    knn.fit(X_history)
    
    distances, indices = knn.kneighbors(current_state)
    
    max_distance = 3.5
    valid_matches = []
    
    for i, dist in enumerate(distances[0]):
        if dist <= max_distance:
            idx = indices[0][i]
            valid_matches.append(idx)
            
    if not valid_matches:
        print(json.dumps({
            "success": True,
            "winRate": 0,
            "matches": 0,
            "message": "Su anki duruma benzeyen gecmis an bulunamadi."
        }))
        return

    # 5. Forward Simulation
    wins = 0
    losses = 0
    total_wait_candles = 0
    
    tp_ratio = 1 + args.tp
    sl_ratio = 1 - args.sl
    
    for idx in valid_matches:
        entry_price = history_closes[idx]
        forward_closes = full_closes[idx+1 : idx+49]
        
        outcome = 'TIMEOUT'
        wait = 48
        
        for c_idx, price in enumerate(forward_closes):
            if price >= entry_price * tp_ratio:
                outcome = 'WIN'
                wait = c_idx + 1
                break
            elif price <= entry_price * sl_ratio:
                outcome = 'LOSS'
                wait = c_idx + 1
                break
                
        if outcome == 'WIN':
            wins += 1
        elif outcome == 'LOSS':
            losses += 1
            
        total_wait_candles += wait

    total_resolved = wins + losses
    win_rate = (wins / total_resolved * 100) if total_resolved > 0 else 0
    avg_wait = (total_wait_candles / len(valid_matches)) * 5 # in minutes
    
    current_values = merged[feature_cols].iloc[-1].to_dict()
    
    print(json.dumps({
        "success": True,
        "symbol": args.symbol,
        "matches": len(valid_matches),
        "totalHistory": len(X_history),
        "winRate": round(win_rate, 2),
        "wins": wins,
        "losses": losses,
        "avgWaitMinutes": round(avg_wait, 1),
        "currentFeatures": current_values
    }))

if __name__ == "__main__":
    main()
