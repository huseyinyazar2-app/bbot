import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'bot_state.db');
const db = new Database(dbPath);

// WAL mode for better concurrent read/write performance (Next.js API reads while bot writes)
try {
  db.pragma('journal_mode = WAL');
} catch (e) {
  console.error('WAL mode could not be enabled:', e);
}

// Initialization
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      strategy TEXT NOT NULL,
      entryPrice REAL NOT NULL,
      quantity REAL NOT NULL,
      side TEXT NOT NULL,
      status TEXT NOT NULL, -- 'OPEN', 'CLOSED'
      tp_price REAL,
      sl_price REAL,
      trailing_activated INTEGER DEFAULT 0,
      trailing_price REAL,
      entry_candle_time INTEGER NOT NULL,
      created_at INTEGER DEFAULT (cast(strftime('%s', 'now') as int))
    );

    CREATE TABLE IF NOT EXISTS blacklist (
      symbol TEXT PRIMARY KEY,
      expire_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      symbol TEXT PRIMARY KEY,
      strategy TEXT NOT NULL,
      priority INTEGER,
      rvol REAL,
      rsi REAL,
      quoteVol24h REAL,
      slPrice REAL,
      score REAL,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS market_data (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS hybrid_live_signals (
      symbol TEXT PRIMARY KEY,
      probability REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      features_json TEXT
    );
  `);
} catch (e) {
  console.error('Database table creation error:', e);
}

try {
  db.exec('ALTER TABLE positions ADD COLUMN exitPrice REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN pnl REAL');
} catch(e) {}

try {
  db.exec('ALTER TABLE watchlist ADD COLUMN ema50 REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE watchlist ADD COLUMN close REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE watchlist ADD COLUMN adx REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN realized_pnl REAL DEFAULT 0');
} catch(e) {}
try {
  db.exec('ALTER TABLE watchlist ADD COLUMN bbUpper REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE watchlist ADD COLUMN bbLower REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE watchlist ADD COLUMN sort_order INTEGER');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN exit_reason TEXT');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN closed_at INTEGER');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN entry_rsi REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN entry_rvol REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN entry_adx REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN btc_regime TEXT');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN setup_score REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE hybrid_live_signals ADD COLUMN features_json TEXT');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN trailing_activation REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE positions ADD COLUMN trailing_distance REAL');
} catch(e) {}
try {
  db.exec('ALTER TABLE hybrid_live_signals ADD COLUMN current_price REAL');
} catch(e) {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `);
} catch(e) {}

export interface Position {
  id: string;
  symbol: string;
  strategy: string;
  entryPrice: number;
  quantity: number;
  side: string;
  status: string;
  tp_price: number;
  sl_price: number;
  trailing_activated: number; // 0 or 1
  trailing_price: number;
  entry_candle_time: number;
  created_at: number;
  realized_pnl?: number;
  exit_reason?: string;
  closed_at?: number;
  exitPrice?: number;
  pnl?: number;
  entry_rsi?: number;
  entry_rvol?: number;
  entry_adx?: number;
  btc_regime?: string;
  setup_score?: number;
  trailing_activation?: number;
  trailing_distance?: number;
}

