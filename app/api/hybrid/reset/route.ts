import { NextResponse, NextRequest } from 'next/server';
import { StateDB } from '@/bot/database';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    if (type === 'logs') {
      StateDB.clearSystemLogs();
      return NextResponse.json({ success: true, message: 'Sistem logları başarıyla temizlendi.' });
    }

    StateDB.resetHybridBot();
    return NextResponse.json({ success: true, message: 'Hibrit Bot geçmişi başarıyla temizlendi, kasa $10,000.00 olarak güncellendi.' });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
