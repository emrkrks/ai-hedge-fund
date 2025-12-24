# 🚀 AI Hedge Fund - Eksik Özelliklerin Eklenmesi Yol Haritası

**Oluşturulma Tarihi:** 23 Aralık 2025

---

## 📋 Özet

Bu doküman, AI Hedge Fund sistemine eklenmesi gereken 5 temel özelliği ve bunların nasıl implemente edileceğini detaylı olarak açıklar:

1. **Macro Analiz** (FRED API) - Druckenmiller için
2. **13-F Cloning** (SEC API) - Pabrai için
3. **Scuttlebutt Data** (Alternative Data) - Fisher için
4. **Sektör Peer Comparison** (FMP API) - Tüm agent'lar için
5. **ESG Analizi** (ESG Enterprise API) - Modern yatırım için

---

## 1️⃣ Macro Analiz (FRED API)

### Hedef Agent: Stanley Druckenmiller

### Neden Gerekli?
Druckenmiller bir **macro trader**. Hisse seçimi kadar faiz oranları, dolar endeksi, yield curve gibi makroekonomik faktörler de önemli.

### Veri Kaynağı
**FRED (Federal Reserve Economic Data)**
- **URL:** https://fred.stlouisfed.org/
- **Maliyet:** ✅ **Tamamen Ücretsiz**
- **API Key:** https://fred.stlouisfed.org/docs/api/api_key.html

### Alınacak Veriler

| Series ID | Açıklama | Kullanım |
|-----------|----------|----------|
| `DFF` | Effective Federal Funds Rate | Fed faiz politikası |
| `DGS10` | 10-Year Treasury Yield | Uzun vadeli faiz |
| `DGS2` | 2-Year Treasury Yield | Kısa vadeli faiz |
| `T10Y2Y` | 10Y-2Y Spread (Yield Curve) | Resesyon tahmini |
| `DTWEXBGS` | Dollar Index | Dolar güçlülüğü |
| `VIXCLS` | VIX | Piyasa volatilitesi |
| `CPIAUCSL` | CPI (Inflation) | Enflasyon trendi |
| `UNRATE` | Unemployment Rate | İşsizlik oranı |

### Implementasyon

#### 1. Yeni dosya: `src/tools/macro_api.py`
```python
import os
import requests
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass

@dataclass
class MacroData:
    series_id: str
    value: float
    date: str
    change_1m: Optional[float] = None
    change_3m: Optional[float] = None

class FREDClient:
    BASE_URL = "https://api.stlouisfed.org/fred"
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("FRED_API_KEY")
        if not self.api_key:
            raise ValueError("FRED_API_KEY not found")
    
    def get_series(self, series_id: str, limit: int = 100) -> list[MacroData]:
        """Fetch a FRED series."""
        url = f"{self.BASE_URL}/series/observations"
        params = {
            "series_id": series_id,
            "api_key": self.api_key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": limit
        }
        response = requests.get(url, params=params)
        data = response.json()
        
        results = []
        for obs in data.get("observations", []):
            if obs["value"] != ".":
                results.append(MacroData(
                    series_id=series_id,
                    value=float(obs["value"]),
                    date=obs["date"]
                ))
        return results
    
    def get_yield_curve_status(self) -> dict:
        """Check if yield curve is inverted (recession signal)."""
        t10y = self.get_series("DGS10", 1)[0].value
        t2y = self.get_series("DGS2", 1)[0].value
        spread = t10y - t2y
        
        return {
            "spread": spread,
            "status": "inverted" if spread < 0 else "normal",
            "recession_signal": spread < 0,
            "10y_yield": t10y,
            "2y_yield": t2y
        }
    
    def get_macro_summary(self) -> dict:
        """Get complete macro environment summary."""
        fed_funds = self.get_series("DFF", 30)
        dollar_index = self.get_series("DTWEXBGS", 30)
        vix = self.get_series("VIXCLS", 30)
        
        return {
            "fed_funds_rate": {
                "current": fed_funds[0].value,
                "1m_ago": fed_funds[20].value if len(fed_funds) > 20 else None,
                "trend": "rising" if fed_funds[0].value > fed_funds[20].value else "falling"
            },
            "yield_curve": self.get_yield_curve_status(),
            "dollar_index": {
                "current": dollar_index[0].value,
                "trend": "strengthening" if dollar_index[0].value > dollar_index[20].value else "weakening"
            },
            "vix": {
                "current": vix[0].value,
                "status": "high_fear" if vix[0].value > 25 else "complacent" if vix[0].value < 15 else "normal"
            }
        }
```

