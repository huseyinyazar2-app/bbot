import os
import sqlite3
import pandas as pd
import numpy as np
import xgboost as xgb
import json
from datetime import datetime
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import precision_recall_curve, auc
from sklearn.inspection import permutation_importance

# Import the new indicators module
from indicators import calculate_all_indicators

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'hybrid_data.db')
MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'bot', 'hybrid', 'models')

# Create models directory if it doesn't exist
os.makedirs(MODELS_DIR, exist_ok=True)

TIERS = {
    "micro_scalp": {
        "target_pct": 1.0,      # %1.0 kar hedefi
        "max_hold_bars": 9,      # 9 × 5dk = 45 dakika
        "min_samples": 50,
        "atr_sl_multiplier": 1.25
    },
    "scalp": {
        "target_pct": 1.25,      # %1.25 kar hedefi
        "max_hold_bars": 24,     # 24 × 5dk = 2 saat
        "min_samples": 50,
        "atr_sl_multiplier": 1.5
    },
    "swing_short": {
        "target_pct": 2.5,       # %2.5 kar hedefi
        "max_hold_bars": 48,     # 48 × 5dk = 4 saat
        "min_samples": 30,
        "atr_sl_multiplier": 2.0
    },
    "swing_mid": {
        "target_pct": 5.0,       # %5 kar hedefi
        "max_hold_bars": 96,     # 96 × 5dk = 8 saat
        "min_samples": 20,
        "atr_sl_multiplier": 2.5
    },
    "swing_long": {
        "target_pct": 8.0,       # %8 kar hedefi
        "max_hold_bars": 288,    # 288 × 5dk = 24 saat
        "min_samples": 15,
        "atr_sl_multiplier": 3.0
    },
}

def load_data(symbol):
    conn = sqlite3.connect(DB_PATH)
    
    # Load Klines
    query = f"SELECT * FROM futures_klines WHERE symbol='{symbol}' ORDER BY openTime ASC"
    df = pd.read_sql(query, conn)
    
    if len(df) == 0:
        return None, None, None
        
    # Load Funding Rates
    query_f = f"SELECT * FROM funding_rates WHERE symbol='{symbol}' ORDER BY calcTime ASC"
    df_f = pd.read_sql(query_f, conn)
    
    # Load BTC for correlation
    query_btc = "SELECT openTime, close FROM futures_klines WHERE symbol='BTCUSDT' ORDER BY openTime ASC"
    df_btc = pd.read_sql(query_btc, conn)
    
    conn.close()
    
    return df, df_btc, df_f

def create_labels_for_tier(df, target_pct, max_hold_bars):
    """
    Sadece TP tabanlı etiketleme. SL yok.
    "Fiyat max_hold_bars içinde target_pct kadar YUKARI gitti mi?"
    """
    labels = np.zeros(len(df))
    close_prices = df['close'].values
    high_prices = df['high'].values
    
    for i in range(len(df) - max_hold_bars):
        entry_price = close_prices[i]
        target_price = entry_price * (1 + target_pct / 100)
        
        hit = False
        # Look ahead
        for j in range(1, max_hold_bars + 1):
            if high_prices[i + j] >= target_price:
                hit = True
                break
                
        labels[i] = 1 if hit else 0
        
    return labels

def select_features(model, X_val, y_val, max_features=20):
    """
    Permutation importance ile en değerli feature'ları seçer.
    """
    print("    -> Feature Importance Hesaplanıyor (Permutation)...")
    result = permutation_importance(model, X_val, y_val, n_repeats=5, random_state=42, scoring='average_precision')
    
    # Katkı sağlayan (önem > 0.0005) feature'ları al
    importances = result.importances_mean
    indices = np.argsort(importances)[::-1]
    
    selected = []
    for idx in indices:
        if importances[idx] > 0.0005:
            selected.append(X_val.columns[idx])
            
    # Sınırlandırmalar
    if len(selected) > max_features:
        selected = selected[:max_features]
    if len(selected) < 5:
        # En iyi 5'i zorla al
        selected = [X_val.columns[idx] for idx in indices[:5]]
        
    return selected

