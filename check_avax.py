import sqlite3
import datetime

conn = sqlite3.connect('bot_state.db')
c = conn.cursor()
c.execute("SELECT symbol, updated_at, features_json FROM hybrid_live_signals WHERE symbol='AVAXUSDT'")
r = c.fetchone()
if r:
    dt = datetime.datetime.fromtimestamp(r[1]/1000) if r[1] else 'None'
    print(r[0], dt)
    print(r[2])
else:
    print("Not found")
