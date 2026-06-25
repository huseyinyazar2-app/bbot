import sqlite3

def main():
    db_path = "bot_state.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM positions
        ORDER BY created_at DESC
        LIMIT 5
    """)
    
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]
    
    for r in rows:
        pos = dict(zip(columns, r))
        print("--- POSITION ---")
        for k, v in pos.items():
            print(f"  {k}: {v}")
            
    conn.close()

if __name__ == "__main__":
    main()
