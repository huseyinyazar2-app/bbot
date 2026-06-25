import os
import re

def search_files(directory):
    pattern = re.compile(r'(blacklist|cooldown|soğuma|soğutma)', re.IGNORECASE)
    matches = []
    
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in root or '.next' in root or 'git' in root or 'scratch' in root:
            continue
        for file in files:
            if file.endswith(('.ts', '.tsx', '.js', '.json', '.py', '.css')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        for i, line in enumerate(f, 1):
                            if pattern.search(line):
                                matches.append((filepath, i, line.strip()))
                except Exception as e:
                    pass
    return matches

def main():
    matches = search_files(".")
    print(f"Found {len(matches)} occurrences:")
    for filepath, line_num, content in matches:
        print(f"  {filepath}:{line_num} -> {content}")

if __name__ == "__main__":
    main()
