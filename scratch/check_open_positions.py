import sqlite3
import time

def main():
    db_path = "bot_state.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, symbol, strategy, entryPrice, quantity, tp_price, sl_price, 
               trailing_activated, trailing_activation, trailing_distance, 
               entry_candle_time, setup_score 
        FROM positions 
        WHERE status = 'OPEN'
    """)
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]
    
    now = time.time()
    print("--- ACTIVE OPEN POSITIONS ---")
    for r in rows:
        pos = dict(zip(columns, r))
        age_minutes = (now - pos['entry_candle_time']) / 60
        print(f"\nSymbol: {pos['symbol']} | Strategy: {pos['strategy']}")
        print(f"  Entry Price: {pos['entryPrice']} | Qty: {pos['quantity']:.4f}")
        print(f"  TP: {pos['tp_price']:.4f} | SL: {pos['sl_price']:.4f}")
        print(f"  Trailing: Activated={pos['trailing_activated']} | Activation={pos['trailing_activation']} | Distance={pos['trailing_distance']}")
        print(f"  Age: {age_minutes:.1f} minutes | Setup Score: {pos['setup_score']}%")
        
    conn.close()

if __name__ == "__main__":
    main()
