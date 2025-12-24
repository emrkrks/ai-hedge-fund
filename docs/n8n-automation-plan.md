# 🤖 AI Hedge Fund - n8n Otomasyon & Mobil App Entegrasyon Planı

**Oluşturulma Tarihi:** 23 Aralık 2025  
**Proje:** AI Hedge Fund Otomasyonu  
**Hedef:** n8n ile otomatik analizler + Mobil app için backend altyapısı

---

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Mimari Tasarım](#mimari-tasarım)
3. [Teknoloji Stack](#teknoloji-stack)
4. [Database Şeması](#database-şeması)
5. [n8n Workflow'ları](#n8n-workflowları)
6. [Mobil App Entegrasyonu](#mobil-app-entegrasyonu)
7. [Faz Planlaması](#faz-planlaması)
8. [Maliyet Analizi](#maliyet-analizi)

---

## 🎯 Genel Bakış

### Amaç
AI Hedge Fund sistemini otomatikleştirerek:
- ✅ Günlük/haftalık otomatik analizler
- ✅ Real-time bildirimler (Slack/Telegram/Push)
- ✅ Mobil app için backend altyapısı
- ✅ Görsel dashboard (Notion)
- ✅ Uzun vadeli veri arşivi (Supabase)

### Hibrit Yaklaşım
```
AI Hedge Fund (Backend)
    ↓
n8n (Otomasyon Orkestratörü)
    ↓
┌─────────────┬─────────────┐
│  Supabase   │   Notion    │
│ (Ana DB)    │ (Dashboard) │
└─────┬───────┴─────────────┘
      ↓
  Mobile App (iOS/Android)
```

---

## 🏗️ Mimari Tasarım

### Ekosistem Diyagramı

```
┌─────────────────────────────────────────────────────────┐
│                    EKOSISTEM                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐      ┌──────────────┐                │
│  │   AI Hedge   │      │     n8n      │                │
│  │     Fund     │──────│  Automation  │                │
│  │   (Backend)  │      │   Workflow   │                │
│  └──────────────┘      └──────┬───────┘                │
│         │                      │                         │
│         │                      ↓                         │
│         │              ┌──────────────┐                 │
│         └──────────────│   Supabase   │◄────────────┐   │
│                        │  (Database)  │             │   │
│                        └──────┬───────┘             │   │
│                               │                     │   │
│         ┌─────────────────────┼─────────────────┐   │   │
│         │                     │                 │   │   │
│         ↓                     ↓                 ↓   │   │
│  ┌─────────────┐      ┌─────────────┐   ┌──────────┴──┐│
│  │   Notion    │      │  Mobile App │   │  Web App    ││
│  │ (Dashboard) │      │  (iOS/And.) │   │ (React/Vue) ││
│  └─────────────┘      └─────────────┘   └─────────────┘│
│    (Görsel)              (API tüketir)    (Opsiyonel)  │
└─────────────────────────────────────────────────────────┘
```

### Veri Akışı

```
┌─────────────────────────────────────────────────────────┐
│               GÜNLÜK RUTIN (09:00)                      │
└─────────────────────────────────────────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │  n8n: Cron Trigger (09:00)    │
        └───────────────┬───────────────┘
                        ↓
        ┌───────────────────────────────┐
        │  AI Hedge Fund API Call       │
        │  POST /analyze                │
        │  Body: watchlist tickers (10) │
        └───────────────┬───────────────┘
                        ↓
                ┌───────┴────────┐
                │                │
                ↓                ↓
    ┌──────────────────┐  ┌──────────────────┐
    │   Supabase       │  │    Notion        │
    │   (Ham Veri)     │  │   (Dashboard)    │
    └──────┬───────────┘  └──────────────────┘
           │
           ↓
    ┌──────────────────┐
    │ Supabase Edge    │
    │ Function:        │
    │ • Özet hesapla   │
    │ • Alert kontrol  │
    │ • Notification   │
    └──────┬───────────┘
           │
           ↓
    ┌──────────────────┐
    │  Mobile App      │
    │  • Push notif    │
    │  • UI güncelle   │
    └──────────────────┘
```

---

## 🛠️ Teknoloji Stack

### Backend & Otomasyon
| Teknoloji | Kullanım | Maliyet |
|-----------|----------|---------|
| **AI Hedge Fund** | Mevcut Python backend (FastAPI) | Ücretsiz |
| **n8n** | Workflow otomasyonu | $0 (self-hosted) |
| **Supabase** | PostgreSQL database + Auth + Storage | $0 (500MB) |
| **Notion** | Görsel dashboard + notlar | $0 (sınırsız) |

### LLM Modelleri (Öncelik Sırası)
1. **Azure OpenAI (GPT-5.2-chat)** - En güçlü, öncelikli
2. **Llama 3.3 70B (Groq)** - Ücretsiz, yedek
3. **GLM-4.6V-Flash (Z.ai)** - Ücretsiz, yedek
4. **Gemini 3.0 Flash (Google)** - Hızlı alternatif

### Mobil App (Gelecek)
- **Flutter** veya **React Native**
- **Supabase SDK** (native entegrasyon)
- **Push Notifications** (Firebase/OneSignal)

---

## 🗄️ Database Şeması

### Supabase PostgreSQL Tabloları

#### 1. `analyses` (Ana Analiz Verileri)
```sql
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ticker TEXT NOT NULL,
  model TEXT NOT NULL,
  analyst TEXT NOT NULL,
  signal TEXT CHECK (signal IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  reasoning TEXT,
  user_id UUID REFERENCES auth.users,
  
  -- Indexes
  INDEX idx_ticker (ticker),
  INDEX idx_created_at (created_at),
  INDEX idx_signal (signal)
);
```

#### 2. `portfolios` (Kullanıcı Portföyleri)
```sql
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  ticker TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  avg_price DECIMAL(10, 2),
  last_signal TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, ticker)
);
```

#### 3. `watchlists` (Takip Listeleri)
```sql
CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  ticker TEXT NOT NULL,
  alert_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, ticker)
);
```

#### 4. `notifications` (Bildirim Geçmişi)
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  ticker TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('SIGNAL', 'ALERT', 'REPORT')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read BOOLEAN DEFAULT false
);
```

### Veri Boyutu Hesaplaması

**Tek kayıt boyutu:** ~1.2 KB

**Kapasite Analizi:**
- **Günlük 1 ticker:** 62 yıl
- **Günlük 10 ticker:** 6.3 yıl
- **Günlük 50 ticker:** 1.3 yıl

**Supabase 500MB = ~416,000 kayıt**

---

## 🔄 n8n Workflow'ları

### 1. Günlük Sabah Analizi (Temel)

```
┌─────────────┐
│ Cron Trigger│ → Her gün 09:00
└─────────────┘
       ↓
┌─────────────────────────┐
│ HTTP Request            │
│ POST localhost:8000/api │
│ Body: {"ticker": "AAPL"}│
└─────────────────────────┘
       ↓
┌──────────────────────────┐
│ Loop Over Analysts       │ (18 analyst)
└──────────────────────────┘
       ↓
┌──────────────────────────┐
│ Supabase Insert          │
│ Table: analyses          │
└──────────────────────────┘
       ↓
┌──────────────────────────┐
│ Notion Append            │
│ Database: Analyses       │
└──────────────────────────┘
```

**Parametreler:**
- Cron: `0 9 * * 1-5` (Hafta içi 09:00)
- Ticker listesi: Supabase `watchlists` tablosundan çek

---

### 2. Güçlü Sinyal Bildirimi

```
┌─────────────┐
│ Webhook     │ → AI Hedge Fund'dan tetiklenir
└─────────────┘
       ↓
┌──────────────────┐
│ IF Node         │ → Signal == "BULLISH" && Confidence >= 80?
└──────────────────┘
    ↙         ↘
 [YES]       [NO]
   ↓           ↓
┌──────────┐  Skip
│ Slack    │
│ Telegram │
│ Push     │
└──────────┘
```

**Kullanım:** Yüksek güvenli sinyallerde anlık bildirim

---

### 3. Haftalık Özet Raporu

```
┌─────────────┐
│ Cron Trigger│ → Her Pazar 18:00
└─────────────┘
       ↓
┌─────────────────────────┐
│ Supabase Query          │
│ SELECT * FROM analyses  │
│ WHERE created_at >= -7d │
└─────────────────────────┘
       ↓
┌──────────────────────────┐
│ Aggregate Data           │
│ • En iyi performans      │
│ • Sinyal dağılımı        │
│ • Model karşılaştırması  │
└──────────────────────────┘
       ↓
┌──────────────────────────┐
│ Email (Gmail/Outlook)    │
│ PDF rapor eki            │
└──────────────────────────┘
```

---

### 4. Google Sheets Watchlist Sync

```
┌─────────────┐
│ Cron Trigger│ → Her gün 08:30
└─────────────┘
       ↓
┌─────────────────────────┐
│ Google Sheets Read      │
│ Sheet: "Watchlist"      │
│ Range: A2:A100          │
└─────────────────────────┘
       ↓
┌──────────────────────────┐
│ Loop Over Tickers        │
└──────────────────────────┘
       ↓
┌──────────────────────────┐
│ Supabase Upsert          │
│ Table: watchlists        │
└──────────────────────────┘
```

**Fayda:** Google Sheets'te watchlist düzenle, otomatik senkronize olsun

---

## 📱 Mobil App Entegrasyonu

### Supabase'in Mobil App Avantajları

#### 1. Otomatik REST API
```javascript
// Mobil app'ten doğrudan kullanım
const { data } = await supabase
  .from('analyses')
  .select('*')
  .eq('ticker', 'ASTS')
  .order('created_at', { ascending: false })
  .limit(10)
```

#### 2. Native SDK'lar

**Flutter:**
```dart
import 'package:supabase_flutter/supabase_flutter.dart';

final response = await Supabase.instance.client
  .from('analyses')
  .select()
  .eq('signal', 'BULLISH')
  .gte('confidence', 70);
```

**React Native:**
```javascript
import { createClient } from '@supabase/supabase-js'

const { data } = await supabase
  .from('analyses')
  .select('ticker, signal, confidence')
```

#### 3. Real-time Updates
```javascript
// Canlı güncellemeler
supabase
  .channel('analyses-channel')
  .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'analyses' },
      (payload) => {
        console.log('Yeni analiz!', payload.new)
        // UI güncelle
      }
  )
  .subscribe()
```

#### 4. Authentication
```javascript
// Login
const { user } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

// Row Level Security (RLS)
// Her kullanıcı sadece kendi verilerini görebilir
```

### Mobil App Ekran Tasarımları

#### Ana Ekran
```
┌─────────────────────────────────┐
│  📊 AI Hedge Fund               │
│                                 │
│  🔔 Son Sinyaller (Bugün)       │
│  ┌───────────────────────────┐  │
│  │ AAPL  🟢 BULLISH  85%     │  │
│  │ TSLA  🔴 BEARISH  92%     │  │
│  │ NVDA  ⚪ NEUTRAL  45%     │  │
│  └───────────────────────────┘  │
│                                 │
│  📈 Watchlist'im (5)            │
│  📂 Portföyüm ($125K)           │
│  ⚙️ Ayarlar                     │
└─────────────────────────────────┘
```

#### Detay Ekranı
```
┌─────────────────────────────────┐
│  ← AAPL Analiz Detayı           │
│                                 │
│  Sinyal: 🟢 BULLISH             │
│  Güven: 85%                     │
│  Tarih: 23 Aralık 2025          │
│  Model: Azure GPT-5.2           │
│                                 │
│  👥 Analyst Görüşleri (18):     │
│  ┌───────────────────────────┐  │
│  │ Warren Buffett  🟢 90%    │  │
│  │ "Strong fundamentals..."  │  │
│  ├───────────────────────────┤  │
│  │ Peter Lynch     🟢 88%    │  │
│  │ "Clear growth story..."   │  │
│  └───────────────────────────┘  │
│                                 │
│  📊 Tarihçe (Grafik)            │
│  📄 PDF Rapor İndir             │
└─────────────────────────────────┘
```

---

## 📅 Faz Planlaması

### Faz 1: Temel Altyapı (1 Hafta) ✅

**Hedef:** n8n + Supabase + Notion kurulumu

**Görevler:**
- [ ] Supabase hesabı oluştur
- [ ] Database şemasını kur (SQL scriptleri çalıştır)
- [ ] n8n'i local'de kur (Docker veya npm)
- [ ] AI Hedge Fund backend'e `/api/analyze` endpoint ekle
- [ ] İlk basit workflow: Cron → API → Supabase
- [ ] Notion database template'i oluştur
- [ ] n8n → Notion entegrasyonu test

**Çıktı:**
- ✅ Günlük otomatik analizler çalışıyor
- ✅ Veriler Supabase + Notion'a kaydediliyor

---

### Faz 2: Gelişmiş Otomasyon (2 Hafta) 🚀

**Hedef:** Bildirimler + watchlist yönetimi

**Görevler:**
- [ ] Slack/Telegram bot kurulumu
- [ ] Güçlü sinyal bildirimi workflow'u
- [ ] Google Sheets watchlist sync
- [ ] Haftalık özet raporu (email)
- [ ] Supabase RLS (Row Level Security) kur
- [ ] Multi-user desteği (authentication)

**Çıktı:**
- ✅ Anlık bildirimler çalışıyor
- ✅ Watchlist otomatik senkronize
- ✅ Haftalık raporlar email ile geliyor

---

### Faz 3: Mobil App Temel (1 Ay) 📱

**Hedef:** Basit mobil app (read-only)

**Görevler:**
- [ ] Flutter/React Native proje kurulumu
- [ ] Supabase SDK entegrasyonu
- [ ] Authentication ekranları (login/signup)
- [ ] Ana ekran: Son analizler listesi
- [ ] Detay ekranı: Analyst görüşleri
- [ ] Real-time updates test

**Çıktı:**
- ✅ Mobil app'ten analizler görüntülenebiliyor
- ✅ Kullanıcı girişi çalışıyor
- ✅ Canlı güncellemeler aktif

---

### Faz 4: Mobil App İleri (2-3 Ay) 🎯

**Hedef:** Tam özellikli mobil app

**Görevler:**
- [ ] Push notifications (Firebase)
- [ ] Watchlist yönetimi (ekle/çıkar)
- [ ] Portfolio tracker
- [ ] Grafikler (chart.js / victory-native)
- [ ] PDF rapor indirme
- [ ] Dark mode
- [ ] Offline mode (local cache)

**Çıktı:**
- ✅ Production-ready mobil app
- ✅ App Store / Play Store'a yayınlanabilir

---

## 💰 Maliyet Analizi

### Aylık Maliyet Tahmini

| Servis | Ücretsiz Tier | Kullanım | Maliyet |
|--------|---------------|----------|---------|
| **Supabase** | 500MB DB + 1GB Storage | Günlük 10 ticker | $0 (6+ yıl yeter) |
| **Notion** | Sınırsız | Dashboard + notlar | $0 |
| **n8n** | Self-hosted | Workflow orkestratörü | $0 |
| **Azure OpenAI** | Pay-as-you-go | GPT-5.2 (öncelikli) | ~$50-100/ay |
| **Groq** | Ücretsiz | Llama 3.3 70B (yedek) | $0 |
| **Z.ai** | Ücretsiz | GLM-4.6V-Flash (yedek) | $0 |
| **Firebase** | 10K notif/ay | Push notifications | $0 |

**Toplam:** ~$50-100/ay (sadece LLM maliyeti)

**Optimizasyon:**
- Groq/Z.ai kullanarak → **$0/ay** (tamamen ücretsiz)
- Azure sadece kritik analizler için → ~$20/ay

---

### LLM Maliyet Karşılaştırması

**Günlük 10 Ticker × 18 Analyst = 180 LLM Çağrısı**

| Model | Maliyet/1M Token | Günlük Maliyet | Aylık Maliyet |
|-------|------------------|----------------|---------------|
| **Azure GPT-5.2** | ~$10 | ~$3 | ~$90 |
| **Groq Llama 3.3** | **$0** | **$0** | **$0** |
| **Z.ai GLM-4.6V** | **$0** | **$0** | **$0** |
| **Gemini 3.0 Flash** | $0.075 | ~$0.20 | ~$6 |

**Tavsiye:** Groq/Z.ai ile başla, kritik analizlerde Azure kullan.

---

## 📊 Notion Dashboard Template

### Database Yapısı

**Database Adı:** "Hedge Fund Analyses"

**Properties:**
- 📅 **Date** (Date) - Analiz tarihi
- 🏷️ **Ticker** (Select) - Hisse senedi sembolü
- 🤖 **Model** (Select) - Kullanılan LLM modeli
- 👤 **Analyst** (Multi-select) - Analyst isimleri
- 📊 **Signal** (Select) - 🟢 Bullish / 🔴 Bearish / ⚪ Neutral
- 📈 **Confidence** (Number, %) - Güven skoru
- 📝 **Reasoning** (Text) - Analiz özeti (ilk 200 karakter)
- 🔗 **Full Report** (URL) - Detaylı rapor linki

### Görünümler (Views)

1. **📋 Tüm Analizler** (Table)
2. **📊 Sinyal Dağılımı** (Board - Signal'e göre grupla)
3. **📅 Takvim** (Calendar - Date'e göre)
4. **📈 Yüksek Güven** (Table - Confidence >= 70 filtresi)
5. **🎯 Bugün** (Table - Date = Today)

---

## 🔐 Güvenlik & Best Practices

### Supabase Row Level Security (RLS)

```sql
-- Her kullanıcı sadece kendi verilerini görebilir
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses"
  ON analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses"
  ON analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### API Key Yönetimi

**n8n Credentials:**
- Supabase URL + Anon Key (public)
- Supabase Service Role Key (private - sadece n8n)
- AI Hedge Fund API Key (internal)
- Notion Integration Token

**Güvenlik:**
- ✅ Tüm keyler environment variables'da
- ✅ `.env` dosyası `.gitignore`'da
- ✅ Production'da secret manager kullan (AWS Secrets Manager / Vault)

---

## 📚 Kaynaklar & Dökümantasyon

### Resmi Dökümantasyonlar
- [Supabase Docs](https://supabase.com/docs)
- [n8n Documentation](https://docs.n8n.io)
- [Notion API](https://developers.notion.com)
- [Groq API](https://console.groq.com/docs)
- [Z.ai Docs](https://docs.z.ai)

### Örnek Projeler
- [Supabase Flutter Example](https://github.com/supabase/supabase-flutter)
- [n8n Workflow Templates](https://n8n.io/workflows)

---

## ✅ Checklist (İlk Adımlar)

### Bugün Yapılacaklar
- [ ] Supabase hesabı aç
- [ ] n8n'i local'de kur
- [ ] AI Hedge Fund backend'i incele (mevcut API'ler)

### Bu Hafta
- [ ] Database şemasını oluştur
- [ ] İlk workflow'u kur (Cron → API → Supabase)
- [ ] Notion template'i hazırla

### Gelecek Hafta
- [ ] Slack/Telegram bildirimleri
- [ ] Watchlist sync
- [ ] Haftalık rapor

---

## 🎯 Başarı Kriterleri

### Faz 1 Tamamlandı ✅
- [x] Günlük otomatik analizler çalışıyor
- [x] Veriler Supabase'e kaydediliyor
- [x] Notion dashboard'u aktif

### Faz 2 Tamamlandı ✅
- [ ] Anlık bildirimler geliyor
- [ ] Watchlist otomatik senkronize
- [ ] Haftalık email raporları

### Faz 3 Tamamlandı ✅
- [ ] Mobil app'ten analizler görüntülenebiliyor
- [ ] Real-time updates çalışıyor
- [ ] Authentication aktif

---

## 📞 Destek & İletişim

**Proje Sahibi:** [İsim]  
**Email:** [Email]  
**GitHub:** [Repo URL]

---

**Son Güncelleme:** 23 Aralık 2025  
**Versiyon:** 1.0  
**Durum:** 🚀 Başlangıç Aşaması
