import os
import sqlite3
import requests
import time
import argparse

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'hybrid_data.db')
TIMEFRAME = '5m'
LIMIT = 1000

def fetch_gap(symbol):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Find the latest openTime for this symbol, ignoring any header strings
    cursor.execute("SELECT MAX(CAST(openTime AS INTEGER)) FROM futures_klines WHERE symbol=? AND openTime != 'openTime' AND openTime != 'open_time'", (symbol,))
    row = cursor.fetchone()
    
    if not row or not row[0]:
        print(f"[{symbol}] Veritabaninda hic veri yok. Once fetch_data.py calistirilmalidir.")
        return

    start_time = int(row[0]) + 1  # Start fetching from the next millisecond
    now = int(time.time() * 1000)

    print(f"[{symbol}] Veritabani Son Kayit: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(start_time/1000))}")

    total_inserted = 0
    consecutive_failures = 0
    while start_time < now:
        url = f"https://fapi.binance.com/fapi/v1/klines?symbol={symbol}&interval={TIMEFRAME}&startTime={start_time}&limit={LIMIT}"
        try:
            res = requests.get(url, timeout=10)
            if res.status_code != 200:
                print(f"[{symbol}] API Hatasi: {res.status_code}")
                consecutive_failures += 1
                if consecutive_failures >= 3:
                    print(f"[{symbol}] Ust uste {consecutive_failures} hata alindi. Islem durduruluyor.")
                    break
                time.sleep(2)
                continue
            
            data = res.json()
            if not data:
                break
            
            consecutive_failures = 0
            records = []
            for k in data:
                # kline fields: [0]openTime, [1]open, [2]high, [3]low, [4]close, [5]vol, [6]closeTime, [7]quoteVol, [8]trades, [9]takerBase, [10]takerQuote
                records.append((
                    symbol, int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]),
                    float(k[5]), int(k[6]), float(k[7]), int(k[8]), float(k[9]), float(k[10])
                ))
            
            cursor.executemany('''
                INSERT OR REPLACE INTO futures_klines 
                (symbol, openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', records)
            
            conn.commit()
            total_inserted += len(records)
            
            start_time = int(data[-1][0]) + 1
            time.sleep(0.5) # Rate limit protection

        except Exception as e:
            print(f"[{symbol}] Hata: {e}")
            consecutive_failures += 1
            if consecutive_failures >= 3:
                print(f"[{symbol}] Ust uste {consecutive_failures} hata alindi. Islem durduruluyor.")
                break
            time.sleep(5)

    print(f"[{symbol}] Toplam {total_inserted} yeni mum eksigi tamamlandi.")
    conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch missing recent klines for a symbol")
    parser.add_argument("symbol", type=str, help="Binance Symbol (e.g. BTCUSDT)")
    args = parser.parse_args()
    
    fetch_gap(args.symbol)
