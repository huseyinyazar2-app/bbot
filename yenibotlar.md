

**24 ayrı bot kendi kafasına göre para kullanmayacak.**
**24 uzman strateji modülü sinyal üretecek.**
**Tek merkezi beyin hangisinin çalışacağına, ne kadar sermaye alacağına, hangisinin pasife düşeceğine karar verecek.**

Yani sistem şu mantıkta olacak:

```text
24 bot = 24 farklı piyasa anını avlayan uzman
Merkezi beyin = orkestra şefi
Risk yöneticisi = kasa bekçisi
Execution engine = emir gönderen motor
```

Aşağıda sana **24 strateji botu + merkezi beyin + çakışma çözümü + bot terfi/rezil sistemi** şeklinde tam plan çıkarıyorum.

Bu yatırım tavsiyesi değildir; sistem tasarım planıdır. Özellikle 24 stratejiyi aynı anda test etmek overfit riskini büyütür. Backtest overfitting finansal simülasyonlarda özel olarak çalışılmış ciddi bir problem; Bailey, Borwein, López de Prado ve Zhu’nun çalışması bu riski “Probability of Backtest Overfitting” olarak ele alıyor. Bu yüzden burada backtest + out-of-sample + paper trade sürecini özellikle sert kuracağız. ([SSRN][1])

---

# 1. Ana mimari

## Sistem bileşenleri

```text
1. Market Regime Detector
2. Coin Universe Selector
3. 24 Strategy Bots
4. Signal Scorer
5. Central Brain
6. Risk Manager
7. Execution Engine
8. Exit Manager
9. Bot Health / Vezir-Rezil Sistemi
```

## Her botun üreteceği standart sinyal

Her bot farklı strateji çalışsa bile merkeze aynı formatta sinyal göndermeli:

```json
{
  "bot_id": "B06_BREAKOUT_RETEST",
  "symbol": "SOLUSDT",
  "direction": "LONG",
  "timeframe": "30m",
  "entry_type": "market_or_limit",
  "entry_zone": [148.20, 149.10],
  "stop_loss": 145.80,
  "take_profit_1": 153.80,
  "take_profit_2": 158.40,
  "trailing_stop": 1.4,
  "max_hold_bars": 36,
  "setup_score": 82,
  "regime_required": ["BTC_BULL", "BTC_RANGE"],
  "risk_class": "medium",
  "expiry_bars": 3,
  "reason": "Breakout + retest + volume confirmation"
}
```

Botlar “al-sat” emri vermeyecek. Sadece **aday işlem** önerecek. Emir verme yetkisi merkezi beyinde olacak.

---

# 2. 24 botu yeniden düzenleyelim

Önceki 24 listede bazıları aslında alım botu değil, kalite/koruma filtresiydi. Bence daha doğru mimari şu:

```text
24 adet gerçek strateji botu
+
Merkezi beyin içinde global koruma modülleri
```

Yani `No-Chase`, `Low Spread`, `Panic Shield`, `Strategy Health` gibi yapıları bot değil, **bütün botların üstünde çalışan merkezi filtre** yapıyoruz. Çünkü bunlar tek bir stratejiye değil, tüm sisteme hükmetmeli.

Bu yüzden aşağıdaki liste daha temiz:

```text
A) Trend botları: 5
B) Breakout botları: 5
C) Range / yatay piyasa botları: 5
D) Panik / recovery botları: 4
E) Uzun vadeli / position botları: 5

Toplam: 24 strateji botu
```

---

# A) Trend botları

## B01 — HTF Trend Retest Bot

**Uzmanlığı:** Büyük trend içinde geri çekilmeden alım.

**Zaman dilimi:** `1h` giriş, `4h` trend onayı.

**Ne izler?**

```text
4h EMA 20 > EMA 50
1h EMA 20 > EMA 50
Fiyat 1h EMA 20 veya EMA 50 bölgesine geri çekilmiş mi?
RSI 40-45 bölgesinden 50 üstüne dönüyor mu?
Hacim normalin üstünde mi?
```

**Ne olursa alır?**

```text
BTC rejimi bull veya range
Coin 4h trend pozitif
Fiyat EMA 20/50 destek bölgesine inmiş
RSI 50 üstüne reclaim etmiş
Kapanış tekrar EMA üstünde
Risk/ödül en az 1:2
```

**Ne olursa satır?**

```text
SL: EMA 50 altı kapanış veya ATR bazlı stop
TP1: +2R
TP2: +3R / trailing
Trend bozulursa erken çıkış
Max hold: 24-48 adet 1h mum
```

**Risk:** Orta. Ana kaliteli botlardan biri.

---

## B02 — Trend Pullback Scalp Bot

**Uzmanlığı:** Gün içi trendde küçük geri çekilmeleri almak.

**Zaman dilimi:** `5m` veya `15m`.

**Ne izler?**

```text
15m EMA 12 > EMA 26
5m kısa geri çekilme
RSI 40 civarından 45-50 üstüne dönüş
Hacim 1.2x - 1.5x
BTC sert düşmüyor
```

**Ne olursa alır?**

```text
Coin trendde
Fiyat EMA hızlı/yavaş bölgesine dönmüş
RSI toparlanmış
Mum kapanışı yeşil ve EMA üstü
```

**Ne olursa satır?**

