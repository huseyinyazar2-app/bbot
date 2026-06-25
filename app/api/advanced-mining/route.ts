import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req: Request) {
  try {
    const scriptPath = path.resolve(process.cwd(), 'scripts/advanced_bot_miner.py');

    // Start it detached so it runs in background
    const pythonProcess = spawn('python', [scriptPath], {
      detached: true,
      stdio: 'ignore'
    });
    
    pythonProcess.unref();

    return NextResponse.json({ success: true, message: 'Gelişmiş madencilik arka planda başlatıldı.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
