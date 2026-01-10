import datetime
import os
import pandas as pd
import requests
import time
from typing import Optional

from src.data.cache import get_cache
from src.data.models import (
    CompanyNews,
    CompanyNewsResponse,
    FinancialMetrics,
    FinancialMetricsResponse,
    Price,
    PriceResponse,
    LineItem,
    LineItemResponse,
    InsiderTrade,
    InsiderTradeResponse,
    CompanyFactsResponse,
)

# Global cache instance
_cache = get_cache()

# ============= FINNHUB API KEY ROTATION =============

# Finnhub API keys for rate limit bypass (60 req/min per key = 180 req/min total)
FINNHUB_KEYS = [
    os.environ.get("FINNHUB_API_KEY_1", "d5ds64pr01qjucj3o7qgd5ds64pr01qjucj3o7r0"),
    os.environ.get("FINNHUB_API_KEY_2", "d5gpdbhr01qll3djrib0d5gpdbhr01qll3djribg"),
    os.environ.get("FINNHUB_API_KEY_3", "d5gpet9r01qll3djrshgd5gpet9r01qll3djrsi0"),
]

# Round-robin key index (thread-safe via GIL for simple operations)
_finnhub_key_index = 0


def _get_next_finnhub_key() -> str:
    """Get next Finnhub API key using round-robin rotation."""
    global _finnhub_key_index
    key = FINNHUB_KEYS[_finnhub_key_index % len(FINNHUB_KEYS)]
    _finnhub_key_index += 1
    return key


def _finnhub_request(endpoint: str, params: dict = None, max_retries: int = 3) -> dict | None:
    """
    Make a Finnhub API request with key rotation and retry logic.
    
    Args:
        endpoint: API endpoint (e.g., "quote", "stock/metric", "stock/profile2")
        params: Query parameters (token will be added automatically)
        max_retries: Max retries across all keys
    
    Returns:
        JSON response or None on failure
    """
    if params is None:
        params = {}
    
    base_url = "https://finnhub.io/api/v1"
    keys_tried = set()
    
    for attempt in range(max_retries * len(FINNHUB_KEYS)):
        key = _get_next_finnhub_key()
        params["token"] = key
        
        try:
            url = f"{base_url}/{endpoint}"
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                # Check for error responses
                if isinstance(data, dict) and data.get("error"):
                    print(f"Finnhub error: {data.get('error')}")
                    return None
                return data
            
            elif response.status_code == 429:
                # Rate limited on this key, try next
                keys_tried.add(key)
                if len(keys_tried) >= len(FINNHUB_KEYS):
                    # All keys exhausted, wait and reset
                    print("Finnhub: All keys rate limited. Waiting 5s...")
                    time.sleep(5)
                    keys_tried.clear()
                continue
            
            elif response.status_code == 403:
                print(f"Finnhub: API key invalid or forbidden")
                return None
            
            else:
                print(f"Finnhub error: HTTP {response.status_code}")
                return None
                
        except requests.exceptions.Timeout:
            print(f"Finnhub timeout on attempt {attempt + 1}")
            continue
        except Exception as e:
            print(f"Finnhub request error: {e}")
            return None
    
    return None


# ============= FALLBACK PROVIDER FUNCTIONS =============

