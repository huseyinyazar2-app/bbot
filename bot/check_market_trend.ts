import { fetchHistoricalKlines } from 'c:/Users/hyaza/Documents/antigravitiy/borsabotu/bot/binance';

async function checkTrend() {
  const symbols = [
    'XAUTUSDT', 'DOGEUSDT', 'UNIUSDT', 'XLMUSDT', 
    'TAOUSDT', 'TRXUSDT', 'JTOUSDT', 'SUIUSDT', 'ADAUSDT'
  ];
  
  const startMs = new Date('2026-06-01T00:00:00Z').getTime();
  const endMs = new Date('2026-06-06T23:59:59Z').getTime();

  console.log("=== June 1-6 Market Trend Analysis ===");
  
  for (const symbol of symbols) {
    try {
      const klines = await fetchHistoricalKlines(symbol, '1d', startMs, endMs);
      if (klines && klines.length > 0) {
        const first = klines[0].open;
        const last = klines[klines.length - 1].close;
        const changePct = ((last - first) / first) * 100;
        console.log(`${symbol}: Open: ${first.toFixed(4)} | Close: ${last.toFixed(4)} | Change: ${changePct.toFixed(2)}%`);
      }
    } catch (e: any) {
      console.error(`Error for ${symbol}:`, e.message);
    }
  }
}

checkTrend();