```text
SL: 0.7% - 1.1% veya 1 ATR
TP: 1.2% - 2.0%
Trailing: 0.5% - 0.8%
Max hold: 9-18 mum
```

**Risk:** Orta-yüksek. Çok işlem üretir; merkezi beyin bunu fazla açtırmamalı.

---

## B03 — Higher Low Continuation Bot

**Uzmanlığı:** Trend devamında “önceki dipten daha yüksek dip” yakalamak.

**Zaman dilimi:** `15m` / `30m`.

**Ne izler?**

```text
Son swing low > önceki swing low
EMA 20 > EMA 50
RSI düşüşte 40 altına inmeden dönmüş
Fiyat önceki lokal tepeyi kırmaya hazırlanıyor
```

**Ne olursa alır?**

```text
Higher low oluşmuş
Son mum lokal direnç üstüne kapanmış
Hacim toparlanmış
BTC nötr/pozitif
```

**Ne olursa satır?**

```text
SL: higher low altı
TP: önceki tepe + 1.5R / 2.5R
Trailing: trend hızlanırsa aktif
Invalidation: higher low kırılırsa çık
```

**Risk:** Orta. Trend devam botu olarak kaliteli.

---

## B04 — Relative Strength vs BTC Bot

**Uzmanlığı:** BTC yatayken veya hafif düşerken bile güçlü kalan altcoini bulmak.

**Zaman dilimi:** `30m` / `1h`.

**Ne izler?**

```text
Coin 24h getirisi - BTC 24h getirisi
Coin/BTC paritesi EMA 20 > EMA 50 mi?
BTC düşerken coin daha az mı düşüyor?
BTC yatayken coin yükseliyor mu?
```

**Ne olursa alır?**

```text
BTC panik değil
Coin BTC’den göreceli güçlü
Coin/BTC trendi pozitif
USDT grafiğinde EMA trendi pozitif
Hacim artıyor
```

**Ne olursa satır?**

```text
Coin/BTC göreceli güç bozulursa
Coin USDT EMA 50 altına inerse
TP: 3% - 5%
SL: 1.5% - 2%
```

**Risk:** Orta. Bence en değerli botlardan biri.

---

## B05 — Momentum Continuation Bot

**Uzmanlığı:** Güçlü momentum mumundan sonra devam hareketini almak.

**Zaman dilimi:** `15m` / `30m`.

**Ne izler?**

```text
Normalden büyük gövdeli mum
Hacim 2x+
Mum kapanışı son direnç üstünde
Sonraki mumda fiyat güçlü kalıyor mu?
```

**Ne olursa alır?**

```text
İlk patlama mumundan hemen sonra değil
Küçük dinlenme sonrası tekrar yukarı kapanışta
Fiyat EMA hızlıdan çok uzak değilse
```

**Ne olursa satır?**

```text
SL: patlama mumunun orta-alt bölgesi
TP: 2R - 3R
Trailing: sert momentum sürerse açık
No-chase filtresi ihlal edilirse işlem açma
```

**Risk:** Yüksek. Fake pump yememesi için No-Chase filtresi şart.

---

# B) Breakout botları

## B06 — Breakout Retest Bot

**Uzmanlığı:** Direnç kırıldıktan sonra eski direncin destek olarak test edilmesini almak.

**Zaman dilimi:** `30m`.

**Ne izler?**

```text
Son 48-80 mumun tepesi
Kırılım hacmi 1.8x+
Kırılımdan sonra retest
Retest bölgesinde satış baskısı azalıyor mu?
```

**Ne olursa alır?**

```text
Direnç kırıldı
Fiyat eski direnç bölgesine geri geldi
Bu bölge destek gibi çalıştı
RSI 55 üstüne döndü
Kapanış tekrar yukarı
```

**Ne olursa satır?**

```text
SL: retest bölgesi altı
TP1: kırılım mesafesi kadar
TP2: 3R / trailing
Retest altına kapanışta çık
```

**Risk:** Orta. Direkt breakout almaktan daha güvenli.

---

## B07 — Volume Breakout Bot

**Uzmanlığı:** Hacimli ani kırılımları almak.

**Zaman dilimi:** `5m` / `15m`.

**Ne izler?**

```text
Son 20-60 mum zirvesi
Hacim 2x+
Mum gövdesi güçlü mü?
Spread normal mi?
Order book derinliği yeterli mi?
```

**Ne olursa alır?**

```text
Kapanış direnç üstünde
Hacim yüksek
Fiyat EMA 20 üstünde
BTC kötü değil
No-chase filtresi izin veriyor
```

**Ne olursa satır?**

```text
SL: kırılım seviyesi altı
TP: 1.8% - 3%
Trailing: 0.8% - 1.2%
Fake breakout kapanışında çık
```

**Risk:** Yüksek. Çok seçici çalışmalı.

---

## B08 — Squeeze Breakout Bot

**Uzmanlığı:** Volatilite sıkışması sonrası patlama.

**Zaman dilimi:** `15m` / `30m`.

**Ne izler?**

```text
Bollinger Band genişliği düşük percentile
ATR düşük
Hacim kurumuş
Fiyat dar bantta sıkışmış
```

**Ne olursa alır?**

```text
Sıkışma sonrası üst bant kırılımı
Hacim 1.8x+
Kapanış bant dışında veya direnç üstünde
BTC range/bull
```

