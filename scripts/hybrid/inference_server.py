import os
import json
import logging
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import pandas as pd
import numpy as np
import xgboost as xgb

from indicators import calculate_all_indicators

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger('HybridInference')

MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'bot', 'hybrid', 'models')
PORT = 5005

class ModelManager:
    def __init__(self):
        # symbol -> { tier_name: { 'model': xgb_model, 'meta': meta_dict } }
        self.models = {}
        self._lock = threading.Lock()  # Thread-safe model loading
        self.load_all_models()

    def load_symbol_models(self, symbol):
        symbol_dir = os.path.join(MODELS_DIR, symbol)
        if not os.path.exists(symbol_dir):
            return
            
        self.models[symbol] = {}
        meta_files = [f for f in os.listdir(symbol_dir) if f.endswith('_meta.json')]
        
        for meta_file in meta_files:
            tier_name = meta_file.replace('_meta.json', '')
            model_file = f"{tier_name}_model.json"
            
            meta_path = os.path.join(symbol_dir, meta_file)
            model_path = os.path.join(symbol_dir, model_file)
            
            if os.path.exists(model_path):
                try:
                    with open(meta_path, 'r') as f:
                        meta = json.load(f)
                        
                    model = xgb.XGBClassifier()
                    model.load_model(model_path)
                    
                    self.models[symbol][tier_name] = {
                        'model': model,
                        'meta': meta
                    }
                    logger.info(f"Yüklendi: {symbol} - {tier_name}")
                except Exception as e:
                    logger.error(f"Hata {symbol} {tier_name} yüklenirken: {e}")

    def load_all_models(self):
        logger.info(f"Modeller yükleniyor... Dizin: {MODELS_DIR}")
        if not os.path.exists(MODELS_DIR):
            logger.warning("Modeller dizini bulunamadı!")
            return

        symbols = [d for d in os.listdir(MODELS_DIR) if os.path.isdir(os.path.join(MODELS_DIR, d))]
        
        for symbol in symbols:
            self.load_symbol_models(symbol)
                        
        logger.info(f"Toplam {len(self.models)} coin için modeller yüklendi.")

    def predict(self, symbol, klines, btc_close_list, funding_rate_list):
        # Check if new model tiers have been written to disk since the last load
        symbol_dir = os.path.join(MODELS_DIR, symbol)
        meta_count = 0
        if os.path.exists(symbol_dir):
            meta_count = len([f for f in os.listdir(symbol_dir) if f.endswith('_meta.json')])

        if symbol not in self.models or not self.models[symbol] or len(self.models[symbol]) < meta_count:
            logger.info(f"[{symbol}] için model yükleniyor/güncelleniyor (Bellekte: {len(self.models.get(symbol, {}))}, Diskte: {meta_count})")
            with self._lock:  # Thread-safe lazy loading
                if symbol not in self.models or not self.models[symbol] or len(self.models[symbol]) < meta_count:
                    self.load_symbol_models(symbol)
            if symbol not in self.models or not self.models[symbol]:
                return {"error": f"Model bulunamadı: {symbol}"}
            
        # Convert to DataFrames
        df = pd.DataFrame(klines)
        if len(df) == 0:
            return {"error": "Boş kline verisi"}
            
        # Need to parse types
        numeric_cols = ['openTime', 'open', 'high', 'low', 'close', 'volume', 'quoteVolume', 'trades', 'takerBuyBase', 'takerBuyQuote']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                
        # BTC DataFrame
        btc_df = None
        if btc_close_list and len(btc_close_list) == len(df):
            btc_df = pd.DataFrame({
                'openTime': df['openTime'],
                'close': btc_close_list
            })
            
        # Funding DataFrame
        funding_df = None
        if funding_rate_list and len(funding_rate_list) > 0:
            # For simplicity, assume last rate is current, or match lengths
            funding_df = pd.DataFrame({
                'calcTime': df['openTime'],
                'rate': funding_rate_list[-1] if len(funding_rate_list) < len(df) else funding_rate_list
            })

        # Calculate indicators
        try:
            features_df = calculate_all_indicators(df, btc_df, funding_df)
        except Exception as e:
            return {"error": f"İndikatör hesaplama hatası: {e}"}

        # Take the last row (current state)
        # Remove duplicate columns (training does this but inference didn't — critical consistency fix)
        features_df = features_df.loc[:, ~features_df.columns.duplicated()]
        last_row = features_df.iloc[[-1]]
        
        response = {
            "symbol": symbol,
            "atr_value": 0,
            "tiers": {}
        }
        
        # ATR_pct NaN check
        if 'ATR_pct' in last_row.columns:
            atr_val = last_row['ATR_pct'].iloc[0]
            if pd.notna(atr_val):
                response["atr_value"] = float(atr_val)
        
        for tier_name, data in self.models[symbol].items():
            model = data['model']
            meta = data['meta']
            selected_features = meta.get('selected_features', [])
            threshold = meta.get('optimal_threshold', 0.75)
            
            # Prepare feature vector
            missing_cols = [c for c in selected_features if c not in last_row.columns]
            if missing_cols:
                logger.warning(f"Eksik feature'lar ({tier_name}): {missing_cols}")
                continue
                
            X = last_row[selected_features].copy()
            # NOT using fillna(0) — XGBoost handles NaN natively during training,
            # so we must pass NaN as-is during inference to maintain consistency.
            
            proba = float(model.predict_proba(X)[0][1])
            decision = "AL" if proba >= threshold else "BEKLE"
            
            response["tiers"][tier_name] = {
                "probability": proba,
                "decision": decision,
                "threshold": threshold,
                "tp": meta.get('target_pct'),
                "atr_sl_multiplier": meta.get('atr_sl_multiplier')
            }
            
        return response


class PredictHandler(BaseHTTPRequestHandler):
    model_manager = None
    
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        
    def do_GET(self):
        self._set_headers(200)
        self.wfile.write(json.dumps({"status": "ok", "models": len(self.model_manager.models)}).encode())
        
    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode('utf-8'))
            
            symbol = req.get('symbol')
            klines = req.get('klines', [])
            btc_close = req.get('btc_close', [])
            funding_rate = req.get('funding_rate', [])
            
            if not symbol or not klines:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Eksik parametre"}).encode())
                return
                
            result = self.model_manager.predict(symbol, klines, btc_close, funding_rate)
            
            status = 200 if "error" not in result else 500
            self._set_headers(status)
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            logger.error(f"Prediction Error: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode())

def run_server():
    PredictHandler.model_manager = ModelManager()
    server_address = ('', PORT)
    ThreadingHTTPServer.request_queue_size = 100
    httpd = ThreadingHTTPServer(server_address, PredictHandler)
    logger.info(f"Inference Server {PORT} portunda başlatıldı...")
    httpd.serve_forever()

if __name__ == "__main__":
    run_server()
