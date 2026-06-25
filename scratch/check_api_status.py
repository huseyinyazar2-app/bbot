import urllib.request
import json
import sys

def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    url = "http://127.0.0.1:3039/api/hybrid/status"
    print(f"Pinging {url}...")
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=3) as response:
            status_code = response.getcode()
            body = response.read().decode('utf-8')
            print(f"Status Code: {status_code}")
            data = json.loads(body)
            print(f"Success: {data.get('success')}")
            print(f"Inference Online: {data.get('inferenceOnline')}")
            print(f"Trained Coins Count: {data.get('totalTrained')}")
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    main()
