import pandas as pd
import numpy as np
import pandas_ta as ta

def calculate_all_indicators(df, df_btc=None, df_funding=None):
    """
    Klines dataframe'i alır ve makine öğrenimi için tamamen normalize edilmiş
    (stationary) feature'lar üretir. Fiyat seviyesine (örn: $20 vs $40) 
    bağımlı olan tüm göstergeler fiyata oranlanır.
    """
    # Veri tiplerini hazırla
    numeric_cols = ['open', 'high', 'low', 'close', 'volume', 'quoteVolume', 'trades', 'takerBuyBase', 'takerBuyQuote']
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    
    if 'openTime' in df.columns:
        df['datetime'] = pd.to_datetime(pd.to_numeric(df['openTime'], errors='coerce'), unit='ms')
        df.dropna(subset=['datetime'], inplace=True)
        # DatetimeIndex, pandas_ta vwap vb. metodlar için gereklidir
        df.set_index(pd.DatetimeIndex(df['datetime']), inplace=True)
    
    # 1. TREND GÖSTERGELERİ (Normalize Edilmiş)
    # ---------------------------------------------------------
    # EMAs
    df['EMA9'] = df.ta.ema(length=9)
    df['EMA21'] = df.ta.ema(length=21)
    df['EMA50'] = df.ta.ema(length=50)
    df['EMA100'] = df.ta.ema(length=100)
    df['EMA200'] = df.ta.ema(length=200)
    
    df['EMA9_ratio'] = (df['close'] - df['EMA9']) / df['EMA9']
    df['EMA21_ratio'] = (df['close'] - df['EMA21']) / df['EMA21']
    df['EMA50_ratio'] = (df['close'] - df['EMA50']) / df['EMA50']
    df['EMA100_ratio'] = (df['close'] - df['EMA100']) / df['EMA100']
    df['EMA200_ratio'] = (df['close'] - df['EMA200']) / df['EMA200']
    
    # SMAs
    df['SMA20'] = df.ta.sma(length=20)
    df['SMA50'] = df.ta.sma(length=50)
    
    df['SMA20_ratio'] = (df['close'] - df['SMA20']) / df['SMA20']
    df['SMA50_ratio'] = (df['close'] - df['SMA50']) / df['SMA50']
    
    # MACD (zaten kendi içinde fark hesaplar, normalize edilebilir)
    macd = df.ta.macd(fast=12, slow=26, signal=9)
    if macd is not None:
        df = pd.concat([df, macd], axis=1)
        # Sütun adları genelde MACD_12_26_9, MACDh_12_26_9, MACDs_12_26_9 olur
        macd_cols = macd.columns
        for c in macd_cols:
            df[c + '_ratio'] = df[c] / df['close']
    
    # Supertrend
    st = df.ta.supertrend(length=7, multiplier=3.0)
    if st is not None:
        df = pd.concat([df, st], axis=1)
        st_col = [c for c in st.columns if c.startswith('SUPERT_')][0]
        df['Supertrend_ratio'] = (df['close'] - df[st_col]) / df['close']
        
    # Ichimoku
    try:
        ichimoku, _ = ta.ichimoku(df['high'], df['low'], df['close'])
        if ichimoku is not None:
            df = pd.concat([df, ichimoku], axis=1)
            # Ichimoku değerlerini fiyata oranla
            for c in ichimoku.columns:
                if c != 'span_a' and c != 'span_b': # Sadece line'lar
                    df[c + '_ratio'] = (df['close'] - df[c]) / df['close']
    except Exception as e:
        print(f"Warning: Ichimoku failed to calculate: {e}")

    # 2. MOMENTUM & OSİLATÖRLER (Sabit aralıklı, 0-100 vb.)
    # ---------------------------------------------------------
    df['RSI7'] = df.ta.rsi(length=7)
    df['RSI14'] = df.ta.rsi(length=14)
    df['RSI21'] = df.ta.rsi(length=21)
    
    # RSI Bullish Divergence 10 (Long-only bot needs bullish divergence to identify buy entry points)
    df['Price_New_Low_10'] = (df['close'] < df['close'].shift(1).rolling(10).min()).astype(int)
    df['RSI_Higher_10'] = (df['RSI14'] > df['RSI14'].shift(1).rolling(10).min()).astype(int)
    df['RSI_Divergence_10'] = df['Price_New_Low_10'] * df['RSI_Higher_10']
    
    stoch = df.ta.stoch()
    if stoch is not None:
        df = pd.concat([df, stoch], axis=1)
        
    df['CCI'] = df.ta.cci(length=20)
    df['WILLR'] = df.ta.willr(length=14)
    
    adx = df.ta.adx(length=14)
    if adx is not None:
        df = pd.concat([df, adx], axis=1)

    # Price Momentum
    df['ROC_5'] = df['close'].pct_change(5)
    df['ROC_15'] = df['close'].pct_change(15)
    
    # Price Position 50
    high_50 = df['high'].rolling(50).max()
    low_50 = df['low'].rolling(50).min()
    df['Price_Position_50'] = (df['close'] - low_50) / (high_50 - low_50).replace(0, np.nan)

    # 3. VOLATİLİTE (Normalize)
    # ---------------------------------------------------------
    bbands = df.ta.bbands(length=20, std=2)
    if bbands is not None:
        df = pd.concat([df, bbands], axis=1)
        # BBP ve BBB zaten normalize sayılır
        
    kc = df.ta.kc(length=20, scalar=1.5)
    if kc is not None:
        df = pd.concat([df, kc], axis=1)
        kcl = [c for c in kc.columns if c.startswith('KCLe')][0]
        kcu = [c for c in kc.columns if c.startswith('KCUe')][0]
        df['KC_position'] = (df['close'] - df[kcl]) / (df[kcu] - df[kcl]).replace(0, np.nan)
        
    if bbands is not None and kc is not None:
        bbl = [c for c in bbands.columns if c.startswith('BBL')][0]
        bbu = [c for c in bbands.columns if c.startswith('BBU')][0]
        bb_spread = df[bbu] - df[bbl]
        kc_spread = df[kcu] - df[kcl]
        df['Spread_KC_BB'] = bb_spread / kc_spread.replace(0, np.nan)
        
    df['ATR'] = df.ta.atr(length=14)
    df['ATR_pct'] = df['ATR'] / df['close']
    
    df['STDEV'] = df.ta.stdev(length=20)
    df['STDEV_pct'] = df['STDEV'] / df['close']

    # 4. HACİM VE CVD (Durağanlaştırılmış)
    # ---------------------------------------------------------
    df['MFI'] = df.ta.mfi(length=14)
    df['CMF'] = df.ta.cmf(length=20)
    df['Vol_Ratio'] = df['volume'] / df['volume'].rolling(20).mean().replace(0, np.nan)
    df['Volume_Slope_5'] = df['volume'].pct_change(5)
    
    df['OBV'] = df.ta.obv()
    # Normalize OBV slope by average volume to make it stationary and comparable across coins
    df['OBV_slope_5'] = df['OBV'].diff(5) / df['volume'].rolling(20).mean().replace(0, np.nan)
    
    vwap = df.ta.vwap()
    if vwap is not None:
        if isinstance(vwap, pd.Series):
            df['VWAP'] = vwap
        else:
            df = pd.concat([df, vwap], axis=1)
            # Find the main VWAP column
            vwap_cols = [c for c in df.columns if 'VWAP' in c]
            if vwap_cols:
                df['VWAP'] = df[vwap_cols[0]]
                
    if 'VWAP' in df.columns:
        df['VWAP_ratio'] = (df['close'] - df['VWAP']) / df['VWAP']
        
    if 'takerBuyBase' in df.columns:
        df['Delta'] = (2 * df['takerBuyBase']) - df['volume']
        df['CVD'] = df['Delta'].cumsum()
        df['CVD_Slope_5'] = df['CVD'].diff(5)
        
    # 5. MARKET CONTEXT (BTC ve Funding)
    # ---------------------------------------------------------
    if 'btc_close' not in df.columns:
        if df_btc is not None and not df_btc.empty:
            df_btc_sub = df_btc[['openTime', 'close']].rename(columns={'close': 'btc_close'})
            df = pd.merge(df, df_btc_sub, on='openTime', how='left')
        else:
            # Fallback for BTC itself or missing BTC data
            df['btc_close'] = df['close']
            
    df['btc_close'] = df['btc_close'].ffill()
    df['BTC_Corr_50'] = df['close'].rolling(50).corr(df['btc_close'])
    df['BTC_Ret_5'] = df['btc_close'].pct_change(5)
        
    if df_funding is not None and not df_funding.empty:
        if 'rate' not in df.columns:
            df_f_sub = df_funding[['calcTime', 'rate']].rename(columns={'calcTime': 'openTime'})
            df = pd.merge(df, df_f_sub, on='openTime', how='left')
            
        df['rate'] = pd.to_numeric(df['rate'], errors='coerce').ffill().fillna(0)

    # 6. ZAMAN (Time Features)
    # ---------------------------------------------------------
    if 'datetime' in df.columns:
        df['Hour'] = df['datetime'].dt.hour
        df['DayOfWeek'] = df['datetime'].dt.dayofweek
        df['IsWeekend'] = df['DayOfWeek'].apply(lambda x: 1 if x >= 5 else 0)

    # ---------------------------------------------------------
    # Ham ve non-stationary sütunları temizleyelim mi?
    # ML modeline gitmeyecek sütunları daha sonra model scriptinde drop edebiliriz.
    
    return df
