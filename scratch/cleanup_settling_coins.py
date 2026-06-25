import os
import shutil
import sqlite3

def main():
    # 1. Delete model directories
    for symbol in ["MKRUSDT", "LRCUSDT"]:
        dir_path = os.path.join("bot/hybrid/models", symbol)
        if os.path.exists(dir_path):
            print(f"Deleting model directory: {dir_path}")
            shutil.rmtree(dir_path)
            
    # 2. Delete from database
    db_path = "bot_state.db"
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            for symbol in ["MKRUSDT", "LRCUSDT"]:
                print(f"Deleting {symbol} from hybrid_live_signals database table...")
                cursor.execute("DELETE FROM hybrid_live_signals WHERE symbol = ?", (symbol,))
            conn.commit()
            conn.close()
            print("Database cleanup complete.")
        except Exception as e:
            print("Database error:", e)

if __name__ == "__main__":
    main()