#### 2. Agent entegrasyonu: `src/agents/stanley_druckenmiller.py`
```python
from src.tools.macro_api import FREDClient

def analyze_macro_environment(state: AgentState) -> dict:
    """Analyze macro conditions for Druckenmiller's framework."""
    try:
        fred = FREDClient()
        macro = fred.get_macro_summary()
        
        score = 0
        signals = []
        
        # Yield curve analysis
        if macro["yield_curve"]["recession_signal"]:
            score -= 2
            signals.append("Yield curve inverted - recession risk HIGH")
        else:
            score += 1
            signals.append("Yield curve normal - no immediate recession signal")
        
        # Fed policy
        if macro["fed_funds_rate"]["trend"] == "falling":
            score += 2  # Dovish Fed = bullish
            signals.append("Fed cutting rates - liquidity increasing")
        elif macro["fed_funds_rate"]["trend"] == "rising":
            score -= 1
            signals.append("Fed raising rates - liquidity tightening")
        
        # VIX
        if macro["vix"]["status"] == "high_fear":
            score += 1  # Contrarian: fear = opportunity
            signals.append("VIX elevated - potential buying opportunity (contrarian)")
        
        # Dollar
        if macro["dollar_index"]["trend"] == "strengthening":
            score -= 1
            signals.append("Strong dollar - headwind for multinational earnings")
        
        return {
            "score": max(min(score, 5), -5),  # Clamp to -5 to +5
            "signals": signals,
            "data": macro,
            "bias": "bullish" if score > 1 else "bearish" if score < -1 else "neutral"
        }
    except Exception as e:
        return {"score": 0, "signals": [f"Macro analysis unavailable: {e}"], "bias": "neutral"}
```

### .env Eklentisi
```
FRED_API_KEY=your_fred_api_key_here
```

---

## 2️⃣ 13-F Cloning (SEC API)

### Hedef Agent: Mohnish Pabrai

### Neden Gerekli?
Pabrai "cloning" stratejisiyle ünlü - başarılı yatırımcıların pozisyonlarını takip ediyor. 13-F formları bunu mümkün kılıyor.

### Veri Kaynağı
**SEC EDGAR 13-F API**
- **URL:** https://www.sec.gov/cgi-bin/browse-edgar
- **Maliyet:** ✅ **Tamamen Ücretsiz**
- **Alternatif:** forms13f.com (açık kaynak), sec-api.io (freemium)

### Takip Edilecek Superinvestors

| Yatırımcı | Fund | CIK |
|-----------|------|-----|
| Warren Buffett | Berkshire Hathaway | 0001067983 |
| Bill Ackman | Pershing Square | 0001336528 |
| David Tepper | Appaloosa Management | 0001006438 |
| Seth Klarman | Baupost Group | 0001061768 |
| Michael Burry | Scion Asset Management | 0001649339 |
| Li Lu | Himalaya Capital | 0001709323 |

### Implementasyon

