import { NextResponse } from 'next/server';
import { exec } from 'child_process';

// Global variable to hold the child process to allow monitoring
let currentProcess: any = null;
let currentLogs: string[] = [];

export async function POST(req: Request) {
  try {
    const { symbols } = await req.json();
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ success: false, error: "Sembol listesi bos." }, { status: 400 });
    }

    if (currentProcess) {
      return NextResponse.json({ success: false, error: "Zaten calisan bir guncelleme islemi var." }, { status: 400 });
    }

    currentLogs = [];
    const symbolsStr = symbols.join(',');
    
    currentProcess = exec(`python bot/update_database.py --symbols ${symbolsStr}`);
    
    currentProcess.stdout.on('data', (data: string) => {
      const lines = data.toString().split('\n').filter(l => l.trim() !== '');
      currentLogs.push(...lines);
      // Keep only last 100 lines to avoid memory leak
      if (currentLogs.length > 100) currentLogs = currentLogs.slice(currentLogs.length - 100);
    });

    currentProcess.stderr.on('data', (data: string) => {
      const lines = data.toString().split('\n').filter(l => l.trim() !== '');
      currentLogs.push(...lines);
    });

    currentProcess.on('close', (code: number) => {
      currentProcess = null;
      currentLogs.push(`Islem bitti (Kodu: ${code})`);
    });

    return NextResponse.json({ success: true, message: "Guncelleme baslatildi." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    isRunning: currentProcess !== null, 
    logs: currentLogs 
  });
}
