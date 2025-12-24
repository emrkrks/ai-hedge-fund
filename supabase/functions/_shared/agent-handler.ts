// Supabase Edge Functions - Generic Agent Handler
// Reusable handler for all agent Edge Functions

import { corsHeaders, handleCors } from "./cors.ts";
import { callLLM, LLMProvider } from "./llm-client.ts";
import { getAgentPrompt } from "./prompts.ts";
import { getComprehensiveData } from "./financial-api.ts";
import { AnalyzeRequest, AnalysisResult, AGENT_CONFIG } from "./types.ts";

/**
 * Create a generic agent handler for Supabase Edge Functions
 */
export function createAgentHandler(agentKey: string) {
    return async (req: Request): Promise<Response> => {
        // Handle CORS preflight
        const corsResponse = handleCors(req);
        if (corsResponse) return corsResponse;

        try {
            const request: AnalyzeRequest = await req.json();
            const { ticker, end_date, llm_provider = "gemini" } = request;

            if (!ticker) {
                return new Response(
                    JSON.stringify({ error: "ticker is required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Validate agent exists
            if (!AGENT_CONFIG[agentKey]) {
                return new Response(
                    JSON.stringify({ error: `Unknown agent: ${agentKey}` }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // 1. Fetch comprehensive financial data
            const data = await getComprehensiveData(ticker, end_date);

            // 2. Build analysis context based on agent type
            const analysisContext = buildAgentContext(agentKey, data);

            // 3. Get the agent's prompt
            const prompt = getAgentPrompt(agentKey);

            // 4. Call LLM with the prompt
            const llmResponse = await callLLM({
                provider: llm_provider as LLMProvider,
                systemPrompt: prompt.system,
                userPrompt: prompt.user(ticker, analysisContext),
            });

            // 5. Build the result
            const result: AnalysisResult = {
                ticker,
                agent: agentKey,
                agent_display_name: AGENT_CONFIG[agentKey].display_name,
                signal: llmResponse.signal.toUpperCase() as "BULLISH" | "BEARISH" | "NEUTRAL",
                confidence: llmResponse.confidence,
                reasoning: llmResponse.reasoning,
                timestamp: new Date().toISOString(),
                analysis_data: analysisContext,
            };

            return new Response(
                JSON.stringify(result),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );

        } catch (error) {
            console.error(`Error in analyze-${agentKey}:`, error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return new Response(
                JSON.stringify({ error: errorMessage }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
    };
}

/**
 * Build agent-specific analysis context from raw data
 */
function buildAgentContext(agentKey: string, data: Record<string, unknown>) {
    const metrics = data.financial_metrics as Record<string, unknown> || {};
    // CRITICAL FIX: Ensure lineItems is always an array to prevent "slice is not a function" error
    const rawLineItems = data.financial_line_items;
    const lineItems = Array.isArray(rawLineItems) ? rawLineItems : [];
    const marketCap = data.market_cap as number;
    const esg = data.esg as Record<string, unknown> || {};
    const superinvestors = data.superinvestor_holdings as Record<string, unknown> || {};
    const peers = data.peers as Record<string, unknown> || {};
    const macro = data.macro as Record<string, unknown> || {};
    const insiderTrades = Array.isArray(data.insider_trades) ? data.insider_trades : [];
    const news = Array.isArray(data.news) ? data.news : [];
    const prices = Array.isArray(data.prices) ? data.prices : [];

    // Common metrics
    const roe = metrics.return_on_equity as number;
    const debtToEquity = metrics.debt_to_equity as number;
    const operatingMargin = metrics.operating_margin as number;
    const currentRatio = metrics.current_ratio as number;
    const peRatio = metrics.price_to_earnings as number;
    const pbRatio = metrics.price_to_book as number;
    const revenueGrowth = metrics.revenue_growth as number;
    const eps = metrics.earnings_per_share as number;

    // Calculate basic scores
    const roicScore = roe > 0.15 ? 3 : roe > 0.10 ? 2 : roe > 0.05 ? 1 : 0;
    const debtScore = debtToEquity < 0.5 ? 3 : debtToEquity < 1.0 ? 2 : debtToEquity < 2.0 ? 1 : 0;
    const marginScore = operatingMargin > 0.20 ? 3 : operatingMargin > 0.10 ? 2 : operatingMargin > 0.05 ? 1 : 0;
    const growthScore = revenueGrowth > 0.20 ? 3 : revenueGrowth > 0.10 ? 2 : revenueGrowth > 0.05 ? 1 : 0;

    // Agent-specific context building
    switch (agentKey) {
        case "warren_buffett":
        case "charlie_munger":
        case "ben_graham":
        case "mohnish_pabrai":
            // Value investors - focus on fundamentals, margin of safety
            return {
                ticker: data.ticker,
                roe,
                debt_to_equity: debtToEquity,
                operating_margin: operatingMargin,
                current_ratio: currentRatio,
                pe_ratio: peRatio,
                pb_ratio: pbRatio,
                market_cap: marketCap,
                moat_score: roicScore,
                financial_strength_score: debtScore,
                margin_score: marginScore,
                esg_score: esg.total_score,
                superinvestors_count: superinvestors.owned_by_count,
                cloning_signal: superinvestors.cloning_signal,
            };

        case "peter_lynch":
            // PEG ratio focused
            const pegRatio = peRatio && revenueGrowth > 0 ? peRatio / (revenueGrowth * 100) : null;
            return {
                ticker: data.ticker,
                peg_ratio: pegRatio,
                pe_ratio: peRatio,
                revenue_growth: revenueGrowth,
                eps,
                eps_growth: ((lineItems[0] as any)?.earnings_per_share - (lineItems[1] as any)?.earnings_per_share) / Math.abs((lineItems[1] as any)?.earnings_per_share || 1),
                debt_to_equity: debtToEquity,
                operating_margin: operatingMargin,
                growth_score: growthScore,
                insider_activity: summarizeInsiderActivity(insiderTrades),
                news_sentiment: summarizeNewsSentiment(news),
            };

        case "cathie_wood":
        case "growth_analyst":
            // Growth focused
            return {
                ticker: data.ticker,
                revenue_growth: revenueGrowth,
                operating_margin: operatingMargin,
                market_cap: marketCap,
                pe_ratio: peRatio,
                growth_score: growthScore,
                sector: peers.sector,
                news_count: news.length,
                recent_news: news.slice(0, 5).map((n: any) => n.title),
            };

        case "stanley_druckenmiller":
            // Macro + momentum focused
            return {
                ticker: data.ticker,
                vix: macro.vix,
                yield_curve_inverted: macro.yield_curve_inverted,
                fed_funds_rate: macro.fed_funds_rate,
                revenue_growth: revenueGrowth,
                momentum: calculateMomentum(prices),
                pe_ratio: peRatio,
                debt_to_equity: debtToEquity,
                volatility: calculateVolatility(prices),
                insider_activity: summarizeInsiderActivity(insiderTrades),
                news_sentiment: summarizeNewsSentiment(news),
            };

        case "michael_burry":
            // Contrarian, deep value
            return {
                ticker: data.ticker,
                pb_ratio: pbRatio,
                pe_ratio: peRatio,
                debt_to_equity: debtToEquity,
                market_cap: marketCap,
                current_ratio: currentRatio,
                operating_margin: operatingMargin,
                insider_activity: summarizeInsiderActivity(insiderTrades),
                short_interest: "N/A", // Would need additional data source
            };

        case "bill_ackman":
            // Activist focused
            return {
                ticker: data.ticker,
                market_cap: marketCap,
                operating_margin: operatingMargin,
                roe,
                pe_ratio: peRatio,
                debt_to_equity: debtToEquity,
                esg_score: esg.total_score,
                insider_activity: summarizeInsiderActivity(insiderTrades),
            };

        case "phil_fisher":
            // Scuttlebutt, management quality
            return {
                ticker: data.ticker,
                revenue_growth: revenueGrowth,
                operating_margin: operatingMargin,
                sector: peers.sector,
                insider_activity: summarizeInsiderActivity(insiderTrades),
                news_sentiment: summarizeNewsSentiment(news),
                recent_news: news.slice(0, 10).map((n: any) => n.title),
            };

        case "rakesh_jhunjhunwala":
            // Macro + emerging markets
            return {
                ticker: data.ticker,
                market_cap: marketCap,
                roe,
                revenue_growth: revenueGrowth,
                pe_ratio: peRatio,
                sector: peers.sector,
                macro: {
                    vix: macro.vix,
                    yield_curve_inverted: macro.yield_curve_inverted,
                },
            };

        case "aswath_damodaran":
            // Valuation focused
            const latestRevenue = (lineItems[0] as any)?.revenue;
            const latestNetIncome = (lineItems[0] as any)?.net_income;
            return {
                ticker: data.ticker,
                market_cap: marketCap,
                pe_ratio: peRatio,
                pb_ratio: pbRatio,
                roe,
                revenue_growth: revenueGrowth,
                operating_margin: operatingMargin,
                latest_revenue: latestRevenue,
                latest_net_income: latestNetIncome,
                wacc_estimate: 0.10, // Simplified
                terminal_growth: 0.03,
            };

        case "technical_analyst":
            // Pure technicals
            return {
                ticker: data.ticker,
                prices: prices.slice(0, 252), // Last year
                momentum: calculateMomentum(prices),
                volatility: calculateVolatility(prices),
                rsi: calculateRSI(prices),
                trend: determineTrend(prices),
            };

        case "fundamentals_analyst":
            // Pure fundamentals
            return {
                ticker: data.ticker,
                roe,
                debt_to_equity: debtToEquity,
                operating_margin: operatingMargin,
                current_ratio: currentRatio,
                pe_ratio: peRatio,
                pb_ratio: pbRatio,
                revenue_growth: revenueGrowth,
                eps,
                financial_line_items: lineItems.slice(0, 5),
            };

        case "news_sentiment_analyst":
            // News analysis
            return {
                ticker: data.ticker,
                total_news_count: news.length,
                news_items: news.slice(0, 20).map((n: any) => ({
                    title: n.title,
                    date: n.published_at,
                    source: n.source,
                })),
                sentiment_summary: summarizeNewsSentiment(news),
            };

        case "sentiment_analyst":
            // Market sentiment
            return {
                ticker: data.ticker,
                insider_activity: summarizeInsiderActivity(insiderTrades),
                superinvestors_count: superinvestors.owned_by_count,
                cloning_signal: superinvestors.cloning_signal,
                news_sentiment: summarizeNewsSentiment(news),
            };

        default:
            // Generic context
            return {
                ticker: data.ticker,
                financial_metrics: metrics,
                market_cap: marketCap,
                macro,
                esg,
                superinvestors,
            };
    }
}

// Helper functions

function summarizeInsiderActivity(trades: Record<string, unknown>[]): Record<string, unknown> {
    if (!trades || trades.length === 0) {
        return { summary: "No insider trades data", buy_ratio: null };
    }

    const buys = trades.filter((t: any) => t.transaction_type === "buy").length;
    const sells = trades.filter((t: any) => t.transaction_type === "sell").length;
    const total = buys + sells;
    const buyRatio = total > 0 ? buys / total : null;

    let summary = "Neutral";
    if (buyRatio !== null) {
        if (buyRatio > 0.7) summary = "Heavy insider buying";
        else if (buyRatio > 0.4) summary = "Moderate insider buying";
        else if (buyRatio < 0.2) summary = "Heavy insider selling";
    }

    return { summary, buys, sells, buy_ratio: buyRatio };
}

function summarizeNewsSentiment(news: Record<string, unknown>[]): Record<string, unknown> {
    if (!news || news.length === 0) {
        return { summary: "No news data", sentiment_score: 0.5 };
    }

    const negativeKeywords = ["lawsuit", "fraud", "negative", "downturn", "decline", "investigation", "recall", "warning"];
    const positiveKeywords = ["growth", "record", "breakthrough", "expansion", "beat", "upgrade", "strong"];

    let positiveCount = 0;
    let negativeCount = 0;

    news.forEach((n: any) => {
        const title = (n.title || "").toLowerCase();
        if (negativeKeywords.some(k => title.includes(k))) negativeCount++;
        if (positiveKeywords.some(k => title.includes(k))) positiveCount++;
    });

    const total = positiveCount + negativeCount || 1;
    const sentimentScore = (positiveCount - negativeCount + total) / (2 * total);

    let summary = "Neutral";
    if (sentimentScore > 0.6) summary = "Positive";
    else if (sentimentScore < 0.4) summary = "Negative";

    return { summary, sentiment_score: sentimentScore, positive_count: positiveCount, negative_count: negativeCount };
}

function calculateMomentum(prices: Record<string, unknown>[]): Record<string, unknown> {
    if (!prices || prices.length < 30) {
        return { momentum_1m: null, momentum_3m: null };
    }

    const closes = prices.map((p: any) => p.close).filter(Boolean);
    if (closes.length < 63) {
        return { momentum_1m: null, momentum_3m: null };
    }

    const current = closes[0];
    const oneMonthAgo = closes[Math.min(21, closes.length - 1)];
    const threeMonthsAgo = closes[Math.min(63, closes.length - 1)];

    return {
        momentum_1m: oneMonthAgo ? (current - oneMonthAgo) / oneMonthAgo : null,
        momentum_3m: threeMonthsAgo ? (current - threeMonthsAgo) / threeMonthsAgo : null,
    };
}

function calculateVolatility(prices: Record<string, unknown>[]): number | null {
    if (!prices || prices.length < 21) return null;

    const returns: number[] = [];
    for (let i = 1; i < Math.min(21, prices.length); i++) {
        const prev = (prices[i - 1] as any).close;
        const curr = (prices[i] as any).close;
        if (prev && curr) {
            returns.push((curr - prev) / prev);
        }
    }

    if (returns.length < 10) return null;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(252); // Annualized
}

function calculateRSI(prices: Record<string, unknown>[], period: number = 14): number | null {
    if (!prices || prices.length < period + 1) return null;

    const closes = prices.slice(0, period + 1).map((p: any) => p.close).filter(Boolean);
    if (closes.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i < closes.length; i++) {
        const change = closes[i - 1] - closes[i]; // Reversed because prices are newest first
        if (change > 0) gains += change;
        else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function determineTrend(prices: Record<string, unknown>[]): string {
    if (!prices || prices.length < 50) return "unknown";

    const closes = prices.slice(0, 50).map((p: any) => p.close).filter(Boolean);
    if (closes.length < 50) return "unknown";

    // Simple EMA comparison
    const ema20 = closes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
    const ema50 = closes.slice(0, 50).reduce((a, b) => a + b, 0) / 50;

    if (ema20 > ema50 * 1.02) return "bullish";
    if (ema20 < ema50 * 0.98) return "bearish";
    return "neutral";
}
