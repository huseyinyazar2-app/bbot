import os
import requests
import zipfile
import sqlite3
import pandas as pd
import io

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'hybrid_data.db')

SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'ADAUSDT', 'AVAXUSDT', 'DOGEUSDT', 'LINKUSDT', 'DOTUSDT',
    'LTCUSDT', 'BCHUSDT', 'ATOMUSDT', 'UNIUSDT',
    'NEARUSDT', 'ALGOUSDT', 'AAVEUSDT', 'SANDUSDT',
    'MANAUSDT', 'AXSUSDT', 'GALAUSDT', 'RUNEUSDT', 'CRVUSDT',
    'SNXUSDT', 'CHZUSDT', 'ENJUSDT', 'COMPUSDT', 'MKRUSDT',
    'YFIUSDT', 'SUSHIUSDT', '1INCHUSDT', 'BATUSDT', 'ZRXUSDT',
    'KNCUSDT', 'STORJUSDT', 'RLCUSDT',
    'BANDUSDT', 'KAVAUSDT', 'INJUSDT', 'CTSIUSDT', 'TRBUSDT',
    'STXUSDT', 'EGLDUSDT', 'FILUSDT', 'ARUSDT', 'LRCUSDT'
]

# Son 12 ay (Haziran 2025 - Mayıs 2026)
MONTHS = [
    '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11',
    '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'
]

TIMEFRAME = '5m'

def setup_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS futures_klines (
            symbol TEXT,
            openTime INTEGER,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume REAL,
            closeTime INTEGER,
            quoteVolume REAL,
            trades INTEGER,
            takerBuyBase REAL,
            takerBuyQuote REAL,
            UNIQUE(symbol, openTime)
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS funding_rates (
            symbol TEXT,
            calcTime INTEGER,
            rate REAL,
            UNIQUE(symbol, calcTime)
        )
    ''')
    conn.commit()
    return conn

def download_and_insert_klines(symbol, month, conn):
    url = f"https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/{TIMEFRAME}/{symbol}-{TIMEFRAME}-{month}.zip"
    try:
        response = requests.get(url, timeout=15)
        if response.status_code != 200:
            return False
            
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            csv_filename = z.namelist()[0]
            with z.open(csv_filename) as f:
                df = pd.read_csv(f, header=None, usecols=[0,1,2,3,4,5,6,7,8,9,10], 
                                 names=['openTime', 'open', 'high', 'low', 'close', 'volume', 'closeTime', 'quoteVolume', 'trades', 'takerBuyBase', 'takerBuyQuote'])
                
        df['symbol'] = symbol
        
        # Insert with IGNORE to avoid duplicate crashes
        df.to_sql('temp_klines', conn, if_exists='replace', index=False)
        conn.execute('''
            INSERT OR IGNORE INTO futures_klines 
            SELECT symbol, openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote
            FROM temp_klines
        ''')
        conn.commit()
        return True
    except Exception as e:
        print(f"Error klines {symbol} {month}: {e}")
        return False

def download_and_insert_funding(symbol, month, conn):
    url = f"https://data.binance.vision/data/futures/um/monthly/fundingRate/{symbol}/{symbol}-fundingRate-{month}.zip"
    try:
        response = requests.get(url, timeout=15)
        if response.status_code != 200:
            return False
            
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            csv_filename = z.namelist()[0]
            with z.open(csv_filename) as f:
                df = pd.read_csv(f, header=0) # first row is header
                df.columns = ['calcTime', 'interval', 'rate'] # standardize column names
                
        df['symbol'] = symbol
        df = df[['symbol', 'calcTime', 'rate']]
        
        df.to_sql('temp_funding', conn, if_exists='replace', index=False)
        conn.execute('''
            INSERT OR IGNORE INTO funding_rates 
            SELECT symbol, calcTime, rate
            FROM temp_funding
        ''')
        conn.commit()
        return True
    except Exception as e:
        print(f"Error funding {symbol} {month}: {e}")
        return False

def main():
    print("Setting up hybrid database...")
    conn = setup_db()
    
    # Optional: We can read symbols from CLI args or run all. We'll loop them.
    for sym in SYMBOLS:
        print(f"[{sym}] Veriler kontrol ediliyor/indiriliyor...")
        
        # Check if already downloaded (simplistic check: do we have ~12 months * 30 days * 288 candles = 100k rows?)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM futures_klines WHERE symbol=?", (sym,))
        count = cursor.fetchone()[0]
        
        if count > 80000:
            print(f"[{sym}] Zaten veritabanında var ({count} mum).")
        else:
            for m in MONTHS:
                success_k = download_and_insert_klines(sym, m, conn)
                success_f = download_and_insert_funding(sym, m, conn)
                if success_k:
                    print(f"  -> {m} Klines indirildi.")
                if success_f:
                    print(f"  -> {m} Funding indirildi.")
            print(f"[{sym}] BAŞARIYLA TAMAMLANDI! Model eğitime hazır.")

        # Tarih güncellemesini (fetch_recent_gap.py) otomatik olarak tetikle
        print(f"[{sym}] Tarih güncellemesi tetikleniyor...")
        conn.commit()
        conn.close()
        
        import subprocess
        script_path = os.path.join(os.path.dirname(__file__), 'fetch_recent_gap.py')
        subprocess.run(["python", script_path, sym])
        
        # Bağlantıyı sonraki döngü için yeniden aç
        conn = sqlite3.connect(DB_PATH)
    
    print("İndeksler oluşturuluyor...")
    conn.execute('CREATE INDEX IF NOT EXISTS idx_fk_symbol_time ON futures_klines (symbol, openTime)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_fr_symbol_time ON funding_rates (symbol, calcTime)')
    conn.commit()
    conn.close()
    print("Tüm indirmeler bitti!")

if __name__ == "__main__":
    main()
