# n8n Workflows - AI Hedge Fund

Bu klasör, AI Hedge Fund projesinin n8n otomasyonlarını içerir. Tüm workflow'lar **Supabase Edge Functions** kullanarak 17 farklı AI yatırımcı agent'ını çalıştırır.

---

## 🚀 Kurulum Gereksinimi

### 1. Supabase Edge Functions Deploy Et

```bash
cd /path/to/ai-hedge-fund
supabase functions deploy --project-ref YOUR_PROJECT_REF
```

### 2. n8n Environment Variables Ayarla

n8n Settings → Environment Variables:

```
SUPABASE_URL = https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
TELEGRAM_CHAT_ID = -100xxxxxxxxx
FRED_API_KEY = your_fred_api_key
FMP_API_KEY = your_fmp_api_key
```

### 3. n8n Credentials Ayarla

- **Supabase Account**: Supabase API credentials
- **Telegram Bot**: Bot token
- **Slack Account**: Slack OAuth token (opsiyonel)
- **Notion Account**: Internal integration token (opsiyonel)
- **Google Sheets**: OAuth (opsiyonel)

---

## 📁 Workflow Dosyaları

| # | Dosya | Açıklama | Çalışma Zamanı |
|---|-------|----------|----------------|
| 1 | `1-daily-morning-analysis.json` | Günlük 17-agent analizi | Hafta içi 09:00 |
| 2 | `2-strong-signal-alert.json` | Webhook ile sinyal alarmı | Webhook trigger |
| 3 | `3-weekly-summary-report.json` | Haftalık özet rapor | Pazar 18:00 |
| 4 | `4-google-sheets-watchlist-sync.json` | Sheets → Supabase sync | Hafta içi 08:30 |
| 5 | `5-scuttlebutt-reddit-sentiment.json` | Reddit duyarlılık analizi | Hafta içi 08:00 |

---

## 🤖 17 AI Agent Listesi

### Efsane Yatırımcılar (12)

| Agent | Stil |
|-------|------|
| **Warren Buffett** | Değer yatırımı, moat, uzun vade |
| **Peter Lynch** | 10-bagger, PEG oranı, tanıdık işletmeler |
| **Ben Graham** | Graham Number, net-net, güvenlik marjı |
| **Charlie Munger** | Mental modeller, kalite, rasyonellik |
| **Michael Burry** | Contrarian, derin değer, short |
| **Cathie Wood** | Disruptive innovation, büyüme |
| **Bill Ackman** | Aktivist, konsantre pozisyon |
| **Stanley Druckenmiller** | Makro, momentum, asimetrik risk/ödül |
| **Phil Fisher** | Scuttlebutt, yönetim kalitesi |
| **Mohnish Pabrai** | Dhandho, klonlama, güvenlik marjı |
| **Rakesh Jhunjhunwala** | Makro, büyüyen pazarlar |
| **Aswath Damodaran** | DCF, intrinsik değer, akademik |

### Teknik Analistler (5)

| Agent | Odak |
|-------|------|
| **Technical Analyst** | Grafik, EMA, RSI, momentum |
| **Fundamentals Analyst** | Mali tablolar, oranlar |
| **Growth Analyst** | Büyüme trendleri, Rule of 40 |
| **News Sentiment Analyst** | Haber duyarlılığı |
| **Sentiment Analyst** | Piyasa duyarlılığı, insider |

---

## 📊 Workflow 1: Daily Morning Analysis

**Akış:**
```
Cron (09:00)
    ↓
Get Watchlist from Supabase
    ↓
Loop Over Tickers
    ↓
    ┌─────────────────────────────────────┐
    │ POST /functions/v1/analyze-aggregate │
    │ • ticker: AAPL                       │
    │ • llm_provider: gemini               │
    │ • agents: [17 agents]                │
    └─────────────────────────────────────┘
    ↓
Transform Response
    ↓
┌─────────────────────────────────────────┐
│ Save to Supabase    │ IF Strong Signal  │
│ • analyses_aggregated│     ↓            │
│ • analyses_detailed  │ Telegram Alert   │
│                      │ Notion Append    │
└─────────────────────────────────────────┘
```

### Supabase Edge Function Çağrısı

```javascript
// n8n HTTP Request
POST https://YOUR-PROJECT.supabase.co/functions/v1/analyze-aggregate

{
  "ticker": "AAPL",
  "end_date": "2025-12-23",
  "llm_provider": "gemini",  // veya "azure", "zai"
  "agents": [
    "warren_buffett",
    "peter_lynch",
    "ben_graham",
    // ... 17 agent
  ]
}
```

