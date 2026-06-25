import subprocess
import os

SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'ADAUSDT', 'AVAXUSDT', 'DOGEUSDT', 'LINKUSDT', 'DOTUSDT',
    'LTCUSDT', 'BCHUSDT', 'ATOMUSDT', 'UNIUSDT',
    'NEARUSDT', 'ALGOUSDT', 'AAVEUSDT', 'SANDUSDT',
    'MANAUSDT', 'AXSUSDT', 'GALAUSDT', 'RUNEUSDT', 'CRVUSDT',
    'SNXUSDT', 'CHZUSDT', 'ENJUSDT', 'COMPUSDT', 'MKRUSDT',
    'YFIUSDT', 'SUSHIUSDT', '1INCHUSDT', 'BATUSDT', 'ZRXUSDT',
    'KNCUSDT', 'STORJUSDT', 'RLCUSDT',
    'BANDUSDT', 'KAVAUSDT', 'INJUSDT', 'CTSIUSDT', 'TRBUSDT',
    'STXUSDT', 'EGLDUSDT', 'FILUSDT', 'ARUSDT', 'LRCUSDT'
]

TOP_COINS = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
    'ADAUSDT', 'DOGEUSDT', 'LINKUSDT', 'DOTUSDT', 'MATICUSDT'
]

REMAINING_COINS = [s for s in SYMBOLS if s not in TOP_COINS]

def main():
    print(f"Updating gaps for {len(REMAINING_COINS)} remaining coins...")
    script_path = os.path.join(os.path.dirname(__file__), 'fetch_recent_gap.py')
    for sym in REMAINING_COINS:
        print(f"[{sym}] Tarih guncellemesi baslatiliyor...")
        subprocess.run(["python", script_path, sym])
        print(f"[{sym}] Tamamlandi.")

if __name__ == "__main__":
    main()
