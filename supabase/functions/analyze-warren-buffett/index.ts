// Supabase Edge Function: analyze-warren-buffett
// Warren Buffett Agent - The Oracle of Omaha

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { callLLM, LLMProvider } from "../_shared/llm-client.ts";
import { getAgentPrompt } from "../_shared/prompts.ts";
import { getComprehensiveData } from "../_shared/financial-api.ts";
import { AnalyzeRequest, AnalysisResult, AGENT_CONFIG } from "../_shared/types.ts";

const AGENT_KEY = "warren_buffett";

serve(async (req: Request) => {
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

        // 1. Fetch comprehensive financial data
        const data = await getComprehensiveData(ticker, end_date);

        // 2. Build Buffett-specific analysis context
        const analysisContext = buildBuffettContext(data);

        // 3. Get the Warren Buffett prompt
        const prompt = getAgentPrompt(AGENT_KEY);

        // 4. Call LLM with the prompt
        const llmResponse = await callLLM({
            provider: llm_provider as LLMProvider,
            systemPrompt: prompt.system,
            userPrompt: prompt.user(ticker, analysisContext),
        });

        // 5. Build the result
        const result: AnalysisResult = {
            ticker,
            agent: AGENT_KEY,
            agent_display_name: AGENT_CONFIG[AGENT_KEY].display_name,
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
        console.error("Error in analyze-warren-buffett:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

/**
 * Build Buffett-specific analysis context from raw data
 */
function buildBuffettContext(data: Record<string, unknown>) {
    const metrics = data.financial_metrics as Record<string, unknown> || {};
    const lineItems = data.financial_line_items as Record<string, unknown>[] || [];
    const marketCap = data.market_cap as number;
    const esg = data.esg as Record<string, unknown> || {};
    const superinvestors = data.superinvestor_holdings as Record<string, unknown> || {};

    // Calculate Buffett-specific metrics
    const roe = metrics.return_on_equity as number;
    const debtToEquity = metrics.debt_to_equity as number;
    const operatingMargin = metrics.operating_margin as number;
    const currentRatio = metrics.current_ratio as number;

    // Moat analysis based on ROE consistency
    let moatScore = 0;
    let moatDetails = "";
    if (roe > 0.20) {
        moatScore = 3;
        moatDetails = `Excellent ROE of ${(roe * 100).toFixed(1)}% indicates strong moat`;
    } else if (roe > 0.15) {
        moatScore = 2;
        moatDetails = `Good ROE of ${(roe * 100).toFixed(1)}%`;
    } else if (roe > 0.10) {
        moatScore = 1;
        moatDetails = `Moderate ROE of ${(roe * 100).toFixed(1)}%`;
    } else {
        moatDetails = `Weak ROE of ${roe ? (roe * 100).toFixed(1) : "N/A"}%`;
    }

    // Financial strength
    let financialStrengthScore = 0;
    let financialStrengthDetails: string[] = [];

    if (debtToEquity !== undefined) {
        if (debtToEquity < 0.5) {
            financialStrengthScore += 2;
            financialStrengthDetails.push(`Conservative debt (D/E: ${debtToEquity.toFixed(2)})`);
        } else if (debtToEquity < 1.0) {
            financialStrengthScore += 1;
            financialStrengthDetails.push(`Moderate debt (D/E: ${debtToEquity.toFixed(2)})`);
        } else {
            financialStrengthDetails.push(`High debt (D/E: ${debtToEquity.toFixed(2)})`);
        }
    }

    if (currentRatio !== undefined) {
        if (currentRatio > 2.0) {
            financialStrengthScore += 1;
            financialStrengthDetails.push(`Strong liquidity (Current ratio: ${currentRatio.toFixed(2)})`);
        } else if (currentRatio > 1.5) {
            financialStrengthDetails.push(`Adequate liquidity (Current ratio: ${currentRatio.toFixed(2)})`);
        } else {
            financialStrengthDetails.push(`Weak liquidity (Current ratio: ${currentRatio?.toFixed(2) || "N/A"})`);
        }
    }

    // Margin analysis
    let marginDetails = "";
    if (operatingMargin !== undefined) {
        if (operatingMargin > 0.20) {
            marginDetails = `Strong operating margin of ${(operatingMargin * 100).toFixed(1)}%`;
        } else if (operatingMargin > 0.10) {
            marginDetails = `Moderate operating margin of ${(operatingMargin * 100).toFixed(1)}%`;
        } else {
            marginDetails = `Weak operating margin of ${(operatingMargin * 100).toFixed(1)}%`;
        }
    }

    // Calculate simple intrinsic value estimate
    const latestNetIncome = (lineItems[0] as Record<string, unknown>)?.net_income as number;
    let intrinsicValue = null;
    let marginOfSafety = null;

    if (latestNetIncome && latestNetIncome > 0) {
        // Conservative 12x earnings multiple
        intrinsicValue = latestNetIncome * 12;
        if (marketCap) {
            marginOfSafety = (intrinsicValue - marketCap) / marketCap;
        }
    }

    // Total score
    const totalScore = moatScore + financialStrengthScore;
    const maxScore = 6;

    return {
        ticker: data.ticker,
        score: totalScore,
        max_score: maxScore,
        moat_analysis: {
            score: moatScore,
            details: moatDetails,
        },
        financial_strength: {
            score: financialStrengthScore,
            details: financialStrengthDetails.join("; "),
        },
        margin_analysis: marginDetails,
        intrinsic_value: intrinsicValue,
        market_cap: marketCap,
        margin_of_safety: marginOfSafety,
        roe: roe,
        debt_to_equity: debtToEquity,
        operating_margin: operatingMargin,
        current_ratio: currentRatio,
        esg_score: esg.total_score,
        superinvestors_count: superinvestors.owned_by_count,
        cloning_signal: superinvestors.cloning_signal,
    };
}
