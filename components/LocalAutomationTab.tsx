'use client';

import React, { useState, useEffect } from 'react';
import { Database, Download, Play, Square, Settings, RefreshCcw } from 'lucide-react';

export default function LocalAutomationTab() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string>('');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/local-automation/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    // GEÇİCİ OLARAK KAPATILDI (Sistemi ve terminali meşgul etmemesi için)
    // const interval = setInterval(fetchStatus, 3000);
    // return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    await fetch('/api/local-automation/start', { method: 'POST' });
    setLoading(false);
    fetchStatus();
  };

  const handleStop = async () => {
    setLoading(true);
    await fetch('/api/local-automation/stop', { method: 'POST' });
    setLoading(false);
    fetchStatus();
  };

  const handleClear = async () => {
    setLoading(true);
    await fetch('/api/local-automation/clear', { method: 'POST' });
    setLoading(false);
    fetchStatus();
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadStatus('İndirme scripti başlatılıyor...');
    try {
      const res = await fetch('/api/local-automation/download', { method: 'POST' });
      if (res.ok) {
        setDownloadStatus('İndirme arka planda çalışıyor. Terminal konsolunu kontrol edin.');
      } else {
        setDownloadStatus('İndirme başlatılamadı.');
      }
    } catch (e) {
      setDownloadStatus('Hata oluştu.');
    }
    setDownloading(false);
  };

  return (
    <div className="space-y-6">
      {/* Local Backend Config Card */}
      <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              Lokal Offline Backtest Engine
            </h2>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-mono">
              API limiti olmadan saniyeler içinde binlerce işlem simüle et
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 font-medium py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              <Download className="w-4 h-4" />
              Veri İndir (Python)
            </button>
            {!status?.isRunning && (
              <button
                onClick={handleClear}
                disabled={loading}
                className="bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 font-medium py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 text-sm"
              >
                İşlemleri Sıfırla
              </button>
            )}
            {status?.isRunning ? (
              <button
                onClick={handleStop}
                disabled={loading || status?.shouldStop}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 text-sm"
              >
                <Square className="w-4 h-4" />
                Durdur
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={loading}
                className="bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-medium py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 shadow-lg flex items-center gap-2 text-sm"
              >
                <Play className="w-4 h-4" />
                Lokal Simülasyonu Başlat
              </button>
            )}
          </div>
        </div>

        {downloadStatus && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-lg text-xs font-mono">
            {downloadStatus}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Motor Durumu</span>
            <div className="mt-3 flex items-center gap-3">
              <div className={`w-3.5 h-3.5 rounded-full ${status?.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'} shrink-0`} />
              <span className="text-sm font-semibold text-slate-200">
                {status?.isRunning ? 'Veritabanı Taranıyor' : 'Hazırda Bekliyor'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 font-mono leading-relaxed">
              Lokal SQLite üzerinden okuma yapılıyor. Hız: 100x
            </p>
          </div>

          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Taranan Veri</span>
            <div className="mt-3">
              <span className="text-3xl font-mono font-bold text-white">
                {status?.scannedRows || 0}
              </span>
              <span className="text-xs text-slate-500 ml-1.5">Mum (Kline)</span>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Üretilen İşlem</span>
            <div className="mt-3">
              <span className="text-3xl font-mono font-bold text-emerald-400">
                {status?.generatedTrades || 0}
              </span>
              <span className="text-xs text-slate-500 ml-1.5">Sinyal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
