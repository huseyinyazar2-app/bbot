import { NextRequest, NextResponse } from "next/server";
import { StateDB } from "../../../bot/database";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const currentSettings = StateDB.getSettings() || { maxConcurrent: 3, buyFeeRate: 0.002, sellFeeRate: 0.002, capital: 1000 };
    
    const newSettings = {
      ...currentSettings,
      ...body
    };

    StateDB.saveSettings(newSettings);

    return NextResponse.json({ success: true, settings: newSettings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
