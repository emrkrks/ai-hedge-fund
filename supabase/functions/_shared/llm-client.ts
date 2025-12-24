// Supabase Edge Functions - LLM Client
// Supports Azure OpenAI, Google Gemini, Z.ai (GLM), and Groq
// Multi-LLM Consensus Mode for robust analysis
// Enhanced rate limiting with exponential backoff

import { LLMSignalResponse } from "./types.ts";

export type LLMProvider = "azure" | "gemini" | "zai" | "groq";

// All available providers for consensus mode
export const ALL_PROVIDERS: LLMProvider[] = ["azure", "gemini", "zai", "groq"];

// ============================================================================
// Rate Limiting Configuration for LLM Providers
// ============================================================================
const LLM_RATE_LIMIT_CONFIG = {
    MAX_RETRIES: 5,                  // Maximum retry attempts (increased from 3)
    INITIAL_COOLDOWN_MS: 10000,      // Initial cooldown: 10 seconds (increased from 5s)
    MAX_COOLDOWN_MS: 60000,          // Maximum cooldown: 60 seconds
    BACKOFF_MULTIPLIER: 2,           // Exponential backoff multiplier
    JITTER_MAX_MS: 2000,             // Random jitter up to 2 seconds
    DELAY_BETWEEN_PROVIDERS_MS: 2000, // Delay between sequential provider calls
};

