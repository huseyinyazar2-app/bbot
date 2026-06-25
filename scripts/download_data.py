import os
import requests
import zipfile
import sqlite3
import pandas as pd
import io

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'historical_klines.db')

SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'ADAUSDT', 'AVAXUSDT', 'DOGEUSDT', 'LINKUSDT', 'DOTUSDT',
    'MATICUSDT', 'LTCUSDT', 'BCHUSDT', 'ATOMUSDT', 'UNIUSDT',
    'FTMUSDT', 'NEARUSDT', 'ALGOUSDT', 'AAVEUSDT', 'SANDUSDT',
    'MANAUSDT', 'AXSUSDT', 'GALAUSDT', 'RUNEUSDT', 'CRVUSDT',
    'SNXUSDT', 'CHZUSDT', 'ENJUSDT', 'COMPUSDT', 'MKRUSDT',
    'YFIUSDT', 'SUSHIUSDT', '1INCHUSDT', 'BATUSDT', 'ZRXUSDT',
    'KNCUSDT', 'OMGUSDT', 'STORJUSDT', 'OCEANUSDT', 'RLCUSDT',
    'BANDUSDT', 'KAVAUSDT', 'INJUSDT', 'CTSIUSDT', 'TRBUSDT',
    'STXUSDT', 'EGLDUSDT', 'FILUSDT', 'ARUSDT', 'LRCUSDT'
]

MONTHS = ['2023-10', '2023-11', '2023-12', '2024-01', '2024-02', '2024-03', '2024-04', '2024-05']
TIMEFRAME = '5m'

def setup_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS klines (
            symbol TEXT,
            openTime INTEGER,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume REAL,
            closeTime INTEGER,
            PRIMARY KEY (symbol, openTime)
        )
    ''')
    # Speed up inserts
    cursor.execute('PRAGMA synchronous = OFF')
    cursor.execute('PRAGMA journal_mode = MEMORY')
    conn.commit()
    return conn

def download_and_insert(symbol, month, conn):
    url = f"https://data.binance.vision/data/spot/monthly/klines/{symbol}/{TIMEFRAME}/{symbol}-{TIMEFRAME}-{month}.zip"
    print(f"Downloading {symbol} for {month}...")
    
    try:
        response = requests.get(url, timeout=15)
        if response.status_code != 200:
            print(f"  -> Not found or error (Status: {response.status_code})")
            return

        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            csv_filename = z.namelist()[0]
            with z.open(csv_filename) as f:
                df = pd.read_csv(f, header=None, usecols=[0,1,2,3,4,5,6], 
                                 names=['openTime', 'open', 'high', 'low', 'close', 'volume', 'closeTime'])
                
        df['symbol'] = symbol
        df = df[['symbol', 'openTime', 'open', 'high', 'low', 'close', 'volume', 'closeTime']]
        
        # Insert into DB
        df.to_sql('klines', conn, if_exists='append', index=False)
        print(f"  -> Inserted {len(df)} rows.")
        
    except Exception as e:
        print(f"  -> Failed: {e}")

if __name__ == "__main__":
    print("Setting up database...")
    conn = setup_db()
    
    for sym in SYMBOLS:
        for m in MONTHS:
            download_and_insert(sym, m, conn)
            
    # Create index for faster querying
    print("Creating index...")
    conn.cursor().execute('CREATE INDEX IF NOT EXISTS idx_symbol_openTime ON klines (symbol, openTime)')
    conn.commit()
    conn.close()
    print("Done! Historical data is ready.")
