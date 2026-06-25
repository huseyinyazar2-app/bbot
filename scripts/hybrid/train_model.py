import os
import sqlite3
import pandas as pd
import numpy as np
import xgboost as xgb
import json
import pandas_ta as ta

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'hybrid_data.db')
MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'bot', 'hybrid', 'models')

# Create models directory if it doesn't exist
os.makedirs(MODELS_DIR, exist_ok=True)

def load_data(symbol):
    conn = sqlite3.connect(DB_PATH)
    
    # Load Klines
    query = f"SELECT * FROM futures_klines WHERE symbol='{symbol}' ORDER BY openTime ASC"
    df = pd.read_sql(query, conn)
    
    if len(df) == 0:
        return None
        
    # Load Funding Rates
    query_f = f"SELECT * FROM funding_rates WHERE symbol='{symbol}' ORDER BY calcTime ASC"
    df_f = pd.read_sql(query_f, conn)
    
    # Load BTC for correlation
    query_btc = "SELECT openTime, close as btc_close FROM futures_klines WHERE symbol='BTCUSDT' ORDER BY openTime ASC"
    df_btc = pd.read_sql(query_btc, conn)
    
    conn.close()
    
    # Merge BTC close
    df = pd.merge(df, df_btc, on='openTime', how='left')
    
    # Merge Funding Rate (Forward Fill)
    if len(df_f) > 0:
        df_f = df_f.rename(columns={'calcTime': 'openTime'})
        df = pd.merge(df, df_f[['openTime', 'rate']], on='openTime', how='left')
        df['rate'] = pd.to_numeric(df['rate'], errors='coerce').ffill().fillna(0)
    else:
        df['rate'] = 0
        
    # Convert all necessary columns to float
    numeric_cols = ['open', 'high', 'low', 'close', 'volume', 'quoteVolume', 'trades', 'takerBuyBase', 'takerBuyQuote', 'btc_close']
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
    return df

