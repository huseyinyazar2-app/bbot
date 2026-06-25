'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, BrainCircuit, Activity, ShieldCheck, Server, AlertCircle, Trash2, ChevronDown, ChevronUp, Terminal, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SystemStatus {
  success: boolean;
  trainedCoins: string[];
  inferenceOnline: boolean;
  totalTrained: number;
  tickers?: Record<string, {lastPrice: number, volume: number, priceChangePercent: number}>;
  capital?: number;
}

interface LogMessage {
  id: string;
  symbol: string;
  strategy?: string;
  entryPrice: number;
  quantity: number;
  side: string;
  status: 'OPEN' | 'CLOSED';
  tp_price: number;
  sl_price: number;
  entry_candle_time: number;
  setup_score?: number;
  exitPrice?: number;
  pnl?: number;
  exit_reason?: string;
  closed_at?: number;
}

export default function HybridBotsPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [liveProbs, setLiveProbs] = useState<Record<string, { prob: number, details: any, current_price?: number }>>({});
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [viewMode, setViewMode] = useState<'live' | 'history'>('live');
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("--:--");
  const [nowSec, setNowSec] = useState<number>(Math.floor(Date.now() / 1000));
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [triggeringServer, setTriggeringServer] = useState<boolean>(false);
  const [sortField, setSortField] = useState<'symbol' | 'price' | 'change24h' | 'volume24h' | 'prob' | 'direction'>('direction');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [resetting, setResetting] = useState(false);
  const [showSystemLogs, setShowSystemLogs] = useState(false);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const showSettingsModalRef = useRef(showSettingsModal);
  useEffect(() => {
    showSettingsModalRef.current = showSettingsModal;
  }, [showSettingsModal]);
  const [settings, setSettings] = useState({
    capital: 10000,
    maxConcurrent: 5,
    buyFeeRate: 0.0010,
    sellFeeRate: 0.0015,
    maxRiskPerTradePct: 0.02,
    maxPositionSizePct: 0.10
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error("Ağ hatası");
      const data = await res.json();
      if (data.success) {
        alert("Ayarlar başarıyla kaydedildi!");
        setShowSettingsModal(false);
        window.location.reload();
      } else {
        alert("Ayarlar kaydedilemedi: " + (data.error || "Bilinmeyen hata"));
      }
    } catch (e) {
      alert("Ayarlar kaydedilirken bir hata oluştu.");
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleLogExpand = (logId: string) => {
    setExpandedLogs(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  const handleResetDatabase = async () => {
    const confirmReset = window.confirm(
      "DİKKAT!\nTüm simülasyon geçmişini (açık ve kapalı pozisyonları) silmek, kasayı $10,000.00 değerine çekmek ve sistemi sıfırlamak istediğinize emin misiniz?\n\nBu işlem geri alınamaz."
    );
    if (!confirmReset) return;

    setResetting(true);
    try {
      const res = await fetch('/api/hybrid/reset', { method: 'POST' });
      if (!res.ok) throw new Error("Ağ hatası");
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        window.location.reload();
      } else {
        alert("Sıfırlama başarısız: " + (data.error || "Bilinmeyen hata"));
      }
    } catch (e) {
      alert("Sıfırlama sırasında bir iletişim hatası oluştu.");
    } finally {
      setResetting(false);
    }
  };

  const handleSort = (field: 'symbol' | 'price' | 'change24h' | 'volume24h' | 'prob' | 'direction') => {
    if (field === 'change24h' || field === 'volume24h') {
      if (sortField === 'change24h') {
        if (sortOrder === 'desc') {
          setSortOrder('asc');
        } else {
          setSortField('volume24h');
          setSortOrder('desc');
        }
      } else if (sortField === 'volume24h') {
        if (sortOrder === 'desc') {
          setSortOrder('asc');
        } else {
          setSortField('change24h');
          setSortOrder('desc');
        }
      } else {
        setSortField('change24h');
        setSortOrder('desc');
      }
    } else {
      if (sortField === field) {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setSortField(field);
        setSortOrder('desc');
      }
    }
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const triggerPythonServer = async () => {
    if (status?.inferenceOnline) {
      alert("Python Yapay Zeka sunucusu zaten aktif!");
      return;
    }
    setTriggeringServer(true);
    try {
      const res = await fetch('/api/hybrid/status', { method: 'POST' });
      if (!res.ok) throw new Error("Ağ hatası");
      const data = await res.json();
      if (data.success) {
        alert("Python motoru arka planda başlatıldı. Birkaç saniye içinde aktif olacaktır.");
      } else {
        alert("Başlatma başarısız oldu: " + (data.error || "Bilinmeyen hata"));
      }
    } catch (e) {
      alert("Sunucuyla iletişim kurulurken bir hata oluştu.");
    } finally {
      setTriggeringServer(false);
    }
  };

  // Countdown timer for 5-minute candles synced with Binance server time
  useEffect(() => {
    let timeOffset = 0;
    
    const syncTime = async () => {
      try {
        const res = await fetch('https://fapi.binance.com/fapi/v1/time');
        const data = await res.json();
        if (data && data.serverTime) {
          timeOffset = data.serverTime - Date.now();
        }
      } catch(e) {}
    };
    syncTime(); // Ilk yuklemede senkronize et
    const syncInterval = setInterval(syncTime, 60 * 60 * 1000); // Her saat basi guncelle

    const interval = setInterval(() => {
      const now = Date.now() + timeOffset; // Binance zamanina esitlenmis su anki zaman
      const fiveMin = 5 * 60 * 1000;
      let nextCandle = Math.ceil(now / fiveMin) * fiveMin;
      let diff = nextCandle - now;
      
      // Tam saniye donumunde 0 kalmasin, yeni muma gecsin
      if (diff === 0) diff = fiveMin;
      
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      setNowSec(Math.floor(now / 1000));
    }, 1000);
    
    return () => {
      clearInterval(interval);
      clearInterval(syncInterval);
    };
  }, []);

  // Fetch status periodically
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/hybrid/status');
        if (!res.ok) {
          throw new Error(`HTTP Hata: ${res.statusText}`);
        }
        const data = await res.json();
        if (data.success) {
          setStatus(data);
          setError(null);
          
          if (data.liveProbs) {
            setLiveProbs(data.liveProbs);
          }
          if (data.recentLogs) {
            setLogs(data.recentLogs);
          }
          if (data.systemLogs) {
            setSystemLogs(data.systemLogs);
          }
          if (data.settings && !showSettingsModalRef.current) {
            setSettings({
              capital: data.settings.capital ?? 10000,
              maxConcurrent: data.settings.maxConcurrent ?? 5,
              buyFeeRate: data.settings.buyFeeRate ?? 0.0010,
              sellFeeRate: data.settings.sellFeeRate ?? 0.0015,
              maxRiskPerTradePct: data.settings.maxRiskPerTradePct ?? 0.02,
              maxPositionSizePct: data.settings.maxPositionSizePct ?? 0.10
            });
          }
        } else {
          setError(data.error || "Bilinmeyen API hatası");
        }
      } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Failed to fetch') || msg.includes('fetch failed')) {
          console.warn("Status fetch warning (server offline):", msg);
        } else {
          console.error("Status fetch error", e);
        }
        setError("Sunucuya bağlanılamıyor. Lütfen API bağlantısını kontrol edin.");
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Check every 5s (Sorun #14)
    return () => clearInterval(interval);
  }, []);

  const hasError = systemLogs.some(log => log.level === 'ERROR');
  const hasWarning = systemLogs.some(log => log.level === 'WARN');

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200 overflow-hidden relative selection:bg-cyan-500/30">
      
      {/* Floating Version Badge at Top-Left */}
      <div className="fixed top-3 left-3 z-[9999] px-2.5 py-1 bg-slate-900/90 border border-cyan-500/30 rounded-lg text-xs font-bold text-cyan-400 backdrop-blur-md shadow-lg pointer-events-none select-none">
        v4.4
      </div>

      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-blue-900/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 py-8 relative z-10 space-y-8">
        
        {/* HEADER */}
        <header className="flex items-center justify-between pb-6 border-b border-white/5">
          <div className="flex items-center space-x-5">

            <div>
              <h1 className="text-3xl font-extrabold flex items-center gap-3 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                <Zap className="text-cyan-400" size={28} />
                Hibrit Radar & Sinyal Motoru
              </h1>
              <p className="text-slate-400 text-sm mt-1 font-medium">XGBoost Uzman Karar Ağaçları Kontrol Paneli v4.3</p>
            </div>
          </div>
          
          {/* Status Badge, Log Panel & Reset Button */}
          <div className="flex items-center gap-3">
            {/* System Logs Button */}
            <button
              onClick={() => setShowSystemLogs(true)}
              className={`p-3 rounded-xl border backdrop-blur-sm relative transition-all active:scale-95 flex items-center justify-center shadow-lg
                ${hasError 
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20' 
                  : hasWarning 
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' 
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
            >
              <Terminal size={20} className={hasError || hasWarning ? 'animate-pulse' : ''} />
              {/* Flashing badge dot */}
              {(hasError || hasWarning) && (
                <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-slate-950
                  ${hasError ? 'bg-rose-500 animate-ping' : 'bg-amber-500 animate-ping'}`} />
              )}
              {(hasError || hasWarning) && (
                <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-slate-950
                  ${hasError ? 'bg-rose-500' : 'bg-amber-500'}`} />
              )}
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-3 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 backdrop-blur-sm relative transition-all active:scale-95 flex items-center justify-center shadow-lg"
              title="Sistem Ayarları"
            >
              <SettingsIcon size={20} />
            </button>

            <div className="flex flex-col items-end gap-2">
              <div className={`px-4 py-2 rounded-full border backdrop-blur-sm flex items-center gap-2 text-sm font-semibold shadow-xl
                ${status?.inferenceOnline ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${status?.inferenceOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                {status?.inferenceOnline ? 'Yapay Zeka Sunucusu Aktif' : 'Sunucu Kapalı (Bekleniyor)'}
              </div>
              <button
                onClick={handleResetDatabase}
                disabled={resetting}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/40 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={12} />
                {resetting ? 'Temizleniyor...' : 'Geçmişi Temizle (Reset)'}
              </button>
            </div>
          </div>
        </header>

        {/* Sorun #16: Hata Durumu Gösterim Banner'ı */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3 text-rose-400 text-sm font-semibold shadow-xl">
            <AlertCircle size={20} className="shrink-0" />
            <div>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="bg-white/[0.03] border border-white/5 backdrop-blur-xl p-5 rounded-2xl shadow-xl">
            <div className="flex items-center gap-3 text-slate-400 mb-2">
              <BrainCircuit size={18} className="text-indigo-400" />
              <span className="text-sm font-semibold uppercase tracking-wider">Eğitilen Modeller</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {status ? status.totalTrained : '--'} <span className="text-slate-500 text-xl font-normal">/ {status?.tickers ? Object.keys(status.tickers).length : 50}</span>
            </div>
          </div>
          
          <div className="bg-white/[0.03] border border-white/5 backdrop-blur-xl p-5 rounded-2xl shadow-xl">
            <div className="flex items-center gap-3 text-slate-400 mb-2">
              <Activity size={18} className="text-cyan-400" />
              <span className="text-sm font-semibold uppercase tracking-wider">Radar Taraması</span>
            </div>
            <div className="text-3xl font-bold text-white flex items-center gap-2">
              {countdown} <span className="text-slate-500 text-sm font-normal">Kapanış</span>
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/5 backdrop-blur-xl p-5 rounded-2xl shadow-xl flex flex-col justify-between">
            <div className="flex items-center gap-3 text-slate-400 mb-2">
              <div className="text-yellow-500 font-bold text-sm">$</div>
              <span className="text-sm font-semibold uppercase tracking-wider">Toplam Para Durumu</span>
            </div>
            <div className="text-3xl font-bold text-yellow-400 font-mono">
              ${status?.capital ? Number(status.capital).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '1,000.00'}
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/5 backdrop-blur-xl p-5 rounded-2xl shadow-xl">
            <div className="flex items-center gap-3 text-slate-400 mb-2">
              <ShieldCheck size={18} className="text-emerald-400" />
              <span className="text-sm font-semibold uppercase tracking-wider">Risk Yönetimi</span>
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              AKTİF
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/5 backdrop-blur-xl p-5 rounded-2xl shadow-xl flex flex-col justify-center">
            <button 
              onClick={triggerPythonServer}
              disabled={triggeringServer || status?.inferenceOnline}
              className={`w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-900/20 transition-all transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Server size={18} />
              {triggeringServer ? 'Başlatılıyor...' : status?.inferenceOnline ? 'Python Motoru Aktif' : 'Python Motorunu Tetikle'}
            </button>
          </div>
        </div>

        {/* MAIN SPLIT */}
        <div className="grid lg:grid-cols-3 gap-8 min-h-[600px] mb-20">
          
          {/* RADAR GRID */}
          <div className="lg:col-span-2 bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-3xl p-6 shadow-2xl flex flex-col">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-2 h-6 bg-cyan-500 rounded-full" />
              Canlı Fırsat Radarı (Live Radar)
            </h2>
            
            <div className="flex-1 overflow-y-auto overflow-x-auto pr-2 custom-scrollbar">
              
              <div className="w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 text-xs select-none">
                      <th onClick={() => handleSort('symbol')} className="px-2 py-3 font-medium cursor-pointer hover:text-white transition-colors">
                        Sembol {sortField === 'symbol' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th onClick={() => handleSort('price')} className="px-2 py-3 font-medium cursor-pointer hover:text-white transition-colors">
                        Fiyat {sortField === 'price' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th className="px-2 py-3 font-medium hidden md:table-cell">Son Kapanışlar (t-1/t-2)</th>
                      <th className="px-2 py-3 font-medium hidden md:table-cell">5dk Değ.</th>
                      <th onClick={() => handleSort('change24h')} className="px-2 py-3 font-medium cursor-pointer hover:text-white transition-colors hidden lg:table-cell">
                        24s Değ. {sortField === 'change24h' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th onClick={() => handleSort('volume24h')} className="px-2 py-3 font-medium cursor-pointer hover:text-white transition-colors hidden lg:table-cell">
                        Hacim {sortField === 'volume24h' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th onClick={() => handleSort('direction')} className="px-2 py-3 font-medium cursor-pointer hover:text-white transition-colors">
                        Yön {sortField === 'direction' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th onClick={() => handleSort('prob')} className="px-2 py-3 font-medium cursor-pointer hover:text-white transition-colors w-[80px]">
                        İhtimal {sortField === 'prob' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th className="px-2 py-3 font-medium hidden md:table-cell text-right">Detay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isMounted && (
                      <AnimatePresence>
                        {(() => {
                           const sortedCoins = [...(status?.trainedCoins || [])].sort((a, b) => {
                             let valA: any = 0;
                             let valB: any = 0;

                             if (sortField === 'symbol') {
                               const compare = a.localeCompare(b);
                               return sortOrder === 'asc' ? compare : -compare;
                             } else if (sortField === 'price') {
                               valA = status?.tickers?.[a]?.lastPrice ?? liveProbs[a]?.details?.currentPrice ?? 0;
                               valB = status?.tickers?.[b]?.lastPrice ?? liveProbs[b]?.details?.currentPrice ?? 0;
                             } else if (sortField === 'change24h') {
                               valA = status?.tickers?.[a]?.priceChangePercent ?? 0;
                               valB = status?.tickers?.[b]?.priceChangePercent ?? 0;
                             } else if (sortField === 'volume24h') {
                               valA = status?.tickers?.[a]?.volume ?? 0;
                               valB = status?.tickers?.[b]?.volume ?? 0;
                             } else if (sortField === 'direction') {
                               const detailsA = liveProbs[a]?.details;
                               const detailsB = liveProbs[b]?.details;
                               const isAlertA = detailsA?.activeSignals?.some((s: any) => s.decision === "AL") 
                                 ? 1 
                                 : ((liveProbs[a]?.prob || 0) >= 75 ? 1 : 0);
                               const isAlertB = detailsB?.activeSignals?.some((s: any) => s.decision === "AL") 
                                 ? 1 
                                 : ((liveProbs[b]?.prob || 0) >= 75 ? 1 : 0);
                               
                               valA = isAlertA;
                               valB = isAlertB;
                               
                               // Secondary sort by probability if direction state is equal
                               if (valA === valB) {
                                 valA = liveProbs[a]?.prob || 0;
                                 valB = liveProbs[b]?.prob || 0;
                                 return sortOrder === 'asc' ? valA - valB : valB - valA;
                               }
                             } else {
                               valA = liveProbs[a]?.prob || 0;
                               valB = liveProbs[b]?.prob || 0;
                             }

                             if (valA === valB) return 0;
                             return sortOrder === 'asc' ? valA - valB : valB - valA;
                           });

                           if (sortedCoins.length === 0) return null;

                           return sortedCoins.map(coin => {
                             const probObj = liveProbs[coin];
                             const prob = probObj?.prob || 0;
                             const details = probObj?.details || null;
                             
                             let isAlert = false;
                             if (details && details.activeSignals && details.activeSignals.length > 0) {
                                 // Is there any AL decision?
                                 isAlert = details.activeSignals.some((s: any) => s.decision === "AL");
                             } else {
                                 isAlert = prob >= 75; // Fallback
                             }
                             
                             // Use live websocket ticker price if available, fallback to the closed candle price
                             const livePrice = (status?.tickers && status.tickers[coin]?.lastPrice) 
                                                 ? status.tickers[coin].lastPrice 
                                                 : (details?.currentPrice || 0);

                             let atrText = "";
                             let tpText = "";
                             if (details && details.activeSignals && details.activeSignals.length > 0) {
                               const signalObj = details.activeSignals[0];
                               if (signalObj.atr !== undefined) atrText = `ATR: ${signalObj.atr.toFixed(4)}`;
                               if (signalObj.tpPct !== undefined) tpText = `TP: %${signalObj.tpPct.toFixed(1)}`;
                             }
                             
                             return (
                               <motion.tr 
                                 key={coin}
                                 layout
                                 initial={{ opacity: 0, y: 10 }}
                                 animate={{ opacity: 1, y: 0 }}
                                 className={`border-b border-slate-800/50 hover:bg-white/5 transition-colors group text-xs md:text-sm
                                   ${isAlert ? 'bg-emerald-500/10' : ''}`}
                               >
                                 <td className="px-2 py-3">
                                   <div className="font-bold text-slate-200 flex items-center gap-1.5 whitespace-nowrap">
                                     {coin.replace('USDT', '')}
                                     {isAlert && <Zap size={13} className="text-emerald-400" fill="currentColor" />}
                                   </div>
                                   {(atrText || tpText) && (
                                     <div className="text-[9px] text-slate-400 font-mono mt-0.5 flex flex-col gap-0.5 leading-tight w-max">
                                       {atrText && <div>{atrText}</div>}
                                       {tpText && <div>{tpText}</div>}
                                     </div>
                                   )}
                                 </td>

                               <td className="px-2 py-3">
                                 <div className="font-bold font-mono text-cyan-400">
                                   ${livePrice ? Number(livePrice).toFixed(4) : '---'}
                                 </div>
                               </td>

                               <td className="px-2 py-3 hidden md:table-cell text-xs font-mono">
                                 <div className="flex flex-col gap-0.5 text-slate-400">
                                   <div>t-1: <span className="text-slate-200 font-semibold">${details?.prevClose ? Number(details.prevClose).toFixed(4) : '---'}</span></div>
                                   <div>t-2: <span className="text-slate-500">${details?.prevClose2 ? Number(details.prevClose2).toFixed(4) : '---'}</span></div>
                                 </div>
                               </td>

                               <td className="px-2 py-3 hidden md:table-cell">
                                 <div className="flex flex-col">
                                   {details && details.prevClose && details.prevClose2 ? (
                                     (() => {
                                       const change = ((details.prevClose - details.prevClose2) / details.prevClose2) * 100;
                                       return (
                                         <span className={`font-semibold ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                           {change > 0 ? '+' : ''}{change.toFixed(2)}%
                                         </span>
                                       );
                                     })()
                                   ) : (
                                     <span className="text-slate-500 text-xs">---</span>
                                   )}
                                 </div>
                               </td>

                               <td className="px-2 py-3 hidden lg:table-cell">
                                 <div className="flex flex-col">
                                   {status?.tickers && status.tickers[coin] ? (
                                     <span className={`font-medium ${status.tickers[coin].priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                       {status.tickers[coin].priceChangePercent > 0 ? '+' : ''}{status.tickers[coin].priceChangePercent.toFixed(2)}%
                                     </span>
                                   ) : (
                                     <span className="text-slate-500 text-xs">Yükleniyor...</span>
                                   )}
                                 </div>
                               </td>

                               <td className="px-2 py-3 hidden lg:table-cell">
                                 <div className="flex flex-col">
                                   {status?.tickers && status.tickers[coin] ? (
                                     <span className="text-xs text-slate-300 font-mono">
                                       ${(status.tickers[coin].volume / 1000000).toFixed(1)}M
                                     </span>
                                   ) : (
                                     <span className="text-slate-500 text-xs">Yükleniyor...</span>
                                   )}
                                 </div>
                               </td>
                               
                               <td className="px-2 py-3">
                                 {isAlert ? (
                                   <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                                     AL
                                   </span>
                                 ) : (
                                   <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-xs font-medium border border-slate-700">
                                     BEKLE
                                   </span>
                                 )}
                               </td>

                               <td className="px-2 py-3">
                                 <div className="flex flex-col gap-1 w-full max-w-[80px]">
                                   <div className="flex justify-between text-xs font-medium">
                                     <span className={isAlert ? 'text-emerald-400' : 'text-slate-400'}>
                                       %{prob.toFixed(1)}
                                     </span>
                                   </div>
                                   <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                     <motion.div 
                                       className={`h-full rounded-full ${isAlert ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-cyan-500'}`}
                                       initial={{ width: 0 }}
                                       animate={{ width: `${prob}%` }}
                                       transition={{ type: "spring", bounce: 0, duration: 1 }}
                                     />
                                   </div>
                                 </div>
                               </td>

                               <td className="px-2 py-3 hidden md:table-cell text-xs">
                                 {details && details.activeSignals ? (
                                     <button 
                                         onClick={() => setSelectedCoin(coin)}
                                         className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/20 transition-colors flex items-center gap-1 font-medium"
                                     >
                                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                         Detay
                                     </button>
                                 ) : (
                                     <span className="text-slate-500 font-mono">Bekleniyor...</span>
                                 )}
                               </td>
                             </motion.tr>
                           );
                         });
                       })()}
                        </AnimatePresence>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* LOGS PANEL */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-6 shadow-2xl flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="w-2 h-6 bg-purple-500 rounded-full" />
                Yapay Zeka Karar Defteri
                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-lg border border-purple-500/30">
                  {logs.filter(log => log.status === 'OPEN').length} Açık İşlem
                </span>
              </h2>
            </div>

            {/* Tab Buttons */}
            <div className="flex bg-slate-950/80 p-1 rounded-xl border border-white/5 mb-4">
              <button 
                onClick={() => setViewMode('live')}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'live' 
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                Aktif İşlemler
              </button>
              <button 
                onClick={() => setViewMode('history')}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'history' 
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                İşlem Geçmişi
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {isMounted && (
                <AnimatePresence>
                  {(() => {
                    const filteredLogs = logs
                      .filter(log => {
                        if (viewMode === 'live') {
                          return log.status === 'OPEN';
                        } else {
                          return log.status === 'CLOSED';
                        }
                      })
                      .sort((a, b) => {
                        if (viewMode === 'live') {
                          return b.entry_candle_time - a.entry_candle_time;
                        } else {
                          return (b.closed_at || 0) - (a.closed_at || 0);
                        }
                      });

                    if (filteredLogs.length === 0) {
                      return (
                        <div className="text-sm text-slate-500 text-center mt-10">
                          {viewMode === 'live' ? 'Aktif işlem bulunmuyor.' : 'İşlem geçmişi bulunmuyor.'}
                        </div>
                      );
                    }

                    return filteredLogs.map(log => {
                      const rawTier = log.strategy?.replace('Hybrid_XGBoost_', '') || 'Bilinmiyor';
                      const tierMap: Record<string, string> = {
                        "micro_scalp": "Çok Kısa",
                        "scalp": "Kısa",
                        "swing_short": "Orta",
                        "swing_mid": "Uzun",
                        "swing_long": "Çok Uzun"
                      };
                      const displayName = tierMap[rawTier] || rawTier.replace('_', ' ');
                      const probScore = log.setup_score ? `%${log.setup_score}` : '';

                      // Robust variables
                      const isClosed = (log.status || 'OPEN') === 'CLOSED';
                      const quantity = log.quantity || 0;
                      const entryPrice = log.entryPrice || 0;
                      const tpPrice = log.tp_price || 0;
                      const slPrice = log.sl_price || 0;
                      const exitPrice = log.exitPrice || 0;

                      // Live PnL calculation
                      const livePrice = (status?.tickers && status.tickers[log.symbol]?.lastPrice) 
                                          ? status.tickers[log.symbol].lastPrice 
                                          : (liveProbs[log.symbol]?.details?.currentPrice || entryPrice);
                      
                      const currentOrExitPrice = isClosed ? exitPrice : livePrice;
                      const isLong = log.side === 'LONG';
                      const priceDiff = currentOrExitPrice - entryPrice;
                      
                      // Sorun #9: Açık pozisyonlarda Maker giriş + çıkış komisyonunun düşülmesi
                      const initialCost = entryPrice * quantity;
                      const estimatedFee = !isClosed ? (initialCost * 0.0010 + livePrice * quantity * 0.0010) : 0;

                      // If closed, use the saved pnl from DB, else calculate dynamically subtracting estimated commission
                      const rawPnL = isLong ? priceDiff * quantity : -priceDiff * quantity;
                      const pnlAmount = isClosed ? (log.pnl || 0) : (rawPnL - estimatedFee);
                      
                      const pnlPercent = (quantity > 0 && entryPrice > 0)
                        ? (pnlAmount / initialCost) * 100
                        : 0;
                        
                      const isProfit = pnlAmount >= 0;
                      const pnlColor = isProfit ? 'text-emerald-400' : 'text-red-500';
                      const pnlSign = pnlAmount > 0 ? '+' : '';

                      const slDiff = isLong ? (slPrice - entryPrice) : (entryPrice - slPrice);
                      const slPercent = entryPrice > 0 ? (slDiff / entryPrice) * 100 : 0;

                      const tpDiff = isLong ? (tpPrice - entryPrice) : (entryPrice - tpPrice);
                      const tpPercent = entryPrice > 0 ? (tpDiff / entryPrice) * 100 : 0;

                      const maxBarsMap: Record<string, number> = {
                        "micro_scalp": 9,
                        "scalp": 24,
                        "swing_short": 48,
                        "swing_mid": 96,
                        "swing_long": 288
                      };
                      const maxBars = maxBarsMap[rawTier] || 9;
                      const expirationTime = log.entry_candle_time + (maxBars * 5 * 60);
                      const remainingSecs = Math.max(0, expirationTime - nowSec);
                      const remH = Math.floor(remainingSecs / 3600);
                      const remM = Math.floor((remainingSecs % 3600) / 60);
                      const remS = remainingSecs % 60;
                      const timeLeftStr = remH > 0 
                        ? `${remH.toString().padStart(2, '0')}:${remM.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`
                        : `${remM.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;

                      // Dynamic styling depending on status and profit
                      let cardStyleClass = "";
                      if (isClosed) {
                        cardStyleClass = isProfit 
                          ? "p-3 rounded-xl border text-sm bg-emerald-950/20 border-emerald-500/20 text-slate-300"
                          : "p-3 rounded-xl border text-sm bg-red-950/10 border-red-500/20 text-slate-300";
                      } else {
                        cardStyleClass = isProfit 
                          ? "p-3 rounded-xl border text-sm bg-emerald-500/10 border-emerald-500/20 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                          : "p-3 rounded-xl border text-sm bg-red-500/10 border-red-500/20 text-red-100 shadow-[0_0_15px_rgba(239,68,68,0.05)]";
                      }

                      const isExpanded = expandedLogs[log.id] || false;

                      return (
                      <motion.div 
                        key={log.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`${cardStyleClass} cursor-pointer hover:border-white/10 transition-all select-none`}
                        onClick={() => toggleLogExpand(log.id)}
                      >
                        {/* Closed Header (Always visible) */}
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${isClosed ? 'text-slate-300' : (isProfit ? 'text-emerald-400' : 'text-red-400')}`}>{log.symbol}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isClosed ? 'bg-white/5 text-slate-400' : (isProfit ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300')}`}>
                              {displayName}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-[10px] text-slate-400 font-mono hidden sm:block">
                              Alış: <span className="text-slate-200 font-bold">${entryPrice.toFixed(4)}</span>
                            </div>
                            
                            <div className={`font-bold font-mono ${pnlColor}`}>
                              {pnlSign}${Math.abs(pnlAmount).toFixed(2)}
                            </div>
                            
                            <div className="text-slate-500">
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </div>
                          </div>
                        </div>

                        {/* Expanded details */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden mt-3 pt-3 border-t border-white/5 space-y-3"
                              onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking details
                            >
                              <div className="flex justify-between items-center text-[10px] opacity-60">
                                <span>Giriş Zamanı: {new Date(log.entry_candle_time * 1000).toLocaleString('tr-TR')}</span>
                                {isClosed ? (
                                  <span className={`font-bold px-1.5 py-0.5 rounded
                                    ${log.exit_reason === 'TP_HIT' ? 'bg-emerald-500/20 text-emerald-400' : 
                                      log.exit_reason === 'SL_HIT' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {log.exit_reason === 'TP_HIT' ? 'TP KAPANDI' : 
                                     log.exit_reason === 'SL_HIT' ? 'SL KAPANDI' : 
                                     log.exit_reason === 'TIMEOUT' ? 'SÜRE DOLDU' : 'KAPANDI'}
                                  </span>
                                ) : (
                                  <span className="text-orange-400 font-mono font-bold animate-pulse">
                                    ⏳ Kalan Süre: {timeLeftStr}
                                  </span>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                                <div className="text-slate-400">Giriş: <span className="text-white">${entryPrice.toFixed(4)}</span></div>
                                <div className="text-emerald-400">TP: <span className="text-white">${tpPrice.toFixed(4)}</span> <span className="text-emerald-500/80 text-[10px]">(+{tpPercent.toFixed(2)}%)</span></div>
                                <div className="text-rose-400">SL: <span className="text-white">${slPrice.toFixed(4)}</span> <span className="text-rose-500/80 text-[10px]">({slPercent.toFixed(2)}%)</span></div>
                                <div className="text-cyan-400">Model İhtimali: <span className="text-white">{log.setup_score ? `%${log.setup_score}` : '---'}</span></div>
                                {isClosed ? (
                                  <div className="text-amber-400">Çıkış: <span className="text-white">${exitPrice.toFixed(4)}</span></div>
                                ) : (
                                  <div className="text-purple-400">Mevcut Fiyat: <span className="text-white">${livePrice ? Number(livePrice).toFixed(4) : '---'}</span></div>
                                )}
                                <div className={`font-bold ${pnlColor}`}>PnL Oranı: <span>{pnlSign}%{pnlPercent.toFixed(2)}</span></div>
                              </div>

                              <div className="pt-2 border-t border-white/5 text-[11px] font-mono flex justify-between">
                                <div className="text-slate-400">Maliyet: <span className="text-slate-200">${(quantity * entryPrice).toFixed(2)} ({quantity.toFixed(4)} Adet)</span></div>
                                <div className="text-slate-400">
                                  {isClosed ? 'İşlem Sonucu:' : 'Mevcut Değer:'} <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-500'}`}>
                                    ${((quantity * entryPrice) + pnlAmount).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  });
                })()}
                </AnimatePresence>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* DETAY MODAL */}
      <AnimatePresence>
        {selectedCoin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedCoin(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-2xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <BrainCircuit className="text-purple-400" />
                    {selectedCoin} Yapay Zeka Analizi
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">XGBoost'un baktığı elit kriterlerin canlı değerleri</p>
                </div>
                <button onClick={() => setSelectedCoin(null)} className="text-slate-500 hover:text-white p-2 text-xl">&times;</button>
              </div>

              {liveProbs[selectedCoin]?.details?.activeSignals ? (
                <div className="space-y-6">
                  {/* TAHMİNLER BÖLÜMÜ */}
                  <div>
                    <h4 className="text-sm font-bold text-emerald-400 mb-3 uppercase tracking-wider border-b border-slate-700/50 pb-2">Çoklu Katman (Multi-Tier) Tahminleri</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {(() => {
                        const tierMap: Record<string, string> = {
                          "micro_scalp": "Çok Kısa",
                          "scalp": "Kısa",
                          "swing_short": "Orta",
                          "swing_mid": "Uzun",
                          "swing_long": "Çok Uzun"
                        };
                        
                        const sortedSignals = [...liveProbs[selectedCoin].details.activeSignals].sort((a: any, b: any) => a.tpPct - b.tpPct);

                        return sortedSignals.map((p: any, idx: number) => {
                          const probPercent = p.probability * 100;
                          const threshPercent = (p.threshold || 0.75) * 100;
                          const isHigh = p.decision === "AL";
                          const displayName = tierMap[p.tier] || p.tier.replace('_', ' ');

                          return (
                            <div key={idx} className={`bg-slate-800/80 p-3 rounded-xl border flex flex-col items-center justify-between text-center min-h-[120px] ${isHigh ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-slate-700/50'}`}>
                              <div>
                                <span className="text-xs text-slate-300 font-bold mb-1 uppercase block">{displayName}</span>
                                <span className="text-[10px] text-slate-500 font-mono">Hedef: %{p.tpPct}</span>
                              </div>
                              
                              <div className="my-2">
                                <div className={`text-lg font-extrabold ${isHigh ? 'text-emerald-400' : 'text-cyan-400'}`}>
                                  %{probPercent.toFixed(1)}
                                </div>
                                <div className="text-[9px] text-slate-500 font-mono">Eşik: %{threshPercent.toFixed(1)}</div>
                                <div className="text-[9px] text-indigo-400 font-mono mt-0.5">
                                  EV: %{((p.probability * p.tpPct) - ((1 - p.probability) * (p.atr || 0) * (p.atrSlMultiplier || 0) * 100)).toFixed(2)}
                                </div>
                              </div>
                              
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold w-full max-w-[80px] block ${isHigh ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                                {isHigh ? 'AL' : 'BEKLE'}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* KARAR ANALİZ AÇIKLAMASI */}
                  {(() => {
                    const details = liveProbs[selectedCoin].details;
                    const activeSignals = details.activeSignals || [];
                    const alSignals = activeSignals.filter((s: any) => s.decision === "AL");
                    const alCount = alSignals.length;
                    
                    const hasActive = logs.some(l => l.symbol === selectedCoin && l.status === 'OPEN');
                    const openCount = logs.filter(l => l.status === 'OPEN').length;
                    const hasStrongSignal = activeSignals.some((s: any) => s.probability >= 0.80);
                    const maxLimit = hasStrongSignal ? 10 : 5;
                    const isLimitOk = openCount < maxLimit;
                    
                    const atrVal = activeSignals[0]?.atr || 0;
                    const isAtrOk = atrVal > 0.003;
                    const hasLongerTermSignal = alSignals.some((s: any) => s.tier !== 'micro_scalp');
                    const isConfluenceOk = hasLongerTermSignal ? true : (alCount >= 2);
                    const btcOk = details.btcTrendOk !== false;
                    
                    const canTrade = !hasActive && isLimitOk && isAtrOk && isConfluenceOk && btcOk;

                    let title = "";
                    let description = "";
                    let alertType: 'success' | 'warning' | 'info' = 'info';

                    const tierMap: Record<string, string> = {
                      "micro_scalp": "Çok Kısa",
                      "scalp": "Kısa",
                      "swing_short": "Orta",
                      "swing_mid": "Uzun",
                      "swing_long": "Çok Uzun"
                    };

                    if (canTrade) {
                      title = "İşlem Kriterleri Sağlandı (AL)";
                      description = "Tüm piyasa ve risk filtreleri olumlu. Sistem bu coin için otomatik alım emri üretti.";
                      alertType = 'success';
                    } else if (hasActive) {
                      title = "Zaten Açık Pozisyon Var";
                      description = `Bu coin (${selectedCoin}) için halihazırda açık bir pozisyon bulunuyor. Risk yönetimi gereği aynı coinde aynı anda sadece 1 pozisyon açılabilir.`;
                      alertType = 'info';
                    } else if (alCount === 0) {
                      title = "Sinyal Bekleniyor";
                      description = "Henüz hiçbir tahmin katmanında model olasılığı belirlenen eşik değerinin üzerine çıkmadı. İşlem açmak için en az 2 katmanın AL vermesi bekleniyor.";
                      alertType = 'info';
                    } else {
                      title = "Fırsat Filtrelere Takıldı";
                      const reasons: string[] = [];
                      if (!isConfluenceOk) {
                        const alTiers = alSignals.map((s: any) => {
                          const name = tierMap[s.tier] || s.tier.replace('_', ' ');
                          return `${name} (%${(s.probability * 100).toFixed(1)})`;
                        }).join(', ');
                        reasons.push(`Çoklu Katman (Confluence) engeline takıldı. Şu an sadece ${alTiers} katmanı AL veriyor, ancak işleme girmek için en az 2 farklı katmanın aynı anda AL vermesi zorunludur.`);
                      }
                      if (!isAtrOk) {
                        reasons.push(`ATR (Volatilite) engeline takıldı. Coin'in ATR değeri ${atrVal.toFixed(4)}, ancak işlem için volatilitenin en az 0.003 olması gerekir (piyasa şu an çok hareketsiz).`);
                      }
                      if (!btcOk) {
                        const btcChange = details.btc10BarChange || 0;
                        reasons.push(`BTC Trend engeline takıldı. BTC son 10 barda %${Math.abs(btcChange).toFixed(2)} düştü. Genel piyasa düşüşteyken altcoinlerde LONG işlem açılması kısıtlanır (Sınır: >= %-2.0).`);
                      }
                      if (!isLimitOk) {
                        reasons.push(`Global Limit engeline takıldı. Şu an sistemde ${openCount} açık pozisyon var. %80 üzeri bir fırsatta maksimum limit 10, normalde ise 5'tir.`);
                      }

                      description = reasons.join(" ");
                      alertType = 'warning';
                    }

                    return (
                      <div className={`p-4 rounded-xl border backdrop-blur-md shadow-lg space-y-2
                        ${alertType === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100' :
                          alertType === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-100' :
                          'bg-slate-800/60 border-slate-700/50 text-slate-300'}`}>
                        <div className="flex items-center gap-2 font-bold text-sm">
                          <span className={`w-2 h-2 rounded-full 
                            ${alertType === 'success' ? 'bg-emerald-400 animate-pulse' :
                              alertType === 'warning' ? 'bg-amber-400' : 'bg-slate-400'}`} />
                          {title}
                        </div>
                        <p className="text-xs leading-relaxed opacity-90">{description}</p>
                      </div>
                    );
                  })()}

                  {/* SİNYAL ONAY DURUMU & FİLTRELER */}
                  <div>
                    <h4 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider border-b border-slate-700/50 pb-2 flex justify-between items-center">
                      <span>Sinyal Filtreleri Durumu</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Son Analiz: {new Date(liveProbs[selectedCoin].details.lastEvaluationTime || Date.now()).toLocaleTimeString('tr-TR')}
                      </span>
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Sol Sütun: Temel Limitler */}
                      <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30 space-y-3 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">1. Coinde Aktif Pozisyon:</span>
                          {(() => {
                            const hasActive = logs.some(l => l.symbol === selectedCoin && l.status === 'OPEN');
                            return hasActive ? (
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold font-mono">❌ Zaten Açık (Max 1)</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold font-mono">🟢 Uygun (Pozisyon Yok)</span>
                            );
                          })()}
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">2. Global Limit:</span>
                          {(() => {
                            const openCount = logs.filter(l => l.status === 'OPEN').length;
                            const hasStrongSignal = liveProbs[selectedCoin].details.activeSignals.some((s: any) => s.probability >= 0.80);
                            const maxLimit = hasStrongSignal ? 10 : 5;
                            const isLimitOk = openCount < maxLimit;
                            return (
                              <span className={`px-2 py-0.5 rounded border font-semibold font-mono ${isLimitOk ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
                                {isLimitOk ? '🟢' : '❌'} {openCount} / {maxLimit} Açık
                              </span>
                            );
                          })()}
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">3. Volatilite (ATR):</span>
                          {(() => {
                            const atrVal = liveProbs[selectedCoin].details.activeSignals[0]?.atr || 0;
                            const isAtrOk = atrVal > 0.003;
                            return (
                              <span className={`px-2 py-0.5 rounded border font-semibold font-mono ${isAtrOk ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-red-400 border-rose-500/30'}`}>
                                {isAtrOk ? '🟢' : '❌'} ATR: {atrVal.toFixed(4)} ({'>'}0.003)
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Sağ Sütun: Confluence ve BTC */}
                      <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30 space-y-3 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">4. Confluence (Tiers):</span>
                          {(() => {
                            const activeSignals = liveProbs[selectedCoin].details.activeSignals || [];
                            const alCount = activeSignals.filter((s: any) => s.decision === "AL").length;
                            const hasLongerTermSignal = activeSignals.some((s: any) => s.decision === "AL" && s.tier !== 'micro_scalp');
                            const isConfluenceOk = hasLongerTermSignal ? true : (alCount >= 2);
                            return (
                              <span className={`px-2 py-0.5 rounded border font-semibold font-mono ${isConfluenceOk ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
                                {isConfluenceOk ? '🟢' : '❌'} {hasLongerTermSignal ? 'Tekil Scalp/Swing' : `${alCount} / 2+ AL Sinyali`}
                              </span>
                            );
                          })()}
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">5. BTC Trend Filtresi:</span>
                          {(() => {
                            const btcOk = liveProbs[selectedCoin].details.btcTrendOk !== false;
                            const btcChange = liveProbs[selectedCoin].details.btc10BarChange || 0;
                            return (
                              <span className={`px-2 py-0.5 rounded border font-semibold font-mono ${btcOk ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
                                {btcOk ? '🟢' : '❌'} BTC 10m: {btcChange >= 0 ? '+' : ''}{btcChange.toFixed(2)}% ({'>'}=-2%)
                              </span>
                            );
                          })()}
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Genel Alım Durumu:</span>
                          {(() => {
                            const hasActive = logs.some(l => l.symbol === selectedCoin && l.status === 'OPEN');
                            const openCount = logs.filter(l => l.status === 'OPEN').length;
                            const hasStrongSignal = liveProbs[selectedCoin].details.activeSignals.some((s: any) => s.probability >= 0.80);
                            const maxLimit = hasStrongSignal ? 10 : 5;
                            const isLimitOk = openCount < maxLimit;
                            const atrVal = liveProbs[selectedCoin].details.activeSignals[0]?.atr || 0;
                            const isAtrOk = atrVal > 0.003;
                            const activeSignals = liveProbs[selectedCoin].details.activeSignals || [];
                            const alCount = activeSignals.filter((s: any) => s.decision === "AL").length;
                            const hasLongerTermSignal = activeSignals.some((s: any) => s.decision === "AL" && s.tier !== 'micro_scalp');
                            const isConfluenceOk = hasLongerTermSignal ? true : (alCount >= 2);
                            const btcOk = liveProbs[selectedCoin].details.btcTrendOk !== false;

                            const canTrade = !hasActive && isLimitOk && isAtrOk && isConfluenceOk && btcOk;
                            return canTrade ? (
                              <span className="px-2.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-extrabold animate-pulse">İŞLEM UYGUN</span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold">İŞLEM DIŞI</span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-slate-500">
                  <AlertCircle size={30} className="mx-auto mb-2 opacity-50" />
                  Henüz veri toplanmadı. Kapanış verisi bekleniyor.
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SYSTEM LOGS MODAL */}
      <AnimatePresence>
        {showSystemLogs && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSystemLogs(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl max-h-[85vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Terminal className="text-cyan-400" />
                    Sistem Çalışma Günlükleri (System Logs)
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">Sinyal motoru ve bağlantıların gerçek zamanlı durum logları</p>
                </div>
                <button onClick={() => setShowSystemLogs(false)} className="text-slate-500 hover:text-white p-2 text-xl">&times;</button>
              </div>

              {/* Log List container */}
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2 max-h-[50vh]">
                {systemLogs.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 font-mono text-sm">
                    Kayıtlı sistem günlüğü bulunmuyor.
                  </div>
                ) : (
                  systemLogs.map((log) => {
                    let logBg = "bg-slate-800/30 border-slate-800";
                    let textClass = "text-slate-300";
                    let labelBg = "bg-slate-700/50 text-slate-400 border-slate-600";
                    
                    if (log.level === 'ERROR') {
                      logBg = "bg-rose-950/20 border-rose-500/20";
                      textClass = "text-rose-200";
                      labelBg = "bg-rose-500/20 text-rose-300 border-rose-500/30";
                    } else if (log.level === 'WARN') {
                      logBg = "bg-amber-950/10 border-amber-500/20";
                      textClass = "text-amber-200";
                      labelBg = "bg-amber-500/20 text-amber-300 border-amber-500/30";
                    } else if (log.level === 'INFO') {
                      logBg = "bg-cyan-950/10 border-cyan-500/10";
                      textClass = "text-cyan-200";
                      labelBg = "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
                    }
                    
                    return (
                      <div key={log.id} className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-3 ${logBg}`}>
                        <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] border shrink-0 ${labelBg}`}>
                          {log.level}
                        </span>
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between items-center text-[10px] opacity-60">
                            <span className="font-bold text-slate-400">[{log.category}]</span>
                            <span>{new Date(log.timestamp).toLocaleString('tr-TR')}</span>
                          </div>
                          <p className={`leading-relaxed break-all ${textClass}`}>{log.message}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer with Actions */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={async () => {
                    const confirmClear = window.confirm("Tüm sistem loglarını temizlemek istediğinize emin misiniz?");
                    if (!confirmClear) return;
                    try {
                      const res = await fetch('/api/hybrid/reset?type=logs', { method: 'POST' });
                      const data = await res.json();
                      if (data.success) {
                        setSystemLogs([]);
                      }
                    } catch (e) {
                      alert("Loglar temizlenirken hata oluştu.");
                    }
                  }}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <Trash2 size={12} />
                  Günlükleri Temizle
                </button>
                <button
                  onClick={() => setShowSystemLogs(false)}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  Kapat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SYSTEM SETTINGS MODAL */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <SettingsIcon className="text-cyan-400" />
                    Sistem Parametre Ayarları
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">Hibrit bot risk yönetimi, bakiye ve komisyon ayarları</p>
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-500 hover:text-white p-2 text-xl">&times;</button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSaveSettings} className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4 max-h-[60vh]">
                
                {/* Capital Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Simülasyon Başlangıç Bakiyesi (USD)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={settings.capital}
                    onChange={e => setSettings({...settings, capital: parseFloat(e.target.value) || 0})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                    required
                  />
                </div>

                {/* Max Concurrent Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Maksimum Eşzamanlı Açık İşlem Limiti</label>
                  <input 
                    type="number" 
                    value={settings.maxConcurrent}
                    onChange={e => setSettings({...settings, maxConcurrent: parseInt(e.target.value) || 1})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                    required
                  />
                </div>

                {/* Risk and Position size inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Riske Edilecek Oran (Risk per Trade)</label>
                    <input 
                      type="number" 
                      step="0.001"
                      value={settings.maxRiskPerTradePct}
                      onChange={e => setSettings({...settings, maxRiskPerTradePct: parseFloat(e.target.value) || 0.02})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                      placeholder="0.02 (%2)"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Maksimum İşlem Büyüklüğü (Max Pos Size)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={settings.maxPositionSizePct}
                      onChange={e => setSettings({...settings, maxPositionSizePct: parseFloat(e.target.value) || 0.10})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                      placeholder="0.10 (%10)"
                      required
                    />
                  </div>
                </div>

                {/* Fee rates inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Maker (Alış) Komisyon Oranı</label>
                    <input 
                      type="number" 
                      step="0.0001"
                      value={settings.buyFeeRate}
                      onChange={e => setSettings({...settings, buyFeeRate: parseFloat(e.target.value) || 0})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                      placeholder="0.0010 (%0.10)"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Taker (Satış) Komisyon Oranı</label>
                    <input 
                      type="number" 
                      step="0.0001"
                      value={settings.sellFeeRate}
                      onChange={e => setSettings({...settings, sellFeeRate: parseFloat(e.target.value) || 0})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                      placeholder="0.0015 (%0.15)"
                      required
                    />
                  </div>
                </div>

                {/* Info Alert */}
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3 text-xs text-cyan-400 leading-relaxed">
                  <strong>💡 Bilgi:</strong> İşlem limitleri ve komisyon oranları kaydedildiği an arka planda çalışan Hibrit Yapay Zeka Motoru tarafından anlık olarak algılanır. Botu yeniden başlatmanıza gerek yoktur.
                </div>

                {/* Modal Actions */}
                <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-bold transition-all active:scale-95"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                  >
                    {savingSettings ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Scrollbar Styles inserted inline for quick setup */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
