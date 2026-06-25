import { NextResponse } from 'next/server';
import { loadDynamicBots } from '../../../bot/engine2/dynamic_loader';

export async function GET() {
  try {
    const bots = loadDynamicBots();
    return NextResponse.json({ success: true, bots });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
