import sys

def main():
    log_path = "bot.log"
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
        
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
            last_lines = lines[-50:]
            print("=== bot.log END ===")
            for line in last_lines:
                print(line, end="")
    except Exception as e:
        print("Error reading log:", e)

if __name__ == "__main__":
    main()
