import { NextResponse } from 'next/server';
import { runSimulation, SimulationParams } from '../../../lib/simulator';
import { StateDB } from '../../../bot/database';

export const dynamic = 'force-dynamic';

interface Backtest2Request {
  startDate: string;
  endDate: string;
  symbols: string[];
  strategies?: string[];
  maxConcurrent?: number;
  initialCapital?: number;
  buyFeeRate?: number;
  sellFeeRate?: number;
}

export async function POST(req: Request) {
  try {
    const body: Backtest2Request = await req.json();
    const { startDate, endDate, symbols, strategies, maxConcurrent, initialCapital, buyFeeRate, sellFeeRate } = body;

    if (!startDate || !endDate || !symbols || symbols.length === 0) {
      return NextResponse.json({ error: 'Missing parameters. Provide startDate, endDate, and symbols.' }, { status: 400 });
    }

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
    }

    const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
    if (endMs - startMs > thirtyOneDaysMs) {
      return NextResponse.json({ error: 'Backtest range cannot exceed 31 days.' }, { status: 400 });
    }

    console.log(`[BACKTEST2 API] Forwarding request to Simulator module.`);
    const result = await runSimulation({
      startDate,
      endDate,
      symbols,
      enabledBots: strategies,
      maxConcurrent,
      initialCapital,
      buyFeeRate,
      sellFeeRate
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[BACKTEST2 API ERROR]', e);
    return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
  }
}