#### 1. Yeni dosya: `src/tools/sec_13f_api.py`
```python
import os
import requests
from dataclasses import dataclass
from typing import Optional

@dataclass
class HoldingInfo:
    ticker: str
    shares: int
    value: float
    change_pct: Optional[float]
    is_new: bool
    is_increased: bool
    is_sold: bool

# Superinvestor CIK mapping
SUPERINVESTORS = {
    "warren_buffett": "0001067983",
    "bill_ackman": "0001336528",
    "david_tepper": "0001006438",
    "seth_klarman": "0001061768",
    "michael_burry": "0001649339",
    "li_lu": "0001709323",
    "mohnish_pabrai": "0001173334",  # Pabrai Investment Funds
}

class SEC13FClient:
    BASE_URL = "https://data.sec.gov"
    
    def __init__(self):
        self.headers = {
            "User-Agent": "AI-Hedge-Fund research@example.com",
            "Accept-Encoding": "gzip, deflate"
        }
    
    def get_latest_holdings(self, cik: str) -> list[HoldingInfo]:
        """Fetch latest 13F holdings for a fund."""
        # Get filing index
        url = f"{self.BASE_URL}/submissions/CIK{cik}.json"
        response = requests.get(url, headers=self.headers)
        data = response.json()
        
        # Find latest 13F filing
        filings = data.get("filings", {}).get("recent", {})
        forms = filings.get("form", [])
        accessions = filings.get("accessionNumber", [])
        
        for i, form in enumerate(forms):
            if form in ["13F-HR", "13F-HR/A"]:
                accession = accessions[i].replace("-", "")
                return self._parse_13f(cik, accession)
        
        return []
    
    def _parse_13f(self, cik: str, accession: str) -> list[HoldingInfo]:
        """Parse 13F XML/JSON filing."""
        # This would parse the actual filing
        # Simplified for example
        url = f"{self.BASE_URL}/Archives/edgar/data/{cik}/{accession}/primary_doc.xml"
        # Parse and return holdings
        pass
    
    def check_superinvestor_ownership(self, ticker: str) -> dict:
        """Check if any superinvestor owns this stock."""
        results = {}
        
        for name, cik in SUPERINVESTORS.items():
            try:
                holdings = self.get_latest_holdings(cik)
                for h in holdings:
                    if h.ticker.upper() == ticker.upper():
                        results[name] = {
                            "owns": True,
                            "shares": h.shares,
                            "value": h.value,
                            "is_new": h.is_new,
                            "is_increased": h.is_increased
                        }
            except Exception:
                continue
        
        return results
    
    def get_cloning_signal(self, ticker: str) -> dict:
        """Generate cloning-based signal."""
        ownership = self.check_superinvestor_ownership(ticker)
        
        owned_by = list(ownership.keys())
        new_positions = [name for name, data in ownership.items() if data.get("is_new")]
        increased = [name for name, data in ownership.items() if data.get("is_increased")]
        
        score = 0
        score += len(owned_by) * 2        # +2 per superinvestor
        score += len(new_positions) * 3   # +3 for new positions
        score += len(increased) * 1       # +1 for increased positions
        
        return {
            "score": min(score, 10),
            "owned_by": owned_by,
            "new_positions_by": new_positions,
            "increased_by": increased,
            "total_superinvestors": len(owned_by),
            "signal": "bullish" if score >= 5 else "neutral" if score >= 2 else "no_signal"
        }
```

#### 2. Agent entegrasyonu: `src/agents/mohnish_pabrai.py`
```python
from src.tools.sec_13f_api import SEC13FClient

def analyze_cloning_signals(ticker: str) -> dict:
    """Check if superinvestors own this stock (Pabrai's cloning strategy)."""
    try:
        client = SEC13FClient()
        cloning = client.get_cloning_signal(ticker)
        
        reasoning = []
        if cloning["owned_by"]:
            reasoning.append(f"Owned by {len(cloning['owned_by'])} superinvestors: {', '.join(cloning['owned_by'])}")
        if cloning["new_positions_by"]:
            reasoning.append(f"NEW positions by: {', '.join(cloning['new_positions_by'])} - strong bullish signal")
        if cloning["increased_by"]:
            reasoning.append(f"INCREASED positions by: {', '.join(cloning['increased_by'])}")
        
        return {
            "score": cloning["score"],
            "signal": cloning["signal"],
            "reasoning": reasoning,
            "data": cloning
        }
    except Exception as e:
        return {"score": 0, "signal": "unavailable", "reasoning": [str(e)]}
```

---

## 3️⃣ Scuttlebutt Data (Alternative Data)

### Hedef Agent: Phil Fisher

### Neden Gerekli?
Phil Fisher'ın "scuttlebutt" metodu rakiplerden, müşterilerden, çalışanlardan bilgi toplamayı içerir. Modern versiyonu alternative data.

### Veri Kaynakları

