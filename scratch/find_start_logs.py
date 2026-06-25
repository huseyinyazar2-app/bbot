import sys

def main():
    log_path = "hybrid_bot.log"
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
        
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                if "HİBRİT YAPAY ZEKA MOTORU BAŞLATILIYOR" in line or "START" in line or "Starting Hybrid" in line:
                    print(line, end="")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
