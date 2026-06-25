import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol') || 'BTCUSDT';
  const tp = searchParams.get('tp') || '0.02';
  const sl = searchParams.get('sl') || '0.01';
  const days = searchParams.get('days') || '365';

  try {
    const scriptPath = path.join(process.cwd(), 'bot', 'knn_live_radar.py');
    const command = `python "${scriptPath}" --symbol ${symbol} --tp ${tp} --sl ${sl} --days ${days}`;
    
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
    
    // Find the JSON block in stdout
    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
      const data = JSON.parse(jsonStr);
      return NextResponse.json(data);
    } else {
      return NextResponse.json({ success: false, error: "Python çıktısı anlaşılamadı.", details: stdout || stderr }, { status: 500 });
    }
    
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