def train_tier(symbol, df_features, tier_name, config):
    print(f"\n  === {tier_name.upper()} TIER EĞİTİMİ ===")
    
    # KOPYA ALIRKEN DUPLICATE KOLONLARI KALDIR
    df_clean = df_features.loc[:, ~df_features.columns.duplicated()].copy()
    
    # XGBoost inf değerleri sevmez, inf'leri NaN'a çevirelim (XGBoost NaN'ları native handle eder)
    df_clean.replace([np.inf, -np.inf], np.nan, inplace=True)
    
    # 1. Labeling
    y = create_labels_for_tier(df_clean, config['target_pct'], config['max_hold_bars'])
    df_clean['Target'] = y
    
    # Drop the last max_hold_bars rows to prevent tail-label poisoning
    df_clean = df_clean.iloc[:-config['max_hold_bars']].copy()
    
    exclude_cols = ['symbol', 'openTime', 'open', 'high', 'low', 'close', 'volume', 'closeTime', 
                   'quoteVolume', 'trades', 'takerBuyBase', 'takerBuyQuote', 'btc_close', 'datetime', 
                   'Delta', 'CVD', 'Target', 'rate'] # non-stationary veya id sütunları
                   
    # Non-stationary raw columns that we normalized
    exclude_cols += ['EMA9', 'EMA21', 'EMA50', 'EMA100', 'EMA200', 'SMA20', 'SMA50', 'VWAP', 'ATR', 'STDEV', 'OBV']
    
    # Ichimoku ham sütunları (ISA_, ISB_, ITS_, IKS_, ICS_ ile başlayanlar)
    exclude_cols += [c for c in df_clean.columns if c.startswith(('ISA_', 'ISB_', 'ITS_', 'IKS_', 'ICS_'))]
    # MACD ham sütunları (sadece _ratio olanları tut)
    exclude_cols += [c for c in df_clean.columns if c.startswith(('MACD_', 'MACDh_', 'MACDs_')) and '_ratio' not in c]
    # Bollinger ham sütunları (BBP_ ve BBB_ normalize, BBL/BBM/BBU ham)
    exclude_cols += [c for c in df_clean.columns if c.startswith(('BBL_', 'BBM_', 'BBU_'))]
    # Keltner ham sütunları
    exclude_cols += [c for c in df_clean.columns if c.startswith(('KCL', 'KCU', 'KCB'))]
    
    # Remove columns that have string values or are exact duplicates
    feature_cols = [c for c in df_clean.columns if c not in exclude_cols and not c.startswith('SUPERT') and not c.startswith('span_')]
    
    # YALNIZCA KULLANILACAK SÜTUNLARDA dropna YAP (SUPERTl vs gibi her satırda NaN olanlar tüm veriyi silmesin)
    use_cols = feature_cols + ['Target']
    df_clean = df_clean[use_cols].dropna()
    
    X = df_clean[feature_cols]
    y = df_clean['Target']
    
    pos_count = y.sum()
    total_count = len(y)
    
    print(f"    -> Toplam Örnek: {total_count}, Pozitif: {pos_count} (%{(pos_count/total_count)*100:.2f})")
    
    if pos_count < config['min_samples']:
        print(f"    -> [ATLANDI] Yeterli pozitif örnek yok ({pos_count} < {config['min_samples']})")
        return False
        
    # 3. Walk-Forward Cross Validation & Feature Selection
    # Zaman serisine uygun olarak veriyi böl (Train: 60%, Val1: 20%, Val2: 20%)
    split1 = int(len(X) * 0.6)
    split2 = int(len(X) * 0.8)
    
    X_train_full = X.iloc[:split1]
    y_train_full = y.iloc[:split1]
    
    X_val1 = X.iloc[split1:split2]
    y_val1 = y.iloc[split1:split2]
    
    X_val2 = X.iloc[split2:]
    y_val2 = y.iloc[split2:]
    
    scale_pos_weight = (len(y_train_full) - y_train_full.sum()) / (y_train_full.sum() + 1e-9)
    
    # Baseline model for feature selection
    base_model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.05,
        scale_pos_weight=scale_pos_weight,
        eval_metric='aucpr',
        random_state=42,
        n_jobs=-1
    )
    
    base_model.fit(X_train_full, y_train_full)
    
    selected_features = select_features(base_model, X_val1, y_val1, max_features=20)
    print(f"    -> Seçilen Özellikler ({len(selected_features)}): {', '.join(selected_features)}")
    
    # 4. Final Model Training on Selected Features
    X_train_final = X.iloc[:split2][selected_features]
    y_train_final = y.iloc[:split2]
    
    X_val_sel = X_val2[selected_features]
    
    final_scale_pos_weight = (len(y_train_final) - y_train_final.sum()) / (y_train_final.sum() + 1e-9)
    
    final_model = xgb.XGBClassifier(
        n_estimators=500,
        max_depth=5,
        learning_rate=0.02,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=10,
        reg_alpha=0.1,
        reg_lambda=1.0,
        scale_pos_weight=final_scale_pos_weight,
        eval_metric='aucpr',
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=30
    )
    
    final_model.fit(
        X_train_final, y_train_final,
        eval_set=[(X_val_sel, y_val2)],
        verbose=False
    )
    
    # 5. Threshold Optimization & Metrics
    y_pred_proba = final_model.predict_proba(X_val_sel)[:, 1]
    precision, recall, thresholds = precision_recall_curve(y_val2, y_pred_proba)
    
    # Güvenli sinyaller için precision'ın yüksek olduğu (örn: >0.65) bir eşik bul
    optimal_threshold = 0.75 # Default fallback
    target_precision = 0.65
    
    # Threshold array is increasing. Find lowest threshold >= 0.50 that gives precision >= target_precision
    for i in range(len(thresholds)):
        if thresholds[i] >= 0.50 and thresholds[i] < 0.95:
            if precision[i] >= target_precision:
                # Check next 3 points for stability to avoid noise spikes
                lookahead = min(3, len(thresholds) - i)
                stable = True
                for j in range(lookahead):
                    if precision[i+j] < target_precision - 0.05: # Allow small dip
                        stable = False
                        break
                if stable:
                    optimal_threshold = float(thresholds[i])
                    break
            
    print(f"    -> Optimal Threshold: {optimal_threshold:.4f} (Hedef Precision: {target_precision})")
    
    # Save Model & Meta
    symbol_dir = os.path.join(MODELS_DIR, symbol)
    os.makedirs(symbol_dir, exist_ok=True)
    
    model_path = os.path.join(symbol_dir, f"{tier_name}_model.json")
    meta_path = os.path.join(symbol_dir, f"{tier_name}_meta.json")
    
    final_model.save_model(model_path)
    
    meta_data = {
        "symbol": symbol,
        "tier": tier_name,
        "trained_at": datetime.now().isoformat(),
        "total_samples": total_count,
        "positive_labels": int(pos_count),
        "selected_features": selected_features,
        "optimal_threshold": optimal_threshold,
        "target_pct": config['target_pct'],
        "max_hold_bars": config['max_hold_bars'],
        "atr_sl_multiplier": config['atr_sl_multiplier']
    }
    
    with open(meta_path, 'w') as f:
        json.dump(meta_data, f, indent=4)
        
    print(f"    -> Kaydedildi: {model_path}")
    return True

def train_all_tiers(symbol):
    print(f"\n=============================================")
    print(f"  {symbol} İÇİN EĞİTİM SÜRECİ BAŞLIYOR  ")
    print(f"=============================================")
    
    df, df_btc, df_f = load_data(symbol)
    if df is None:
        print(f"[{symbol}] Veri bulunamadı. Lütfen fetch_data.py çalıştırın.")
        return
        
    print(f"-> Veriler yüklendi ({len(df)} mum). İndikatörler hesaplanıyor...")
    df_features = calculate_all_indicators(df, df_btc, df_f)
    
    for tier_name, config in TIERS.items():
        # Her tier için DataFrame'i kopyala (Target label'lar değişeceği için)
        df_copy = df_features.copy()
        try:
            train_tier(symbol, df_copy, tier_name, config)
        except Exception as e:
            print(f"    -> HATA: {tier_name} eğitimi başarısız oldu: {e}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbol', type=str, default='AVAXUSDT', help='Symbol to train')
    args = parser.parse_args()
    
    train_all_tiers(args.symbol)