YAHOO_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def _get_financial_metrics_finnhub(
    ticker: str,
    end_date: str,
    period: str = "ttm",
    limit: int = 10,
) -> list[FinancialMetrics]:
    """
    Fetch financial metrics from Finnhub API + FMP supplement for missing metrics.
    Uses /stock/metric endpoint for comprehensive fundamental data.
    Works for ALL US symbols (unlike FMP which limits to ~87 symbols on free tier).
    
    NOTE: FMP has a 250 TOTAL request limit (not per day!), so we:
    1. Only call FMP if Finnhub is missing critical metrics (PEG, ROIC, etc.)
    2. Cache FMP responses aggressively
    3. Make FMP calls optional - Finnhub alone is sufficient for most analysis
    """
    try:
        # Get basic metrics from Finnhub
        metrics_data = _finnhub_request("stock/metric", {"symbol": ticker, "metric": "all"})
        if not metrics_data:
            return []
        
        metric = metrics_data.get("metric", {})
        if not metric:
            return []
        
        # Get company profile for market cap
        profile_data = _finnhub_request("stock/profile2", {"symbol": ticker})
        market_cap = profile_data.get("marketCapitalization", 0) * 1_000_000 if profile_data else None
        currency = profile_data.get("currency", "USD") if profile_data else "USD"
        
        # FMP supplement is OPTIONAL - only use if we have API key and critical metrics are missing
        # FMP has 250 TOTAL requests limit, so we're conservative
        fmp_ratios = {}
        fmp_keymetrics = {}
        fmp_api_key = os.environ.get("FMP_API_KEY")
        
        # Check if critical metrics are missing from Finnhub
        needs_fmp = (
            fmp_api_key and 
            (metric.get("pegRatio") is None or 
             metric.get("roicTTM") is None or 
             metric.get("freeCashFlowPerShareTTM") is None)
        )
        
        if needs_fmp:
            # Check cache first for FMP data
            fmp_cache_key = f"fmp_supplement_{ticker}"
            cached_fmp = _cache.get_financial_metrics(fmp_cache_key)
            
            if cached_fmp:
                # Use cached FMP data
                fmp_ratios = cached_fmp[0].get("ratios", {}) if cached_fmp else {}
                fmp_keymetrics = cached_fmp[0].get("keymetrics", {}) if cached_fmp else {}
            else:
                try:
                    # FMP ratios for PEG, Cash Ratio, FCF/Share
                    ratios_url = f"https://financialmodelingprep.com/stable/ratios?symbol={ticker}&apikey={fmp_api_key}"
                    ratios_resp = requests.get(ratios_url, timeout=5)
                    if ratios_resp.status_code == 200:
                        data = ratios_resp.json()
                        if isinstance(data, list) and len(data) > 0:
                            fmp_ratios = data[0]
                    
                    # FMP key-metrics for ROIC
                    km_url = f"https://financialmodelingprep.com/stable/key-metrics?symbol={ticker}&apikey={fmp_api_key}"
                    km_resp = requests.get(km_url, timeout=5)
                    if km_resp.status_code == 200:
                        data = km_resp.json()
                        if isinstance(data, list) and len(data) > 0:
                            fmp_keymetrics = data[0]
                    
                    # Cache FMP data for 24 hours to preserve API quota
                    if fmp_ratios or fmp_keymetrics:
                        _cache.set_financial_metrics(fmp_cache_key, [{"ratios": fmp_ratios, "keymetrics": fmp_keymetrics}])
                except:
                    pass  # FMP supplement failed, continue with Finnhub data only
        
        # Map Finnhub fields to FinancialMetrics, with FMP fallback for missing values
        metrics = FinancialMetrics(
            ticker=ticker,
            report_period=end_date,
            period=period,
            currency=currency,
            
            # Valuation
            market_cap=market_cap,
            enterprise_value=metric.get("enterpriseValue"),
            price_to_earnings_ratio=metric.get("peNormalizedAnnual") or metric.get("peTTM"),
            price_to_book_ratio=metric.get("pbQuarterly") or metric.get("pbAnnual"),
            price_to_sales_ratio=metric.get("psTTM") or metric.get("psAnnual"),
            enterprise_value_to_ebitda_ratio=metric.get("currentEv/freeCashFlowTTM"),
            enterprise_value_to_revenue_ratio=fmp_keymetrics.get("evToSales"),
            free_cash_flow_yield=metric.get("freeCashFlowYieldTTM") or fmp_keymetrics.get("freeCashFlowYield"),
            peg_ratio=metric.get("pegRatio") or fmp_ratios.get("priceToEarningsGrowthRatio"),
            
            # Profitability
            gross_margin=metric.get("grossMarginTTM") or fmp_ratios.get("grossProfitMargin"),
            operating_margin=metric.get("operatingMarginTTM") or fmp_ratios.get("operatingProfitMargin"),
            net_margin=metric.get("netProfitMarginTTM") or fmp_ratios.get("netProfitMargin"),
            return_on_equity=metric.get("roeTTM") or metric.get("roeRfy") or fmp_keymetrics.get("returnOnEquity"),
            return_on_assets=metric.get("roaTTM") or metric.get("roaRfy") or fmp_keymetrics.get("returnOnAssets"),
            return_on_invested_capital=metric.get("roicTTM") or fmp_keymetrics.get("returnOnInvestedCapital"),
            
            # Efficiency
            asset_turnover=metric.get("assetTurnoverTTM") or fmp_ratios.get("assetTurnover"),
            inventory_turnover=metric.get("inventoryTurnoverTTM") or fmp_ratios.get("inventoryTurnover"),
            receivables_turnover=metric.get("receivablesTurnoverTTM") or fmp_ratios.get("receivablesTurnover"),
            days_sales_outstanding=fmp_keymetrics.get("daysOfSalesOutstanding"),
            operating_cycle=fmp_keymetrics.get("operatingCycle"),
            working_capital_turnover=fmp_ratios.get("workingCapitalTurnoverRatio"),
            
            # Liquidity
            current_ratio=metric.get("currentRatioQuarterly") or metric.get("currentRatioAnnual") or fmp_ratios.get("currentRatio"),
            quick_ratio=metric.get("quickRatioQuarterly") or metric.get("quickRatioAnnual") or fmp_ratios.get("quickRatio"),
            cash_ratio=metric.get("cashRatioQuarterly") or fmp_ratios.get("cashRatio"),
            operating_cash_flow_ratio=fmp_ratios.get("operatingCashFlowRatio"),
            
            # Leverage
            debt_to_equity=metric.get("totalDebt/totalEquityQuarterly") or fmp_ratios.get("debtToEquityRatio"),
            debt_to_assets=fmp_ratios.get("debtToAssetsRatio"),
            interest_coverage=fmp_ratios.get("interestCoverageRatio"),
            
            # Growth (Finnhub provides growth metrics)
            revenue_growth=metric.get("revenueGrowthQuarterlyYoy") or metric.get("revenueGrowth3Y"),
            earnings_growth=metric.get("epsGrowthQuarterlyYoy") or metric.get("epsGrowth3Y"),
            book_value_growth=metric.get("bookValueShareGrowth5Y"),
            earnings_per_share_growth=metric.get("epsGrowth5Y"),
            free_cash_flow_growth=metric.get("freeCashFlowGrowth5Y"),
            operating_income_growth=metric.get("ebitdaGrowth5Y"),
            ebitda_growth=metric.get("ebitdaGrowth5Y"),
            
            # Per Share
            payout_ratio=metric.get("payoutRatioTTM") or fmp_ratios.get("dividendPayoutRatio"),
            earnings_per_share=metric.get("epsTTM") or fmp_ratios.get("netIncomePerShare"),
            book_value_per_share=metric.get("bookValuePerShareQuarterly") or fmp_ratios.get("bookValuePerShare"),
            free_cash_flow_per_share=metric.get("freeCashFlowPerShareTTM") or fmp_ratios.get("freeCashFlowPerShare"),
        )
        
        return [metrics]
    
    except Exception as e:
        print(f"Finnhub financial metrics error for {ticker}: {e}")
        return []


