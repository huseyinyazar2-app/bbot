import sqlite3
import time

def main():
    db_path = "bot_state.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Checking live signals in database...")
    cursor.execute("SELECT symbol, probability, updated_at FROM hybrid_live_signals ORDER BY probability DESC LIMIT 10")
    rows = cursor.fetchall()
    
    now = time.time() * 1000
    for r in rows:
        age_seconds = (now - r[2]) / 1000
        print(f"Symbol: {r[0]} | Prob: {r[1]}% | Age: {age_seconds:.1f}s ago")
        
    conn.close()

if __name__ == "__main__":
    main()
