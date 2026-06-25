import sqlite3
import requests
import time
import argparse
import sys
import json
import io
import zipfile
import csv
from datetime import datetime, timezone

DB_PATH = 'historical_klines.db'
REST_URL = "https://api.binance.com/api/v3/klines"

def create_table_if_not_exists():
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
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_symbol_openTime ON klines (symbol, openTime)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_openTime ON klines(openTime)')
    conn.commit()
    conn.close()

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
        try:
            data_to_insert.append((
                symbol,
                int(k[0]),     # openTime
                float(k[1]),   # open
                float(k[2]),   # high
                float(k[3]),   # low
                float(k[4]),   # close
                float(k[5]),   # volume
                int(k[6])      # closeTime
            ))
        except (ValueError, IndexError):
            continue
            
    cursor.executemany('''
        INSERT OR IGNORE INTO klines (symbol, openTime, open, high, low, close, volume, closeTime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', data_to_insert)
    
    conn.commit()
    conn.close()
    return len(data_to_insert)

def get_month_ranges(start_time_ms, end_time_ms):
    start_dt = datetime.fromtimestamp(start_time_ms / 1000, tz=timezone.utc)
    end_dt = datetime.fromtimestamp(end_time_ms / 1000, tz=timezone.utc)
    
    current = datetime(start_dt.year, start_dt.month, 1, tzinfo=timezone.utc)
    months = []
    while current <= end_dt:
        months.append((current.year, current.month))
        if current.month == 12:
            current = datetime(current.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            current = datetime(current.year, current.month + 1, 1, tzinfo=timezone.utc)
    return months

def sync_symbol(symbol, years_if_empty=2):
    now = int(time.time() * 1000)
    last_ts = get_last_timestamp(symbol)
    
    if last_ts is None:
        start_time = now - (years_if_empty * 365 * 24 * 60 * 60 * 1000)
        print(f"[{symbol}] Veritabaninda yok. {years_if_empty} yillik veri Binance Vision (ZIP) ile indirilecek...", flush=True)
    else:
        start_time = last_ts + (5 * 60 * 1000)
        
    if start_time >= now - (5 * 60 * 1000):
        print(f"[{symbol}] Zaten guncel.", flush=True)
        return 0
        
    fetch_start = start_time
    total_downloaded = 0
    
    # 1. BINANCE VISION ZIP LOGIC (For bulk historical data)
    months = get_month_ranges(fetch_start, now)
    
    for year, month in months:
        month_str = f"{year}-{month:02d}"
        
        # Don't try to download zip for current ongoing month
        month_start_ts = datetime(year, month, 1, tzinfo=timezone.utc).timestamp() * 1000
        if month_start_ts > now:
            break
            
        zip_url = f"https://data.binance.vision/data/spot/monthly/klines/{symbol}/5m/{symbol}-5m-{month_str}.zip"
        
        try:
            head_resp = requests.head(zip_url, timeout=5)
            if head_resp.status_code == 200:
                print(f"[{symbol}] Toplu Paket indiriliyor: {month_str}.zip ...", flush=True)
                resp = requests.get(zip_url, timeout=60)
                if resp.status_code == 200:
                    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                        csv_filename = z.namelist()[0]
                        with z.open(csv_filename) as f:
                            content = f.read().decode('utf-8')
                            reader = csv.reader(content.splitlines())
                            klines = []
                            for row in reader:
                                if len(row) < 7: continue
                                row_open_time = int(row[0])
                                # Binance vision sometimes provides microseconds (16 digits) instead of ms (13 digits)
                                if row_open_time > 9999999999999:
                                    row_open_time = int(row_open_time / 1000)
                                    row[0] = str(row_open_time)
                                    row[6] = str(int(int(row[6]) / 1000))
                                
                                # Only process rows that are >= our target fetch start to prevent duplicates/gaps
                                if row_open_time >= fetch_start:
                                    klines.append(row)
                                    fetch_start = row_open_time + 1
                                    
                            if klines:
                                saved = save_klines(symbol, klines)
                                total_downloaded += saved
        except Exception as e:
            # If ZIP fails for any reason (e.g. 404), break out and fallback to REST
            print(f"[{symbol}] {month_str}.zip bulunamadi veya okunamadi. REST API'ye geciliyor...", flush=True)
            pass

    # 2. REST API FALLBACK (For the remaining days/hours)
    while fetch_start < now - (5 * 60 * 1000):
        params = {
            "symbol": symbol,
            "interval": "5m",
            "limit": 1000,
            "startTime": fetch_start,
            "endTime": now
        }
        
        try:
            response = requests.get(REST_URL, params=params, timeout=10)
            
            if response.status_code == 429:
                print(f"[{symbol}] REST Rate Limit! 10 saniye bekleniyor...", flush=True)
                time.sleep(10)
                continue
                
            response.raise_for_status()
            data = response.json()
            
            if not data:
                break
                
            saved = save_klines(symbol, data)
            total_downloaded += saved
            
            fetch_start = data[-1][0] + 1
            time.sleep(0.3) # rate limit prevention
            
        except Exception as e:
            print(f"[{symbol}] REST Hata: {e}. 5 sn sonra tekrar...", flush=True)
            time.sleep(5)
            
    print(f"[{symbol}] Tamamen guncellendi. Yeni eklenen mum: {total_downloaded}", flush=True)
    return total_downloaded

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbols', type=str, required=True, help='Comma separated symbols (e.g. BTCUSDT,ETHUSDT)')
    args = parser.parse_args()
    
    symbols = [s.strip() for s in args.symbols.split(',') if s.strip()]
    
    create_table_if_not_exists()
    
    total_mum = 0
    for idx, symbol in enumerate(symbols):
        print(f"[{idx+1}/{len(symbols)}] {symbol} kontrol ediliyor...", flush=True)
        total_mum += sync_symbol(symbol)
        
    print(f"=== ISLEM TAMAMLANDI ===", flush=True)
    print(f"Toplam eklenen mum: {total_mum}", flush=True)
    
if __name__ == '__main__':
    main()
