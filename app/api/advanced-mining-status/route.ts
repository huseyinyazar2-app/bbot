import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const statusFile = path.resolve(process.cwd(), 'mining_status.json');
    if (!fs.existsSync(statusFile)) {
      return NextResponse.json({ message: 'Bekliyor...', progress: 0, is_finished: false });
    }
    const content = fs.readFileSync(statusFile, 'utf-8');
    const data = JSON.parse(content);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
