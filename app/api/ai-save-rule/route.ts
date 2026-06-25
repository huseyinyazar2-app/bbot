import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const rules = await req.json();
    
    if (!Array.isArray(rules) || rules.length === 0) {
      return NextResponse.json({ success: false, error: 'Kaydedilecek kural bulunamadı' }, { status: 400 });
    }

    const filePath = path.resolve(process.cwd(), 'saved_bots.json');
    let existingData: any[] = [];

    // Read existing file if it exists
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        if (fileContent) {
          existingData = JSON.parse(fileContent);
          if (!Array.isArray(existingData)) {
            existingData = [];
          }
        }
      } catch (err) {
        console.error('Error reading saved_bots.json:', err);
        // Continue with empty array if parsing fails
      }
    }

    // Add timestamp to new rules and append
    const newRulesWithTimestamp = rules.map(rule => ({
      ...rule,
      savedAt: new Date().toISOString()
    }));

    const combinedData = [...existingData, ...newRulesWithTimestamp];

    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(combinedData, null, 2), 'utf-8');

    return NextResponse.json({ success: true, savedCount: rules.length, totalCount: combinedData.length });
  } catch (error: any) {
    console.error('Error in ai-save-rule:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
