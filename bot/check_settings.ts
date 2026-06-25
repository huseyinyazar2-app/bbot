import { StateDB } from './database';

console.log("=== DB SETTINGS ===");
console.log(StateDB.getSettings());

console.log("\n=== WATCHLIST ===");
console.log(StateDB.getWatchlist().slice(0, 5));

console.log("\n=== OPEN POSITIONS ===");
console.log(StateDB.getOpenPositions());

console.log("\n=== CLOSED POSITIONS COUNT ===");
console.log(StateDB.getClosedPositions(100).length);