def _get_prices_finnhub(ticker: str, start_date: str, end_date: str) -> list[Price]:
    """
    Fetch price data from Finnhub candle endpoint.
    Uses /stock/candle for historical OHLCV data.
    """
    try:
        # Convert dates to Unix timestamps
        start_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.datetime.strptime(end_date, "%Y-%m-%d")
        
        # Add buffer for timezone differences
        start_ts = int(start_dt.timestamp())
        end_ts = int(end_dt.timestamp()) + 86400  # Add 1 day
        
        data = _finnhub_request("stock/candle", {
            "symbol": ticker,
            "resolution": "D",
            "from": start_ts,
            "to": end_ts,
        })
        
        if not data or data.get("s") != "ok":
            return []
        
        timestamps = data.get("t", [])
        opens = data.get("o", [])
        highs = data.get("h", [])
        lows = data.get("l", [])
        closes = data.get("c", [])
        volumes = data.get("v", [])
        
        if not timestamps:
            return []
        
        prices = []
        for i, ts in enumerate(timestamps):
            dt = datetime.datetime.fromtimestamp(ts)
            date_str = dt.strftime("%Y-%m-%d")
            
            # Filter by date range
            if date_str < start_date or date_str > end_date:
                continue
            
            prices.append(Price(
                open=float(opens[i]),
                high=float(highs[i]),
                low=float(lows[i]),
                close=float(closes[i]),
                volume=int(volumes[i]),
                time=date_str,
            ))
        
        return prices
    
    except Exception as e:
        print(f"Finnhub prices error for {ticker}: {e}")
        return []


