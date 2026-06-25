# Yapay Zeka Tarafından Keşfedilen ve Eklenecek Botlar

Bu dosya, yapay zeka madenciliği sonucunda keşfedilen ve kârlılığı kanıtlanmış, ileride sisteme eklenecek bot kurallarını listeler.

## 1. AI_DIP_AVCISI (Makro Swing)
- **Kâr Hedefi (TP):** %8.0
- **Zarar Kes (SL):** %5.0
- **Kazanma Oranı (Win Rate):** %58.6 (1099 İşlem)
- **Teorik PNL (1000$ ile):** 28.820$
- **Kural:** `eth_price_vs_sma200 <= -3.8540 AND price_vs_bb_lower > -0.0491 AND adx_14 <= 66.6132 AND eth_change_1h <= -1.0885`
- **Açıklama:** Ethereum ana ortalamasından düşmüşken, altcoin alt Bollinger bandının üzerinde tutunarak piyasaya direniyor. Tepki yükselişini yakalar.

## 2. AI_KESKIN_NISANCI (Makro Swing)
- **Kâr Hedefi (TP):** %8.0
- **Zarar Kes (SL):** %5.0
- **Kazanma Oranı (Win Rate):** %94.6 (70 İşlem)
- **Teorik PNL (1000$ ile):** 5.130$
- **Kural:** `adx_14 > 36.6717 AND btc_change_1h > -0.4414 AND btc_price_vs_sma200 <= -5.4958`
- **Açıklama:** Bitcoin dibi görmüş ve sert düşüşü durmuşken (yataya bağladığında) yakalanan mükemmel "V formasyonu" dönüş noktası.

## 3. AI_ETH_MOMENTUM (Swing)
- **Kâr Hedefi (TP):** %5.0
- **Zarar Kes (SL):** %3.5
- **Kazanma Oranı (Win Rate):** %92.7 (74 İşlem)
- **Teorik PNL (1000$ ile):** 3.225$
- **Kural:** `eth_change_1h > 3.0641 AND eth_rsi_14 <= 61.2801`
- **Açıklama:** Ethereum 1 saat içinde %3'ten fazla fırlamış ancak hala aşırı alım bölgesine (RSI>70) girmemiş, şişmemiş yükselişleri yakalar.