def calculate_indicators(df):
    print("  -> İndikatörler Hesaplanıyor...")
    
    # Set DatetimeIndex for pandas_ta (specifically VWAP)
    df['openTime'] = pd.to_numeric(df['openTime'], errors='coerce')
    df = df.dropna(subset=['openTime'])
    df['datetime'] = pd.to_datetime(df['openTime'], unit='ms')
    df.set_index(pd.DatetimeIndex(df['datetime']), inplace=True)
    
    # EMAs
    df['EMA9'] = df.ta.ema(length=9)
    df['EMA21'] = df.ta.ema(length=21)
    df['EMA50'] = df.ta.ema(length=50)
    df['EMA100'] = df.ta.ema(length=100)
    df['EMA200'] = df.ta.ema(length=200)
    
    # SMAs
    df['SMA20'] = df.ta.sma(length=20)
    df['SMA50'] = df.ta.sma(length=50)
    
    # MACD
    macd = df.ta.macd(fast=12, slow=26, signal=9)
    if macd is not None:
        df = pd.concat([df, macd], axis=1)
    
    # RSIs
    df['RSI7'] = df.ta.rsi(length=7)
    df['RSI14'] = df.ta.rsi(length=14)
    df['RSI21'] = df.ta.rsi(length=21)
        
    # Bollinger Bands
    bbands = df.ta.bbands(length=20, std=2)
    if bbands is not None:
        df = pd.concat([df, bbands], axis=1)
        
    # Keltner Channels
    kc = df.ta.kc(length=20, scalar=1.5)
    if kc is not None:
        df = pd.concat([df, kc], axis=1)
    
    # ATR (14)
    df['ATR'] = df.ta.atr(length=14)
    
    # Supertrend
    st = df.ta.supertrend(length=7, multiplier=3.0)
    if st is not None:
        df = pd.concat([df, st], axis=1)
        
    # Ichimoku
    ichimoku = df.ta.ichimoku()[0]
    if ichimoku is not None:
        df = pd.concat([df, ichimoku], axis=1)
        
    # DMI / ADX
    adx = df.ta.adx(length=14)
    if adx is not None:
        df = pd.concat([df, adx], axis=1)
        
    # Stochastic
    stoch = df.ta.stoch()
    if stoch is not None:
        df = pd.concat([df, stoch], axis=1)
        
    # CCI
    df['CCI'] = df.ta.cci(length=20)
    
    # Williams %R
    df['WILLR'] = df.ta.willr(length=14)
    
    # MFI
    df['MFI'] = df.ta.mfi(length=14)
    
    # OBV
    df['OBV'] = df.ta.obv()
    
    # CMF
    df['CMF'] = df.ta.cmf(length=20)
    
    # Volume Ratio
    df['Vol_Ratio'] = df['volume'] / df['volume'].rolling(20).mean()
    
    # VWAP
    vwap = df.ta.vwap()
    if vwap is not None:
        if isinstance(vwap, pd.Series):
            df['VWAP'] = vwap
        else:
            df = pd.concat([df, vwap], axis=1)
    
    # Standard Deviation
    df['STDEV'] = df.ta.stdev(length=20)
    
    # CVD (Cumulative Volume Delta)
    # Taker Buy Volume is given. Taker Sell Volume = Total Volume - Taker Buy Volume
    # Delta = Taker Buy - Taker Sell = 2 * Taker Buy - Total
    df['Delta'] = (2 * df['takerBuyBase']) - df['volume']
    df['CVD'] = df['Delta'].cumsum()
    # To make CVD stationary for ML, we look at the slope or percentage change
    df['CVD_Slope_5'] = df['CVD'].diff(5)
    
    # BTC Correlation & Status
    df['BTC_Corr_50'] = df['close'].rolling(50).corr(df['btc_close'])
    df['BTC_Ret_5'] = df['btc_close'].pct_change(5)
    
    # Time Features
    df['Hour'] = df['datetime'].dt.hour
    df['DayOfWeek'] = df['datetime'].dt.dayofweek
    df['IsWeekend'] = df['DayOfWeek'].apply(lambda x: 1 if x >= 5 else 0)
    
    # Price Momentum
    df['ROC_5'] = df['close'].pct_change(5)
    df['ROC_15'] = df['close'].pct_change(15)
    
    return df

def apply_triple_barrier(df, tp_atr_mult=3.0, sl_atr_mult=1.0, max_candles=48):
    print("  -> Üçlü Bariyer (Triple Barrier) Etiketlemesi Yapılıyor...")
    
    labels = np.zeros(len(df))
    close_prices = df['close'].values
    high_prices = df['high'].values
    low_prices = df['low'].values
    atr_values = df['ATR'].values
    
    # Optimize labeling with numpy
    for i in range(len(df) - max_candles):
        if np.isnan(atr_values[i]):
            continue
            
        entry_price = close_prices[i]
        tp_price = entry_price + (atr_values[i] * tp_atr_mult)
        sl_price = entry_price - (atr_values[i] * sl_atr_mult)
        
        # Look ahead 'max_candles'
        hit_tp = False
        hit_sl = False
        
        for j in range(1, max_candles + 1):
            curr_high = high_prices[i + j]
            curr_low = low_prices[i + j]
            
            if curr_low <= sl_price:
                hit_sl = True
                break
            if curr_high >= tp_price:
                hit_tp = True
                break
                
        if hit_tp and not hit_sl:
            labels[i] = 1
        else:
            labels[i] = 0
            
    df['Target'] = labels
    return df