**Ne olursa satır?**

```text
SL: sıkışma bandı içine dönüş
TP: band genişliğinin 1.5-2.5 katı
Trailing: volatilite artarsa devrede
```

**Risk:** Orta-yüksek. Güzel yakalarsa büyük hareket verir.

---

## B09 — Range Expansion Bot

**Uzmanlığı:** Uzun yatay kanalın yukarı çözülmesini almak.

**Zaman dilimi:** `30m` / `1h`.

**Ne izler?**

```text
En az 24-72 mum yatay kanal
Üst band / alt band net mi?
Üst band üstü kapanış
Hacim artışı
```

**Ne olursa alır?**

```text
Yatay kanal üst bandı kırıldı
Kapanış üstte kaldı
Hacim 1.5x+
BTC panik değil
```

**Ne olursa satır?**

```text
SL: kanal içine geri dönüş
TP: kanal yüksekliği kadar
TP2: 2x kanal yüksekliği
```

**Risk:** Orta. Güçlü yataydan çıkışlarda çalışır.

---

## B10 — Bull Flag Bot

**Uzmanlığı:** Sert yükseliş sonrası bayrak/dinlenme formasyonu.

**Zaman dilimi:** `15m` / `30m`.

**Ne izler?**

```text
Önce sert impuls yükselişi
Sonra aşağı eğimli/daralan düzeltme
Hacim düzeltmede azalıyor mu?
Kırılımda hacim artıyor mu?
```

**Ne olursa alır?**

```text
Bayrak üst çizgisi kırıldı
Hacim geri geldi
Fiyat EMA 20 üstünde
RSI 50 üstünde
```

**Ne olursa satır?**

```text
SL: bayrak altı
TP: bayrak direğinin 0.5-1.0 katı
Trailing: momentum devam ederse
```

**Risk:** Yüksek. Formasyon tespiti iyi yazılmalı.

---

# C) Range / yatay piyasa botları

## B11 — Range Support Bounce Bot

**Uzmanlığı:** Yatay piyasanın alt bandından tepki almak.

**Zaman dilimi:** `15m` / `30m`.

**Ne izler?**

```text
Net yatay kanal
Alt banda temas
RSI düşük
Satış hacmi azalıyor
Fitil/reclaim var mı?
```

**Ne olursa alır?**

```text
BTC range
Coin kanal içinde
Alt band test edildi
Alt band altına sarkıp geri aldı
RSI 30-40 bölgesinden döndü
```

**Ne olursa satır?**

```text
SL: kanal altı
TP1: kanal ortası
TP2: kanal üstü
Kanal altı kapanışta çık
```

**Risk:** Orta. Trend piyasasında çalıştırılmamalı.

---

## B12 — VWAP Reclaim Bot

**Uzmanlığı:** Gün içi VWAP altına sarkma sonrası VWAP geri alımı.

**Zaman dilimi:** `5m` / `15m`.

**Ne izler?**

```text
Session VWAP
Fiyat VWAP altına sarktı mı?
VWAP tekrar geri alındı mı?
Hacim var mı?
```

**Ne olursa alır?**

```text
BTC panik değil
Fiyat VWAP altından üstüne kapanış yaptı
RSI 45-50 üstüne döndü
Hacim ortalama üstü
```

**Ne olursa satır?**

```text
SL: VWAP altına geri kapanış
TP: gün içi lokal direnç
Trailing: küçük
Max hold: kısa
```

**Risk:** Orta-yüksek. Scalp karakterli.

---

## B13 — Bollinger Reclaim Bot

**Uzmanlığı:** Bollinger alt bandı dışına taşma ve band içine dönüş.

**Zaman dilimi:** `15m`.

**Ne izler?**

```text
Bollinger alt band dışı kapanış
Sonraki mum band içine geri dönüş
RSI aşırı satım
Hacim capitulation mı?
```

**Ne olursa alır?**

```text
BTC panik değil veya recovery başlamış
Coin alt band dışına taşmış
Sonra band içine güçlü kapanış yapmış
RSI 30 üstüne dönmüş
```

**Ne olursa satır?**

```text
SL: dip altı
TP1: Bollinger orta band
TP2: üst banda yaklaşma
```

**Risk:** Yüksek. Sadece mean-reversion rejiminde çalışmalı.

---

## B14 — RSI Reclaim Mean-Reversion Bot

**Uzmanlığı:** Aşırı satımdan dönüş.

**Zaman dilimi:** `5m` / `15m`.

**Ne izler?**

```text
RSI 25-30 altı
RSI 35-40 üstüne geri dönüş
Fiyat düşüş hızını kesiyor mu?
BTC kötü mü?
```

**Ne olursa alır?**

```text
RSI dip yaptı
RSI toparlanma seviyesini geçti
Fiyat EMA hızlıya yaklaşıyor
Hacim panik sonrası azalıyor
```

**Ne olursa satır?**

```text
SL: son dip altı
TP: 0.8% - 1.5%
Max hold: kısa
BTC tekrar sert düşerse acil çık
```

**Risk:** Yüksek. Küçük riskle çalışmalı.

---

## B15 — Failed Breakdown / Liquidity Trap Bot

**Uzmanlığı:** Destek altına fake kırılım sonrası hızlı geri dönüş.

**Zaman dilimi:** `15m` / `30m`.