def _get_market_cap_finnhub(ticker: str) -> Optional[float]:
    """Fetch market cap from Finnhub profile endpoint."""
    try:
        data = _finnhub_request("stock/profile2", {"symbol": ticker})
        if data and data.get("marketCapitalization"):
            # Finnhub returns market cap in millions
            return data["marketCapitalization"] * 1_000_000
        return None
    except Exception as e:
        print(f"Finnhub market cap error for {ticker}: {e}")
        return None


def _get_prices_yahoo(ticker: str, start_date: str, end_date: str) -> list[Price]:
    """
    Fetch price data from Yahoo Finance v8 Chart API.
    This is a free, unlimited API that works for all symbols.
    """
    try:
        # Calculate date range for Yahoo API
        start_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.datetime.strptime(end_date, "%Y-%m-%d")
        days_diff = (end_dt - start_dt).days
        
        # Map to Yahoo range parameter
        if days_diff <= 5:
            range_param = "5d"
        elif days_diff <= 30:
            range_param = "1mo"
        elif days_diff <= 90:
            range_param = "3mo"
        elif days_diff <= 180:
            range_param = "6mo"
        elif days_diff <= 365:
            range_param = "1y"
        elif days_diff <= 730:
            range_param = "2y"
        else:
            range_param = "5y"
        
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range={range_param}"
        headers = {"User-Agent": YAHOO_USER_AGENT}
        
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            return []
        
        data = response.json()
        if not data.get("chart", {}).get("result"):
            return []
        
        result = data["chart"]["result"][0]
        timestamps = result.get("timestamp", [])
        quotes = result.get("indicators", {}).get("quote", [{}])[0]
        
        if not timestamps or not quotes:
            return []
        
        prices = []
        for i, ts in enumerate(timestamps):
            # Convert timestamp to date string
            dt = datetime.datetime.fromtimestamp(ts)
            date_str = dt.strftime("%Y-%m-%d")
            
            # Filter by date range
            if date_str < start_date or date_str > end_date:
                continue
            
            # Skip if any OHLCV is None
            if any(quotes.get(k, [None])[i] is None for k in ["open", "high", "low", "close", "volume"]):
                continue
            
            prices.append(Price(
                open=float(quotes["open"][i]),
                high=float(quotes["high"][i]),
                low=float(quotes["low"][i]),
                close=float(quotes["close"][i]),
                volume=int(quotes["volume"][i]),
                time=date_str,
            ))
        
        return prices
    except Exception as e:
        print(f"Yahoo API error for {ticker}: {e}")
        return []


