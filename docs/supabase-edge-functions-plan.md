# 🚀 AI Hedge Fund - Supabase Edge Functions Planı

## 📋 Genel Bakış

Bu plan, AI Hedge Fund projesindeki tüm agent'ları Supabase Edge Functions olarak yeniden oluşturmayı kapsar.

---

## 🎯 Hedef

- Tüm 17 agent'ı Supabase Edge Functions olarak port et
- n8n workflow'larından bu fonksiyonları çağır
- Python mantığını TypeScript/Deno'ya taşı
- Orijinal prompt'ları koru

---

## 📊 Agent Listesi (17 Adet)

### 🧑‍💼 Persona Agent'ları (12 Adet)

| # | Agent Key | Display Name | Yatırım Stili |
|---|-----------|--------------|---------------|
| 1 | `aswath_damodaran` | Aswath Damodaran | Intrinsik değer, DCF analizi |
| 2 | `ben_graham` | Ben Graham | Güvenlik marjı, değer yatırımı |
| 3 | `bill_ackman` | Bill Ackman | Aktivist yatırım, contrarian |
| 4 | `cathie_wood` | Cathie Wood | Disruptive inovasyon, büyüme |
| 5 | `charlie_munger` | Charlie Munger | Kaliteli işletmeler, rasyonel düşünce |
| 6 | `michael_burry` | Michael Burry | Contrarian, derin değer analizi |
| 7 | `mohnish_pabrai` | Mohnish Pabrai | Dhandho yatırım, güvenlik marjı |
| 8 | `peter_lynch` | Peter Lynch | 10-bagger, PEG oranı |
| 9 | `phil_fisher` | Phil Fisher | Scuttlebutt, yönetim kalitesi |
| 10 | `rakesh_jhunjhunwala` | Rakesh Jhunjhunwala | Makro, büyüyen pazarlar |
| 11 | `stanley_druckenmiller` | Stanley Druckenmiller | Makro trendler, para/faiz |
| 12 | `warren_buffett` | Warren Buffett | Rekabetçi avantaj, uzun vade |

### 📈 Teknik/Temel Agent'ları (5 Adet)

| # | Agent Key | Display Name | Analiz Tipi |
|---|-----------|--------------|-------------|
| 13 | `technical_analyst` | Technical Analyst | Grafik, teknik göstergeler |
| 14 | `fundamentals_analyst` | Fundamentals Analyst | Mali tablolar, oranlar |
| 15 | `growth_analyst` | Growth Analyst | Büyüme trendleri |
| 16 | `news_sentiment_analyst` | News Sentiment | Haber duyarlılığı |
| 17 | `sentiment_analyst` | Sentiment Analyst | Piyasa duyarlılığı |

---

## 🏗️ Edge Function Yapısı

```
supabase/
└── functions/
    ├── _shared/                     # Paylaşılan kodlar
    │   ├── llm-client.ts           # LLM API istemcileri
    │   ├── financial-api.ts        # FMP, FRED API istemcileri
    │   ├── types.ts                # TypeScript tipleri
    │   └── prompts.ts              # Tüm agent prompt'ları
    │
    ├── analyze-warren-buffett/
    │   └── index.ts
    ├── analyze-peter-lynch/
    │   └── index.ts
    ├── analyze-ben-graham/
    │   └── index.ts
    ├── analyze-charlie-munger/
    │   └── index.ts
    ├── analyze-michael-burry/
    │   └── index.ts
    ├── analyze-cathie-wood/
    │   └── index.ts
    ├── analyze-bill-ackman/
    │   └── index.ts
    ├── analyze-stanley-druckenmiller/
    │   └── index.ts
    ├── analyze-phil-fisher/
    │   └── index.ts
    ├── analyze-mohnish-pabrai/
    │   └── index.ts
    ├── analyze-rakesh-jhunjhunwala/
    │   └── index.ts
    ├── analyze-aswath-damodaran/
    │   └── index.ts
    ├── analyze-technical/
    │   └── index.ts
    ├── analyze-fundamentals/
    │   └── index.ts
    ├── analyze-growth/
    │   └── index.ts
    ├── analyze-news-sentiment/
    │   └── index.ts
    ├── analyze-sentiment/
    │   └── index.ts
    └── analyze-aggregate/           # Tüm sonuçları birleştirir
        └── index.ts
```

---

## 📝 Her Edge Function'ın Yapısı

