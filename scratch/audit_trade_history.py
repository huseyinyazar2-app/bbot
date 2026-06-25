import sqlite3
import time
import sys

def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
        
    db_path = "bot_state.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. General Stats
    cursor.execute("SELECT COUNT(*) FROM positions WHERE status = 'OPEN'")
    open_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM positions WHERE status = 'CLOSED'")
    closed_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT SUM(pnl), AVG(pnl) FROM positions WHERE status = 'CLOSED'")
    stats = cursor.fetchone()
    total_pnl = stats[0] if stats[0] is not None else 0
    avg_pnl = stats[1] if stats[1] is not None else 0
    
    # 2. Exit Reasons Breakdown
    cursor.execute("SELECT exit_reason, COUNT(*) FROM positions WHERE status = 'CLOSED' GROUP BY exit_reason")
    exit_reasons = cursor.fetchall()
    
    # 3. Check for Overlapping Open Positions
    cursor.execute("""
        SELECT symbol, COUNT(*) as c 
        FROM positions 
        WHERE status = 'OPEN' 
        GROUP BY symbol 
        HAVING c > 1
    """)
    overlapping_open = cursor.fetchall()
    
    # 4. Check for fee and pricing anomalies (e.g. SL or TP not hit logically, or negative quantity)
    cursor.execute("SELECT id, symbol, entryPrice, exitPrice, quantity, tp_price, sl_price, pnl, exit_reason FROM positions WHERE status = 'CLOSED' ORDER BY closed_at DESC LIMIT 20")
    last_closed = cursor.fetchall()
    
    print("==================================================")
    print("📊 NEXUS HYBRID AI BOT - ISLEM DENETIM RAPORU")
    print("==================================================")
    print(f"Acik Pozisyon Sayisi: {open_count}")
    print(f"Kapali Pozisyon Sayisi: {closed_count}")
    print(f"Toplam Simulasyon Kari/Zarari (PnL): ${total_pnl:.2f}")
    print(f"Islem Basina Ortalama Kar/Zarar: ${avg_pnl:.2f}")
    print("\n🚪 CIKIS SEBEPLERI DAGILIMI:")
    for reason, count in exit_reasons:
        pct = (count / closed_count * 100) if closed_count > 0 else 0
        print(f"  - {reason or 'BELIRTILMEDI'}: {count} adet (%{pct:.1f})")
        
    print("\n🛑 CAKISAN ACIK POZISYON KONTROLU (Ayni coin cift acik mi?):")
    if not overlapping_open:
        print("  - [TEMIZ] Ayni coinde cakisan birden fazla acik pozisyon bulunmuyor.")
    else:
        for symbol, count in overlapping_open:
            print(f"  - [HATA] {symbol}: {count} adet acik pozisyon var!")
            
    print("\n🕒 SON 20 KAPATILAN ISLEM VE ANALIZLERI:")
    columns = [desc[0] for desc in cursor.description]
    for row in last_closed:
        pos = dict(zip(columns, row))
        symbol = pos['symbol']
        entry = pos['entryPrice']
        exit_p = pos['exitPrice'] if pos['exitPrice'] is not None else 0
        tp = pos['tp_price'] if pos['tp_price'] is not None else 0
        sl = pos['sl_price'] if pos['sl_price'] is not None else 0
        pnl = pos['pnl'] if pos['pnl'] is not None else 0
        reason = pos['exit_reason']
        
        # Analyze correctness
        anomaly_msg = ""
        if reason == 'TP_HIT' and exit_p < entry:
            anomaly_msg = "[ANOMALI: TP ile kapanmis ama cikis fiyati giristen dusuk!]"
        elif reason == 'SL_HIT' and exit_p > entry and pnl < 0:
            anomaly_msg = "[TRAILING STOP: Giris ustu kapatilmis fakat komisyon net zararda]"
        elif reason == 'SL_HIT' and exit_p > entry and pnl > 0:
            anomaly_msg = "[TRAILING STOP: Giris ustu kapatilmis ve karla sonuclanmis]"
        elif reason == 'SL_HIT' and exit_p == entry:
            anomaly_msg = "[BE-STOP: Giris fiyatinda durdurulmus, komisyon kaybi var]"
            
        pnl_sign = "+" if pnl > 0 else ""
        print(f"  - {symbol} | Giris: {entry:.4f} | Cikis: {exit_p:.4f} ({reason}) | TP: {tp:.4f} | SL: {sl:.4f} | PnL: {pnl_sign}${pnl:.2f} {anomaly_msg}")
        
    # 5. Check settings
    cursor.execute("SELECT value FROM market_data WHERE key = 'SETTINGS'")
    settings_row = cursor.fetchone()
    
    print("\n⚙️ SISTEM AYARLARI:")
    if settings_row:
        print(f"  - {settings_row[0]}")
        
    conn.close()

if __name__ == "__main__":
    main()
