import sqlite3
import json

def main():
    db_path = "bot_state.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Query position logs for the symbols in the screenshot
    cursor.execute("""
        SELECT id, symbol, strategy, entryPrice, exitPrice, quantity, status, 
               tp_price, sl_price, realized_pnl, pnl, exit_reason, 
               trailing_activated, trailing_price, trailing_activation, trailing_distance
        FROM positions 
        WHERE symbol IN ('SANDUSDT', 'BATUSDT', 'STXUSDT')
        ORDER BY created_at DESC 
        LIMIT 10
    """)
    
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]
    
    print("--- Database Positions ---")
    for r in rows:
        pos = dict(zip(columns, r))
        print(f"\nID: {pos['id']}")
        print(f"Symbol: {pos['symbol']} | Strategy: {pos['strategy']} | Status: {pos['status']}")
        print(f"Entry Price: {pos['entryPrice']} | Exit Price: {pos['exitPrice']}")
        print(f"TP Price: {pos['tp_price']} | SL Price: {pos['sl_price']} | Exit Reason: {pos['exit_reason']}")
        print(f"PnL: {pos['pnl']} | Realized PnL: {pos['realized_pnl']}")
        print(f"Trailing: Activated={pos['trailing_activated']} | Activation Price={pos['trailing_activation']} | Distance={pos['trailing_distance']}")
        
    conn.close()

if __name__ == "__main__":
    main()
