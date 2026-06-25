import { NextResponse } from 'next/server';
import { StateDB } from '@/bot/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const openPositions = StateDB.getOpenPositions();
    const closedPositions = StateDB.getClosedPositions(20); // last 20 trades
    const blacklist = StateDB.getBlacklist();
    const watchlist = StateDB.getWatchlist();
    const top50 = StateDB.getTopCoins();
    const settings = StateDB.getSettings();
    const wsStatus = StateDB.getSystemStatus('WS');
    const botStatus = StateDB.getSystemStatus('BOT_LAST_TICK');
    const btcStatusRaw = StateDB.getSystemStatus('BTC');
    const scannerStatus = StateDB.getSystemStatus('SCANNER');
    
    let btcStatus = null;
    try {
      if (btcStatusRaw && btcStatusRaw.length > 0) btcStatus = JSON.parse(btcStatusRaw);
    } catch {}

    return NextResponse.json({
      openPositions,
      closedPositions,
      blacklist,
      watchlist,
      top50,
      settings,
      realtimePrices: StateDB.getRealtimePrices(),
      sysStatus: {
        ws: wsStatus || 'DISCONNECTED',
        botLastTick: botStatus || null,
        btc: btcStatus,
        scanner: scannerStatus || 'LOADING'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    StateDB.saveSettings(data);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
