import { StateDB } from '../bot/database';

function main() {
  console.log("Adding mock system logs...");
  
  StateDB.addSystemLog("INFO", "System", "HİBRİT YAPAY ZEKA MOTORU BAŞLATILIYOR (Test Log)");
  StateDB.addSystemLog("WARN", "WebSocket", "Binance bağlantısı koptu! (Test Log)");
  StateDB.addSystemLog("ERROR", "Signal Generator", "Tahmin motorunda hata [BTCUSDT]: fetch failed (Test Log)");

  console.log("Retrieving logs...");
  const logs = StateDB.getRecentSystemLogs(10);
  console.log("Logged items:", JSON.stringify(logs, null, 2));
}

main();