| Kaynak | Veri Tipi | API | Maliyet |
|--------|-----------|-----|---------|
| **Glassdoor** | Çalışan memnuniyeti | Scraping/Unofficial | Ücretsiz |
| **LinkedIn** | Çalışan büyümesi | Unofficial API | Ücretsiz |
| **Reddit** | Müşteri/Sektör sentiment | PRAW (Official) | Ücretsiz |
| **Twitter/X** | Sosyal sentiment | Official API | Freemium |
| **App Store Reviews** | Ürün kalitesi | Scraping | Ücretsiz |

### Implementasyon

#### 1. Yeni dosya: `src/tools/scuttlebutt_api.py`
```python
import praw
import os
from typing import Optional
from dataclasses import dataclass

@dataclass
class ScuttlebuttData:
    source: str
    sentiment_score: float  # -1 to +1
    key_topics: list[str]
    sample_comments: list[str]

class ScuttlebuttClient:
    def __init__(self):
        # Reddit API setup
        self.reddit = praw.Reddit(
            client_id=os.getenv("REDDIT_CLIENT_ID"),
            client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
            user_agent="AI-Hedge-Fund Scuttlebutt Analyzer"
        )
    
    def analyze_reddit_sentiment(self, ticker: str, company_name: str) -> ScuttlebuttData:
        """Analyze Reddit discussions about a company."""
        subreddits = ["wallstreetbets", "stocks", "investing", "stockmarket"]
        
        all_comments = []
        for sub in subreddits:
            try:
                subreddit = self.reddit.subreddit(sub)
                posts = subreddit.search(f"{ticker} OR {company_name}", limit=50, time_filter="month")
                
                for post in posts:
                    all_comments.append({
                        "title": post.title,
                        "score": post.score,
                        "upvote_ratio": post.upvote_ratio,
                        "num_comments": post.num_comments
                    })
            except Exception:
                continue
        
        if not all_comments:
            return ScuttlebuttData(
                source="reddit",
                sentiment_score=0,
                key_topics=[],
                sample_comments=[]
            )
        
        # Simple sentiment: upvote ratio weighted by score
        weighted_sentiment = sum(
            (c["upvote_ratio"] - 0.5) * 2 * c["score"] 
            for c in all_comments
        ) / max(sum(c["score"] for c in all_comments), 1)
        
        return ScuttlebuttData(
            source="reddit",
            sentiment_score=max(min(weighted_sentiment, 1), -1),
            key_topics=self._extract_topics([c["title"] for c in all_comments]),
            sample_comments=[c["title"] for c in sorted(all_comments, key=lambda x: x["score"], reverse=True)[:5]]
        )
    
    def _extract_topics(self, titles: list[str]) -> list[str]:
        """Extract common topics from titles."""
        # Simple keyword extraction
        keywords = {}
        for title in titles:
            words = title.lower().split()
            for word in words:
                if len(word) > 4:
                    keywords[word] = keywords.get(word, 0) + 1
        
        return [k for k, v in sorted(keywords.items(), key=lambda x: x[1], reverse=True)[:10]]
    
    def get_employee_sentiment(self, company_name: str) -> dict:
        """Analyze employee sentiment (would need Glassdoor scraping or API)."""
        # Placeholder - would integrate with Glassdoor data
        return {
            "rating": None,
            "recommend_pct": None,
            "ceo_approval": None,
            "available": False
        }
    
    def get_full_scuttlebutt(self, ticker: str, company_name: str) -> dict:
        """Complete scuttlebutt analysis."""
        reddit = self.analyze_reddit_sentiment(ticker, company_name)
        employee = self.get_employee_sentiment(company_name)
        
        combined_score = reddit.sentiment_score
        
        return {
            "reddit": {
                "sentiment": reddit.sentiment_score,
                "topics": reddit.key_topics,
                "sample_posts": reddit.sample_comments
            },
            "employee": employee,
            "combined_score": combined_score,
            "signal": "bullish" if combined_score > 0.2 else "bearish" if combined_score < -0.2 else "neutral"
        }
```

### .env Eklentisi
```
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
```

---

## 4️⃣ Sektör Peer Comparison (FMP API)

### Hedef: Tüm Agent'lar

### Neden Gerekli?
Bir şirketi değerlendirirken sektör ortalamasıyla karşılaştırmak çok önemli. P/E = 30 bazı sektörlerde ucuz, bazılarında pahalı.

