import requests
import json

def main():
    url = "https://fapi.binance.com/fapi/v1/exchangeInfo"
    try:
        res = requests.get(url, timeout=10)
        if res.status_code == 200:
            info = res.json()
            symbols = info.get("symbols", [])
            sym_map = {s["symbol"]: s for s in symbols}
            
            for target in ["MKRUSDT", "LRCUSDT", "BTCUSDT", "ETHUSDT"]:
                if target in sym_map:
                    s = sym_map[target]
                    print(f"{target}: status={s.get('status')}, contractType={s.get('contractType')}")
                else:
                    print(f"{target} NOT FOUND in exchange info")
                    
        else:
            print("Failed to fetch exchange info:", res.status_code)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
