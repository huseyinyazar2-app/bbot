import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execPromise = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const scriptPath = path.resolve(process.cwd(), 'scratch', 'optimize_xgboost.py');
    
    // Execute python script with json flag
    const { stdout, stderr } = await execPromise(`python "${scriptPath}" --json`);
    
    if (stderr && !stdout) {
      console.error('[OPTIMIZE API ERROR - stderr]', stderr);
      return NextResponse.json({ error: 'Python script error: ' + stderr }, { status: 500 });
    }
    
    const data = JSON.parse(stdout.trim());
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[OPTIMIZE API ERROR]', e);
    return NextResponse.json({ error: e.message || 'Failed to run XGBoost optimization' }, { status: 500 });
  }
}
