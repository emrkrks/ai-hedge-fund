// Supabase Edge Functions - Financial Data API Client
// Uses FinancialDatasets.ai API (same as original Python project)

import {
    FinancialMetrics,
    MacroData,
    PeerData,
    ESGData,
    InsiderTrade,
    NewsItem,
    PriceData,
} from "./types.ts";

const FINANCIAL_DATASETS_BASE_URL = "https://api.financialdatasets.ai";
const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

/**
 * Get FinancialDatasets.ai API key from Supabase secrets
 */
function getFinancialDatasetsApiKey(): string {
    const key = Deno.env.get("FINANCIAL_DATASETS_API_KEY");
    if (!key) {
        throw new Error("FINANCIAL_DATASETS_API_KEY not configured in Supabase secrets");
    }
    return key;
}

/**
 * Get FRED API key from environment (optional for macro data)
 */
function getFredApiKey(): string | null {
    return Deno.env.get("FRED_API_KEY") || null;
}

/**
 * Make API request to FinancialDatasets.ai
 */
async function makeFinancialDatasetsRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>
): Promise<unknown> {
    const apiKey = getFinancialDatasetsApiKey();
    const url = `${FINANCIAL_DATASETS_BASE_URL}${endpoint}`;

    const headers: Record<string, string> = {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
    };

    const options: RequestInit = {
        method,
        headers,
    };

    if (body && method === "POST") {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        console.error(`FinancialDatasets API error: ${response.status} - ${await response.text()}`);
        return null;
    }

    return await response.json();
}

/**
 * Fetch financial metrics from FinancialDatasets.ai
 */
export async function getFinancialMetrics(
    ticker: string,
    endDate?: string,
    period: string = "ttm",
    limit: number = 10
): Promise<FinancialMetrics> {
    try {
        const dateParam = endDate || new Date().toISOString().split("T")[0];
        const data = await makeFinancialDatasetsRequest(
            `/financial-metrics/?ticker=${ticker}&report_period_lte=${dateParam}&limit=${limit}&period=${period}`
        ) as { financial_metrics?: Record<string, unknown>[] } | null;

        const metrics = data?.financial_metrics?.[0] || {};

        return {
            ticker,
            return_on_equity: metrics.return_on_equity as number,
            debt_to_equity: metrics.debt_to_equity as number,
            operating_margin: metrics.operating_margin as number,
            current_ratio: metrics.current_ratio as number,
            price_to_earnings: metrics.price_to_earnings_ratio as number,
            price_to_book: metrics.price_to_book_ratio as number,
            revenue_growth: metrics.revenue_growth as number,
            earnings_per_share: metrics.earnings_per_share as number,
            free_cash_flow: metrics.free_cash_flow as number,
            market_cap: metrics.market_cap as number,
            // Additional metrics for agents
            gross_margin: metrics.gross_margin as number,
            net_margin: metrics.net_margin as number,
            peg_ratio: metrics.peg_ratio as number,
            price_to_sales_ratio: metrics.price_to_sales_ratio as number,
            earnings_per_share_growth: metrics.earnings_per_share_growth as number,
            revenue_per_share: metrics.revenue_per_share as number,
            free_cash_flow_growth: metrics.free_cash_flow_growth as number,
        };
    } catch (error) {
        console.error(`Error fetching financial metrics for ${ticker}:`, error);
        return { ticker };
    }
}

/**
 * Search for specific financial line items (like Python's search_line_items)
 */
export async function searchLineItems(
    ticker: string,
    lineItems: string[],
    endDate?: string,
    period: string = "annual",
    limit: number = 10
): Promise<Record<string, unknown>[]> {
    try {
        const dateParam = endDate || new Date().toISOString().split("T")[0];

        const data = await makeFinancialDatasetsRequest(
            "/financials/search/line-items",
            "POST",
            {
                tickers: [ticker],
                line_items: lineItems,
                end_date: dateParam,
                period: period,
                limit: limit,
            }
        ) as { search_results?: Record<string, unknown>[] } | null;

        // Return array of line items (always return array even if empty)
        return data?.search_results || [];
    } catch (error) {
        console.error(`Error fetching line items for ${ticker}:`, error);
        return [];
    }
}

