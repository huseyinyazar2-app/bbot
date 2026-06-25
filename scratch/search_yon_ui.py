import re

def main():
    filepath = "app/hybrid-bots/page.tsx"
    pattern = re.compile(r'Yön:', re.IGNORECASE)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f, 1):
                if pattern.search(line):
                    print(f"Line {i}: {line.strip()}")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