### Veri Kaynağı
**Financial Modeling Prep (FMP)**
- **URL:** https://financialmodelingprep.com/
- **Maliyet:** Freemium (250 calls/day ücretsiz)
- **Özellik:** Peer comparison endpoint var

### Implementasyon

#### 1. Yeni dosya: `src/tools/peer_comparison_api.py`
```python
import os
import requests
from dataclasses import dataclass
from typing import Optional

@dataclass
class PeerMetrics:
    ticker: str
    pe_ratio: Optional[float]
    pb_ratio: Optional[float]
    ps_ratio: Optional[float]
    roe: Optional[float]
    profit_margin: Optional[float]
    debt_to_equity: Optional[float]

class PeerComparisonClient:
    BASE_URL = "https://financialmodelingprep.com/api/v4"
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("FMP_API_KEY")
    
    def get_peers(self, ticker: str) -> list[str]:
        """Get peer companies for a ticker."""
        url = f"{self.BASE_URL}/stock_peers"
        params = {"symbol": ticker, "apikey": self.api_key}
        
        response = requests.get(url, params=params)
        data = response.json()
        
        if data and len(data) > 0:
            return data[0].get("peersList", [])
        return []
    
    def get_key_metrics(self, ticker: str) -> PeerMetrics:
        """Get key financial metrics for a ticker."""
        url = f"https://financialmodelingprep.com/api/v3/ratios-ttm/{ticker}"
        params = {"apikey": self.api_key}
        
        response = requests.get(url, params=params)
        data = response.json()
        
        if data and len(data) > 0:
            d = data[0]
            return PeerMetrics(
                ticker=ticker,
                pe_ratio=d.get("peRatioTTM"),
                pb_ratio=d.get("priceToBookRatioTTM"),
                ps_ratio=d.get("priceToSalesRatioTTM"),
                roe=d.get("returnOnEquityTTM"),
                profit_margin=d.get("netProfitMarginTTM"),
                debt_to_equity=d.get("debtEquityRatioTTM")
            )
        return PeerMetrics(ticker=ticker, pe_ratio=None, pb_ratio=None, ps_ratio=None, roe=None, profit_margin=None, debt_to_equity=None)
    
    def compare_to_peers(self, ticker: str) -> dict:
        """Compare a company to its sector peers."""
        peers = self.get_peers(ticker)
        if not peers:
            return {"available": False, "reason": "No peers found"}
        
        # Get metrics for target and peers
        target = self.get_key_metrics(ticker)
        peer_metrics = [self.get_key_metrics(p) for p in peers[:10]]
        
        # Calculate sector medians
        def median(values):
            values = [v for v in values if v is not None]
            if not values:
                return None
            sorted_v = sorted(values)
            n = len(sorted_v)
            return sorted_v[n // 2] if n % 2 else (sorted_v[n//2 - 1] + sorted_v[n//2]) / 2
        
        sector_medians = {
            "pe_ratio": median([p.pe_ratio for p in peer_metrics]),
            "pb_ratio": median([p.pb_ratio for p in peer_metrics]),
            "roe": median([p.roe for p in peer_metrics]),
            "profit_margin": median([p.profit_margin for p in peer_metrics]),
            "debt_to_equity": median([p.debt_to_equity for p in peer_metrics])
        }
        
        # Compare
        comparisons = {}
        
        if target.pe_ratio and sector_medians["pe_ratio"]:
            ratio = target.pe_ratio / sector_medians["pe_ratio"]
            comparisons["pe_ratio"] = {
                "target": target.pe_ratio,
                "sector_median": sector_medians["pe_ratio"],
                "vs_sector": f"{(ratio - 1) * 100:.1f}%",
                "status": "cheap" if ratio < 0.8 else "expensive" if ratio > 1.2 else "inline"
            }
        
        if target.roe and sector_medians["roe"]:
            comparisons["roe"] = {
                "target": target.roe,
                "sector_median": sector_medians["roe"],
                "status": "above_average" if target.roe > sector_medians["roe"] else "below_average"
            }
        
        # Overall signal
        cheap_metrics = sum(1 for c in comparisons.values() if c.get("status") in ["cheap", "above_average"])
        expensive_metrics = sum(1 for c in comparisons.values() if c.get("status") in ["expensive", "below_average"])
        
        return {
            "available": True,
            "peers": peers[:10],
            "comparisons": comparisons,
            "sector_medians": sector_medians,
            "signal": "bullish" if cheap_metrics > expensive_metrics else "bearish" if expensive_metrics > cheap_metrics else "neutral",
            "summary": f"Target is {'undervalued' if cheap_metrics > expensive_metrics else 'overvalued' if expensive_metrics > cheap_metrics else 'fairly valued'} vs {len(peers)} sector peers"
        }
```