def _get_financial_metrics_fmp(
    ticker: str,
    end_date: str,
    period: str = "ttm",
    limit: int = 10,
) -> list[FinancialMetrics]:
    """
    Fetch financial metrics from Financial Modeling Prep API.
    Combines data from /stable/ratios, /stable/key-metrics, and /stable/income-statement.
    """
    fmp_api_key = os.environ.get("FMP_API_KEY")
    if not fmp_api_key:
        return []
    
    try:
        base_url = "https://financialmodelingprep.com/stable"
        
        # Fetch all required data in parallel-ish manner
        ratios_url = f"{base_url}/ratios?symbol={ticker}&apikey={fmp_api_key}"
        keymetrics_url = f"{base_url}/key-metrics?symbol={ticker}&apikey={fmp_api_key}"
        income_url = f"{base_url}/income-statement?symbol={ticker}&apikey={fmp_api_key}"
        profile_url = f"{base_url}/profile?symbol={ticker}&apikey={fmp_api_key}"
        
        ratios_resp = requests.get(ratios_url, timeout=10)
        keymetrics_resp = requests.get(keymetrics_url, timeout=10)
        income_resp = requests.get(income_url, timeout=10)
        profile_resp = requests.get(profile_url, timeout=10)
        
        # Check for premium restrictions
        for resp in [ratios_resp, keymetrics_resp]:
            if resp.status_code == 200:
                text = resp.text
                if "Premium" in text or "Special" in text:
                    print(f"FMP: {ticker} requires premium subscription")
                    return []
        
        # Parse responses
        ratios = ratios_resp.json() if ratios_resp.status_code == 200 else []
        keymetrics = keymetrics_resp.json() if keymetrics_resp.status_code == 200 else []
        income = income_resp.json() if income_resp.status_code == 200 else []
        profile = profile_resp.json() if profile_resp.status_code == 200 else []
        
        if not ratios or not isinstance(ratios, list):
            return []
        
        metrics_list = []
        
        for i, ratio in enumerate(ratios[:limit]):
            # Get corresponding data from other endpoints
            km = keymetrics[i] if i < len(keymetrics) and isinstance(keymetrics, list) else {}
            inc = income[i] if i < len(income) and isinstance(income, list) else {}
            prof = profile[0] if profile and isinstance(profile, list) else {}
            
            # Calculate growth metrics from income statement
            revenue_growth = None
            earnings_growth = None
            if i + 1 < len(income) and isinstance(income, list):
                prev_inc = income[i + 1]
                if prev_inc.get("revenue") and inc.get("revenue"):
                    revenue_growth = (inc["revenue"] - prev_inc["revenue"]) / abs(prev_inc["revenue"])
                if prev_inc.get("netIncome") and inc.get("netIncome"):
                    earnings_growth = (inc["netIncome"] - prev_inc["netIncome"]) / abs(prev_inc["netIncome"])
            
            metrics = FinancialMetrics(
                ticker=ticker,
                report_period=ratio.get("date", end_date),
                period=ratio.get("period", "FY") if period == "ttm" else period,
                currency=prof.get("currency", "USD"),
                
                # Valuation
                market_cap=prof.get("marketCap") or km.get("marketCap"),
                enterprise_value=km.get("enterpriseValue"),
                price_to_earnings_ratio=ratio.get("priceToEarningsRatio"),
                price_to_book_ratio=ratio.get("priceToBookRatio"),
                price_to_sales_ratio=ratio.get("priceToSalesRatio"),
                enterprise_value_to_ebitda_ratio=km.get("evToEBITDA"),
                enterprise_value_to_revenue_ratio=km.get("evToSales"),
                free_cash_flow_yield=km.get("freeCashFlowYield"),
                peg_ratio=ratio.get("priceToEarningsGrowthRatio"),
                
                # Profitability
                gross_margin=ratio.get("grossProfitMargin"),
                operating_margin=ratio.get("operatingProfitMargin"),
                net_margin=ratio.get("netProfitMargin"),
                return_on_equity=km.get("returnOnEquity"),
                return_on_assets=km.get("returnOnAssets"),
                return_on_invested_capital=km.get("returnOnInvestedCapital"),
                
                # Efficiency
                asset_turnover=ratio.get("assetTurnover"),
                inventory_turnover=ratio.get("inventoryTurnover"),
                receivables_turnover=ratio.get("receivablesTurnover"),
                days_sales_outstanding=km.get("daysOfSalesOutstanding"),
                operating_cycle=km.get("operatingCycle"),
                working_capital_turnover=ratio.get("workingCapitalTurnoverRatio"),
                
                # Liquidity
                current_ratio=ratio.get("currentRatio"),
                quick_ratio=ratio.get("quickRatio"),
                cash_ratio=ratio.get("cashRatio"),
                operating_cash_flow_ratio=ratio.get("operatingCashFlowRatio"),
                
                # Leverage
                debt_to_equity=ratio.get("debtToEquityRatio"),
                debt_to_assets=ratio.get("debtToAssetsRatio"),
                interest_coverage=ratio.get("interestCoverageRatio"),
                
                # Growth
                revenue_growth=revenue_growth,
                earnings_growth=earnings_growth,
                book_value_growth=None,
                earnings_per_share_growth=None,
                free_cash_flow_growth=None,
                operating_income_growth=None,
                ebitda_growth=None,
                
                # Per Share
                payout_ratio=ratio.get("dividendPayoutRatio"),
                earnings_per_share=ratio.get("netIncomePerShare") or (inc.get("eps") if inc else None),
                book_value_per_share=ratio.get("bookValuePerShare"),
                free_cash_flow_per_share=ratio.get("freeCashFlowPerShare"),
            )
            metrics_list.append(metrics)
        
        return metrics_list
    
    except Exception as e:
        print(f"FMP API error for {ticker}: {e}")
        return []