```typescript
// supabase/functions/analyze-{agent}/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { getFinancialData } from "../_shared/financial-api.ts"
import { callLLM } from "../_shared/llm-client.ts"
import { PROMPTS } from "../_shared/prompts.ts"

interface AnalyzeRequest {
  ticker: string
  company_name?: string
  end_date?: string
  llm_provider: "azure" | "gemini" | "zai"
}

interface AnalysisResult {
  ticker: string
  agent: string
  signal: "BULLISH" | "BEARISH" | "NEUTRAL"
  confidence: number
  reasoning: string
  timestamp: string
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { ticker, company_name, end_date, llm_provider } = await req.json()
    
    // 1. Finansal veri çek
    const financialData = await getFinancialData(ticker, end_date)
    
    // 2. Agent-specific analiz yap
    const analysisContext = buildAnalysisContext(financialData)
    
    // 3. LLM'e gönder
    const result = await callLLM({
      provider: llm_provider,
      systemPrompt: PROMPTS.WARREN_BUFFETT.system,
      userPrompt: PROMPTS.WARREN_BUFFETT.user(ticker, analysisContext),
    })
    
    // 4. Sonucu döndür
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
```

---

## 🔑 Gerekli API Anahtarları (Supabase Secrets)

```bash
# Supabase'de ayarlanacak secrets
supabase secrets set AZURE_OPENAI_API_KEY=xxx
supabase secrets set AZURE_OPENAI_ENDPOINT=xxx
supabase secrets set GEMINI_API_KEY=xxx
supabase secrets set ZAI_API_KEY=xxx
supabase secrets set FMP_API_KEY=xxx
supabase secrets set FRED_API_KEY=xxx
```

---

## 📅 Uygulama Sırası

### Faz 1: Altyapı (Bu dosyalar önce)
1. `_shared/cors.ts` - CORS ayarları
2. `_shared/types.ts` - TypeScript tipleri
3. `_shared/llm-client.ts` - LLM API istemcileri (Azure, Gemini, Z.ai)
4. `_shared/financial-api.ts` - Finansal veri API'leri
5. `_shared/prompts.ts` - Tüm agent prompt'ları (Python'dan alınacak)

### Faz 2: Agent Edge Functions (Sırayla)
1. `analyze-warren-buffett/` - Test için ilk
2. `analyze-ben-graham/`
3. `analyze-peter-lynch/`
4. `analyze-charlie-munger/`
5. `analyze-michael-burry/`
6. `analyze-cathie-wood/`
7. `analyze-bill-ackman/`
8. `analyze-stanley-druckenmiller/`
9. `analyze-phil-fisher/`
10. `analyze-mohnish-pabrai/`
11. `analyze-rakesh-jhunjhunwala/`
12. `analyze-aswath-damodaran/`
13. `analyze-technical/`
14. `analyze-fundamentals/`
15. `analyze-growth/`
16. `analyze-news-sentiment/`
17. `analyze-sentiment/`

### Faz 3: Agregasyon ve n8n
1. `analyze-aggregate/` - Tüm sonuçları birleştirir
2. n8n workflow güncellemesi

---

## 📞 n8n'den Çağrı Örneği

```javascript
// n8n HTTP Request Node
{
  "method": "POST",
  "url": "https://YOUR-PROJECT.supabase.co/functions/v1/analyze-warren-buffett",
  "headers": {
    "Authorization": "Bearer {{ $env.SUPABASE_ANON_KEY }}",
    "Content-Type": "application/json"
  },
  "body": {
    "ticker": "AAPL",
    "company_name": "Apple Inc.",
    "end_date": "2025-12-23",
    "llm_provider": "gemini"
  }
}
```

---

## ✅ Başarı Kriterleri

- [ ] Tüm 17 agent Edge Function olarak çalışıyor
- [ ] Her agent orijinal prompt'u kullanıyor
- [ ] Finansal veri API'leri çalışıyor (FMP, FRED)
- [ ] 3 LLM provider destekleniyor (Azure, Gemini, Z.ai)
- [ ] n8n workflow'u Edge Functions'ı başarılı çağırıyor
- [ ] Sonuçlar Supabase DB'ye kaydediliyor

---

## 📌 Notlar

1. **Python → TypeScript**: Bazı hesaplamalar (ROE, DCF) sadeleştirilecek, LLM'e daha fazla iş yüklenecek
2. **Rate Limiting**: FMP API ücretsiz tier'da 250 istek/gün limiti var
3. **Cold Start**: Edge Functions ilk çağrıda yavaş olabilir (~1-2 sn)
4. **Timeout**: Supabase Edge Functions max 60 saniye timeout

---

## 🚀 Başlangıç

Plan hazır. Şimdi Faz 1'den başlayarak kod yazılacak.