### .env Eklentisi
```
FMP_API_KEY=your_fmp_api_key_here
```

---

## 5️⃣ ESG Analizi

### Hedef: Yeni Agent (ESG Agent) + Tüm Agent'lara Bilgi

### Neden Gerekli?
Modern yatırımcılar ESG faktörlerini dikkate alıyor. Ayrıca ESG riskleri uzun vadeli değeri etkileyebilir.

### Veri Kaynağı
**ESG Enterprise (RapidAPI)**
- **URL:** https://rapidapi.com/esg-enterprise/api/esg-environmental-social-governance-data
- **Maliyet:** Freemium (500 calls/month ücretsiz)

**Alternatif:** Financial Modeling Prep ESG API (freemium)

### Implementasyon

#### 1. Yeni dosya: `src/tools/esg_api.py`
```python
import os
import requests
from dataclasses import dataclass
from typing import Optional

@dataclass
class ESGRating:
    ticker: str
    environmental_score: Optional[float]
    social_score: Optional[float]
    governance_score: Optional[float]
    total_score: Optional[float]
    controversy_level: Optional[str]
    industry_rank: Optional[int]

class ESGClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("ESG_API_KEY")
        # Using FMP as primary source
        self.base_url = "https://financialmodelingprep.com/api/v4"
    
    def get_esg_rating(self, ticker: str) -> ESGRating:
        """Get ESG rating for a company."""
        url = f"{self.base_url}/esg-environmental-social-governance-data"
        params = {"symbol": ticker, "apikey": self.api_key}
        
        response = requests.get(url, params=params)
        data = response.json()
        
        if data and len(data) > 0:
            d = data[0]
            return ESGRating(
                ticker=ticker,
                environmental_score=d.get("environmentalScore"),
                social_score=d.get("socialScore"),
                governance_score=d.get("governanceScore"),
                total_score=d.get("ESGScore"),
                controversy_level=d.get("controversyLevel"),
                industry_rank=d.get("ESGRank")
            )
        
        return ESGRating(
            ticker=ticker,
            environmental_score=None,
            social_score=None,
            governance_score=None,
            total_score=None,
            controversy_level=None,
            industry_rank=None
        )
    
    def analyze_esg_risks(self, ticker: str) -> dict:
        """Analyze ESG-related risks and opportunities."""
        rating = self.get_esg_rating(ticker)
        
        risks = []
        opportunities = []
        
        if rating.environmental_score:
            if rating.environmental_score < 30:
                risks.append("High environmental risk - potential regulatory/legal issues")
            elif rating.environmental_score > 70:
                opportunities.append("Strong environmental practices - attractive to ESG funds")
        
        if rating.social_score:
            if rating.social_score < 30:
                risks.append("Poor social metrics - labor/community issues possible")
            elif rating.social_score > 70:
                opportunities.append("Strong social practices - positive brand impact")
        
        if rating.governance_score:
            if rating.governance_score < 30:
                risks.append("Weak governance - management/board concerns")
            elif rating.governance_score > 70:
                opportunities.append("Strong governance - aligned management incentives")
        
        if rating.controversy_level:
            if rating.controversy_level in ["High", "Severe"]:
                risks.append(f"Active controversy: {rating.controversy_level}")
        
        # Score calculation
        if rating.total_score:
            score = (rating.total_score - 50) / 10  # Normalize to -5 to +5
        else:
            score = 0
        
        return {
            "rating": {
                "environmental": rating.environmental_score,
                "social": rating.social_score,
                "governance": rating.governance_score,
                "total": rating.total_score,
                "industry_rank": rating.industry_rank
            },
            "controversy": rating.controversy_level,
            "risks": risks,
            "opportunities": opportunities,
            "score": max(min(score, 5), -5),
            "signal": "bullish" if score > 1 else "bearish" if score < -1 else "neutral",
            "summary": f"ESG Score: {rating.total_score or 'N/A'}/100 - {len(risks)} risks, {len(opportunities)} opportunities identified"
        }
```

