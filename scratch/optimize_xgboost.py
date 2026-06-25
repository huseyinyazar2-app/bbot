import sqlite3
import pandas as pd
import numpy as np
import os
import sys
import json
import warnings
warnings.simplefilter(action='ignore', category=FutureWarning)
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bot_state.db")

def load_data(use_json=False):
    """Loads closed positions from SQLite DB."""
    if not os.path.exists(DB_PATH):
        return pd.DataFrame(), False
        
    try:
        conn = sqlite3.connect(DB_PATH)
        query = """
            SELECT symbol, strategy, entryPrice, exitPrice, pnl, 
                   entry_rsi, entry_rvol, entry_adx, btc_regime, setup_score 
            FROM positions 
            WHERE status = 'CLOSED' 
              AND entry_rsi IS NOT NULL
        """
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        return df, False
    except Exception as e:
        return pd.DataFrame(), False

def find_best_split(bot_trades, col_name, thresholds, is_categorical=False, min_split_size=5, min_acceptable_wr=0.45, min_delta=0.15):
    best_diff = 0
    best_rule = ""
    best_wr = 0
    
    # Dinamik Delta: İşlem sayısı azsa farkı daha yüksek tutarak halüsinasyonu engelle (Örn: 15 işlemde %22 fark, 50 işlemde %15 fark aranır)
    dynamic_min_delta = max(min_delta, 0.25 - (len(bot_trades) * 0.002))

    if is_categorical:
        categories = bot_trades[col_name].dropna().unique()
        for cat in categories:
            in_mask = bot_trades[col_name] == cat
            out_mask = bot_trades[col_name] != cat
            
            in_group = bot_trades[in_mask]
            out_group = bot_trades[out_mask]
            
            if len(in_group) >= min_split_size and len(out_group) >= min_split_size:
                wr_in = (in_group['target'].mean() or 0)
                wr_out = (out_group['target'].mean() or 0)
                diff = abs(wr_in - wr_out)
                
                if diff > best_diff and diff > dynamic_min_delta:
                    # Kötü bir rejimi eleme senaryosu (Kalan kısım min_acceptable_wr'yi geçmeli)
                    if wr_in < wr_out and wr_out >= min_acceptable_wr:
                        best_diff = diff
                        best_wr = wr_out
                        best_rule = f"'{cat}' rejiminde WR %{wr_in*100:.1f} iken diğer rejimlerde %{wr_out*100:.1f}. Sinyalleri {cat} harici rejimlerle sınırlandırın."
                    # Sadece tek bir rejimde çalışma senaryosu
                    elif wr_in > wr_out and wr_in >= min_acceptable_wr:
                        best_diff = diff
                        best_wr = wr_in
                        best_rule = f"SADECE '{cat}' rejiminde WR %{wr_in*100:.1f} iken diğerlerinde %{wr_out*100:.1f}. Bu botu sadece {cat} rejiminde çalışacak şekilde kısıtlayın."
    else:
        for threshold in thresholds:
            left = bot_trades[bot_trades[col_name] < threshold]
            right = bot_trades[bot_trades[col_name] >= threshold]
            
            if len(left) >= min_split_size and len(right) >= min_split_size:
                wr_left = (left['target'].mean() or 0)
                wr_right = (right['target'].mean() or 0)
                diff = abs(wr_left - wr_right)
                
                if diff > best_diff and diff > dynamic_min_delta:
                    if wr_left > wr_right and wr_left >= min_acceptable_wr:
                        best_diff = diff
                        best_wr = wr_left
                        best_rule = f"{col_name} < {threshold} filtresi uygulandığında WR %{wr_left*100:.1f} oluyor (Eksik tarafta: %{wr_right*100:.1f}). Giriş anında '{col_name} < {threshold}' kontrolü ekleyin."
                    elif wr_right > wr_left and wr_right >= min_acceptable_wr:
                        best_diff = diff
                        best_wr = wr_right
                        best_rule = f"{col_name} >= {threshold} filtresi uygulandığında WR %{wr_right*100:.1f} oluyor (Eksik tarafta: %{wr_left*100:.1f}). Giriş anında '{col_name} >= {threshold}' kontrolü ekleyin."
                        
    return best_diff, best_rule, best_wr