### Yanıt

```json
{
  "ticker": "AAPL",
  "timestamp": "2025-12-23T09:00:00.000Z",
  "aggregated_signal": "BULLISH",
  "aggregated_confidence": 73,
  "bullish_count": 12,
  "bearish_count": 2,
  "neutral_count": 3,
  "agent_results": [
    {
      "agent": "warren_buffett",
      "agent_display_name": "Warren Buffett",
      "signal": "BULLISH",
      "confidence": 78,
      "reasoning": "Strong moat, excellent ROE, trading at reasonable valuation..."
    },
    // ... 16 more agents
  ]
}
```

---

## 📢 Workflow 2: Strong Signal Alert

**Webhook URL:** `https://your-n8n.com/webhook/hedge-fund-signal`

**Örnek Çağrı:**
```bash
curl -X POST https://your-n8n.com/webhook/hedge-fund-signal \
  -H "Content-Type: application/json" \
  -d '{"ticker": "NVDA", "llm_provider": "gemini"}'
```

---

## 📈 Workflow 3: Weekly Summary

Pazar günü saat 18:00'de haftalık özet oluşturur:
- En iyi BULLISH hisseler
- En kötü BEARISH hisseler
- Haftalık istatistikler

---

## 🔄 Workflow 4: Google Sheets Sync

Google Sheets'teki watchlist'i Supabase'e senkronize eder.

**Sheets formatı:**
| Ticker | Alert Enabled |
|--------|---------------|
| AAPL   | true          |
| NVDA   | true          |
| TSLA   | false         |

---

## 🔍 Workflow 5: Scuttlebutt Reddit Sentiment

Phil Fisher'ın "scuttlebutt" yaklaşımıyla Reddit'ten duyarlılık analizi yapar:
- r/wallstreetbets
- r/stocks
- r/investing

---

## 🗄️ Supabase Tabloları

Bu workflow'ların çalışması için aşağıdaki tablolar gerekli:

```sql
-- Watchlist
CREATE TABLE watchlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  company_name TEXT,
  alert_enabled BOOLEAN DEFAULT true,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aggregated Analyses
CREATE TABLE analyses_aggregated (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  aggregated_signal TEXT,
  aggregated_confidence INTEGER,
  bullish_count INTEGER,
  bearish_count INTEGER,
  neutral_count INTEGER,
  total_agents INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Detailed Agent Analyses
CREATE TABLE analyses_detailed (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  agent TEXT NOT NULL,
  agent_display_name TEXT,
  signal TEXT,
  confidence INTEGER,
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly Summaries
CREATE TABLE weekly_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_ending TIMESTAMPTZ,
  total_tickers INTEGER,
  total_analyses INTEGER,
  top_bullish JSONB,
  top_bearish JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT,
  title TEXT,
  message TEXT,
  type TEXT,
  aggregated_signal TEXT,
  aggregated_confidence INTEGER,
  bullish_count INTEGER,
  bearish_count INTEGER,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scuttlebutt Data
CREATE TABLE scuttlebutt_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT UNIQUE NOT NULL,
  company_name TEXT,
  timestamp TIMESTAMPTZ,
  total_posts INTEGER,
  avg_sentiment DECIMAL,
  sentiment_signal TEXT,
  wsb_mentions INTEGER,
  key_topics JSONB,
  top_posts JSONB,
  phil_fisher_insight TEXT
);
```

---

## 🔑 LLM Provider Seçenekleri

| Provider | Model | Avantaj |
|----------|-------|---------|
| `gemini` | Gemini 1.5 Flash | Hızlı, ucuz |
| `azure` | GPT-4o-mini | Güvenilir, enterprise |
| `zai` | GLM-4V Flash | Alternatif, Çince destek |

---

## 🚀 n8n'e Import

1. n8n Dashboard'a git
2. **Import** → **From File**
3. JSON dosyasını seç
4. **Credentials** bağla
5. **Environment variables** kontrol et
6. **Activate** et

---

## ⚠️ Önemli Notlar

1. **Timeout**: Supabase Edge Functions 60 saniye timeout var, aggregate 17 agent için yeterli olmalı
2. **Rate Limits**: FMP API 250 istek/gün (ücretsiz tier)
3. **Cold Start**: Edge Functions ilk çağrıda 1-2 sn gecikebilir
4. **Secrets**: Tüm API anahtarları Supabase'de ayarlanmalı:
   ```bash
   supabase secrets set GEMINI_API_KEY=xxx
   supabase secrets set FMP_API_KEY=xxx
   supabase secrets set FRED_API_KEY=xxx
   ```