**Ne izler?**

```text
Net destek seviyesi
Destek altına fitil/sarkma
Sonra destek üstüne kapanış
Hacim patlaması
Short/stop avı davranışı
```

**Ne olursa alır?**

```text
Destek altı kırılmış gibi yaptı
Aynı veya sonraki mum destek üstüne döndü
Kapanış güçlü
RSI toparlandı
```

**Ne olursa satır?**

```text
SL: fake kırılım dibi altı
TP1: kanal ortası
TP2: önceki direnç
```

**Risk:** Orta-yüksek ama kaliteli setup yakalarsa çok iyi.

---

# D) Panik / recovery botları

Bu botlar normal botlardan farklı. Bunlar sadece piyasa sert düşüşten sonra **çok küçük riskle** çalışmalı.

## B16 — Capitulation Wick Bot

**Uzmanlığı:** Panik satışında uzun fitilli dip yakalamak.

**Zaman dilimi:** `5m` / `15m`.

**Ne izler?**

```text
Çok uzun alt fitil
Hacim 3x+
RSI aşırı satım
Mum kapanışı dipten ciddi yukarıda
BTC düşüş hızı kesilmiş mi?
```

**Ne olursa alır?**

```text
Panik fitili var
Mum dipten güçlü kapandı
Sonraki mum fitil dibini kırmadı
BTC toparlanma işareti verdi
```

**Ne olursa satır?**

```text
SL: fitil dibi altı
TP: 1R / 2R hızlı çıkış
Max hold: çok kısa
```

**Risk:** Çok yüksek. Mikro risk botu.

---

## B17 — BTC Recovery Bounce Bot

**Uzmanlığı:** BTC toparlanınca altcoin tepki hareketi almak.

**Zaman dilimi:** `15m`.

**Ne izler?**

```text
BTC sert düştü
BTC VWAP/EMA 20 geri aldı
Altcoinler henüz gecikmeli
Hacim toparlanıyor
```

**Ne olursa alır?**

```text
BTC recovery onayı verdi
Coin aşırı satımda ama toparlanıyor
Coin RSI reclaim yaptı
```

**Ne olursa satır?**

```text
BTC yeniden recovery seviyesini kaybederse çık
TP: kısa tepki hedefi
SL: yakın
```

**Risk:** Yüksek. Sadece BTC onayından sonra.

---

## B18 — Oversold Leader Bot

**Uzmanlığı:** Piyasa düşerken en az düşen güçlü coini seçmek.

**Zaman dilimi:** `30m` / `1h`.

**Ne izler?**

```text
BTC düşerken coin daha az düşmüş mü?
Coin EMA 50 üstünde kalabilmiş mi?
Coin/BTC oranı yükselmiş mi?
```

**Ne olursa alır?**

```text
BTC panik sonrası stabilize oldu
Coin piyasaya göre güçlü
İlk toparlanmada lider coin yukarı kırıyor
```

**Ne olursa satır?**

```text
Relative strength bozulursa
BTC tekrar düşüşe geçerse
TP: 2R - 3R
```

**Risk:** Orta-yüksek. Düşüş sonrası en mantıklı recovery botlarından biri.

---

## B19 — Market-Wide Reclaim Bot

**Uzmanlığı:** Piyasa geneli aynı anda destek/EMA reclaim yapınca tepki almak.

**Zaman dilimi:** `15m` / `30m`.

**Ne izler?**

```text
İlk 20 coinin kaçı EMA 20 üstüne döndü?
BTC EMA 20 üstüne döndü mü?
ETH onay veriyor mu?
Market breadth toparlandı mı?
```

**Ne olursa alır?**

```text
BTC toparlandı
İlk 20 coinin en az %60'ı kısa EMA üstüne döndü
Seçilen coin de hacimli reclaim yaptı
```

**Ne olursa satır?**

```text
Market breadth tekrar bozulursa
BTC EMA altına inerse
TP kısa/orta vadeli
```

**Risk:** Orta. Panik sonrası kolektif toparlanma botu.

---

# E) Uzun vadeli / position botları

Bunlar günlük scalp mantığıyla çalışmaz. Daha az işlem açar, daha uzun tutar. Sermayesi ayrı kovada olmalı.

## B20 — 4H Swing Trend Rider Bot

**Uzmanlığı:** 4 saatlik trendi sürmek.

**Zaman dilimi:** `4h`.

**Ne izler?**

```text
4h EMA 20 > EMA 50 > EMA 200
Fiyat EMA 20/50 üstünde
RSI 50 üstünde
ATR sağlıklı
```

**Ne olursa alır?**

```text
4h trend pozitif
Fiyat EMA 20/50 retest yaptı
Güçlü kapanış geldi
BTC 4h trend pozitif
```

**Ne olursa satır?**

```text
4h EMA 50 altı kapanış
Trailing stop
TP parçalı: 5%, 8%, 12% gibi
Trend bozulmazsa pozisyon taşır
```

**Risk:** Orta. Uzun vadeli en temel bot.

---

## B21 — Daily Trend Position Bot

**Uzmanlığı:** Günlük trend yakalamak.

**Zaman dilimi:** `1d`.

**Ne izler?**

```text
Daily EMA 50 > EMA 200
Fiyat daily EMA 50 üstünde
Haftalık trend bozuk değil
Coin yüksek hacimli ve majör
```

