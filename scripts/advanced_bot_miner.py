import os
import json
import subprocess
import time
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, 'scripts')
STATUS_FILE = os.path.join(BASE_DIR, 'mining_status.json')
SAVED_BOTS_FILE = os.path.join(BASE_DIR, 'saved_bots.json')

def update_status(message, progress=0, is_finished=False):
    status = {
        "message": message,
        "progress": progress,
        "is_finished": is_finished,
        "updated_at": datetime.now().isoformat()
    }
    with open(STATUS_FILE, 'w', encoding='utf-8') as f:
        json.dump(status, f, ensure_ascii=False)

def run_script(script_name, args):
    cmd = ['python', os.path.join(SCRIPTS_DIR, script_name)] + args
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=BASE_DIR)
    if result.returncode != 0:
        with open(os.path.join(BASE_DIR, 'miner_error.log'), 'a', encoding='utf-8') as f:
            f.write(f"[{datetime.now().isoformat()}] Error running {script_name}:\nSTDERR:\n{result.stderr}\n\nSTDOUT:\n{result.stdout}\n")
        return None
    try:
        return json.loads(result.stdout)
    except Exception as e:
        with open(os.path.join(BASE_DIR, 'miner_error.log'), 'a', encoding='utf-8') as f:
            f.write(f"[{datetime.now().isoformat()}] JSON Parse Error from {script_name}: {e}\nOutput: {result.stdout[:1000]}\n")
        return None

def main():
    try:
        update_status("Başlatılıyor... Sabit havuz temizleniyor.", 0)
        
        with open(SAVED_BOTS_FILE, 'w', encoding='utf-8') as f:
            f.write('[]')
            
        update_status("Aşama 1: Geniş veride (6M Mum) temel örüntüler aranıyor...", 5)
        
        discovery_args = [
            '--tp', '2.0',
            '--sl', '1.0',
            '--min-win-rate', '0.55',
            '--limit', '6000000',
            '--mode', 'auto'
        ]
        
        discovery_res = run_script('discover_strategies.py', discovery_args)
        
        if not discovery_res or not discovery_res.get('success'):
            err_msg = discovery_res.get('error', 'Bilinmeyen Hata') if discovery_res else 'Script çöktü'
            update_status(f"Hata: Keşif işlemi başarısız oldu. Detay: {err_msg}", 0, True)
            return
            
        discovered_rules = discovery_res.get('rules', [])
        
        if not discovered_rules:
            update_status("Kural bulunamadı, piyasa uygun değil.", 100, True)
            return
            
        discovered_rules = sorted(discovered_rules, key=lambda x: x['win_rate'], reverse=True)[:10]
        total_discovered = len(discovered_rules)
        
        update_status(f"Aşama 1 Tamamlandı. En iyi {total_discovered} temel kural bulundu. Rafine (Derin Analiz) başlıyor.", 15)
        time.sleep(2)
        
        all_refined_rules = []
        
        for i, rule in enumerate(discovered_rules):
            progress = 15 + int((i / total_discovered) * 35)
            update_status(f"Aşama 2 (Derin Analiz): Kural {i+1}/{total_discovered} rafine ediliyor...", progress)
            
            refine_args = [
                '--tp', str(rule.get('tp', 2.0)),
                '--sl', str(rule.get('sl', 1.0)),
                '--min-win-rate', '0.60',
                '--limit', '6000000',
                '--mode', 'manual',
                '--base-rule', rule['description'],
                '--lookahead', str(rule.get('lookahead', 48))
            ]
            
            refine_res = run_script('discover_strategies.py', refine_args)
            if refine_res and refine_res.get('success'):
                variations = sorted(refine_res.get('rules', []), key=lambda x: x['win_rate'], reverse=True)[:3]
                all_refined_rules.extend(variations)
                
            time.sleep(2)
            
        total_refined = len(all_refined_rules)
        if total_refined == 0:
            update_status("Hiçbir kural rafine edilemedi.", 100, True)
            return
            
        update_status(f"Aşama 2 Tamamlandı. Toplam {total_refined} varyasyon üretildi. 2 Yıllık Doğrulama başlıyor.", 50)
        time.sleep(2)
        
        successful_bots = []
        for i, rule in enumerate(all_refined_rules):
            progress = 50 + int((i / total_refined) * 45)
            update_status(f"Aşama 3 (Devasa Test): Doğrulama {i+1}/{total_refined}... (Kural test ediliyor)", progress)
            
            validate_args = [
                '--tp', str(rule.get('tp', 2.0)),
                '--sl', str(rule.get('sl', 1.0)),
                '--rule', rule['description'],
                '--limit', '12000000',
                '--lookahead', str(rule.get('lookahead', 48))
            ]
            
            val_res = run_script('validate_strategy.py', validate_args)
            if val_res and val_res.get('success'):
                v = val_res.get('validation', {})
                if v.get('win_rate', 0) >= 0.60 and v.get('wins', 0) >= 5:
                    successful_bots.append({
                        "profile": rule.get('profile', 'Auto-Miner'),
                        "originalRule": rule.get('original_rule', ''),
                        "addedCondition": rule.get('added_condition', ''),
                        "description": rule.get('description', ''),
                        "tp": rule.get('tp', 2.0),
                        "sl": rule.get('sl', 1.0),
                        "win_rate": v.get('win_rate', 0),
                        "support": v.get('support', 0),
                        "wins": v.get('wins', 0),
                        "losses": v.get('losses', 0),
                        "savedAt": datetime.now().isoformat()
                    })
                    
                    with open(SAVED_BOTS_FILE, 'w', encoding='utf-8') as f:
                        json.dump(successful_bots, f, indent=2, ensure_ascii=False)
                        
            time.sleep(1)
            
        update_status(f"Madencilik Başarıyla Tamamlandı! Toplam {len(successful_bots)} Süper-Bot havuza kaydedildi.", 100, True)
        
    except Exception as e:
        update_status(f"Kritik Hata: {str(e)}", 0, True)

if __name__ == '__main__':
    main()
