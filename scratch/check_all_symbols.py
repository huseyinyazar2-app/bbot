import os
import requests

def main():
    models_dir = "bot/hybrid/models"
    if not os.path.exists(models_dir):
        print("Models directory not found")
        return
        
    trained_coins = []
    for item in os.listdir(models_dir):
        if os.path.isdir(os.path.join(models_dir, item)):
            trained_coins.append(item)
            
    print(f"Trained coins in models dir ({len(trained_coins)}): {trained_coins}")
    
    url = "https://fapi.binance.com/fapi/v1/exchangeInfo"
    try:
        res = requests.get(url, timeout=10)
        if res.status_code != 200:
            print("Failed to fetch exchange info:", res.status_code)
            return
            
        info = res.json()
        symbols = info.get("symbols", [])
        sym_map = {s["symbol"]: s for s in symbols}
        
        non_trading = []
        trading = []
        not_found = []
        
        for coin in trained_coins:
            if coin in sym_map:
                s = sym_map[coin]
                status = s.get("status")
                if status == "TRADING":
                    trading.append((coin, status))
                else:
                    non_trading.append((coin, status))
            else:
                not_found.append(coin)
                
        print("\n--- TRADING SYMBOLS ---")
        print(f"Total: {len(trading)}")
        
        print("\n--- NON-TRADING SYMBOLS (Issues) ---")
        for coin, status in non_trading:
            print(f"{coin}: status={status}")
            
        print("\n--- NOT FOUND SYMBOLS ---")
        for coin in not_found:
            print(f"{coin}")
            
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
