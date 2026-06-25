import sqlite3
import json
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
    
    # 1. Delete all closed positions
    cursor.execute("DELETE FROM positions WHERE status = 'CLOSED'")
    deleted_count = cursor.rowcount
    print(f"Deleted {deleted_count} closed positions from 'positions' table.")
    
    # 2. Reset capital in SETTINGS
    cursor.execute("SELECT value FROM market_data WHERE key = 'SETTINGS'")
    row = cursor.fetchone()
    if row:
        settings = json.loads(row[0])
        old_capital = settings.get("capital")
        settings["capital"] = 10000.0
        # If maxConcurrent is not set, default it
        if "maxConcurrent" not in settings:
            settings["maxConcurrent"] = 6
        new_settings_str = json.dumps(settings)
        cursor.execute("INSERT OR REPLACE INTO market_data (key, value) VALUES ('SETTINGS', ?)", (new_settings_str,))
        print(f"Reset capital from ${old_capital} to $10000.0 in SETTINGS.")
    else:
        # Create default settings if not exists
        settings = {
            "maxConcurrent": 6,
            "buyFeeRate": 0.001,
            "sellFeeRate": 0.001,
            "capital": 10000.0,
            "isLiveBotActive": False,
            "feeRate": 0.002
        }
        cursor.execute("INSERT OR REPLACE INTO market_data (key, value) VALUES ('SETTINGS', ?)", (json.dumps(settings),))
        print("Created default SETTINGS with capital $10000.0.")
        
    # 3. Add system log for tracking
    timestamp = int(time.time() * 1000)
    log_msg = "Kullanıcı talebi üzerine geçmiş işlemler temizlendi ve kasa 10,000.00$ olarak sıfırlandı."
    cursor.execute("INSERT INTO system_logs (level, category, message, timestamp) VALUES ('INFO', 'System', ?, ?)", (log_msg, timestamp))
    print("Added system log entry.")
    
    conn.commit()
    conn.close()
    print("Database commit and cleanup completed successfully.")

if __name__ == "__main__":
    main()
