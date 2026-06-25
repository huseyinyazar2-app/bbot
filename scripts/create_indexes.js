const db = require('better-sqlite3')('historical_klines.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='klines'").get().sql);
console.log('Creating index idx_openTime...');
db.exec('CREATE INDEX IF NOT EXISTS idx_openTime ON klines(openTime);');
console.log('Creating index idx_symbol_time...');
db.exec('CREATE INDEX IF NOT EXISTS idx_symbol_time ON klines(symbol, openTime);');
console.log('Indexes created successfully.');
db.close();
