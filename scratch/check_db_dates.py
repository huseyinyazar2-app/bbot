import sqlite3
import datetime

conn = sqlite3.connect('hybrid_data.db')
cursor = conn.cursor()
cursor.execute("SELECT MAX(openTime) FROM futures_klines WHERE symbol='AVAXUSDT'")
res = cursor.fetchone()[0]

if res:
    dt = datetime.datetime.fromtimestamp(res/1000)
    print(f"Max date in DB for AVAXUSDT: {dt} (Timestamp: {res})")
else:
    print("No data found for AVAXUSDT")

cursor.execute("SELECT COUNT(DISTINCT symbol) FROM futures_klines")
syms = cursor.fetchone()[0]
print(f"Total symbols in DB: {syms}")
