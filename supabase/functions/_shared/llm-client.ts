// Supabase Edge Functions - LLM Client
// Supports Azure OpenAI, Google Gemini, Z.ai (GLM), and Groq
// Multi-LLM Consensus Mode for robust analysis

import { LLMSignalResponse } from "./types.ts";

export type LLMProvider = "azure" | "gemini" | "zai" | "groq";

// All available providers for consensus mode
export const ALL_PROVIDERS: LLMProvider[] = ["azure", "gemini", "zai", "groq"];

interface LLMCallOptions {
    provider: LLMProvider;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * Call an LLM provider and return a structured signal response
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMSignalResponse> {
    const { provider, systemPrompt, userPrompt, temperature = 0.3, maxTokens = 500 } = options;

    switch (provider) {
        case "azure":
            return await callAzureOpenAI(systemPrompt, userPrompt, temperature, maxTokens);
        case "gemini":
            return await callGemini(systemPrompt, userPrompt, temperature, maxTokens);
        case "zai":
            return await callZai(systemPrompt, userPrompt, temperature, maxTokens);
        case "groq":
            return await callGroq(systemPrompt, userPrompt, temperature, maxTokens);
        default:
            throw new Error(`Unknown LLM provider: ${provider}`);
    }
}

/**
 * Azure OpenAI API call with retry logic
 */
async function callAzureOpenAI(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number,
    retryCount: number = 0
): Promise<LLMSignalResponse> {
    const apiKey = Deno.env.get("AZURE_OPENAI_API_KEY");
    const endpoint = Deno.env.get("AZURE_OPENAI_ENDPOINT");
    const deploymentName = Deno.env.get("AZURE_OPENAI_DEPLOYMENT") || "gpt-4o-mini";
    const maxRetries = 3;
    const cooldownMs = 5000; // 5 seconds

    if (!apiKey || !endpoint) {
        throw new Error("Azure OpenAI credentials not configured");
    }

    const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": apiKey,
        },
        body: JSON.stringify({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();

        // Retry on rate limit (429) error
        if (response.status === 429 && retryCount < maxRetries) {
            console.log(`Azure rate limited (429). Retry ${retryCount + 1}/${maxRetries} after ${cooldownMs / 1000}s cooldown...`);
            await new Promise(resolve => setTimeout(resolve, cooldownMs));
            return callAzureOpenAI(systemPrompt, userPrompt, temperature, maxTokens, retryCount + 1);
        }

        throw new Error(`Azure OpenAI error: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    return parseSignalResponse(content, "azure");
}

/**
 * Google Gemini API call with retry logic
 */
async function callGemini(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number,
    retryCount: number = 0
): Promise<LLMSignalResponse> {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const modelName = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash-lite";
    const maxRetries = 3;
    const cooldownMs = 5000; // 5 seconds

    if (!apiKey) {
        throw new Error("Gemini API key not configured");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: `${systemPrompt}\n\n${userPrompt}`,
                        },
                    ],
                },
            ],
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                responseMimeType: "application/json",
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();

        // Retry on rate limit (429) error
        if (response.status === 429 && retryCount < maxRetries) {
            console.log(`Gemini rate limited (429). Retry ${retryCount + 1}/${maxRetries} after ${cooldownMs / 1000}s cooldown...`);
            await new Promise(resolve => setTimeout(resolve, cooldownMs));
            return callGemini(systemPrompt, userPrompt, temperature, maxTokens, retryCount + 1);
        }

        throw new Error(`Gemini error: ${errorText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    return parseSignalResponse(content, "gemini");
}

/**
 * Z.ai (GLM) API call with retry logic
 */
async function callZai(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number,
    retryCount: number = 0
): Promise<LLMSignalResponse> {
    const apiKey = Deno.env.get("ZAI_API_KEY");
    const modelName = Deno.env.get("ZAI_MODEL") || "glm-4v-flash";
    const maxRetries = 3;
    const cooldownMs = 5000; // 5 seconds

    if (!apiKey) {
        throw new Error("Z.ai API key not configured");
    }

    const url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();

        // Retry on rate limit (429) error
        if (response.status === 429 && retryCount < maxRetries) {
            console.log(`Z.ai rate limited (429). Retry ${retryCount + 1}/${maxRetries} after ${cooldownMs / 1000}s cooldown...`);
            await new Promise(resolve => setTimeout(resolve, cooldownMs));
            return callZai(systemPrompt, userPrompt, temperature, maxTokens, retryCount + 1);
        }

        throw new Error(`Z.ai error: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    return parseSignalResponse(content, "zai");
}

/**
 * Groq API call with retry logic (fast inference with Llama, Mixtral, etc.)
 */
async function callGroq(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number,
    retryCount: number = 0
): Promise<LLMSignalResponse> {
    const apiKey = Deno.env.get("GROQ_API_KEY");
    const modelName = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
    const maxRetries = 3;
    const cooldownMs = 5000; // 5 seconds

    if (!apiKey) {
        throw new Error("Groq API key not configured");
    }

    const url = "https://api.groq.com/openai/v1/chat/completions";

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();

        // Retry on rate limit (429) error
        if (response.status === 429 && retryCount < maxRetries) {
            console.log(`Groq rate limited (429). Retry ${retryCount + 1}/${maxRetries} after ${cooldownMs / 1000}s cooldown...`);
            await new Promise(resolve => setTimeout(resolve, cooldownMs));
            return callGroq(systemPrompt, userPrompt, temperature, maxTokens, retryCount + 1);
        }

        throw new Error(`Groq error: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    return parseSignalResponse(content, "groq");
}

/**
 * Parse LLM response to extract signal, confidence, reasoning
 */
function parseSignalResponse(content: string, provider: string): LLMSignalResponse {
    try {
        // Clean markdown code blocks if present
        const cleanContent = content
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        const parsed = JSON.parse(cleanContent);

        // Normalize signal to uppercase
        const signal = (parsed.signal || "neutral").toUpperCase();

        return {
            signal: signal as "BULLISH" | "BEARISH" | "NEUTRAL",
            confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
            reasoning: String(parsed.reasoning || "No reasoning provided").substring(0, 1000),
            provider: provider,
        };
    } catch (error) {
        console.error(`Failed to parse ${provider} LLM response:`, error, content);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            signal: "NEUTRAL",
            confidence: 0,
            reasoning: `Parse error (${provider}): ${errorMessage}`,
            provider: provider,
        };
    }
}

/**
 * Call multiple LLM providers in parallel and return all results
 */
export async function callMultipleLLMs(
    systemPrompt: string,
    userPrompt: string,
    providers: LLMProvider[] = ALL_PROVIDERS
): Promise<LLMSignalResponse[]> {
    const results = await Promise.allSettled(
        providers.map((provider) =>
            callLLM({
                provider,
                systemPrompt,
                userPrompt,
            })
        )
    );

    return results
        .filter((r): r is PromiseFulfilledResult<LLMSignalResponse> => r.status === "fulfilled")
        .map((r) => r.value);
}

/**
 * Multi-LLM Consensus Mode
 * Calls all 4 LLMs and aggregates their signals using voting
 * Returns the majority decision with averaged confidence
 */
export async function callWithConsensus(
    systemPrompt: string,
    userPrompt: string,
    providers: LLMProvider[] = ALL_PROVIDERS
): Promise<{
    consensus_signal: "BULLISH" | "BEARISH" | "NEUTRAL";
    consensus_confidence: number;
    consensus_reasoning: string;
    individual_results: LLMSignalResponse[];
    vote_breakdown: { bullish: number; bearish: number; neutral: number };
}> {
    const results = await callMultipleLLMs(systemPrompt, userPrompt, providers);

    // Count votes
    let bullishVotes = 0;
    let bearishVotes = 0;
    let neutralVotes = 0;
    let totalConfidence = 0;
    const reasonings: string[] = [];

    for (const result of results) {
        const signal = result.signal.toUpperCase();
        if (signal === "BULLISH") bullishVotes++;
        else if (signal === "BEARISH") bearishVotes++;
        else neutralVotes++;

        totalConfidence += result.confidence;
        reasonings.push(`[${result.provider?.toUpperCase() || "LLM"}] ${result.signal}: ${result.reasoning.substring(0, 200)}`);
    }

    // Determine consensus signal by majority vote
    let consensusSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    const maxVotes = Math.max(bullishVotes, bearishVotes, neutralVotes);

    if (bullishVotes === maxVotes && bullishVotes > bearishVotes) {
        consensusSignal = "BULLISH";
    } else if (bearishVotes === maxVotes && bearishVotes > bullishVotes) {
        consensusSignal = "BEARISH";
    }
    // If tie or neutral has max, default to NEUTRAL

    // Calculate averaged confidence
    const avgConfidence = results.length > 0 ? Math.round(totalConfidence / results.length) : 0;

    // Boost or penalize confidence based on consensus strength
    let adjustedConfidence = avgConfidence;
    const consensusStrength = maxVotes / Math.max(results.length, 1);

    if (consensusStrength >= 0.75) {
        // Strong consensus (3+ out of 4 agree) - boost confidence
        adjustedConfidence = Math.min(100, Math.round(avgConfidence * 1.2));
    } else if (consensusStrength < 0.5) {
        // Weak consensus (split) - reduce confidence
        adjustedConfidence = Math.round(avgConfidence * 0.7);
    }

    // Build consensus reasoning
    const consensusReasoning = `**Consensus: ${consensusSignal}** (${maxVotes}/${results.length} LLMs agree)\n\n` +
        `Vote breakdown: 🟢 Bullish: ${bullishVotes}, 🔴 Bearish: ${bearishVotes}, ⚪ Neutral: ${neutralVotes}\n\n` +
        reasonings.join("\n\n");

    return {
        consensus_signal: consensusSignal,
        consensus_confidence: adjustedConfidence,
        consensus_reasoning: consensusReasoning,
        individual_results: results,
        vote_breakdown: {
            bullish: bullishVotes,
            bearish: bearishVotes,
            neutral: neutralVotes,
        },
    };
}