def train_optimizer():
    use_json = "--json" in sys.argv
    
    if not use_json:
        print("[AI] Yapay Zeka (XGBoost) Cevrimdisi Optimizasyon Baslatiliyor...\n" + "="*60)
        
    df, is_synthetic = load_data(use_json)
    
    if not use_json:
        print(f"[INFO] Toplam Yuklenen Trade Log Sayisi: {len(df)}")
    
    if len(df) == 0:
        if use_json:
            print(json.dumps({"success": False, "error": "Veritabanı boş."}))
        else:
            print("Veri bulunamadı.")
        return

    # Hedef Değişken (Target): PnL > 0 ise 1 (Win), değilse 0 (Loss)
    df['target'] = (df['pnl'] > 0).astype(int)
    
    # ML Modeli Eğitimi
    feature_cols = ['entry_rsi', 'entry_rvol', 'entry_adx', 'setup_score', 'btc_regime', 'strategy']
    X_raw = df[feature_cols].copy()
    y = df['target'].copy()
    
    X = pd.get_dummies(X_raw, columns=['btc_regime', 'strategy'], drop_first=False)
    X.columns = [str(c).replace("[", "").replace("]", "").replace("<", "") for c in X.columns]
    
    # Yeterli veri varsa modeli böl ve eğit (En az 30 işlem)
    acc = 0.0
    feature_importance_list = []
    
    if len(df) >= 30:
        try:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
            model = xgb.XGBClassifier(
                n_estimators=100, max_depth=4, learning_rate=0.05, 
                subsample=0.8, colsample_bytree=0.8, random_state=42, eval_metric='logloss'
            )
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            acc = accuracy_score(y_test, y_pred)
            
            importances = model.feature_importances_
            indices = np.argsort(importances)[::-1]
            
            for f in range(min(10, len(X.columns))):
                col_idx = indices[f]
                feature_importance_list.append({
                    "feature": X.columns[col_idx],
                    "importance": float(importances[col_idx])
                })
        except Exception as e:
            pass # Stratify fails on highly imbalanced small sets
            
    # Kurallar
    report = {
        "Global_Oneriler": [],
        "Basarili_Botlar": [],
        "Sorunlu_Botlar": [],
        "Yetersiz_Veri": []
    }
    
    # Global Kurallar (Minimum 500 işlem)
    if len(df) >= 500:
        rsi_diff, rsi_rule, _ = find_best_split(df, 'entry_rsi', [30, 40, 50, 60, 70], min_split_size=50)
        if rsi_rule: report["Global_Oneriler"].append(f"[GLOBAL] {rsi_rule}")
        
        adx_diff, adx_rule, _ = find_best_split(df, 'entry_adx', [20, 25, 30], min_split_size=50)
        if adx_rule: report["Global_Oneriler"].append(f"[GLOBAL] {adx_rule}")
    else:
        report["Global_Oneriler"].append(f"Global optimizasyon analizi için sistem genelinde en az 500 işleme ihtiyaç var. (Mevcut: {len(df)})")
        
    # Bot Bazlı Kapsamlı Analiz
    unique_bots = sorted(df['strategy'].dropna().unique())
    
    for bot_id in unique_bots:
        bot_trades = df[df['strategy'] == bot_id]
        count = len(bot_trades)
        wr = (bot_trades['target'].mean() or 0)
        
        if count < 15:
            report["Yetersiz_Veri"].append(f"{bot_id}: {count} işlem. (İstatistiksel analiz için en az 15 işlem bekleniyor)")
            continue
            
        rules = []
        
        rsi_diff, rsi_rule, _ = find_best_split(bot_trades, 'entry_rsi', [30, 35, 40, 45, 50, 55, 60, 65, 70])
        if rsi_rule: rules.append((rsi_diff, rsi_rule))
        
        adx_diff, adx_rule, _ = find_best_split(bot_trades, 'entry_adx', [15, 20, 22, 25, 30, 35])
        if adx_rule: rules.append((adx_diff, adx_rule))
        
        rvol_diff, rvol_rule, _ = find_best_split(bot_trades, 'entry_rvol', [0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.5])
        if rvol_rule: rules.append((rvol_diff, rvol_rule))
        
        reg_diff, reg_rule, _ = find_best_split(bot_trades, 'btc_regime', [], is_categorical=True)
        if reg_rule: rules.append((reg_diff, reg_rule))
        
        # Karar Verme Aşaması
        if wr >= 0.40:
            if rules:
                rules.sort(key=lambda x: x[0], reverse=True)
                best_rule = rules[0][1]
                report["Basarili_Botlar"].append(f"{bot_id} (WR: %{wr*100:.1f} | İşlem: {count}): İYİLEŞTİRME FIRSATI -> {best_rule}")
            else:
                report["Basarili_Botlar"].append(f"{bot_id} (WR: %{wr*100:.1f} | İşlem: {count}): Çok sağlıklı çalışıyor, belirgin bir zayıf noktası yok.")
        else:
            if rules:
                rules.sort(key=lambda x: x[0], reverse=True)
                best_rule = rules[0][1]
                report["Sorunlu_Botlar"].append(f"{bot_id} (WR: %{wr*100:.1f} | İşlem: {count}): KURTARMA REÇETESİ -> {best_rule}")
            else:
                report["Sorunlu_Botlar"].append(f"{bot_id} (WR: %{wr*100:.1f} | İşlem: {count}): KRİTİK UYARI -> İstatistiksel bir filtre bulunamadı. Çalışma mantığını gözden geçirin veya kapatın.")

    # Flatten recommendations for UI / JSON
    all_recommendations = []
    all_recommendations.extend(report["Global_Oneriler"])
    all_recommendations.extend(report["Sorunlu_Botlar"])
    all_recommendations.extend(report["Basarili_Botlar"])
    all_recommendations.extend(report["Yetersiz_Veri"])

    if use_json:
        result = {
            "success": True,
            "accuracy": float(acc),
            "is_synthetic": False,
            "total_trades": len(df),
            "feature_importance": feature_importance_list,
            "recommendations": all_recommendations
        }
        print(json.dumps(result))
    else:
        print("\n" + "="*20 + " GLOBAL ÖNERİLER " + "="*20)
        for r in report["Global_Oneriler"]: print(f" - {r}")
        
        print("\n" + "="*20 + " SORUNLU BOTLAR (WR < %40) " + "="*20)
        if not report["Sorunlu_Botlar"]: print(" - Sorunlu bot bulunamadı.")
        for r in report["Sorunlu_Botlar"]: print(f" [!] {r}")
            
        print("\n" + "="*20 + " BAŞARILI BOTLAR (WR >= %40) " + "="*20)
        if not report["Basarili_Botlar"]: print(" - Yeterli veriye sahip başarılı bot bulunamadı.")
        for r in report["Basarili_Botlar"]: print(f" [+] {r}")
            
        print("\n" + "="*20 + " YETERSİZ VERİ (İŞLEM < 15) " + "="*20)
        for r in report["Yetersiz_Veri"]: print(f" [?] {r}")
            
        print("\n" + "="*60)
        print("[OK] Kapsamlı Optimizasyon Raporu Tamamlandı.")

if __name__ == "__main__":
    train_optimizer()
