// Supabase Edge Functions - LLM Client
// Supports Azure OpenAI, Google Gemini, and Z.ai (GLM)

import { LLMSignalResponse } from "./types.ts";

export type LLMProvider = "azure" | "gemini" | "zai";

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
        default:
            throw new Error(`Unknown LLM provider: ${provider}`);
    }
}

/**
 * Azure OpenAI API call
 */
async function callAzureOpenAI(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number
): Promise<LLMSignalResponse> {
    const apiKey = Deno.env.get("AZURE_OPENAI_API_KEY");
    const endpoint = Deno.env.get("AZURE_OPENAI_ENDPOINT");
    const deploymentName = Deno.env.get("AZURE_OPENAI_DEPLOYMENT") || "gpt-4o-mini";

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
        const error = await response.text();
        throw new Error(`Azure OpenAI error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    return parseSignalResponse(content);
}

/**
 * Google Gemini API call
 */
async function callGemini(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number
): Promise<LLMSignalResponse> {
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
        throw new Error("Gemini API key not configured");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

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
        const error = await response.text();
        throw new Error(`Gemini error: ${error}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    return parseSignalResponse(content);
}

/**
 * Z.ai (GLM) API call
 */
async function callZai(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number
): Promise<LLMSignalResponse> {
    const apiKey = Deno.env.get("ZAI_API_KEY");

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
            model: "glm-4v-flash",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Z.ai error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    return parseSignalResponse(content);
}

/**
 * Parse LLM response to extract signal, confidence, reasoning
 */
function parseSignalResponse(content: string): LLMSignalResponse {
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
            signal: signal as "bullish" | "bearish" | "neutral",
            confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
            reasoning: String(parsed.reasoning || "No reasoning provided").substring(0, 1000),
        };
    } catch (error) {
        console.error("Failed to parse LLM response:", error, content);
        return {
            signal: "neutral",
            confidence: 0,
            reasoning: `Parse error: ${error.message}`,
        };
    }
}

/**
 * Call multiple LLM providers and aggregate results
 */
export async function callMultipleLLMs(
    systemPrompt: string,
    userPrompt: string,
    providers: LLMProvider[] = ["azure", "gemini", "zai"]
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
