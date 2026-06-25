import { POST } from '../app/api/backtest2/route';

async function test() {
  const reqBody = {
    startDate: "2026-06-01",
    endDate: "2026-06-03", // 2 days to keep it fast
    symbols: ["SOLUSDT", "AVAXUSDT", "ADAUSDT", "XRPUSDT", "LINKUSDT"], 
    strategies: ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B11", "B13", "B14", "B15", "B16", "B17", "B18"],
    initialCapital: 10000,
    buyFeeRate: 0.001, sellFeeRate: 0.001
  };
  
  const req = new Request("http://localhost/api/backtest2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody)
  });
  
  console.log("Calling POST /api/backtest2...");
  const response = await POST(req);
  const data = await response.json();
  
  console.log("Response status:", response.status);
  if (response.status !== 200) {
    console.error("Error response:", data);
  } else {
    console.log("Success! Summary:", JSON.stringify(data.summary, null, 2));
    console.log("Total Trades:", data.trades.length);
    console.log("Bot Performance:");
    Object.entries(data.botPerformance).forEach(([botId, stats]: [string, any]) => {
      console.log(`- ${botId}: Trades=${stats.trades_count}, WinRate=${stats.win_rate.toFixed(1)}%, PnL=${stats.pnl.toFixed(2)} USDT, Status=${stats.status}`);
    });
    if (data.trades.length > 0) {
      console.log("\nSample Trades (first 3):");
      console.log(JSON.stringify(data.trades.slice(0, 3), null, 2));
    }
  }
}

test().catch(console.error);
