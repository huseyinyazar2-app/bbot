import requests

def test_symbol(symbol):
    print(f"Testing {symbol} on Binance Futures...")
    url = f"https://fapi.binance.com/fapi/v1/klines?symbol={symbol}&interval=5m&limit=5"
    try:
        res = requests.get(url, timeout=10)
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            print(f"First kline: {data[0]}")
            print(f"Last kline: {data[-1]}")
        else:
            print(f"Error response: {res.text}")
    except Exception as e:
        print(f"Exception: {e}")

test_symbol("MKRUSDT")
test_symbol("LRCUSDT")