// Track last request time per provider to prevent rapid fire
const lastProviderRequestTime: Record<LLMProvider, number> = {
    azure: 0,
    gemini: 0,
    zai: 0,
    groq: 0,
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Add random jitter to prevent thundering herd
 */
function addJitter(baseMs: number): number {
    return baseMs + Math.floor(Math.random() * LLM_RATE_LIMIT_CONFIG.JITTER_MAX_MS);
}

/**
 * Calculate exponential backoff delay for retries
 */
function getLLMBackoffDelay(retryCount: number): number {
    const delay = LLM_RATE_LIMIT_CONFIG.INITIAL_COOLDOWN_MS *
        Math.pow(LLM_RATE_LIMIT_CONFIG.BACKOFF_MULTIPLIER, retryCount);
    return Math.min(addJitter(delay), LLM_RATE_LIMIT_CONFIG.MAX_COOLDOWN_MS);
}

/**
 * Wait before making request to a specific provider
 */
async function waitForProvider(provider: LLMProvider): Promise<void> {
    const now = Date.now();
    const lastRequest = lastProviderRequestTime[provider];
    const minDelay = LLM_RATE_LIMIT_CONFIG.DELAY_BETWEEN_PROVIDERS_MS;

    if (now - lastRequest < minDelay) {
        const waitTime = minDelay - (now - lastRequest);
        console.log(`[LLM/${provider}] Rate limit wait: ${waitTime}ms`);
        await sleep(waitTime);
    }

    lastProviderRequestTime[provider] = Date.now();
}

/**
 * Parse Retry-After header or extract wait time from error response
 */
function parseRetryAfterFromError(responseText: string): number | null {
    // Try to find "retry after X seconds" or similar patterns
    const patterns = [
        /retry after (\d+) seconds?/i,
        /wait (\d+) seconds?/i,
        /available in (\d+) seconds?/i,
        /cooldown.*?(\d+)/i,
    ];

    for (const pattern of patterns) {
        const match = responseText.match(pattern);
        if (match) {
            return parseInt(match[1], 10) * 1000;
        }
    }

    return null;
}

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

    if (!apiKey || !endpoint) {
        throw new Error("Azure OpenAI credentials not configured");
    }

    // Wait for rate limit before request
    await waitForProvider("azure");

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

        // Retry on rate limit (429) error with exponential backoff
        if (response.status === 429 && retryCount < LLM_RATE_LIMIT_CONFIG.MAX_RETRIES) {
            const serverWaitTime = parseRetryAfterFromError(errorText);
            const cooldownMs = serverWaitTime || getLLMBackoffDelay(retryCount);

            console.warn(
                `[Azure] Rate limited (429). Retry ${retryCount + 1}/${LLM_RATE_LIMIT_CONFIG.MAX_RETRIES} ` +
                `after ${Math.round(cooldownMs / 1000)}s cooldown...`
            );
            await sleep(cooldownMs);
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

    if (!apiKey) {
        throw new Error("Gemini API key not configured");
    }

    // Wait for rate limit before request
    await waitForProvider("gemini");

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

        // Retry on rate limit (429) error with exponential backoff
        if (response.status === 429 && retryCount < LLM_RATE_LIMIT_CONFIG.MAX_RETRIES) {
            const serverWaitTime = parseRetryAfterFromError(errorText);
            const cooldownMs = serverWaitTime || getLLMBackoffDelay(retryCount);

            console.warn(
                `[Gemini] Rate limited (429). Retry ${retryCount + 1}/${LLM_RATE_LIMIT_CONFIG.MAX_RETRIES} ` +
                `after ${Math.round(cooldownMs / 1000)}s cooldown...`
            );
            await sleep(cooldownMs);
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

    if (!apiKey) {
        throw new Error("Z.ai API key not configured");
    }

    // Wait for rate limit before request
    await waitForProvider("zai");

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

        // Retry on rate limit (429) error with exponential backoff
        if (response.status === 429 && retryCount < LLM_RATE_LIMIT_CONFIG.MAX_RETRIES) {
            const serverWaitTime = parseRetryAfterFromError(errorText);
            const cooldownMs = serverWaitTime || getLLMBackoffDelay(retryCount);

            console.warn(
                `[Z.ai] Rate limited (429). Retry ${retryCount + 1}/${LLM_RATE_LIMIT_CONFIG.MAX_RETRIES} ` +
                `after ${Math.round(cooldownMs / 1000)}s cooldown...`
            );
            await sleep(cooldownMs);
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

    if (!apiKey) {
        throw new Error("Groq API key not configured");
    }

    // Wait for rate limit before request
    await waitForProvider("groq");

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

        // Retry on rate limit (429) error with exponential backoff
        if (response.status === 429 && retryCount < LLM_RATE_LIMIT_CONFIG.MAX_RETRIES) {
            const serverWaitTime = parseRetryAfterFromError(errorText);
            const cooldownMs = serverWaitTime || getLLMBackoffDelay(retryCount);

            console.warn(
                `[Groq] Rate limited (429). Retry ${retryCount + 1}/${LLM_RATE_LIMIT_CONFIG.MAX_RETRIES} ` +
                `after ${Math.round(cooldownMs / 1000)}s cooldown...`
            );
            await sleep(cooldownMs);
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
 * Enhanced to handle various confidence formats and edge cases
 */
function parseSignalResponse(content: string, provider: string): LLMSignalResponse {
    try {
        // Clean markdown code blocks if present
        let cleanContent = content
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        // Try to extract JSON if it's embedded in text
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleanContent = jsonMatch[0];
        }

        const parsed = JSON.parse(cleanContent);

        // Normalize signal to uppercase
        const rawSignal = String(parsed.signal || "neutral").toUpperCase().trim();
        let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
        if (rawSignal.includes("BULLISH") || rawSignal.includes("BUY")) {
            signal = "BULLISH";
        } else if (rawSignal.includes("BEARISH") || rawSignal.includes("SELL")) {
            signal = "BEARISH";
        }

        // Extract confidence - handle multiple formats
        let confidence = 0;
        const rawConfidence = parsed.confidence;

        if (typeof rawConfidence === "number") {
            confidence = rawConfidence;
        } else if (typeof rawConfidence === "string") {
            // Handle percentage strings like "75%" or "75 percent"
            const numMatch = rawConfidence.match(/(\d+(?:\.\d+)?)/);
            if (numMatch) {
                confidence = parseFloat(numMatch[1]);
            } else {
                // Handle text descriptions
                const confLower = rawConfidence.toLowerCase();
                if (confLower.includes("very high") || confLower.includes("extremely")) confidence = 90;
                else if (confLower.includes("high")) confidence = 75;
                else if (confLower.includes("moderate") || confLower.includes("medium")) confidence = 55;
                else if (confLower.includes("low")) confidence = 35;
                else if (confLower.includes("very low")) confidence = 15;
            }
        }

        // If still 0, infer from signal (LLM gave a signal so must have SOME confidence)
        if (confidence === 0 && signal !== "NEUTRAL") {
            confidence = 50; // Default to moderate confidence if LLM gave a directional signal
        } else if (confidence === 0 && parsed.reasoning && parsed.reasoning.length > 50) {
            confidence = 40; // If there's substantial reasoning, give some baseline confidence
        }

        // Normalize to 0-100 range
        confidence = Math.min(100, Math.max(0, Math.round(confidence)));

        // Extract reasoning
        const reasoning = String(parsed.reasoning || parsed.explanation || parsed.rationale || "Analysis completed").substring(0, 1000);

        return {
            signal,
            confidence,
            reasoning,
            provider,
        };
    } catch (error) {
        console.error(`Failed to parse ${provider} LLM response:`, error, content);

        // Try to salvage something from the raw content
        const contentLower = content.toLowerCase();
        let fallbackSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
        let fallbackConfidence = 30; // Low confidence for fallback

        if (contentLower.includes("bullish") || contentLower.includes("buy")) {
            fallbackSignal = "BULLISH";
            fallbackConfidence = 40;
        } else if (contentLower.includes("bearish") || contentLower.includes("sell")) {
            fallbackSignal = "BEARISH";
            fallbackConfidence = 40;
        }

        return {
            signal: fallbackSignal,
            confidence: fallbackConfidence,
            reasoning: `[Parse fallback] ${content.substring(0, 200)}...`,
            provider,
        };
    }
}

/**
 * Call multiple LLM providers and return all results
 * Uses sequential execution with delays to prevent rate limiting
 */
export async function callMultipleLLMs(
    systemPrompt: string,
    userPrompt: string,
    providers: LLMProvider[] = ALL_PROVIDERS,
    sequential: boolean = true // Default to sequential to prevent rate limits
): Promise<LLMSignalResponse[]> {
    if (sequential) {
        // Sequential execution with delay between providers
        const results: LLMSignalResponse[] = [];

        for (const provider of providers) {
            try {
                console.log(`[LLM] Calling ${provider} (sequential mode)...`);
                const result = await callLLM({
                    provider,
                    systemPrompt,
                    userPrompt,
                });
                results.push(result);

                // Small delay between providers even within sequential mode
                await sleep(LLM_RATE_LIMIT_CONFIG.DELAY_BETWEEN_PROVIDERS_MS);
            } catch (error) {
                console.error(`[LLM] ${provider} failed:`, error);
                // Continue with other providers
            }
        }

        return results;
    } else {
        // Parallel execution (use with caution - may hit rate limits)
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
