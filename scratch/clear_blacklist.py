import sqlite3
import time
import sys

def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    db_path = "bot_state.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Delete all blacklist entries
    cursor.execute("DELETE FROM blacklist")
    deleted_count = cursor.rowcount
    print(f"Cleared {deleted_count} active cooldowns from 'blacklist' table.")
    
    # 2. Add system log entry
    timestamp = int(time.time() * 1000)
    log_msg = "Kullanıcı talebi üzerine tüm soğuma listesi (kara liste) temizlendi."
    cursor.execute("INSERT INTO system_logs (level, category, message, timestamp) VALUES ('INFO', 'System', ?, ?)", (log_msg, timestamp))
    print("Added system log entry for blacklist cleanup.")
    
    conn.commit()
    conn.close()
    print("Database committed successfully.")

if __name__ == "__main__":
    main()
