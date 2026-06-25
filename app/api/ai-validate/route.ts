import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tpPercent, slPercent, rule, dataLimit, buyCommission = 0.1, sellCommission = 0.1, lookahead = 48 } = body;

    const scriptPath = path.resolve(process.cwd(), 'scripts/validate_strategy.py');

    return new Promise<Response>((resolve) => {
      const pythonProcess = spawn('python', [
        scriptPath,
        '--tp', String(tpPercent),
        '--sl', String(slPercent),
        '--rule', String(rule),
        '--limit', String(dataLimit),
        '--buy-comm', String(buyCommission),
        '--sell-comm', String(sellCommission),
        '--lookahead', String(lookahead)
      ]);

      let resultData = '';
      let errorData = '';

      pythonProcess.stdout.on('data', (data) => {
        resultData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('[AI VALIDATE] Python Error:', errorData);
          resolve(NextResponse.json({ success: false, error: 'Python script hatası', detail: errorData }, { status: 500 }));
          return;
        }

        try {
          const parsed = JSON.parse(resultData);
          resolve(NextResponse.json(parsed));
        } catch (e) {
          console.error('[AI VALIDATE] JSON Parse Error:', resultData);
          resolve(NextResponse.json({ success: false, error: 'Geçersiz JSON çıktısı', detail: resultData }, { status: 500 }));
        }
      });
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
