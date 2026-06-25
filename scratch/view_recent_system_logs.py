import sqlite3
import time

def main():
    db_path = "bot_state.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- RECENT SYSTEM LOGS ---")
    cursor.execute("SELECT level, category, message, timestamp FROM system_logs ORDER BY timestamp DESC LIMIT 15")
    rows = cursor.fetchall()
    
    for r in rows:
        time_str = time.strftime('%H:%M:%S', time.localtime(r[3] / 1000))
        print(f"[{time_str}] [{r[0]}] [{r[1]}] {r[2]}")
        
    conn.close()

if __name__ == "__main__":
    main()
