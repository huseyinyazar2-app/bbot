import os
import subprocess
import time

# Tüm 46 Aktif Coin
ALL_COINS = [
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

def check_models_exist(symbol):
    models_dir = os.path.join("bot", "hybrid", "models", symbol)
    if not os.path.exists(models_dir):
        return False
    required_files = [
        "micro_scalp_model.json",
        "scalp_model.json",
        "swing_short_model.json",
        "swing_mid_model.json",
        "swing_long_model.json"
    ]
    for f in required_files:
        if not os.path.exists(os.path.join(models_dir, f)):
            return False
    return True

def run_command(cmd, log_file):
    print(f"Running: {cmd}")
    with open(log_file, "a") as f:
        f.write(f"\n--- Running: {cmd} at {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
    
    process = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    while True:
        output = process.stdout.readline()
        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.strip())
            with open(log_file, "a") as f:
                f.write(output)
    
    rc = process.poll()
    return rc

def main():
    log_file = "train_all_coins.log"
    print(f"Starting orchestration for all {len(ALL_COINS)} coins...")
    
    # Adım 1: Tüm verilerin ana arşivini indir (Zaten var olanları atlar)
    print("\n>>> Adım 1: fetch_data.py çalıştırılıyor...")
    run_command("python scripts/hybrid/fetch_data.py", log_file)
    
    # Adım 2: Her bir coin için eksikleri kapat ve modelleri eğit
    trained_count = 0
    skipped_count = 0
    
    for sym in ALL_COINS:
        print(f"\n=========================================")
        print(f" İşleniyor: {sym}")
        print(f"=========================================\n")
        
        if check_models_exist(sym):
            print(f"[+] {sym} için tüm modeller zaten eğitilmiş. Eğitim atlanıyor.")
            skipped_count += 1
            continue
            
        # Eksik gap'i kapat (Örn: 1 Haziran - Bugün)
        print(f"[*] {sym} için eksik tarihler API'den tamamlanıyor...")
        run_command(f"python scripts/hybrid/fetch_recent_gap.py {sym}", log_file)
        
        # Tüm 5 katmanı eğit
        print(f"[*] {sym} için modeller eğitiliyor...")
        rc = run_command(f"python scripts/hybrid/train_multi_tier.py --symbol {sym}", log_file)
        
        if rc == 0:
            print(f"[+] {sym} başarıyla eğitildi.")
            trained_count += 1
        else:
            print(f"[-] {sym} eğitiminde hata oluştu (Çıkış kodu: {rc}).")
            
        # Modeller yorulmasın, CPU dinlensin
        time.sleep(5)
        
    print(f"\nTüm işlemler tamamlandı! Eğitilen yeni coin: {trained_count}, Atlanan coin: {skipped_count}")

if __name__ == "__main__":
    main()
