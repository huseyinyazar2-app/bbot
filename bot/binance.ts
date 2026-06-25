import { CONFIG } from './config';

const REST_BASE = 'https://api.binance.com';

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  isClosed: boolean;
}

export interface SymbolInfo {
  symbol: string;
  stepSize: number;
  tickSize: number;
}

let symbolInfoCache: Map<string, SymbolInfo> = new Map();

/** Rest API Fetch Helper */
async function fetchBinance(endpoint: string) {
  const url = `${REST_BASE}${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance API Error ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Preload limits like LOT_SIZE, PRICE_FILTER */
export async function initializeExchangeInfo() {
  const data = await fetchBinance('/api/v3/exchangeInfo');
  for (const sym of data.symbols) {
    if (sym.status !== 'TRADING') continue;
    let stepSize = 0;
    let tickSize = 0;
    
    for (const filter of sym.filters) {
      if (filter.filterType === 'LOT_SIZE') stepSize = parseFloat(filter.stepSize);
      if (filter.filterType === 'PRICE_FILTER') tickSize = parseFloat(filter.tickSize);
    }
    
    symbolInfoCache.set(sym.symbol, { symbol: sym.symbol, stepSize, tickSize });
  }
}

/** Formats an order size correctly to prevent margin errors */
export function formatQuantity(symbol: string, quantity: number): number {
  const info = symbolInfoCache.get(symbol);
  if (!info || info.stepSize === 0) return quantity;
  const precision = Math.log10(1 / info.stepSize);
  const factor = Math.pow(10, precision);
  return Math.floor(quantity * factor) / factor;
}

/** Formats a price correctly */
export function formatPrice(symbol: string, price: number): number {
  const info = symbolInfoCache.get(symbol);
  if (!info || info.tickSize === 0) return price;
  const precision = Math.log10(1 / info.tickSize);
  const factor = Math.pow(10, precision);
  return Math.floor(price * factor) / factor;
}

/** Get Top Vip List */
export async function getTop50Coins(): Promise<{symbol: string, volume: number, price: number, priceChangePercent: number}[]> {
  const tickers: any[] = await fetchBinance('/api/v3/ticker/24hr');
  
  const valid = tickers.filter(t => 
    t.symbol.endsWith(CONFIG.QUOTE_ASSET) && 
    !CONFIG.EXCLUDED_COINS.includes(t.symbol)
  );

  // Sort by USDT quoteVolume desc
  valid.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
  
  return valid.slice(0, 50).map(t => ({ 
    symbol: t.symbol, 
    volume: parseFloat(t.quoteVolume),
    price: parseFloat(t.lastPrice),
    priceChangePercent: parseFloat(t.priceChangePercent)
  }));
}

/** Get Klines */
export async function getKlines(symbol: string, interval: string, limit: number = 100): Promise<Kline[]> {
  const data: any[] = await fetchBinance(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  return data.map(d => ({
    openTime: d[0],
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4]),
    volume: parseFloat(d[5]),
    closeTime: d[6],
    quoteVolume: parseFloat(d[7]),
    isClosed: Date.now() > d[6]
  }));
}

export async function getCurrentPrices(symbols: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (symbols.length === 0) return result;
  try {
    const data: any[] = await fetchBinance('/api/v3/ticker/price');
    for (const item of data) {
      if (symbols.includes(item.symbol)) {
        result.set(item.symbol, parseFloat(item.price));
      }
    }
  } catch (e) {
    console.error('REST fallback price fetch failed:', e);
  }
  return result;
}

export async function executeOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, price?: number) {
  // const apiKey = process.env.BINANCE_API_KEY;
  // const apiSecret = process.env.BINANCE_API_SECRET;
  // if (!apiKey || !apiSecret) throw new Error('API Keys not configured.');
  // const timestamp = Date.now();
  // let query = `symbol=${symbol}&side=${side}&type=${price ? 'LIMIT' : 'MARKET'}&quantity=${quantity}&timestamp=${timestamp}`;
  // if (price) query += `&price=${price}&timeInForce=GTC`;
  // const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
  // const url = `${REST_BASE}/api/v3/order?${query}&signature=${signature}`;
  // const res = await fetch(url, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } });
  // return res.json();
  return { status: 'SIMULATED', symbol, side, quantity, price };
}

export async function fetchHistoricalKlines(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<Kline[]> {
  let allKlines: Kline[] = [];
  let currentStart = startTime;

  while (currentStart < endTime) {
    const url = `/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=1000`;
    const data: any[] = await fetchBinance(url);
    if (!data || data.length === 0) break;

    const chunk = data.map(d => ({
      openTime: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
      closeTime: d[6],
      quoteVolume: parseFloat(d[7]),
      isClosed: true
    }));

    allKlines = allKlines.concat(chunk);
    
    const lastCloseTime = chunk[chunk.length - 1].closeTime;
    if (lastCloseTime >= endTime || lastCloseTime <= currentStart) {
      break;
    }
    currentStart = lastCloseTime + 1;
    
    // Delay to prevent hitting rate limits
    await new Promise(r => setTimeout(r, 50));
  }

  return allKlines;
}
