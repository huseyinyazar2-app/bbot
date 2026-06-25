import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { HybridMarketListener } from '../../bot/hybrid/market_listener';
import { StateDB } from '../../bot/database';

const logFile = path.join(process.cwd(), 'hybrid_bot.log');
function logToFile(msg: string) {
    const time = new Date().toISOString();
    try {
        fs.appendFileSync(logFile, `[${time}] ${msg}\n`);
    } catch (e) {}
}
const originalLog = console.log;
const originalError = console.error;
console.log = (...args: any[]) => {
    logToFile(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    originalLog(...args);
};
console.error = (...args: any[]) => {
    logToFile("[ERROR] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    originalError(...args);
};

let activeIntervals: NodeJS.Timeout[] = [];
function clearActiveIntervals() {
    activeIntervals.forEach(clearInterval);
    activeIntervals = [];
}

async function start() {
    clearActiveIntervals();
    console.log("=========================================");
    console.log("🚀 HİBRİT YAPAY ZEKA MOTORU BAŞLATILIYOR 🚀");
    console.log("=========================================");
    StateDB.addSystemLog("INFO", "System", "HİBRİT YAPAY ZEKA MOTORU BAŞLATILIYOR");

    const modelsDir = path.join(process.cwd(), 'bot', 'hybrid', 'models');
    let trainedCoins: string[] = [];

    // Eğitilen coinleri bul
    if (fs.existsSync(modelsDir)) {
        const items = fs.readdirSync(modelsDir, { withFileTypes: true });
        const coinSet = new Set<string>();
        items.forEach(item => {
            if (item.isDirectory()) {
                coinSet.add(item.name);
            }
        });
        trainedCoins = Array.from(coinSet);
    }

    if (trainedCoins.length === 0) {
        console.error("❌ HATA: Eğitilmiş model bulunamadı. Lütfen önce modelleri eğitin.");
        process.exit(1);
    }

    console.log(`✅ Toplam ${trainedCoins.length} eğitilmiş model bulundu. Piyasalar yükleniyor...`);
    StateDB.addSystemLog("INFO", "System", `Toplam ${trainedCoins.length} eğitilmiş model bulundu. Piyasalar yükleniyor...`);

    const listener = new HybridMarketListener();
    const latestPrices: Record<string, number> = {};

    // Canlı fiyatları saniyede bir DB'ye yazalım (Arayüzde akıcılık sağlamak için)
    const priceInterval = setInterval(() => {
        if (Object.keys(latestPrices).length > 0) {
            StateDB.setRealtimePrices(latestPrices);
        }
    }, 1000);
    activeIntervals.push(priceInterval);

    // Ön yükleme: Son 250 mumu çek
    const coinsToSeed = [...new Set([...trainedCoins, 'BTCUSDT'])];
    
    // Geçmiş verileri güncelle (Veritabanındaki eksik mumları tamamlar) - Hibrit bot için gerekmiyor, başlangıcı engelliyor.
    /*
    console.log("🔄 Veritabanındaki geçmiş veriler kontrol ediliyor ve eksikler indiriliyor...");
    try {
        const { execSync } = require('child_process');
        const symbolsStr = coinsToSeed.join(',');
        execSync(`python bot/update_database.py --symbols ${symbolsStr}`, { stdio: 'inherit' });
        console.log("✅ Geçmiş veriler başarıyla güncellendi.");
    } catch (e) {
        console.error("❌ Geçmiş veriler güncellenirken hata oluştu:", e);
    }
    */

    const seedPromises = coinsToSeed.map(coin => listener.seedKlines(coin));
    await Promise.allSettled(seedPromises);
    console.log("✅ Tüm coinler için 250 mumluk geçmiş veri (EMA200 altyapısı) hafızaya alındı.");

    // İlk başlangıçta son kapanan mum kapanışını baz alarak analizleri hemen çalıştırıp DB'yi besle!
    for (const coin of trainedCoins) {
        listener.runInitialEvaluation(coin).catch(err => {
            console.error(`[Start Hybrid] Başlangıç analizi hatası (${coin}):`, err);
        });
    }

    // Binance WebSocket'e Bağlan
    // Tum coinlerin kline_5m yayinina abone olalim
    const streams = coinsToSeed.map(coin => `${coin.toLowerCase()}@kline_5m`).join('/');
    const wsUrl = `wss://fstream.binance.com/market/stream?streams=${streams}`;

    console.log("🌐 Binance Canlı K-Line WebSocket'ine bağlanılıyor...");
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log("📡 Binance bağlantısı BAŞARILI! Gerçek canlı veri akışı başladı.");
        StateDB.addSystemLog("INFO", "WebSocket", "Binance bağlantısı BAŞARILI! Canlı veri akışı başladı.");
    });

    let msgCount = 0;
    const fallbackInterval = setInterval(async () => {
        // Eger WebSocket calismiyorsa/bloke ediliyorsa REST API ile fiyatlari guncelle
        if (msgCount === 0) {
            try {
                const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/price');
                const prices = await res.json();
                if (Array.isArray(prices)) {
                    const now = Date.now();
                    const currentCandleTime = Math.floor(now / (5 * 60 * 1000)) * (5 * 60 * 1000);
                    
                    for (const p of prices) {
                        if (coinsToSeed.includes(p.symbol)) {
                            const currentPrice = parseFloat(p.price);
                            latestPrices[p.symbol] = currentPrice;
                            
                            // REST fiyatı ile çıkış kontrolünü çalıştır (WebSocket kilitlenmesine karşı koruma)
                            listener.simulationEngine.checkExits(p.symbol, currentPrice, currentPrice, currentPrice, currentCandleTime);
                        }
                    }
                }
            } catch (e) {
                console.error("[WS Fallback] REST API Fiyat guncelleme hatasi:", e);
            }
        }
        msgCount = 0;
    }, 5000);
    activeIntervals.push(fallbackInterval);

    // Gerçek zamanlı mum kapanışını izleyen ve WebSocket çalışmadığında devreye giren REST Fallback
    let lastProcessedCandleTime = Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000);

    const restFallbackInterval = setInterval(async () => {
        const now = Date.now();
        const currentCandleTime = Math.floor(now / (5 * 60 * 1000)) * (5 * 60 * 1000);

        // Eğer 5 dakikalık yeni bir mum dilimine girdiysek ve WebSocket mesaj almıyorsa (msgCount == 0)
        if (currentCandleTime > lastProcessedCandleTime) {
            lastProcessedCandleTime = currentCandleTime;
            
            if (msgCount === 0) {
                // Binance sunucularında mumun tam oturması için 2-3 saniye bekleyip REST API'den verileri çekiyoruz
                setTimeout(async () => {
                    try {
                        const promises = coinsToSeed.map(coin => listener.seedKlines(coin));
                        await Promise.allSettled(promises);
                        console.log(`🔄 [REST Fallback] 5 Dakikalık mum kapandı. Veriler güncellendi ve analiz tetikleniyor.`);
                        StateDB.addSystemLog("WARN", "System", "REST Fallback devrede: 5 dakikalık yeni mum analizi tetikleniyor.");
                        
                        for (const coin of trainedCoins) {
                            listener.runInitialEvaluation(coin).catch(err => {
                                const errMsg = (err as Error).message;
                                console.error(`[REST Fallback] Analiz hatası (${coin}):`, errMsg);
                                StateDB.addSystemLog("ERROR", "System", `REST Fallback analizi başarısız [${coin}]: ${errMsg}`);
                            });
                        }
                    } catch (e) {
                        console.error("[REST Fallback] Mum güncelleme hatası:", e);
                    }
                }, 3000); // 3 saniye tolerans
            } else {
                console.log("✅ [WS] 5 Dakikalık mum WebSocket üzerinden başarıyla işlendi.");
            }
        }
    }, 2000);
    activeIntervals.push(restFallbackInterval);

    // Her 10 saniyede bir 24 saatlik ticker verilerini cekip DB'ye yazalim (Hacim ve Degisim yuzdesi icin)
    const tickerInterval = setInterval(async () => {
        try {
            const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
            const data = await res.json();
            if (Array.isArray(data)) {
                const tickers: Record<string, {lastPrice: number, volume: number, priceChangePercent: number}> = {};
                for (const item of data) {
                    if (trainedCoins.includes(item.symbol)) {
                        tickers[item.symbol] = {
                            lastPrice: parseFloat(item.lastPrice) || 0,
                            volume: parseFloat(item.quoteVolume) || 0, // Quote volume (USDT bazli hacim daha anlasilir)
                            priceChangePercent: parseFloat(item.priceChangePercent) || 0
                        };
                    }
                }
                StateDB.setRealtimeTickers(tickers);
            }
        } catch (e) {}
    }, 10000);
    activeIntervals.push(tickerInterval);

    // Yeni eğitilen modelleri izleyen watcher (Her 10 saniyede bir klasörleri kontrol eder)
    const watcherInterval = setInterval(() => {
        if (fs.existsSync(modelsDir)) {
            const items = fs.readdirSync(modelsDir, { withFileTypes: true });
            const currentCoins = new Set<string>();
            items.forEach(item => {
                if (item.isDirectory()) {
                    currentCoins.add(item.name);
                }
            });
            const hasNew = Array.from(currentCoins).some(c => !trainedCoins.includes(c));
            if (hasNew) {
                console.log("🔄 Yeni eğitilmiş model tespit edildi! WebSocket akışları güncelleniyor...");
                clearInterval(watcherInterval);
                ws.close();
            }
        }
    }, 10000);
    activeIntervals.push(watcherInterval);

    ws.on('message', async (data: WebSocket.Data) => {
        msgCount++;
        try {
            const parsed = JSON.parse(data.toString());
            if (parsed && parsed.data && parsed.data.k) {
                const k = parsed.data.k;
                const symbol = parsed.data.s; // Orjinal sembol, örn: BTCUSDT
                
                const kline = {
                    openTime: k.t,
                    open: parseFloat(k.o),
                    high: parseFloat(k.h),
                    low: parseFloat(k.l),
                    close: parseFloat(k.c),
                    volume: parseFloat(k.v),
                    closeTime: k.T,
                    quoteVolume: parseFloat(k.q),
                    trades: k.n,
                    takerBuyBase: parseFloat(k.V),
                    takerBuyQuote: parseFloat(k.Q)
                };

                const isClosed = k.x; // Mum kapandı mı?

                // Canlı fiyat bilgisini önbelleğe alalım
                latestPrices[symbol] = kline.close;

                // Sinyal üreticiye gönder
                await listener.onWebSocketTick(symbol, kline, isClosed);
            }
        } catch (e) {
            console.error("WebSocket veri isleme hatasi:", e);
        }
    });

    ws.on('close', () => {
        console.log("⚠️ Binance bağlantısı koptu! Tekrar bağlanılıyor...");
        StateDB.addSystemLog("WARN", "WebSocket", "Binance bağlantısı koptu! 5 saniye içinde tekrar bağlanılacak.");
        setTimeout(start, 5000);
    });

    ws.on('error', (err) => {
        const errMsg = (err as Error).message;
        console.error("❌ WebSocket Hatası:", errMsg);
        StateDB.addSystemLog("ERROR", "WebSocket", `Hata oluştu: ${errMsg}`);
    });
}

start();
