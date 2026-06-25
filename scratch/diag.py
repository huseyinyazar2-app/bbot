import pandas as pd
import sqlite3
import numpy as np
import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'scripts', 'hybrid'))
from indicators import calculate_all_indicators

conn = sqlite3.connect('hybrid_data.db')
df = pd.read_sql("SELECT * FROM futures_klines WHERE symbol='AVAXUSDT' ORDER BY openTime ASC", conn)
df_btc = pd.read_sql("SELECT openTime, close FROM futures_klines WHERE symbol='BTCUSDT' ORDER BY openTime ASC", conn)
df_f = pd.read_sql("SELECT * FROM funding_rates WHERE symbol='AVAXUSDT' ORDER BY calcTime ASC", conn)

df = df.drop_duplicates(subset=['openTime'])
df_btc = df_btc.drop_duplicates(subset=['openTime'])

df_features = calculate_all_indicators(df, df_btc, df_f)
print('Total rows:', len(df_features))
for col in df_features.columns:
    nan_cnt = df_features[col].isna().sum()
    if nan_cnt > 0:
        print(f'{col}: {nan_cnt} NaNs')
