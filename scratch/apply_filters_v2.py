import os

STRAT_DIR = "c:\\Users\\hyaza\\Documents\\antigravitiy\\borsabotu\\bot\\engine2\\strategies"

def insert_filter(filename, filter_code):
    path = os.path.join(STRAT_DIR, filename)
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 1. Find `return {`
    idx = -1
    for i, line in enumerate(lines):
        if line.strip().startswith('return {') and 'bot_id:' in lines[i+1]:
            idx = i
            break
            
    if idx == -1:
        print(f"return {{ not found in {filename}")
        return
        
    # 2. Insert filter code before `return {`
    # Check if already inserted
    if "YZ Filtresi" in "".join(lines[idx-10:idx]):
        print(f"Already filtered {filename}")
        # But we might need to overwrite the old ones we did manually.
        pass
        
    # To be safe, let's just insert it. Wait, I should remove my previous manual edits to B01, B06, B08, B09, B13, B15.
    pass