def select_elite_features(X, y):
    print("  -> Feature Importance (Özellik Önemi) Hesaplanıyor...")
    
    # Train a baseline model
    model = xgb.XGBClassifier(n_estimators=100, max_depth=5, learning_rate=0.05, random_state=42)
    model.fit(X, y)
    
    # Get importance (gain)
    importance = model.get_booster().get_score(importance_type='gain')
    
    if not importance:
        return list(X.columns)
        
    # Sort by gain descending
    sorted_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    
    # Keep features that have non-zero gain
    # Alternatively, take top N features that make up 90% of total gain
    total_gain = sum([val for key, val in sorted_features])
    elite_features = []
    cumulative_gain = 0
    
    for feat, gain in sorted_features:
        elite_features.append(feat)
        cumulative_gain += gain
        if cumulative_gain / total_gain >= 0.95: # Top features covering 95% of total gain
            break
            
    # Guarantee at least 5 features, at most 20
    if len(elite_features) < 5:
        elite_features = [feat for feat, gain in sorted_features[:5]]
    if len(elite_features) > 20:
        elite_features = [feat for feat, gain in sorted_features[:20]]
        
    return elite_features

def train_and_save(symbol):
    print(f"\n=== {symbol} İÇİN EĞİTİM BAŞLIYOR ===")
    
    df = load_data(symbol)
    if df is None:
        print(f"[{symbol}] Veritabanında bulunamadı. Lütfen önce fetch_data.py çalıştırın.")
        return
        
    df = calculate_indicators(df)
    df = apply_triple_barrier(df, tp_atr_mult=3.0, sl_atr_mult=1.0, max_candles=48)
    
    # Drop duplicated columns (e.g. Ichimoku returns multiple same named cols)
    df = df.loc[:, ~df.columns.duplicated()]
    
    # Drop rows with NaNs
    df = df.replace([np.inf, -np.inf], np.nan).dropna()
    
    # Features list (exclude base columns and target)
    exclude_cols = ['symbol', 'openTime', 'open', 'high', 'low', 'close', 'volume', 'closeTime', 'quoteVolume', 'trades', 'takerBuyBase', 'takerBuyQuote', 'btc_close', 'datetime', 'Delta', 'CVD', 'Target']
    feature_cols = [c for c in df.columns if c not in exclude_cols]
    
    X = df[feature_cols]
    y = df['Target']
    
    # Class imbalance check
    win_rate = y.mean() * 100
    print(f"  -> Sinyal Üretilebilecek Fırsat (Win Label) Oranı: %{win_rate:.2f}")
    if win_rate == 0:
        print(f"[{symbol}] Hiçbir kârlı senaryo bulunamadı. Model eğitilmiyor.")
        return
    
    elite_features = select_elite_features(X, y)
    print(f"  -> Seçilen Elit İndikatörler ({len(elite_features)} adet): {', '.join(elite_features)}")
    
    X_elite = df[elite_features]
    
    print("  -> Asıl Model Eğitiliyor...")
    scale_pos_weight = (len(y) - y.sum()) / y.sum() # Handle imbalanced data
    
    final_model = xgb.XGBClassifier(
        n_estimators=300, 
        max_depth=6, 
        learning_rate=0.01, 
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        n_jobs=-1
    )
    final_model.fit(X_elite, y)
    
    # Save Model
    model_path = os.path.join(MODELS_DIR, f"{symbol}_uzman_model.json")
    final_model.save_model(model_path)
    
    # Save Feature List so the Node.js bot knows what to calculate
    features_path = os.path.join(MODELS_DIR, f"{symbol}_features.json")
    with open(features_path, 'w') as f:
        json.dump({'symbol': symbol, 'features': elite_features}, f, indent=4)
        
    print(f"[{symbol}] EĞİTİM TAMAMLANDI! Model kaydedildi: {model_path}")

if __name__ == "__main__":
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DISTINCT symbol FROM futures_klines")
        # symbols = [row[0] for row in cursor.fetchall()]
        symbols = ['AVAXUSDT']
    except:
        symbols = ['AVAXUSDT']
    conn.close()
    
    print(f"Toplam {len(symbols)} coin bulundu. Sırayla eğitime başlanıyor...")
    for sym in symbols:
        try:
            train_and_save(sym)
        except Exception as e:
            print(f"[{sym}] Eğitim sırasında hata oluştu: {e}")
