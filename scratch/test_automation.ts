import { StateDB } from '../bot/database';

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  console.log("=== OTOMASYON TESTI BASLIYOR ===");
  
  // 1. Initial status check
  console.log("\n1. Mevcut durum sorgulanıyor...");
  let res = await fetch('http://localhost:3039/api/automation');
  let status = await res.json();
  console.log("Durum:", JSON.stringify(status, null, 2));

  // 2. Start automation
  console.log("\n2. Otomasyon başlatılıyor...");
  res = await fetch('http://localhost:3039/api/automation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start' })
  });
  let startRes = await res.json();
  console.log("Başlatma Yanıtı:", JSON.stringify(startRes, null, 2));

  // 3. Wait for the cycle to perform database operations
  console.log("\n3. Bir döngünün tamamlanması için bekleniyor (45 saniye)...");
  for (let i = 0; i < 9; i++) {
    await wait(5000);
    res = await fetch('http://localhost:3039/api/automation');
    status = await res.json();
    console.log(`[${(i+1)*5}s] Statü:`, status.statusText, "| Döngü Sayısı:", status.cycleCount);
    if (status.cycleCount > 0) {
      break;
    }
  }

  // 4. Verify trades in database
  console.log("\n4. Veritabanındaki simüle işlemler kontrol ediliyor...");
  const closed = StateDB.getClosedPositions(200, true);
  const simTrades = closed.filter(p => p.id.startsWith('SIM-'));
  console.log(`Veritabanında toplam SIM- ön ekli işlem sayısı: ${simTrades.length}`);
  
  if (simTrades.length > 0) {
    const sample = simTrades[0];
    console.log("Örnek simüle işlem detayları:", {
      id: sample.id,
      symbol: sample.symbol,
      strategy: sample.strategy,
      entryPrice: sample.entryPrice,
      exitPrice: sample.exitPrice,
      pnl: sample.pnl,
      closed_at: sample.closed_at,
      entry_rsi: sample.entry_rsi,
      status: sample.status
    });
    
    if (sample.pnl === null || sample.exitPrice === null) {
      console.error("HATA: exitPrice veya pnl veritabanına NULL olarak yazılmış!");
    } else {
      console.log("BAŞARI: exitPrice ve pnl değerleri veritabanına başarıyla yazılmış!");
    }
  } else {
    console.warn("UYARI: Hiç simüle işlem bulunamadı (belki de simülasyon henüz tamamlanmadı).");
  }

  // 5. Stop automation
  console.log("\n5. Otomasyon durduruluyor...");
  res = await fetch('http://localhost:3039/api/automation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop' })
  });
  let stopRes = await res.json();
  console.log("Durdurma Yanıtı:", JSON.stringify(stopRes, null, 2));

  // Wait for it to stop cleanly
  console.log("Otomasyonun tamamen durması bekleniyor...");
  for (let i = 0; i < 5; i++) {
    await wait(2000);
    res = await fetch('http://localhost:3039/api/automation');
    status = await res.json();
    console.log(`Statü: ${status.statusText} | isRunning: ${status.isRunning}`);
    if (!status.isRunning) {
      break;
    }
  }

  // 6. Clear simulated trades
  console.log("\n6. Simüle işlemler temizleniyor...");
  res = await fetch('http://localhost:3039/api/automation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clear' })
  });
  let clearRes = await res.json();
  console.log("Temizleme Yanıtı:", JSON.stringify(clearRes, null, 2));

  // Verify DB clean
  const closedAfterClear = StateDB.getClosedPositions(200, true);
  const simTradesAfterClear = closedAfterClear.filter(p => p.id.startsWith('SIM-'));
  console.log(`Temizleme sonrası SIM- işlem sayısı: ${simTradesAfterClear.length}`);
  if (simTradesAfterClear.length === 0) {
    console.log("BAŞARI: Tüm simüle işlemler temizlendi!");
  } else {
    console.error("HATA: Simüle işlemler veritabanından silinemedi!");
  }

  console.log("\n=== TEST TAMAMLANDI ===");
}

runTest().catch(console.error);