export const StateDB = {
  getSettings: () => {
    let settings: any = { maxConcurrent: 3, buyFeeRate: 0.001, sellFeeRate: 0.001, capital: 1000, isLiveBotActive: false };
    try {
      const row = db.prepare("SELECT value FROM market_data WHERE key = 'SETTINGS'").get() as any;
      if (row && row.value) {
        settings = { ...settings, ...JSON.parse(row.value) };
      }
    } catch (e) {}
    return settings;
  },

  saveSettings: (settings: any) => {
    try {
      db.prepare("INSERT OR REPLACE INTO market_data (key, value) VALUES ('SETTINGS', ?)").run(JSON.stringify(settings));
    } catch (e) {}
  },

  setTopCoins: (coins: {symbol: string, volume: number, price: number, priceChangePercent: number}[]) => {
    db.prepare("INSERT OR REPLACE INTO market_data (key, value) VALUES ('TOP50', ?)").run(JSON.stringify(coins));
  },

  getTopCoins: () => {
    try {
      const row = db.prepare("SELECT value FROM market_data WHERE key = 'TOP50'").get() as any;
      if (row) return JSON.parse(row.value);
    } catch {}
    return [];
  },

  setSystemStatus: (key: string, value: string) => {
    db.prepare("INSERT OR REPLACE INTO market_data (key, value) VALUES (?, ?)").run(`SYS_STATUS_${key}`, value);
  },

  getSystemStatus: (key: string) => {
    try {
      const row = db.prepare("SELECT value FROM market_data WHERE key = ?").get(`SYS_STATUS_${key}`) as any;
      if (row) return row.value;
    } catch {}
    return null;
  },

  setRealtimePrices: (prices: Record<string, number>) => {
    db.prepare("INSERT OR REPLACE INTO market_data (key, value) VALUES ('REALTIME_PRICES', ?)").run(JSON.stringify(prices));
  },

  getRealtimePrices: (): Record<string, number> => {
    try {
      const row = db.prepare("SELECT value FROM market_data WHERE key = 'REALTIME_PRICES'").get() as any;
      if (row) return JSON.parse(row.value);
    } catch {}
    return {};
  },

  setRealtimeTickers: (tickers: Record<string, {lastPrice: number, volume: number, priceChangePercent: number}>) => {
    try {
      db.prepare("INSERT OR REPLACE INTO market_data (key, value) VALUES ('REALTIME_TICKERS', ?)").run(JSON.stringify(tickers));
    } catch (e) {
      console.error("DB Hata (setRealtimeTickers):", e);
    }
  },

  getRealtimeTickers: (): Record<string, {lastPrice: number, volume: number, priceChangePercent: number}> => {
    try {
      const row = db.prepare("SELECT value FROM market_data WHERE key = 'REALTIME_TICKERS'").get() as any;
      if (row) return JSON.parse(row.value);
    } catch {}
    return {};
  },

  setHybridSignal: (symbol: string, probability: number, featuresJson?: string, current_price?: number) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO hybrid_live_signals (symbol, probability, updated_at, features_json, current_price)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
                probability = excluded.probability,
                updated_at = excluded.updated_at,
                features_json = excluded.features_json,
                current_price = excluded.current_price
        `);
        stmt.run(symbol, probability, Date.now(), featuresJson || null, current_price || null);
    } catch (e) {
        console.error("setHybridSignal error:", e);
    }
  },

  getHybridSignals: (): Record<string, { prob: number, details: any, current_price?: number }> => {
    try {
      const rows = db.prepare("SELECT symbol, probability, features_json, current_price FROM hybrid_live_signals").all() as any[];
      const result: Record<string, { prob: number, details: any, current_price?: number }> = {};
      rows.forEach(r => { 
        result[r.symbol] = {
          prob: r.probability,
          details: r.features_json ? JSON.parse(r.features_json) : null,
          current_price: r.current_price
        }; 
      });
      return result;
    } catch {
      return {};
    }
  },

  addSystemLog: (level: string, category: string, message: string) => {
    try {
      const stmt = db.prepare("INSERT INTO system_logs (level, category, message, timestamp) VALUES (?, ?, ?, ?)");
      stmt.run(level, category, message, Date.now());
      // Prune old logs to keep only the last 100
      db.prepare("DELETE FROM system_logs WHERE id NOT IN (SELECT id FROM system_logs ORDER BY timestamp DESC LIMIT 100)").run();
    } catch (e) {
      console.error("addSystemLog error:", e);
    }
  },

  getRecentSystemLogs: (limit: number = 50): { id: number, level: string, category: string, message: string, timestamp: number }[] => {
    try {
      return db.prepare("SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?").all(limit) as any[];
    } catch {
      return [];
    }
  },

  clearSystemLogs: () => {
    try {
      db.prepare("DELETE FROM system_logs").run();
    } catch {}
  },

  updateWatchlist: (signals: any[]) => {
    db.transaction(() => {
      db.prepare("DELETE FROM watchlist").run();
      const stmt = db.prepare("INSERT INTO watchlist (symbol, strategy, priority, rvol, rsi, quoteVol24h, slPrice, score, updated_at, ema50, close, adx, bbUpper, bbLower, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const now = Date.now();
      for (let i = 0; i < signals.length; i++) {
         const s = signals[i];
         stmt.run(s.symbol, s.strategy, s.priority, s.rvol, s.rsi, s.quoteVol24h, s.slPrice, s.score || 0, now, s.ema50, s.close, s.adx, s.bbUpper, s.bbLower, i);
      }
    })();
  },

  getWatchlist: () => {
    try {
      return db.prepare("SELECT * FROM watchlist ORDER BY sort_order ASC").all();
    } catch {
      return [];
    }
  },

  getOpenPositions: (): Position[] => {
    try {
      return db.prepare("SELECT * FROM positions WHERE status = 'OPEN' ORDER BY created_at DESC").all() as Position[];
    } catch {
      return [];
    }
  },
  
  getClosedPositions: (limit: number = 50, includeSimulated: boolean = false): Position[] => {
    try {
      const sql = includeSimulated
        ? "SELECT * FROM positions WHERE status = 'CLOSED' ORDER BY created_at DESC LIMIT ?"
        : "SELECT * FROM positions WHERE status = 'CLOSED' AND id NOT LIKE 'SIM-%' ORDER BY created_at DESC LIMIT ?";
      return db.prepare(sql).all(limit) as Position[];
    } catch {
      return [];
    }
  },

  getBlacklist: (): { symbol: string, expire_at: number }[] => {
    const now = Date.now();
    try {
      // Find expired ones first so we can log them
      const expired = db.prepare("SELECT symbol FROM blacklist WHERE expire_at < ?").all(now) as { symbol: string }[];
      for (const item of expired) {
        StateDB.addSystemLog("INFO", "Engine", `${item.symbol} için soğuma süresi (cooldown) sona erdi, alımlar tekrar açıldı.`);
      }
      // Clean up expired ones
      db.prepare("DELETE FROM blacklist WHERE expire_at < ?").run(now);
    } catch (e) {
      console.error("getBlacklist error:", e);
    }
    return db.prepare("SELECT * FROM blacklist").all() as { symbol: string, expire_at: number }[];
  },

  getPosition: (id: string): Position | undefined => {
    return db.prepare("SELECT * FROM positions WHERE id = ?").get(id) as Position | undefined;
  },

  addPosition: (pos: Partial<Position>) => {
    const stmt = db.prepare(`
      INSERT INTO positions (
        id, symbol, strategy, entryPrice, quantity, side, status, 
        tp_price, sl_price, entry_candle_time, entry_rsi, entry_rvol, 
        entry_adx, btc_regime, setup_score, exitPrice, pnl, 
        realized_pnl, exit_reason, closed_at, trailing_activation, trailing_distance
      )
      VALUES (
        @id, @symbol, @strategy, @entryPrice, @quantity, @side, @status, 
        @tp_price, @sl_price, @entry_candle_time, @entry_rsi, @entry_rvol, 
        @entry_adx, @btc_regime, @setup_score, @exitPrice, @pnl, 
        @realized_pnl, @exit_reason, @closed_at, @trailing_activation, @trailing_distance
      )
    `);
    const fullPos = {
      id: null,
      symbol: null,
      strategy: null,
      entryPrice: null,
      quantity: null,
      side: null,
      status: null,
      tp_price: null,
      sl_price: null,
      entry_candle_time: null,
      entry_rsi: null,
      entry_rvol: null,
      entry_adx: null,
      btc_regime: null,
      setup_score: null,
      exitPrice: null,
      pnl: null,
      realized_pnl: 0,
      exit_reason: null,
      closed_at: null,
      trailing_activation: null,
      trailing_distance: null,
      ...pos
    };
    stmt.run(fullPos);
  },

  updatePosition: (id: string, updates: Partial<Position>) => {
    const allowedKeys = ['status', 'exitPrice', 'pnl', 'realized_pnl', 'exit_reason', 'closed_at', 'tp_price', 'sl_price', 'trailing_activated', 'trailing_price', 'entry_candle_time', 'trailing_activation', 'trailing_distance'];
    const keys = Object.keys(updates).filter(k => allowedKeys.includes(k));
    if (keys.length === 0) return;
    const setClause = keys.map(k => `${k} = @${k}`).join(', ');
    const stmt = db.prepare(`UPDATE positions SET ${setClause} WHERE id = @id`);
    stmt.run({ ...updates, id });
  },

  closePosition: (id: string, exitPrice?: number, pnl?: number, exitReason?: string) => {

    const now = Math.floor(Date.now() / 1000);

    if (exitPrice !== undefined && pnl !== undefined) {
      db.prepare("UPDATE positions SET status = 'CLOSED', exitPrice = ?, pnl = ?, exit_reason = ?, closed_at = ? WHERE id = ?")
        .run(exitPrice, pnl, exitReason || null, now, id);
    } else {
      db.prepare("UPDATE positions SET status = 'CLOSED', exit_reason = ?, closed_at = ? WHERE id = ?")
        .run(exitReason || null, now, id);
    }
  },

  addToBlacklist: (symbol: string, expireAtMs: number) => {
    db.prepare(`INSERT OR REPLACE INTO blacklist (symbol, expire_at) VALUES (?, ?)`).run(symbol, expireAtMs);
  },

  isBlacklisted: (symbol: string): boolean => {
    const now = Date.now();
    try {
      const row = db.prepare(`SELECT expire_at FROM blacklist WHERE symbol = ?`).get(symbol) as any;
      if (!row) return false;
      if (row.expire_at < now) {
        db.prepare(`DELETE FROM blacklist WHERE symbol = ?`).run(symbol);
        StateDB.addSystemLog("INFO", "Engine", `${symbol} için soğuma süresi (cooldown) sona erdi, alımlar tekrar açıldı.`);
        return false;
      }
    } catch (e) {
      console.error("isBlacklisted error:", e);
    }
    return true;
  },

  resetDatabase: () => {
    db.prepare(`DELETE FROM positions`).run();
    db.prepare(`DELETE FROM blacklist`).run();
    db.prepare(`DELETE FROM watchlist`).run();
    // Settingleri tutuyoruz, ama istersen ayarları da silebiliriz.
    // Kullanıcı baştan başlat diyor, logları ve geçmişi istiyor. 
  },

  resetHybridBot: () => {
    try {
      db.prepare("DELETE FROM positions WHERE strategy LIKE 'Hybrid_XGBoost%'").run();
      db.prepare("DELETE FROM hybrid_live_signals").run();
      const settings = StateDB.getSettings();
      settings.capital = 10000;
      StateDB.saveSettings(settings);
    } catch (e) {
      console.error("resetHybridBot error:", e);
    }
  },

  clearSimulatedPositions: () => {
    try {
      db.prepare("DELETE FROM positions WHERE id LIKE 'SIM-%'").run();
    } catch (e) {}
  }
};
