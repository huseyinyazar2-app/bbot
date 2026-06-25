const db = require('better-sqlite3')('bot_state.db');
const openPositions = db.prepare("SELECT * FROM positions WHERE strategy LIKE 'Hybrid_XGBoost%' AND status = 'OPEN'").all();
console.log("OPEN POSITIONS:", JSON.stringify(openPositions, null, 2));

const closedPositions = db.prepare("SELECT * FROM positions WHERE strategy LIKE 'Hybrid_XGBoost%' AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT 5").all();
console.log("RECENT CLOSED POSITIONS:", JSON.stringify(closedPositions, null, 2));

const settings = db.prepare("SELECT value FROM market_data WHERE key = 'SETTINGS'").get();
console.log("SETTINGS:", settings ? JSON.parse(settings.value) : "NONE");

const prices = db.prepare("SELECT value FROM market_data WHERE key = 'REALTIME_PRICES'").get();
console.log("REALTIME PRICES:", prices ? JSON.parse(prices.value) : "NONE");

const tickers = db.prepare("SELECT value FROM market_data WHERE key = 'REALTIME_TICKERS'").get();
console.log("REALTIME TICKERS FOR AVAXUSDT:", tickers ? JSON.parse(tickers.value)['AVAXUSDT'] : "NONE");