def _get_market_cap_fmp(ticker: str) -> Optional[float]:
    """Fetch market cap from FMP profile endpoint."""
    fmp_api_key = os.environ.get("FMP_API_KEY")
    if not fmp_api_key:
        return None
    
    try:
        url = f"https://financialmodelingprep.com/stable/profile?symbol={ticker}&apikey={fmp_api_key}"
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            return None
        
        data = response.json()
        if data and isinstance(data, list) and len(data) > 0:
            return data[0].get("marketCap")
        return None
    except Exception as e:
        print(f"FMP market cap error for {ticker}: {e}")
        return None


def _make_api_request(url: str, headers: dict, method: str = "GET", json_data: dict = None, max_retries: int = 3) -> requests.Response:
    """
    Make an API request with rate limiting handling and moderate backoff.
    
    Args:
        url: The URL to request
        headers: Headers to include in the request
        method: HTTP method (GET or POST)
        json_data: JSON data for POST requests
        max_retries: Maximum number of retries (default: 3)
    
    Returns:
        requests.Response: The response object
    
    Raises:
        Exception: If the request fails with a non-429 error
    """
    for attempt in range(max_retries + 1):  # +1 for initial attempt
        if method.upper() == "POST":
            response = requests.post(url, headers=headers, json=json_data)
        else:
            response = requests.get(url, headers=headers)
        
        if response.status_code == 429 and attempt < max_retries:
            # Linear backoff: 60s, 90s, 120s, 150s...
            delay = 60 + (30 * attempt)
            print(f"Rate limited (429). Attempt {attempt + 1}/{max_retries + 1}. Waiting {delay}s before retrying...")
            time.sleep(delay)
            continue
        
        # Return the response (whether success, other errors, or final 429)
        return response


