import sqlite3

conn = sqlite3.connect('bot_state.db')
cur = conn.cursor()

cur.execute('PRAGMA table_info(hybrid_live_signals)')
rows = cur.fetchall()
print('hybrid_live_signals columns:', [r[1] for r in rows])

cur.execute('PRAGMA table_info(positions)')
rows2 = cur.fetchall()
print('positions columns:', [r[1] for r in rows2])

cur.execute("SELECT COUNT(*) FROM positions WHERE status='OPEN'")
print('Open positions:', cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM positions WHERE status='CLOSED'")
print('Closed positions:', cur.fetchone()[0])

# Check if current_price column exists in hybrid_live_signals
has_current_price = any(r[1] == 'current_price' for r in rows)
print('hybrid_live_signals has current_price:', has_current_price)

# Check entry_candle_time column exists in positions
has_entry_candle = any(r[1] == 'entry_candle_time' for r in rows2)
print('positions has entry_candle_time:', has_entry_candle)

# Sample some open positions
cur.execute("SELECT id, symbol, strategy, entryPrice, quantity, tp_price, sl_price, entry_candle_time, setup_score FROM positions WHERE status='OPEN' LIMIT 5")
for row in cur.fetchall():
    print('  OPEN:', row)

# Sample some closed positions
cur.execute("SELECT id, symbol, strategy, entryPrice, exitPrice, pnl, exit_reason, closed_at FROM positions WHERE status='CLOSED' ORDER BY closed_at DESC LIMIT 5")
for row in cur.fetchall():
    print('  CLOSED:', row)

# Check settings
cur.execute("SELECT value FROM market_data WHERE key='SETTINGS'")
srow = cur.fetchone()
print('Settings:', srow[0] if srow else 'NOT FOUND')

conn.close()