**Ne olursa alır?**

```text
Daily trend pozitif
Fiyat EMA 50'ye düzeltme yaptı
Günlük kapanış tekrar güçlendi
BTC daily trend pozitif
```

**Ne olursa satır?**

```text
Daily EMA 50 altı kapanış
BTC daily trend bozulması
Kârda trailing
Uzun vadeli stop geniş olur
```

**Risk:** Orta. İşlem az, elde tutma uzun.

---

## B22 — Weekly Accumulation Pullback Bot

**Uzmanlığı:** Haftalık güçlü coinlerde kademeli birikim.

**Zaman dilimi:** `1d` / `1w`.

**Ne izler?**

```text
Weekly trend
Daily düzeltme
Majör destekler
BTC makro rejimi
Coin uzun vadeli hacim kalitesi
```

**Ne olursa alır?**

```text
Weekly trend pozitif
Daily düzeltme sağlıklı
Fiyat önemli destek/EMA bölgesine geldi
Panik değil, kontrollü düzeltme
```

**Nasıl alır?**

```text
Tek seferde değil
3 kademe:
- İlk kademe destek bölgesi
- İkinci kademe daha derin destek
- Üçüncü kademe reclaim sonrası
```

**Ne olursa satır?**

```text
Weekly trend bozulursa
BTC makro risk-off olursa
Kârlar belirli eşiklerde realize edilir
```

**Risk:** Orta-düşük ama sermaye bağlar.

---

## B23 — Long-Term Breakout Retest Bot

**Uzmanlığı:** Günlük/haftalık büyük direnç kırılımı sonrası retest.

**Zaman dilimi:** `1d` / `4h`.

**Ne izler?**

```text
Son 30-90 günlük direnç
Daily kapanışla kırılım
Kırılım sonrası retest
Hacim artışı
```

**Ne olursa alır?**

```text
Daily direnç kırılmış
Retest gelmiş
Retestte destek çalışmış
BTC daily trend negatif değil
```

**Ne olursa satır?**

```text
Retest seviyesi altı daily kapanış
TP: 1R, 2R, 3R parçalı
Trailing daily/4h bazlı
```

**Risk:** Orta. Uzun vadeli breakout için güzel.

---

## B24 — Core Portfolio Rebalance Bot

**Uzmanlığı:** Uzun vadeli portföyü nakit/coin arasında dengelemek.

**Bu bot klasik al-sat botu değil.** Uzun vadeli sepeti yönetir.

**Ne izler?**

```text
BTC daily/weekly trend
Portföy coinlerinin daily/weekly trendi
Aşırı kâr şişmesi
Aşırı korelasyon
Nakit oranı
```

**Ne olursa alır?**

```text
BTC weekly/daily pozitif
Portföyde nakit oranı hedefin üstünde
Majör coinlerde daily/weekly pullback tamamlanmış
```

**Ne olursa satar?**

```text
Portföy coinlerinden biri hedef ağırlığı çok aşmışsa
BTC daily/weekly risk-off vermişse
Coin weekly destek kaybetmişse
Kârın belirli kısmı stable'a alınır
```

**Risk:** Düşük-orta. Asıl amacı portföyü büyütmek değil, sistemi dengede tutmak.

---

# 3. Merkezi beyin nasıl karar verecek?

Merkezi beyin her mum kapanışında şu adımları çalıştırır.

## Adım 1 — Piyasa rejimini belirle

Önce BTC ve genel piyasa sınıflandırılır:

```text
BTC_BULL
BTC_BEAR
BTC_RANGE
BTC_PANIC
BTC_RECOVERY
LOW_VOLATILITY_SQUEEZE
HIGH_VOLATILITY_EXPANSION
ALTCOIN_STRENGTH
ALTCOIN_WEAKNESS
```

Örnek rejim kuralları:

```text
BTC_BULL:
4h close > EMA 200
EMA 50 slope pozitif
BTC son 24h aşırı düşmemiş

BTC_BEAR:
4h close < EMA 200
EMA 50 slope negatif

BTC_RANGE:
EMA eğimi yatay
ATR normal/düşük
Fiyat net bant içinde

BTC_PANIC:
BTC son 1h içinde örneğin -2.5% / -4% arası sert düşüş
ATR spike
İlk 20 coinin çoğu negatif

BTC_RECOVERY:
Panik sonrası BTC EMA 20 veya VWAP üstüne reclaim
Market breadth toparlanıyor
```

---

## Adım 2 — Hangi botlar çalışabilir?

Örnek:

| Piyasa rejimi    | Çalışabilecek botlar                                  |
| ---------------- | ----------------------------------------------------- |
| BTC Bull         | B01, B02, B03, B04, B05, B06, B08, B10, B20, B21      |
| BTC Range        | B06, B08, B09, B11, B12, B13, B14, B15                |
| BTC Bear         | Çoğu kapalı; sadece çok seçici B18, B22 düşük risk    |
| BTC Panic        | Normal botlar kapalı; sadece B16, B17, B19 mikro risk |
| Low Volatility   | B08, B09                                              |
| High Volatility  | Breakout botları azaltılır; recovery botları dikkatli |
| Altcoin Strength | B04, B18, B20, B23                                    |

---

## Adım 3 — Sinyal skoru hesapla

Her bot sinyal verdiğinde merkezi beyin skorlama yapar:

