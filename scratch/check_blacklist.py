import sqlite3
import time

def main():
    db_path = "bot_state.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- BLACKLIST TABLE ---")
    cursor.execute("SELECT symbol, expire_at FROM blacklist")
    rows = cursor.fetchall()
    
    now = time.time() * 1000
    print(f"Current time (ms): {now:.0f} ({time.strftime('%Y-%m-%d %H:%M:%S')})")
    
    if not rows:
        print("Blacklist is empty.")
    for r in rows:
        expire_time = r[1]
        remaining = (expire_time - now) / 1000
        expire_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(expire_time / 1000))
        print(f"Symbol: {r[0]} | Expire At: {expire_time} ({expire_str}) | Remaining: {remaining:.1f} seconds")
        
    conn.close()

if __name__ == "__main__":
    main()
