import { NextResponse } from 'next/server';
import { StateDB } from '../../../bot/database';

export async function POST(req: Request) {
  try {
    StateDB.resetDatabase();
    return NextResponse.json({ success: true, message: 'Veritabanı sıfırlandı' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