/**
 * Fetch financial line items (simplified for compatibility)
 * Returns array format expected by agent-handler
 */
export async function getFinancialLineItems(
    ticker: string,
    endDate?: string,
    period: "annual" | "quarter" = "annual",
    limit: number = 10
): Promise<Record<string, unknown>[]> {
    // Use the full line items list like the original Python project
    const lineItems = [
        "revenue",
        "net_income",
        "operating_income",
        "return_on_invested_capital",
        "gross_margin",
        "operating_margin",
        "free_cash_flow",
        "capital_expenditure",
        "cash_and_equivalents",
        "total_debt",
        "shareholders_equity",
        "outstanding_shares",
        "research_and_development",
        "goodwill_and_intangible_assets",
        "earnings_per_share",
    ];

    return await searchLineItems(ticker, lineItems, endDate, period, limit);
}

/**
 * Fetch stock peers
 */
export async function getPeers(ticker: string): Promise<PeerData> {
    try {
        const data = await makeFinancialDatasetsRequest(
            `/company/facts/?ticker=${ticker}`
        ) as { company_facts?: Record<string, unknown> } | null;

        const facts = data?.company_facts || {};

        return {
            peers: [], // FinancialDatasets doesn't provide peers directly
            pe_ratio: facts.pe_ratio as number,
            roe: facts.roe as number,
            sector: facts.sector as string,
            industry: facts.industry as string,
        };
    } catch (error) {
        console.error(`Error fetching peers for ${ticker}:`, error);
        return { peers: [] };
    }
}

/**
 * Fetch ESG data (placeholder - FinancialDatasets.ai doesn't have ESG)
 */
export async function getESGData(ticker: string): Promise<ESGData> {
    // ESG data not available in FinancialDatasets.ai
    return {
        total_score: undefined,
        esg_signal: "neutral",
    };
}

/**
 * Fetch insider trades from FinancialDatasets.ai
 */
export async function getInsiderTrades(
    ticker: string,
    endDate?: string,
    limit: number = 100
): Promise<InsiderTrade[]> {
    try {
        const dateParam = endDate || new Date().toISOString().split("T")[0];

        const data = await makeFinancialDatasetsRequest(
            `/insider-trades/?ticker=${ticker}&filing_date_lte=${dateParam}&limit=${limit}`
        ) as { insider_trades?: Record<string, unknown>[] } | null;

        return (data?.insider_trades || []).map((trade) => ({
            transaction_date: trade.filing_date as string,
            transaction_type: (trade.transaction_shares as number) > 0 ? "buy" : "sell",
            transaction_shares: Math.abs(trade.transaction_shares as number) || 0,
            transaction_value: trade.transaction_value as number,
            owner_name: trade.owner_name as string,
        }));
    } catch (error) {
        console.error(`Error fetching insider trades for ${ticker}:`, error);
        return [];
    }
}

/**
 * Fetch company news from FinancialDatasets.ai
 */
export async function getCompanyNews(
    ticker: string,
    endDate?: string,
    limit: number = 50
): Promise<NewsItem[]> {
    try {
        const dateParam = endDate || new Date().toISOString().split("T")[0];

        const data = await makeFinancialDatasetsRequest(
            `/news/?ticker=${ticker}&end_date=${dateParam}&limit=${limit}`
        ) as { news?: Record<string, unknown>[] } | null;

        return (data?.news || []).map((news) => ({
            title: news.title as string,
            published_at: news.date as string,
            source: news.source as string,
            sentiment: news.sentiment as "positive" | "negative" | "neutral" | undefined,
        }));
    } catch (error) {
        console.error(`Error fetching news for ${ticker}:`, error);
        return [];
    }
}

/**
 * Fetch historical prices from FinancialDatasets.ai
 */