#### 2. Yeni Agent: `src/agents/esg_agent.py`
```python
from src.graph.state import AgentState
from src.tools.esg_api import ESGClient
from langchain_core.messages import HumanMessage
import json

def esg_analyst_agent(state: AgentState, agent_id: str = "esg_analyst_agent"):
    """Analyzes ESG factors for investment decisions."""
    data = state["data"]
    tickers = data["tickers"]
    
    esg_analysis = {}
    client = ESGClient()
    
    for ticker in tickers:
        try:
            analysis = client.analyze_esg_risks(ticker)
            esg_analysis[ticker] = {
                "signal": analysis["signal"],
                "confidence": min(abs(analysis["score"]) * 20, 100),
                "reasoning": analysis
            }
        except Exception as e:
            esg_analysis[ticker] = {
                "signal": "neutral",
                "confidence": 0,
                "reasoning": {"error": str(e)}
            }
    
    message = HumanMessage(content=json.dumps(esg_analysis), name=agent_id)
    state["data"]["analyst_signals"][agent_id] = esg_analysis
    
    return {"messages": [message], "data": data}
```

---

## 📊 Entegrasyon Özeti

### .env Dosyası Güncellemesi
```bash
# Macro Analysis (FRED)
FRED_API_KEY=your_fred_api_key

# Peer Comparison + ESG (Financial Modeling Prep)
FMP_API_KEY=your_fmp_api_key

# Scuttlebutt (Reddit)
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret

# 13-F (SEC - no key needed, just user-agent)
```

### API Maliyet Özeti

| Özellik | API | Ücretsiz Limit | Aylık Maliyet |
|---------|-----|----------------|---------------|
| Macro | FRED | Sınırsız | **$0** |
| 13-F | SEC EDGAR | Sınırsız | **$0** |
| Scuttlebutt | Reddit PRAW | 60 req/min | **$0** |
| Peer Comparison | FMP | 250 req/day | **$0** (freemium) |
| ESG | FMP | 250 req/day | **$0** (freemium) |

**Toplam Eklenen Maliyet: $0/ay** (Freemium tier içinde)

---

## 🗓️ Implementasyon Zaman Çizelgesi

### Hafta 1: Macro Analiz
- [ ] FRED API key al
- [ ] `macro_api.py` oluştur
- [ ] `stanley_druckenmiller.py` entegrasyonu
- [ ] Test

### Hafta 2: 13-F Cloning
- [ ] `sec_13f_api.py` oluştur
- [ ] Superinvestor listesi tamamla
- [ ] `mohnish_pabrai.py` entegrasyonu
- [ ] Test

### Hafta 3: Peer Comparison + ESG
- [ ] FMP API key al
- [ ] `peer_comparison_api.py` oluştur
- [ ] `esg_api.py` oluştur
- [ ] ESG Agent oluştur
- [ ] Tüm agent'lara peer data entegre
- [ ] Test

### Hafta 4: Scuttlebutt
- [ ] Reddit API credentials al
- [ ] `scuttlebutt_api.py` oluştur
- [ ] `phil_fisher.py` entegrasyonu
- [ ] Test
- [ ] Glassdoor/LinkedIn için alternatif araştır

---

## ✅ Sonuç

Bu 5 özelliğin eklenmesiyle sistem:

1. **Macro-aware** olacak (Druckenmiller)
2. **Superinvestor signals** kullanacak (Pabrai)
3. **Alternative data** entegre edecek (Fisher)
4. **Relative valuation** yapabilecek (Tüm agent'lar)
5. **ESG risk assessment** sunacak (Modern yatırım)

Tüm API'ler ücretsiz tier içinde kullanılabilir. Toplam ek maliyet: **$0/ay**

---

**Son Güncelleme:** 23 Aralık 2025
