// Supabase Edge Functions - Financial Data API Client
// Fetches data from FMP (Financial Modeling Prep) and FRED

import {
    FinancialMetrics,
    MacroData,
    PeerData,
    ESGData,
    InsiderTrade,
    NewsItem,
    PriceData,
} from "./types.ts";

const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3";
const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

/**
 * Get FMP API key from environment
 */
function getFmpApiKey(): string {
    const key = Deno.env.get("FMP_API_KEY");
    if (!key) {
        throw new Error("FMP_API_KEY not configured");
    }
    return key;
}

/**
 * Get FRED API key from environment
 */
function getFredApiKey(): string {
    const key = Deno.env.get("FRED_API_KEY");
    if (!key) {
        throw new Error("FRED_API_KEY not configured");
    }
    return key;
}

/**
 * Fetch financial metrics from FMP
 */
export async function getFinancialMetrics(ticker: string): Promise<FinancialMetrics> {
    const apiKey = getFmpApiKey();

    try {
        const [ratios, quote] = await Promise.all([
            fetch(`${FMP_BASE_URL}/ratios-ttm/${ticker}?apikey=${apiKey}`).then(r => r.json()),
            fetch(`${FMP_BASE_URL}/quote/${ticker}?apikey=${apiKey}`).then(r => r.json()),
        ]);

        const ratio = ratios?.[0] || {};
        const quoteData = quote?.[0] || {};

        return {
            ticker,
            return_on_equity: ratio.returnOnEquityTTM,
            debt_to_equity: ratio.debtEquityRatioTTM,
            operating_margin: ratio.operatingProfitMarginTTM,
            current_ratio: ratio.currentRatioTTM,
            price_to_earnings: ratio.peRatioTTM,
            price_to_book: ratio.priceToBookRatioTTM,
            revenue_growth: ratio.revenueGrowth,
            earnings_per_share: quoteData.eps,
            free_cash_flow: undefined, // Would need separate call
            market_cap: quoteData.marketCap,
        };
    } catch (error) {
        console.error(`Error fetching financial metrics for ${ticker}:`, error);
        return { ticker };
    }
}

/**
 * Fetch key financial line items
 */
export async function getFinancialLineItems(
    ticker: string,
    period: "annual" | "quarter" = "annual",
    limit: number = 5
): Promise<Record<string, unknown>[]> {
    const apiKey = getFmpApiKey();

    try {
        const response = await fetch(
            `${FMP_BASE_URL}/income-statement/${ticker}?period=${period}&limit=${limit}&apikey=${apiKey}`
        );
        return await response.json();
    } catch (error) {
        console.error(`Error fetching financial line items for ${ticker}:`, error);
        return [];
    }
}

/**
 * Fetch stock peers
 */
export async function getPeers(ticker: string): Promise<PeerData> {
    const apiKey = getFmpApiKey();

    try {
        const [peersResponse, profileResponse] = await Promise.all([
            fetch(`${FMP_BASE_URL}/stock_peers?symbol=${ticker}&apikey=${apiKey}`).then(r => r.json()),
            fetch(`${FMP_BASE_URL}/profile/${ticker}?apikey=${apiKey}`).then(r => r.json()),
        ]);

        const peers = peersResponse?.[0]?.peersList || [];
        const profile = profileResponse?.[0] || {};

        return {
            peers,
            pe_ratio: profile.peRatio,
            roe: profile.roe,
            sector: profile.sector,
        };
    } catch (error) {
        console.error(`Error fetching peers for ${ticker}:`, error);
        return { peers: [] };
    }
}

/**
 * Fetch ESG data
 */
export async function getESGData(ticker: string): Promise<ESGData> {
    const apiKey = getFmpApiKey();

    try {
        const response = await fetch(
            `${FMP_BASE_URL}/esg-environmental-social-governance-data?symbol=${ticker}&apikey=${apiKey}`
        );
        const data = await response.json();
        const esg = data?.[0] || {};

        const totalScore = esg.ESGScore || 0;
        let esgSignal: "bullish" | "bearish" | "neutral" = "neutral";

        if (totalScore >= 70) esgSignal = "bullish";
        else if (totalScore < 40) esgSignal = "bearish";

        return {
            total_score: totalScore,
            environment_score: esg.environmentScore,
            social_score: esg.socialScore,
            governance_score: esg.governanceScore,
            esg_signal: esgSignal,
            controversy_level: esg.controversyLevel,
        };
    } catch (error) {
        console.error(`Error fetching ESG data for ${ticker}:`, error);
        return { esg_signal: "neutral" };
    }
}

/**
 * Fetch insider trades
 */
export async function getInsiderTrades(ticker: string, limit: number = 50): Promise<InsiderTrade[]> {
    const apiKey = getFmpApiKey();

    try {
        const response = await fetch(
            `${FMP_BASE_URL}/insider-trading?symbol=${ticker}&limit=${limit}&apikey=${apiKey}`
        );
        const data = await response.json();

        return (data || []).map((trade: Record<string, unknown>) => ({
            transaction_date: trade.transactionDate as string,
            transaction_type: (trade.transactionType as string)?.toLowerCase().includes("buy") ? "buy" : "sell",
            transaction_shares: Number(trade.securitiesTransacted) || 0,
            owner_name: trade.reportingName as string,
        }));
    } catch (error) {
        console.error(`Error fetching insider trades for ${ticker}:`, error);
        return [];
    }
}

