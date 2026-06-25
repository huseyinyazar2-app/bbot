import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { StateDB } from '@/bot/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  const modelsDir = path.join(process.cwd(), 'bot', 'hybrid', 'models');
  let trainedCoins: string[] = [];

  try {
    if (fs.existsSync(modelsDir)) {
      const items = fs.readdirSync(modelsDir, { withFileTypes: true });
      const coinSet = new Set<string>();
      
      items.forEach(item => {
        if (item.isDirectory()) {
          coinSet.add(item.name);
        }
      });
      trainedCoins = Array.from(coinSet);
    }

    // Ping Python Inference Server
    let inferenceOnline = false;
    try {
      const response = await fetch('http://127.0.0.1:5005', { method: 'GET', signal: AbortSignal.timeout(500) });
      if (response.status === 404 || response.ok) {
        inferenceOnline = true; // Server is running and responding (even if 404 on root)
      }
    } catch (e) {
      inferenceOnline = false;
    }

    // Gerek sinyalleri DB'den ek
    const liveProbs = StateDB.getHybridSignals() || {};
    
    // Soğuma listesi temizliğini ve güncellenmesini tetikle
    const blacklist = StateDB.getBlacklist() || [];
    
    // Ticker verilerini (Hacim ve Fiyat Degisimi) ekle
    const tickers = StateDB.getRealtimeTickers() || {};

    // Gerçek zamanlı WebSocket fiyatlarını ticker nesnesine giydirelim
    const realtimePrices = StateDB.getRealtimePrices() || {};
    for (const symbol in tickers) {
      if (tickers[symbol] && realtimePrices && realtimePrices[symbol]) {
        tickers[symbol].lastPrice = realtimePrices[symbol];
      }
    }
    
    // Ak simülasyon işlemlerini ekle (Tüm açık işlemler + son 100 kapalı işlem)
    let recentLogs: any[] = [];
    let capital = 1000;
    let settings: any = {};
    try {
        const openPos = StateDB.getOpenPositions()
          .filter(p => p.strategy.startsWith('Hybrid_XGBoost'))
          .sort((a, b) => b.entry_candle_time - a.entry_candle_time);
        const closedPos = StateDB.getClosedPositions(100, true)
          .filter(p => p.strategy.startsWith('Hybrid_XGBoost'))
          .sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0));
        recentLogs = [...openPos, ...closedPos];
        
        settings = StateDB.getSettings();
        capital = settings.capital ?? 1000;
    } catch(e) {
        console.error("Status route DB query failed:", e);
    }

    const systemLogs = StateDB.getRecentSystemLogs(50);

    return NextResponse.json({
      success: true,
      trainedCoins,
      inferenceOnline,
      totalTrained: trainedCoins.length,
      liveProbs,
      tickers,
      recentLogs,
      capital,
      settings,
      systemLogs,
      blacklist
    });

  } catch (error) {
    console.error("Status Route 500 Error:", error);
    try {
      StateDB.addSystemLog("ERROR", "API Status", (error as Error).message);
    } catch (e) {}
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST() {
  try {
    let inferenceOnline = false;
    try {
      const response = await fetch('http://127.0.0.1:5005', { method: 'GET', signal: AbortSignal.timeout(400) });
      if (response.status === 404 || response.ok) {
        inferenceOnline = true;
      }
    } catch (e) {}

    if (inferenceOnline) {
      return NextResponse.json({ success: true, message: 'Server is already running.' });
    }

    const { spawn } = require('child_process');
    const pythonScript = path.join(process.cwd(), 'scripts/hybrid', 'inference_server.py');
    const child = spawn('python', [pythonScript], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd()
    });
    child.unref();

    return NextResponse.json({ success: true, message: 'Inference server started in the background.' });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