```text
Toplam skor = 100 puan

25 puan: Piyasa rejimi uyumu
20 puan: Setup kalitesi
15 puan: Üst zaman dilimi onayı
15 puan: Hacim + likidite kalitesi
10 puan: Risk/ödül oranı
10 puan: No-chase / giriş kalitesi
5 puan: Botun güncel sağlık puanı
```

Ceza puanları:

```text
-10: Aynı coinde pozisyon var
-10: BTC son mumda sert kırmızı
-10: Fiyat EMA'dan fazla uzak
-10: Spread yüksek
-15: Bot son dönemde kötü performansta
-20: Günlük zarar limitine yaklaşıldı
-100: Kill switch aktif
```

İşlem eşikleri:

```text
Skor < 65: işlem yok
65-74: sadece paper/shadow
75-84: küçük gerçek risk
85-94: normal risk
95+: A+ işlem, ama yine de maksimum risk limiti aşılmaz
```

---

# 4. Sermaye dağıtımı

Bence sermaye yönetimi “işlem büyüklüğü %” değil, **stop’a göre risk** olmalı.

Yani şöyle:

```text
Pozisyon büyüklüğü = İşlemde riske edilecek tutar / stop mesafesi
```

Örnek:

```text
Bakiye: 1000 USDT
İşlem riski: %0.5 = 5 USDT
Stop mesafesi: %2
Pozisyon büyüklüğü: 5 / 0.02 = 250 USDT
```

Bu, `%10 ile gir` mantığından daha profesyonel. Çünkü stop dar ise pozisyon büyük, stop geniş ise pozisyon küçük olur.

## Risk sınıfları

| Bot tipi              |                                Başlangıç risk |
| --------------------- | --------------------------------------------: |
| Scalp / hızlı bot     |            bakiye başına `0.20% - 0.35%` risk |
| Intraday kaliteli bot |                          `0.35% - 0.50%` risk |
| Swing bot             |                          `0.50% - 0.75%` risk |
| Uzun vadeli bot       | ayrı portföy kovası, daha düşük işlem sıklığı |
| Panik botu            |                    `0.10% - 0.20%` mikro risk |

## Global sınırlar

```text
Aynı anda max açık pozisyon: 3
Aynı coinde max pozisyon: 1 aktif trade + varsa ayrı core portföy
Günlük max zarar: %2
Haftalık max zarar: %5
Tek bot günlük max zarar: %0.75
Tek coin toplam maruziyet: %15-20
Uzun vadeli portföy kovası: toplam bakiyenin ayrı %20-40'ı
```

---

# 5. Vezir-Rezil sistemi

Botların kendi performansına göre sermaye payı değişmeli.

## Bot statüleri

```text
RESEARCH
BACKTEST_PASS
SHADOW
PAPER
MICRO_LIVE
ACTIVE
PRIME
PROBATION
DISABLED
```

## Terfi sistemi

| Statü         | Anlamı                                       |
| ------------- | -------------------------------------------- |
| Research      | Sadece kod/test aşaması                      |
| Backtest Pass | Geçmiş veride temel kriterleri geçti         |
| Shadow        | Canlı piyasada sinyal üretir ama işlem açmaz |
| Paper         | Sanal işlem açar                             |
| Micro Live    | Gerçek parayla çok küçük risk                |
| Active        | Normal risk alabilir                         |
| Prime         | Sistemin vezir botu                          |
| Probation     | Performans bozuldu, risk azaltıldı           |
| Disabled      | Rezalete bağladı, kapalı                     |

## Terfi kriterleri

Örnek:

```text
Backtest Pass:
Profit factor > 1.25
Max drawdown kabul edilebilir
Yeterli işlem sayısı
Farklı piyasa rejimlerinde tamamen çökmedi

Paper -> Micro Live:
En az 30-50 paper sinyal
Net expectancy pozitif
Canlı spread/slippage kabul edilebilir

Micro Live -> Active:
En az 30 gerçek mikro işlem
Profit factor > 1.2
Max drawdown düşük
Paper ve gerçek sonuç farkı makul

Active -> Prime:
Son 100 işlemde pozitif expectancy
Profit factor > 1.5
Drawdown düşük
Çeşitli rejimlerde stabil
```

## Rezil etme kuralları

```text
Son 20 işlemde profit factor < 0.9 ise PROBATION
Son 5 işlem üst üste zarar ise risk %50 azalt
Günlük bot limiti dolduysa o gün kapat
Son 50 işlemde expectancy negatife döndüyse SHADOW'a düşür
Backtestte iyi ama paper'da kötüyse DISABLED
```

---

# 6. Çakışma çözümleri

## Senaryo 1 — Aynı coinde birden fazla bot long sinyali verdi

Örnek:

```text
SOLUSDT:
B04 Relative Strength: skor 86
B06 Breakout Retest: skor 82
B02 Pullback: skor 74
```

Çözüm:

```text
Tek pozisyon açılır.
En yüksek skorlu bot lead_bot olur.
Diğer botlar confluence bonus verir.
Pozisyon boyutu ikiye/üçe katlanmaz.
Maksimum +%20 risk bonusu verilebilir.
```

Yani:

```text
Lead bot: B04
Confluence: B06
Risk: normal risk x 1.2
```

---

## Senaryo 2 — Aynı coinde zıt sinyal oluştu

