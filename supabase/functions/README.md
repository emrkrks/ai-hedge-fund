# Supabase Edge Functions - AI Hedge Fund

Bu klasör, AI Hedge Fund projesinin 17 AI yatırımcı agent'ını Supabase Edge Functions olarak içerir.

## 📁 Yapı

```
functions/
├── _shared/                    # Paylaşılan modüller
│   ├── types.ts               # TypeScript tipleri
│   ├── cors.ts                # CORS ayarları
│   ├── llm-client.ts          # LLM API istemcileri
│   ├── financial-api.ts       # FMP/FRED API
│   ├── prompts.ts             # Agent prompt'ları
│   └── agent-handler.ts       # Generic handler
│
├── analyze-warren-buffett/    # Warren Buffett Agent
├── analyze-peter-lynch/       # Peter Lynch Agent
├── analyze-ben-graham/        # Ben Graham Agent
├── analyze-charlie-munger/    # Charlie Munger Agent
├── analyze-michael-burry/     # Michael Burry Agent
├── analyze-cathie-wood/       # Cathie Wood Agent
├── analyze-bill-ackman/       # Bill Ackman Agent
├── analyze-stanley-druckenmiller/
├── analyze-phil-fisher/       # Phil Fisher Agent
├── analyze-mohnish-pabrai/    # Mohnish Pabrai Agent
├── analyze-rakesh-jhunjhunwala/
├── analyze-aswath-damodaran/  # Aswath Damodaran Agent
├── analyze-technical/         # Technical Analyst
├── analyze-fundamentals/      # Fundamentals Analyst
├── analyze-growth/            # Growth Analyst
├── analyze-news-sentiment/    # News Sentiment Analyst
├── analyze-sentiment/         # Sentiment Analyst
└── analyze-aggregate/         # Aggregates all agents
```

## 🚀 Deployment

### 1. Secrets Ayarla (Supabase Dashboard'da Settings > Edge Functions > Secrets)

```bash
# FinancialDatasets.ai API (Orijinal Python projesindekiyle aynı)
supabase secrets set FINANCIAL_DATASETS_API_KEY=your_financial_datasets_key

# LLM Providers (4 adet - Consensus Mode için hepsi gerekli)
supabase secrets set GEMINI_API_KEY=your_gemini_key
supabase secrets set AZURE_OPENAI_API_KEY=your_azure_key
supabase secrets set AZURE_OPENAI_ENDPOINT=https://xxx.openai.azure.com
supabase secrets set ZAI_API_KEY=your_zai_key
supabase secrets set GROQ_API_KEY=your_groq_key

# Opsiyonel (Macro data için)
supabase secrets set FRED_API_KEY=your_fred_key
```

### 2. Deploy Et

```bash
# Tüm fonksiyonları deploy et
supabase functions deploy

# Veya tek tek
supabase functions deploy analyze-warren-buffett
supabase functions deploy analyze-aggregate
```

## 📞 Kullanım

### Tek Agent Çağrısı

```bash
curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/analyze-warren-buffett \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "llm_provider": "gemini"}'
```

### Tüm Agent'ları Çağır (Aggregate)

```bash
curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/analyze-aggregate \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "llm_provider": "gemini",
    "agents": ["warren_buffett", "peter_lynch", "ben_graham"]
  }'
```

## 📊 Response Format

```json
{
  "ticker": "AAPL",
  "agent": "warren_buffett",
  "agent_display_name": "Warren Buffett",
  "signal": "BULLISH",
  "confidence": 78,
  "reasoning": "Strong moat with consistent 20%+ ROE...",
  "timestamp": "2025-12-23T09:00:00.000Z",
  "analysis_data": {
    "roe": 0.25,
    "debt_to_equity": 0.45,
    "moat_score": 3,
    ...
  }
}
```

## 🔑 LLM Providers (Multi-LLM Consensus Mode)

| Provider | Environment Variable | Model |
|----------|---------------------|-------|
| Azure OpenAI | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT` | GPT-4o-mini |
| Google Gemini | `GEMINI_API_KEY` | gemini-2.0-flash-lite |
| Z.ai (GLM) | `ZAI_API_KEY` | glm-4v-flash |
| Groq | `GROQ_API_KEY` | llama-3.3-70b-versatile |

### 🗳️ Consensus Mode

Her agent 4 LLM'den aynı anda yanıt alıp çoğunluk oylamasıyla karar verir:

```json
{
  "ticker": "AAPL",
  "use_consensus": true,
  "agents": ["warren_buffett", "peter_lynch"]
}
```

Sonuç:
- 4 LLM paralel çağrılır (Azure, Gemini, Z.ai, Groq)
- Her biri bağımsız analiz yapar
- Çoğunluk oyu final sinyali belirler
- Güven skoru konsensüs gücüne göre ayarlanır

## ⚙️ Local Development

```bash
# Deno'yu yükle
curl -fsSL https://deno.land/install.sh | sh

# Local olarak çalıştır
supabase functions serve analyze-warren-buffett --env-file .env.local
```

## 📝 Notes

- Edge Functions 60 saniye timeout
- Deno runtime kullanır
- Her agent bireysel çağrılabilir veya aggregate ile toplu çağrılabilir
- Consensus mode daha yavaş ama daha güvenilir sonuç verir