export async function getHistoricalPrices(
    ticker: string,
    startDate?: string,
    endDate?: string
): Promise<PriceData[]> {
    try {
        const end = endDate || new Date().toISOString().split("T")[0];
        // Default to 1 year of data
        const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        const data = await makeFinancialDatasetsRequest(
            `/prices/?ticker=${ticker}&interval=day&interval_multiplier=1&start_date=${start}&end_date=${end}`
        ) as { prices?: Record<string, unknown>[] } | null;

        return (data?.prices || []).map((price) => ({
            time: price.time as string,
            open: Number(price.open) || 0,
            high: Number(price.high) || 0,
            low: Number(price.low) || 0,
            close: Number(price.close) || 0,
            volume: Number(price.volume) || 0,
        }));
    } catch (error) {
        console.error(`Error fetching prices for ${ticker}:`, error);
        return [];
    }
}

/**
 * Fetch market cap from company facts
 */
export async function getMarketCap(ticker: string, endDate?: string): Promise<number | undefined> {
    try {
        const data = await makeFinancialDatasetsRequest(
            `/company/facts/?ticker=${ticker}`
        ) as { company_facts?: Record<string, unknown> } | null;

        return data?.company_facts?.market_cap as number | undefined;
    } catch (error) {
        console.error(`Error fetching market cap for ${ticker}:`, error);
        return undefined;
    }
}

/**
 * Fetch macro data from FRED (optional)
 */
export async function getMacroData(): Promise<MacroData> {
    const apiKey = getFredApiKey();

    if (!apiKey) {
        // Return defaults if no FRED API key
        return {
            vix: 20,
            fed_funds_rate: 5.25,
            yield_curve_10y_2y: 0,
            yield_curve_inverted: false,
        };
    }

    try {
        const [vixResponse, fedFundsResponse, yieldCurveResponse] = await Promise.all([
            fetch(`${FRED_BASE_URL}?series_id=VIXCLS&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`).then(r => r.json()),
            fetch(`${FRED_BASE_URL}?series_id=FEDFUNDS&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`).then(r => r.json()),
            fetch(`${FRED_BASE_URL}?series_id=T10Y2Y&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`).then(r => r.json()),
        ]);

        const vix = parseFloat(vixResponse?.observations?.[0]?.value) || 20;
        const fedFunds = parseFloat(fedFundsResponse?.observations?.[0]?.value) || 5.25;
        const yieldCurve = parseFloat(yieldCurveResponse?.observations?.[0]?.value) || 0;

        return {
            vix,
            fed_funds_rate: fedFunds,
            yield_curve_10y_2y: yieldCurve,
            yield_curve_inverted: yieldCurve < 0,
        };
    } catch (error) {
        console.error("Error fetching macro data:", error);
        return {
            vix: 20,
            fed_funds_rate: 5.25,
            yield_curve_10y_2y: 0,
            yield_curve_inverted: false,
        };
    }
}

/**
 * Fetch superinvestor holdings (placeholder - would need Dataroma or WhaleWisdom API)
 */
export async function getSuperinvestorHoldings(ticker: string): Promise<{
    owned_by_count: number;
    superinvestors: string[];
    cloning_signal: "bullish" | "bearish" | "neutral";
}> {
    // Superinvestor data not available in FinancialDatasets.ai
    return {
        owned_by_count: 0,
        superinvestors: [],
        cloning_signal: "neutral",
    };
}

/**
 * Fetch all data needed for comprehensive analysis
 */
export async function getComprehensiveData(ticker: string, endDate?: string) {
    const [
        financialMetrics,
        financialLineItems,
        peers,
        esgData,
        insiderTrades,
        news,
        prices,
        marketCap,
        macroData,
        superinvestorHoldings,
    ] = await Promise.all([
        getFinancialMetrics(ticker, endDate),
        getFinancialLineItems(ticker, endDate),
        getPeers(ticker),
        getESGData(ticker),
        getInsiderTrades(ticker, endDate),
        getCompanyNews(ticker, endDate),
        getHistoricalPrices(ticker, undefined, endDate),
        getMarketCap(ticker, endDate),
        getMacroData(),
        getSuperinvestorHoldings(ticker),
    ]);

    return {
        ticker,
        financial_metrics: financialMetrics,
        financial_line_items: financialLineItems,
        peers,
        esg: esgData,
        insider_trades: insiderTrades,
        news,
        prices,
        market_cap: marketCap,
        macro: macroData,
        superinvestor_holdings: superinvestorHoldings,
    };
}