Örnek:

```text
B06 long diyor
B15 failed breakdown bekliyor ama onay yok
B24 core portföy azalt diyor
```

Çözüm:

```text
Zıt sinyal varsa yeni işlem açma.
Mevcut pozisyon varsa exit manager devreye girsin.
Sadece güçlü invalidation varsa pozisyon azalt/çık.
```

---

## Senaryo 3 — Farklı coinlerde aynı anda çok sinyal geldi

Çözüm:

```text
Sinyalleri skora göre sırala.
Korelasyon kontrolü yap.
Aynı anda en fazla 2-3 işlem aç.
Aynı tema coinlerinden maksimum 1-2 seç.
```

Örnek:

```text
SOL, AVAX, NEAR, FET aynı anda sinyal verdi.
Hepsi altcoin riskine bağlı.
En yüksek 2 skor alınır, diğerleri bekler.
```

---

## Senaryo 4 — Uzun vadeli pozisyon varken scalp sinyali geldi

Çözüm:

```text
Core pozisyon ayrı kova.
Trading pozisyon ayrı kova.
Aynı coinde toplam maruziyet limitini aşma.
Scalp zararı core pozisyonu otomatik sattırmaz.
Core satışını sadece uzun vadeli botlar veya risk-off modülü yapar.
```

---

## Senaryo 5 — BTC panic oldu

Çözüm:

```text
Tüm normal botlar kapatılır.
Açık pozisyonlarda acil risk azaltılır.
Sadece B16/B17/B19 mikro riskle çalışabilir.
Yeni breakout/trend botu kesinlikle çalışmaz.
```

---

## Senaryo 6 — Backtestte aynı mumda hem TP hem SL görünüyor

Bu çok önemli.

Çözüm:

```text
Konservatif varsayım kullan:
Aynı mumda TP ve SL varsa önce SL çalışmış kabul et.
```

Yoksa backtest olduğundan güzel görünür.

---

# 7. Execution engine şartları

Canlı botta emir göndermeden önce şu kontroller zorunlu:

```text
Spread uygun mu?
Order book derinliği yeterli mi?
Min notional sağlanıyor mu?
Lot size / step size doğru mu?
Tick size doğru mu?
Maks açık emir limiti aşılmıyor mu?
```

Binance Spot tarafında sembol bazlı `LOT_SIZE`, `MIN_NOTIONAL`, `MARKET_LOT_SIZE`, `MAX_NUM_ORDERS` gibi filtreler bulunuyor; canlı bot emir göndermeden önce bunları `/exchangeInfo` üzerinden kontrol etmeli. ([Binance Geliştirici Merkezi][2])

## Pozisyon açıldıktan sonra

Pozisyon açılır açılmaz sistem şunu yapmalı:

```text
1. Stop loss koy
2. Take profit koy
3. Trailing gerekiyorsa takip et
4. Emir başarısız olursa pozisyonu kapat veya acil alarm üret
```

Binance OCO emirlerinde iki bağlantılı emirden biri çalışınca diğeri otomatik iptal edilir; bu yapı spot pozisyonlarda kâr alma ve stop-loss’u birlikte yönetmek için uygundur. Fakat OCO emirleri de sembol filtrelerine uymalıdır. ([Binance][3])

---

# 8. Merkezi koruma modülleri

Bunları bot değil, bütün sistemin üstünde çalışan güvenlik katmanı yap.

## G01 — BTC Panic Shield

```text
BTC son X mumda sert düştüyse:
- Yeni normal işlem açma
- Açık işlemlerde risk azalt
- Sadece recovery botlarına mikro izin ver
```

## G02 — No-Chase Filter

```text
Son 3-5 mumda coin çok yükseldiyse alma.
Fiyat EMA 20'den çok uzaksa alma.
Breakout sonrası retest yoksa alma.
```

## G03 — Spread / Liquidity Filter

```text
Spread > belirlenen eşik ise alma.
Order book derinliği yetersizse alma.
24h quote volume düşükse alma.
```

## G04 — Correlation / Exposure Filter

```text
Aynı anda aynı temaya/korelasyona fazla yüklenme.
BTC düşerse hepsi birlikte düşecek coinleri sınırlı tut.
```

## G05 — Daily Loss Kill Switch

```text
Günlük zarar limiti dolduysa:
- Yeni işlem yok
- Sadece açık pozisyon yönetimi
- Ertesi güne kadar sistem soğutma
```

## G06 — Strategy Health Monitor

```text
Her botun rolling performansını izler.
Bozulanı probation'a alır.
İyileşeni terfi ettirir.
```

---

# 9. Backtest planı

24 botun hepsini test edelim ama adil test edelim.

## Backtestte ortak kurallar

```text
Aynı veri dönemi
Aynı komisyon
Aynı slippage
Aynı coin evreni yöntemi
Aynı risk modeli
Aynı BTC rejim sınıflandırması
Aynı emir gerçekleşme mantığı
```

## Kritik hata: geleceği bilerek coin seçme

“Seçilen dönem hacmine göre ilk 10” tehlikeli olabilir.

Doğrusu:

```text
Her gün/hafta o ana kadar bilinen hacme göre coin havuzu seç.
Backtest sonunda en hacimli çıkanları baştan seçme.
```

Yoksa look-ahead bias olur.

