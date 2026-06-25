import fs from 'fs';
import path from 'path';

export interface DynamicBot {
  id: string; // Auto-generated ID like DYN_01
  profile: string;
  rule: string;
  tp: number;
  sl: number;
  // Metrics for context
  winRate: number;
  support: number;
}

export function loadDynamicBots(): DynamicBot[] {
  const filePath = path.resolve(process.cwd(), 'saved_bots.json');
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    if (!Array.isArray(data)) return [];

    return data.map((item, index) => {
      // Use outOfSample win rate if available, otherwise inSample
      const winRate = item.outOfSampleWinRate !== null && item.outOfSampleWinRate !== undefined
        ? item.outOfSampleWinRate
        : item.inSampleWinRate;
        
      const support = item.outOfSampleSupport !== null && item.outOfSampleSupport !== undefined
        ? item.outOfSampleSupport
        : item.inSampleSupport;

      return {
        id: `DYN_${(index + 1).toString().padStart(3, '0')}`,
        profile: item.profile || 'Manuel',
        rule: item.combinedRule,
        tp: item.tp,
        sl: item.sl,
        winRate,
        support
      };
    });
  } catch (e) {
    console.error("Dinamik botlar yüklenirken hata oluştu:", e);
    return [];
  }
}

export function evaluateRule(ruleStr: string, vars: Record<string, number>): boolean {
  if (!ruleStr) return false;
  
  // Safe evaluation of simple math conditions
  // Replace SQL/Pandas style AND/OR with JS operators
  let jsRule = ruleStr.replace(/ AND /g, ' && ').replace(/ OR /g, ' || ');
  
  const keys = Object.keys(vars);
  const values = Object.values(vars);
  
  try {
    // Create an array of null checks for every key to prevent JS NaN errors
    const definedChecks = keys.map(k => `${k} !== undefined && ${k} !== null`).join(' && ');
    const safeRule = `if (${definedChecks}) { return ${jsRule}; } else { return false; }`;
    
    const fn = new Function(...keys, safeRule);
    return fn(...values);
  } catch (e) {
    // console.error("Kural değerlendirme hatası:", ruleStr, e);
    return false;
  }
}