def get_prices(ticker: str, start_date: str, end_date: str, api_key: str = None) -> list[Price]:
    """Fetch price data using Finnhub → Yahoo fallback chain."""
    # Create a cache key that includes all parameters to ensure exact matches
    cache_key = f"{ticker}_{start_date}_{end_date}"
    
    # Check cache first - simple exact match
    if cached_data := _cache.get_prices(cache_key):
        return [Price(**price) for price in cached_data]

    # Primary: Yahoo Finance (best for historical OHLCV, unlimited)
    prices = _get_prices_yahoo(ticker, start_date, end_date)
    
    # Fallback: Finnhub candles
    if not prices:
        print(f"Yahoo failed, using Finnhub for {ticker} prices")
        prices = _get_prices_finnhub(ticker, start_date, end_date)

    if not prices:
        return []

    # Cache the results using the comprehensive cache key
    _cache.set_prices(cache_key, [p.model_dump() for p in prices])
    return prices


def get_financial_metrics(
    ticker: str,
    end_date: str,
    period: str = "ttm",
    limit: int = 10,
    api_key: str = None,
) -> list[FinancialMetrics]:
    """Fetch financial metrics using Finnhub → FMP fallback chain."""
    # Create a cache key that includes all parameters to ensure exact matches
    cache_key = f"{ticker}_{period}_{end_date}_{limit}"
    
    # Check cache first - simple exact match
    if cached_data := _cache.get_financial_metrics(cache_key):
        return [FinancialMetrics(**metric) for metric in cached_data]

    # Primary: Finnhub (best coverage, 180 req/min with 3 keys)
    financial_metrics = _get_financial_metrics_finnhub(ticker, end_date, period, limit)
    
    # Fallback: FMP (limited to ~87 symbols on free tier)
    if not financial_metrics:
        print(f"Finnhub failed, using FMP for {ticker} financial metrics")
        financial_metrics = _get_financial_metrics_fmp(ticker, end_date, period, limit)

    if not financial_metrics:
        return []

    # Cache the results as dicts using the comprehensive cache key
    _cache.set_financial_metrics(cache_key, [m.model_dump() for m in financial_metrics])
    return financial_metrics


def search_line_items(
    ticker: str,
    line_items: list[str],
    end_date: str,
    period: str = "ttm",
    limit: int = 10,
    api_key: str = None,
) -> list[LineItem]:
    """Fetch line items from API."""
    # If not in cache or insufficient data, fetch from API
    headers = {}
    financial_api_key = api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY")
    if financial_api_key:
        headers["X-API-KEY"] = financial_api_key

    url = "https://api.financialdatasets.ai/financials/search/line-items"

    body = {
        "tickers": [ticker],
        "line_items": line_items,
        "end_date": end_date,
        "period": period,
        "limit": limit,
    }
    response = _make_api_request(url, headers, method="POST", json_data=body)
    if response.status_code != 200:
        return []
    
    try:
        data = response.json()
        response_model = LineItemResponse(**data)
        search_results = response_model.search_results
    except:
        return []
    if not search_results:
        return []

    # Cache the results
    return search_results[:limit]


def get_insider_trades(
    ticker: str,
    end_date: str,
    start_date: str | None = None,
    limit: int = 1000,
    api_key: str = None,
) -> list[InsiderTrade]:
    """Fetch insider trades from cache or API."""
    # Create a cache key that includes all parameters to ensure exact matches
    cache_key = f"{ticker}_{start_date or 'none'}_{end_date}_{limit}"
    
    # Check cache first - simple exact match
    if cached_data := _cache.get_insider_trades(cache_key):
        return [InsiderTrade(**trade) for trade in cached_data]

    # If not in cache, fetch from API
    headers = {}
    financial_api_key = api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY")
    if financial_api_key:
        headers["X-API-KEY"] = financial_api_key

    all_trades = []
    current_end_date = end_date

    while True:
        url = f"https://api.financialdatasets.ai/insider-trades/?ticker={ticker}&filing_date_lte={current_end_date}"
        if start_date:
            url += f"&filing_date_gte={start_date}"
        url += f"&limit={limit}"

        response = _make_api_request(url, headers)
        if response.status_code != 200:
            break

        try:
            data = response.json()
            response_model = InsiderTradeResponse(**data)
            insider_trades = response_model.insider_trades
        except:
            break  # Parsing error, exit loop

        if not insider_trades:
            break

        all_trades.extend(insider_trades)

        # Only continue pagination if we have a start_date and got a full page
        if not start_date or len(insider_trades) < limit:
            break

        # Update end_date to the oldest filing date from current batch for next iteration
        current_end_date = min(trade.filing_date for trade in insider_trades).split("T")[0]

        # If we've reached or passed the start_date, we can stop
        if current_end_date <= start_date:
            break

    if not all_trades:
        return []

    # Cache the results using the comprehensive cache key
    _cache.set_insider_trades(cache_key, [trade.model_dump() for trade in all_trades])
    return all_trades


