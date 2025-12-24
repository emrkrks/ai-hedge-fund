// Supabase Edge Function: analyze-aggregate
// Calls all agents and aggregates their signals

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { AGENT_CONFIG, AnalysisResult } from "../_shared/types.ts";

// Force redeploy trigger

interface AggregateRequest {
    ticker: string;
    end_date?: string;
    llm_provider?: "azure" | "gemini" | "zai";
    agents?: string[]; // Optional: specific agents to run
}

interface AggregatedResult {
    ticker: string;
    timestamp: string;
    aggregated_signal: "BULLISH" | "BEARISH" | "NEUTRAL";
    aggregated_confidence: number;
    bullish_count: number;
    bearish_count: number;
    neutral_count: number;
    agent_results: AnalysisResult[];
}

// Get the Supabase URL and construct Functions URL
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const request: AggregateRequest = await req.json();
        const { ticker, end_date, llm_provider = "gemini", agents } = request;

        if (!ticker) {
            return new Response(
                JSON.stringify({ error: "ticker is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Determine which agents to run
        const agentKeys = agents || Object.keys(AGENT_CONFIG);

        // Map agent keys to function names
        const agentFunctionMap: Record<string, string> = {
            warren_buffett: "analyze-warren-buffett",
            peter_lynch: "analyze-peter-lynch",
            ben_graham: "analyze-ben-graham",
            charlie_munger: "analyze-charlie-munger",
            michael_burry: "analyze-michael-burry",
            cathie_wood: "analyze-cathie-wood",
            bill_ackman: "analyze-bill-ackman",
            stanley_druckenmiller: "analyze-stanley-druckenmiller",
            phil_fisher: "analyze-phil-fisher",
            mohnish_pabrai: "analyze-mohnish-pabrai",
            rakesh_jhunjhunwala: "analyze-rakesh-jhunjhunwala",
            aswath_damodaran: "analyze-aswath-damodaran",
            technical_analyst: "analyze-technical",
            fundamentals_analyst: "analyze-fundamentals",
            growth_analyst: "analyze-growth",
            news_sentiment_analyst: "analyze-news-sentiment",
            sentiment_analyst: "analyze-sentiment",
        };

        // Call all agent functions in parallel
        const agentPromises = agentKeys.map(async (agentKey) => {
            const functionName = agentFunctionMap[agentKey];
            if (!functionName) return null;

            try {
                const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: req.headers.get("Authorization") || "",
                    },
                    body: JSON.stringify({ ticker, end_date, llm_provider }),
                });

                if (response.ok) {
                    return await response.json() as AnalysisResult;
                } else {
                    console.error(`Agent ${agentKey} failed:`, await response.text());
                    return null;
                }
            } catch (error) {
                console.error(`Agent ${agentKey} error:`, error);
                return null;
            }
        });

        const results = await Promise.all(agentPromises);
        const validResults = results.filter((r): r is AnalysisResult => r !== null);

        // Calculate aggregate signal
        let bullishCount = 0;
        let bearishCount = 0;
        let neutralCount = 0;
        let totalConfidence = 0;

        validResults.forEach((result) => {
            const signal = result.signal.toUpperCase();
            if (signal === "BULLISH") bullishCount++;
            else if (signal === "BEARISH") bearishCount++;
            else neutralCount++;
            totalConfidence += result.confidence;
        });

        const avgConfidence = validResults.length > 0 ? totalConfidence / validResults.length : 0;

        let aggregatedSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
        if (bullishCount > bearishCount && bullishCount > neutralCount) {
            aggregatedSignal = "BULLISH";
        } else if (bearishCount > bullishCount && bearishCount > neutralCount) {
            aggregatedSignal = "BEARISH";
        }

        const aggregatedResult: AggregatedResult = {
            ticker,
            timestamp: new Date().toISOString(),
            aggregated_signal: aggregatedSignal,
            aggregated_confidence: Math.round(avgConfidence),
            bullish_count: bullishCount,
            bearish_count: bearishCount,
            neutral_count: neutralCount,
            agent_results: validResults,
        };

        return new Response(
            JSON.stringify(aggregatedResult),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Error in analyze-aggregate:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
