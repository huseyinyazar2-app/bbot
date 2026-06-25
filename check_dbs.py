import sqlite3
from datetime import datetime

def check_db(db_path, table, time_col):
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute(f"SELECT symbol, MIN({time_col}), MAX({time_col}) FROM {table} GROUP BY symbol LIMIT 10")
        rows = c.fetchall()
        print(f"--- {db_path} ---")
        for r in rows:
            symbol, min_ts, max_ts = r
            min_dt = datetime.fromtimestamp(min_ts/1000) if min_ts else 'N/A'
            max_dt = datetime.fromtimestamp(max_ts/1000) if max_ts else 'N/A'
            print(f"{symbol}: {min_dt} to {max_dt}")
        conn.close()
    except Exception as e:
        print(f"Error checking {db_path}: {e}")

check_db('historical_klines.db', 'klines', 'openTime')
check_db('hybrid_data.db', 'futures_klines', 'openTime')