def get_company_news(
    ticker: str,
    end_date: str,
    start_date: str | None = None,
    limit: int = 1000,
    api_key: str = None,
) -> list[CompanyNews]:
    """Fetch company news from cache or API."""
    # Create a cache key that includes all parameters to ensure exact matches
    cache_key = f"{ticker}_{start_date or 'none'}_{end_date}_{limit}"
    
    # Check cache first - simple exact match
    if cached_data := _cache.get_company_news(cache_key):
        return [CompanyNews(**news) for news in cached_data]

    # If not in cache, fetch from API
    headers = {}
    financial_api_key = api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY")
    if financial_api_key:
        headers["X-API-KEY"] = financial_api_key

    all_news = []
    current_end_date = end_date

    while True:
        url = f"https://api.financialdatasets.ai/news/?ticker={ticker}&end_date={current_end_date}"
        if start_date:
            url += f"&start_date={start_date}"
        url += f"&limit={limit}"

        response = _make_api_request(url, headers)
        if response.status_code != 200:
            break

        try:
            data = response.json()
            response_model = CompanyNewsResponse(**data)
            company_news = response_model.news
        except:
            break  # Parsing error, exit loop

        if not company_news:
            break

        all_news.extend(company_news)

        # Only continue pagination if we have a start_date and got a full page
        if not start_date or len(company_news) < limit:
            break

        # Update end_date to the oldest date from current batch for next iteration
        current_end_date = min(news.date for news in company_news).split("T")[0]

        # If we've reached or passed the start_date, we can stop
        if current_end_date <= start_date:
            break

    if not all_news:
        return []

    # Cache the results using the comprehensive cache key
    _cache.set_company_news(cache_key, [news.model_dump() for news in all_news])
    return all_news


def get_market_cap(
    ticker: str,
    end_date: str,
    api_key: str = None,
) -> float | None:
    """Fetch market cap using Finnhub → FMP fallback chain."""
    market_cap = None
    
    # Primary: Finnhub (best coverage)
    market_cap = _get_market_cap_finnhub(ticker)
    
    # Fallback: get_financial_metrics (which has Finnhub → FMP chain)
    if not market_cap:
        financial_metrics = get_financial_metrics(ticker, end_date, api_key=api_key)
        if financial_metrics:
            market_cap = financial_metrics[0].market_cap

    # Final fallback: FMP profile directly
    if not market_cap:
        market_cap = _get_market_cap_fmp(ticker)

    return market_cap


def prices_to_df(prices: list[Price]) -> pd.DataFrame:
    """Convert prices to a DataFrame."""
    df = pd.DataFrame([p.model_dump() for p in prices])
    df["Date"] = pd.to_datetime(df["time"])
    df.set_index("Date", inplace=True)
    numeric_cols = ["open", "close", "high", "low", "volume"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df.sort_index(inplace=True)
    return df


# Update the get_price_data function to use the new functions
def get_price_data(ticker: str, start_date: str, end_date: str, api_key: str = None) -> pd.DataFrame:
    prices = get_prices(ticker, start_date, end_date, api_key=api_key)
    return prices_to_df(prices)