## Test aşamaları

```text
1. Tek bot backtest
2. Tek bot out-of-sample test
3. Tek bot paper test
4. 24 bot birlikte backtest
5. Merkezi beyinle birlikte backtest
6. Shadow canlı sinyal
7. Paper canlı işlem
8. Micro live
9. Active live
```

## Botları eleme metrikleri

Sadece toplam kâra bakma.

```text
Profit factor
Expectancy
Max drawdown
Avg win / avg loss
En kötü kayıp serisi
İşlem sayısı
Rejim bazlı performans
Paper/live farkı
Slippage hassasiyeti
```

## Minimum örnek eşikler

```text
Scalp botları:
En az 200-300 işlemle test
Profit factor > 1.20
Avg trade net maliyetin en az 2 katı

Swing botları:
En az 80-150 işlem
Profit factor > 1.35
Drawdown makul

Uzun vadeli botlar:
Daha az işlem kabul edilir
Ama daha uzun tarih gerekir
En az 2-3 farklı piyasa rejimi görmeli
```

---

# 10. Veritabanı modeli

Bence şu tablolar olsun:

```text
bot_configs
strategy_signals
signal_scores
market_regime_snapshots
positions
orders
trades
bot_daily_stats
bot_rolling_stats
capital_allocations
risk_events
backtest_runs
paper_trades
live_trade_audit
```

## bot_configs alanları

```text
bot_id
bot_name
enabled
status
allowed_regimes
timeframes
risk_class
base_risk_pct
max_daily_trades
max_daily_loss_pct
cooldown_bars
min_score_to_trade
params_json
created_at
updated_at
```

## strategy_signals alanları

```text
signal_id
bot_id
symbol
timeframe
direction
entry_zone
stop_loss
take_profit
trailing_stop
setup_score
reason_json
expires_at
created_at
```

## bot_rolling_stats alanları

```text
bot_id
last_20_trades_pf
last_50_trades_pf
last_100_trades_pf
expectancy
win_rate
avg_win
avg_loss
max_drawdown
current_grade
capital_multiplier
```

---

# 11. Merkezi beyin karar algoritması

Basit pseudo-code şöyle olabilir:

```text
Her mum kapanışında:

1. market_regime = detect_market_regime()

2. coin_universe = select_symbols_without_lookahead()

3. active_bots = get_bots_allowed_for_regime(market_regime)

4. Her bot için:
   signal = bot.scan(coin_universe, market_data)

5. Sinyalleri topla.

6. Her sinyal için:
   score = calculate_signal_score(signal, market_regime)
   score -= risk_penalties(signal)
   score += confluence_bonus(signal)

7. Sinyalleri skora göre sırala.

8. Çakışmaları temizle:
   - aynı coin aynı yön: tek lead signal
   - zıt sinyal: işlem yok veya exit
   - korelasyon limiti
   - global risk limiti

9. Risk manager pozisyon boyutunu hesaplar.

10. Execution engine emir gönderir.

11. Exit manager pozisyonu takip eder.

12. Gün sonunda bot performansı güncellenir:
   - vezir/rezil sistemi çalışır.
```

---

# 12. İlk MVP’de yapılacak sıralama

24 botu aynı anda yazmak mümkün ama karmaşıklık artar. Bence kodlama sırası şu olsun:

## Faz 1 — Altyapı

```text
Market data
Indicator engine
Backtest engine
Commission/slippage model
Dynamic coin universe
Signal format
Risk manager
Central scoring
```

## Faz 2 — İlk 8 bot

```text
B01 HTF Trend Retest
B04 Relative Strength
B06 Breakout Retest
B08 Squeeze Breakout
B11 Range Support Bounce
B15 Failed Breakdown
B16 Capitulation Wick
B20 4H Swing Trend Rider
```

## Faz 3 — Kalan botlar

```text
Diğer trend, breakout, range ve uzun vadeli botlar
```

## Faz 4 — Vezir/Rezil sistemi

```text
Bot health
Dynamic capital multiplier
Auto probation
Auto disable
Prime bot sistemi
```

---

# 13. Benim net önerim

Başlangıç hedefi şu olmalı:

```text
24 botun hepsi backtest ve paper ortamında çalışsın.
Gerçek para tarafında merkezi beyin aynı anda en fazla 2-3 pozisyon açsın.
Her bot kendi sermayesini yönetmesin.
Sermayeyi tek risk manager dağıtsın.
```

En önemli kural:

```text
24 bot = 24 kat fazla işlem değil.
24 bot = doğru piyasa anını kaçırmama sistemi.
```

Bu sistemi böyle kurarsan gerçekten profesyonel bir “strateji laboratuvarı + canlı bot orkestrası” olur. İşin en değerli tarafı da şu: En başta hangi strateji iyi bilmiyoruz. 24 botu aynı standartta test edip **veriye göre eleyerek** gitmek en doğru yaklaşım.

[1]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253 "The Probability of Backtest Overfitting by David H. Bailey, Jonathan Borwein, Marcos Lopez de Prado, Qiji Jim Zhu :: SSRN"
[2]: https://developers.binance.com/docs/binance-spot-api-docs/filters "Filters | Binance Open Platform"
[3]: https://www.binance.com/en/academy/articles/how-to-place-an-oco-order-with-the-binance-api "How to Place an OCO Order With the Binance API?"