/**
 * Fetch company news
 */
export async function getCompanyNews(ticker: string, limit: number = 20): Promise<NewsItem[]> {
    const apiKey = getFmpApiKey();

    try {
        const response = await fetch(
            `${FMP_BASE_URL}/stock_news?tickers=${ticker}&limit=${limit}&apikey=${apiKey}`
        );
        const data = await response.json();

        return (data || []).map((news: Record<string, unknown>) => ({
            title: news.title as string,
            published_at: news.publishedDate as string,
            source: news.site as string,
            sentiment: undefined, // Would need sentiment analysis
        }));
    } catch (error) {
        console.error(`Error fetching news for ${ticker}:`, error);
        return [];
    }
}

/**
 * Fetch historical prices
 */
export async function getHistoricalPrices(
    ticker: string,
    startDate?: string,
    endDate?: string
): Promise<PriceData[]> {
    const apiKey = getFmpApiKey();

    try {
        let url = `${FMP_BASE_URL}/historical-price-full/${ticker}?apikey=${apiKey}`;
        if (startDate) url += `&from=${startDate}`;
        if (endDate) url += `&to=${endDate}`;

        const response = await fetch(url);
        const data = await response.json();

        return (data?.historical || []).map((price: Record<string, unknown>) => ({
            time: price.date as string,
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
 * Fetch market cap
 */
export async function getMarketCap(ticker: string): Promise<number | undefined> {
    const apiKey = getFmpApiKey();

    try {
        const response = await fetch(
            `${FMP_BASE_URL}/market-capitalization/${ticker}?apikey=${apiKey}`
        );
        const data = await response.json();
        return data?.[0]?.marketCap;
    } catch (error) {
        console.error(`Error fetching market cap for ${ticker}:`, error);
        return undefined;
    }
}

/**
 * Fetch macro data from FRED
 */
export async function getMacroData(): Promise<MacroData> {
    const apiKey = getFredApiKey();

    try {
        const [vixResponse, fedFundsResponse, yieldCurveResponse] = await Promise.all([
            fetch(`${FRED_BASE_URL}?series_id=VIXCLS&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`).then(r => r.json()),
            fetch(`${FRED_BASE_URL}?series_id=FEDFUNDS&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`).then(r => r.json()),
            fetch(`${FRED_BASE_URL}?series_id=T10Y2Y&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`).then(r => r.json()),
        ]);

        const vix = parseFloat(vixResponse?.observations?.[0]?.value) || 0;
        const fedFunds = parseFloat(fedFundsResponse?.observations?.[0]?.value) || 0;
        const yieldCurve = parseFloat(yieldCurveResponse?.observations?.[0]?.value) || 0;

        return {
            vix,
            fed_funds_rate: fedFunds,
            yield_curve_10y_2y: yieldCurve,
            yield_curve_inverted: yieldCurve < 0,
        };
    } catch (error) {
        console.error("Error fetching macro data:", error);
        return { yield_curve_inverted: false };
    }
}

/**
 * Fetch superinvestor holdings (13-F data)
 */
export async function getSuperinvestorHoldings(ticker: string): Promise<{
    owned_by_count: number;
    superinvestors: string[];
    cloning_signal: "bullish" | "bearish" | "neutral";
}> {
    // Note: FMP has limited 13-F data. Using placeholder logic.
    // In production, would use a dedicated 13-F API like Dataroma or WhaleWisdom.

    const apiKey = getFmpApiKey();

    try {
        const response = await fetch(
            `${FMP_BASE_URL}/institutional-holder/${ticker}?apikey=${apiKey}`
        );
        const data = await response.json();

        // Filter for known superinvestors
        const knownSuperinvestors = [
            "BERKSHIRE HATHAWAY",
            "PERSHING SQUARE",
            "SCION ASSET MANAGEMENT",
            "ARK INVESTMENT",
            "THIRD POINT",
        ];

        const holders = (data || [])
            .filter((h: Record<string, unknown>) =>
                knownSuperinvestors.some(s =>
                    (h.holder as string)?.toUpperCase().includes(s)
                )
            )
            .map((h: Record<string, unknown>) => h.holder as string);

        const ownedByCount = holders.length;
        let cloningSignal: "bullish" | "bearish" | "neutral" = "neutral";

        if (ownedByCount >= 3) cloningSignal = "bullish";
        else if (ownedByCount >= 1) cloningSignal = "neutral";

        return {
            owned_by_count: ownedByCount,
            superinvestors: holders,
            cloning_signal: cloningSignal,
        };
    } catch (error) {
        console.error(`Error fetching superinvestor holdings for ${ticker}:`, error);
        return {
            owned_by_count: 0,
            superinvestors: [],
            cloning_signal: "neutral",
        };
    }
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
        getFinancialMetrics(ticker),
        getFinancialLineItems(ticker),
        getPeers(ticker),
        getESGData(ticker),
        getInsiderTrades(ticker),
        getCompanyNews(ticker),
        getHistoricalPrices(ticker, undefined, endDate),
        getMarketCap(ticker),
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
