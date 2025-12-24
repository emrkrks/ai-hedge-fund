// Supabase Edge Functions - Agent Analysis Logic
// Port of the original Python agent analysis functions
// Each agent has specific sub-analyses that compute scores, then derive signal and confidence

import { FinancialMetrics, InsiderTrade, NewsItem, PriceData } from "./types.ts";

// ============================================================================
// COMMON UTILITIES
// ============================================================================

interface AnalysisResult {
    score: number;
    max_score: number;
    details: string;
}

interface AgentAnalysisOutput {
    signal: "BULLISH" | "BEARISH" | "NEUTRAL";
    confidence: number;
    analysis_summary: Record<string, AnalysisResult>;
    total_score: number;
    max_score: number;
}

function getLatestValue(items: Record<string, unknown>[], key: string): number | undefined {
    if (!items || items.length === 0) return undefined;
    const value = items[0]?.[key];
    return typeof value === "number" ? value : undefined;
}

// ============================================================================
// MICHAEL BURRY AGENT ANALYSIS
// Contrarian deep-value investor
// ============================================================================

export function analyzeMichaelBurry(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[],
    marketCap: number | undefined,
    insiderTrades: InsiderTrade[],
    news: NewsItem[]
): AgentAnalysisOutput {
    // 1. Value Analysis (FCF yield, EV/EBIT)
    const valueAnalysis = analyzeValue(metrics, lineItems, marketCap);

    // 2. Balance Sheet Analysis (leverage, liquidity)
    const balanceSheetAnalysis = analyzeBalanceSheet(metrics, lineItems);

    // 3. Insider Activity Analysis
    const insiderAnalysis = analyzeInsiderActivity(insiderTrades);

    // 4. Contrarian Sentiment Analysis
    const contrarianAnalysis = analyzeContrarianSentiment(news);

    // Aggregate scores
    const totalScore = valueAnalysis.score + balanceSheetAnalysis.score +
        insiderAnalysis.score + contrarianAnalysis.score;
    const maxScore = valueAnalysis.max_score + balanceSheetAnalysis.max_score +
        insiderAnalysis.max_score + contrarianAnalysis.max_score;

    // Derive signal
    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (totalScore >= 0.7 * maxScore) {
        signal = "BULLISH";
    } else if (totalScore <= 0.3 * maxScore) {
        signal = "BEARISH";
    }

    // Calculate confidence (score ratio as percentage)
    const confidence = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 50;

    return {
        signal,
        confidence,
        analysis_summary: {
            value: valueAnalysis,
            balance_sheet: balanceSheetAnalysis,
            insider: insiderAnalysis,
            contrarian: contrarianAnalysis,
        },
        total_score: totalScore,
        max_score: maxScore,
    };
}

function analyzeValue(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[],
    marketCap: number | undefined
): AnalysisResult {
    const maxScore = 6;
    let score = 0;
    const details: string[] = [];

    // FCF Yield
    const fcf = getLatestValue(lineItems, "free_cash_flow") || metrics.free_cash_flow;
    if (fcf && marketCap && marketCap > 0) {
        const fcfYield = fcf / marketCap;
        if (fcfYield >= 0.15) {
            score += 4;
            details.push(`FCF yield ${(fcfYield * 100).toFixed(1)}% (>15%)`);
        } else if (fcfYield >= 0.12) {
            score += 3;
            details.push(`FCF yield ${(fcfYield * 100).toFixed(1)}% (>12%)`);
        } else if (fcfYield >= 0.08) {
            score += 2;
            details.push(`FCF yield ${(fcfYield * 100).toFixed(1)}% (>8%)`);
        } else {
            details.push(`Low FCF yield ${(fcfYield * 100).toFixed(1)}%`);
        }
    } else {
        details.push("FCF data unavailable");
    }

    // P/E ratio (lower is better for value)
    if (metrics.price_to_earnings) {
        if (metrics.price_to_earnings < 10) {
            score += 2;
            details.push(`P/E ${metrics.price_to_earnings.toFixed(1)} (<10)`);
        } else if (metrics.price_to_earnings < 15) {
            score += 1;
            details.push(`P/E ${metrics.price_to_earnings.toFixed(1)} (<15)`);
        } else {
            details.push(`High P/E ${metrics.price_to_earnings.toFixed(1)}`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeBalanceSheet(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[]
): AnalysisResult {
    const maxScore = 3;
    let score = 0;
    const details: string[] = [];

    // Debt to Equity
    if (metrics.debt_to_equity !== undefined) {
        if (metrics.debt_to_equity < 0.5) {
            score += 2;
            details.push(`Low D/E ${metrics.debt_to_equity.toFixed(2)}`);
        } else if (metrics.debt_to_equity < 1) {
            score += 1;
            details.push(`Moderate D/E ${metrics.debt_to_equity.toFixed(2)}`);
        } else {
            details.push(`High leverage D/E ${metrics.debt_to_equity.toFixed(2)}`);
        }
    }

    // Current Ratio
    if (metrics.current_ratio !== undefined) {
        if (metrics.current_ratio > 2) {
            score += 1;
            details.push(`Strong liquidity CR ${metrics.current_ratio.toFixed(2)}`);
        } else if (metrics.current_ratio > 1.5) {
            details.push(`Adequate liquidity CR ${metrics.current_ratio.toFixed(2)}`);
        } else {
            details.push(`Weak liquidity CR ${metrics.current_ratio.toFixed(2)}`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeInsiderActivity(insiderTrades: InsiderTrade[]): AnalysisResult {
    const maxScore = 2;
    let score = 0;
    const details: string[] = [];

    if (!insiderTrades || insiderTrades.length === 0) {
        return { score: 0, max_score: maxScore, details: "No insider trade data" };
    }

    let sharesBought = 0;
    let sharesSold = 0;

    for (const trade of insiderTrades) {
        const shares = trade.transaction_shares || 0;
        if (trade.transaction_type?.toLowerCase().includes("buy") || shares > 0) {
            sharesBought += Math.abs(shares);
        } else {
            sharesSold += Math.abs(shares);
        }
    }

    const netShares = sharesBought - sharesSold;
    if (netShares > 0) {
        const ratio = netShares / Math.max(sharesSold, 1);
        score = ratio > 1 ? 2 : 1;
        details.push(`Net insider buying: ${netShares.toLocaleString()} shares`);
    } else {
        details.push(`Net insider selling: ${Math.abs(netShares).toLocaleString()} shares`);
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeContrarianSentiment(news: NewsItem[]): AnalysisResult {
    const maxScore = 1;
    let score = 0;
    const details: string[] = [];

    if (!news || news.length === 0) {
        return { score: 0, max_score: maxScore, details: "No recent news" };
    }

    // Contrarian: negative news can be good for deep value
    const negativeCount = news.filter(n => {
        const sent = String(n.sentiment || "").toLowerCase();
        return sent === "negative" || sent === "bearish";
    }).length;

    if (negativeCount >= 5) {
        score = 1; // Contrarian opportunity
        details.push(`${negativeCount} negative headlines (contrarian opportunity)`);
    } else {
        details.push(`${negativeCount} negative headlines (limited contrarian signal)`);
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

// ============================================================================
// CHARLIE MUNGER AGENT ANALYSIS
// Quality over quantity - moats, management, predictability
// ============================================================================

export function analyzeCharlieMunger(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[],
    marketCap: number | undefined,
    insiderTrades: InsiderTrade[],
    news: NewsItem[]
): AgentAnalysisOutput {
    // 1. Moat Analysis (ROIC, ROE, margins)
    const moatAnalysis = analyzeMoat(metrics, lineItems);

    // 2. Management Quality (insider activity, capital allocation)
    const managementAnalysis = analyzeManagement(metrics, insiderTrades);

    // 3. Predictability (earnings stability)
    const predictabilityAnalysis = analyzePredictability(lineItems);

    // 4. Valuation (fair price for wonderful company)
    const valuationAnalysis = analyzeValuation(metrics, marketCap);

    // Aggregate with Munger's weights: Moat 30%, Management 25%, Predictability 25%, Valuation 20%
    const totalScore = moatAnalysis.score + managementAnalysis.score +
        predictabilityAnalysis.score + valuationAnalysis.score;
    const maxScore = moatAnalysis.max_score + managementAnalysis.max_score +
        predictabilityAnalysis.max_score + valuationAnalysis.max_score;

    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (totalScore >= 0.7 * maxScore) {
        signal = "BULLISH";
    } else if (totalScore <= 0.3 * maxScore) {
        signal = "BEARISH";
    }

    const confidence = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 50;

    return {
        signal,
        confidence,
        analysis_summary: {
            moat: moatAnalysis,
            management: managementAnalysis,
            predictability: predictabilityAnalysis,
            valuation: valuationAnalysis,
        },
        total_score: totalScore,
        max_score: maxScore,
    };
}

function analyzeMoat(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[]
): AnalysisResult {
    const maxScore = 6;
    let score = 0;
    const details: string[] = [];

    // ROE (Return on Equity)
    if (metrics.return_on_equity !== undefined) {
        if (metrics.return_on_equity > 0.20) {
            score += 2;
            details.push(`Strong ROE ${(metrics.return_on_equity * 100).toFixed(1)}% (>20%)`);
        } else if (metrics.return_on_equity > 0.15) {
            score += 1;
            details.push(`Good ROE ${(metrics.return_on_equity * 100).toFixed(1)}% (>15%)`);
        } else {
            details.push(`Weak ROE ${(metrics.return_on_equity * 100).toFixed(1)}%`);
        }
    }

    // Operating Margin
    if (metrics.operating_margin !== undefined) {
        if (metrics.operating_margin > 0.25) {
            score += 2;
            details.push(`Strong margins ${(metrics.operating_margin * 100).toFixed(1)}%`);
        } else if (metrics.operating_margin > 0.15) {
            score += 1;
            details.push(`Good margins ${(metrics.operating_margin * 100).toFixed(1)}%`);
        } else {
            details.push(`Thin margins ${(metrics.operating_margin * 100).toFixed(1)}%`);
        }
    }

    // Gross Margin (pricing power indicator)
    if (metrics.gross_margin !== undefined) {
        if (metrics.gross_margin > 0.50) {
            score += 2;
            details.push(`Strong pricing power GM ${(metrics.gross_margin * 100).toFixed(1)}%`);
        } else if (metrics.gross_margin > 0.35) {
            score += 1;
            details.push(`Moderate pricing power GM ${(metrics.gross_margin * 100).toFixed(1)}%`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeManagement(
    metrics: FinancialMetrics,
    insiderTrades: InsiderTrade[]
): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    // Insider activity as proxy for management alignment
    const insiderAnalysis = analyzeInsiderActivity(insiderTrades);
    if (insiderAnalysis.score > 0) {
        score += 2;
        details.push("Management buying shares (aligned)");
    }

    // Low debt suggests conservative management
    if (metrics.debt_to_equity !== undefined && metrics.debt_to_equity < 0.5) {
        score += 2;
        details.push("Conservative capital structure");
    } else if (metrics.debt_to_equity !== undefined) {
        details.push(`Debt/Equity ${metrics.debt_to_equity.toFixed(2)}`);
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzePredictability(lineItems: Record<string, unknown>[]): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    if (!lineItems || lineItems.length < 3) {
        return { score: 2, max_score: maxScore, details: "Limited historical data" };
    }

    // Check revenue and earnings consistency
    const revenues = lineItems.map(item => item.revenue as number).filter(r => r !== undefined);
    const netIncomes = lineItems.map(item => item.net_income as number).filter(n => n !== undefined);

    // All positive revenues
    if (revenues.length >= 3 && revenues.every(r => r > 0)) {
        score += 2;
        details.push("Consistent positive revenue");
    }

    // All positive net income
    if (netIncomes.length >= 3 && netIncomes.every(n => n > 0)) {
        score += 2;
        details.push("Consistent profitability");
    } else if (netIncomes.length >= 3) {
        const positiveCount = netIncomes.filter(n => n > 0).length;
        score += Math.floor(positiveCount / netIncomes.length * 2);
        details.push(`${positiveCount}/${netIncomes.length} profitable periods`);
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeValuation(
    metrics: FinancialMetrics,
    marketCap: number | undefined
): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    // P/E ratio
    if (metrics.price_to_earnings !== undefined) {
        if (metrics.price_to_earnings > 0 && metrics.price_to_earnings < 15) {
            score += 2;
            details.push(`Attractive P/E ${metrics.price_to_earnings.toFixed(1)}`);
        } else if (metrics.price_to_earnings > 0 && metrics.price_to_earnings < 25) {
            score += 1;
            details.push(`Fair P/E ${metrics.price_to_earnings.toFixed(1)}`);
        } else if (metrics.price_to_earnings > 0) {
            details.push(`High P/E ${metrics.price_to_earnings.toFixed(1)}`);
        }
    }

    // P/B ratio
    if (metrics.price_to_book !== undefined) {
        if (metrics.price_to_book < 2) {
            score += 2;
            details.push(`Good P/B ${metrics.price_to_book.toFixed(1)}`);
        } else if (metrics.price_to_book < 4) {
            score += 1;
            details.push(`Moderate P/B ${metrics.price_to_book.toFixed(1)}`);
        } else {
            details.push(`High P/B ${metrics.price_to_book.toFixed(1)}`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

// ============================================================================
// WARREN BUFFETT AGENT ANALYSIS
// Circle of competence, moats, owner earnings
// ============================================================================

export function analyzeWarrenBuffett(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[],
    marketCap: number | undefined,
    insiderTrades: InsiderTrade[],
    news: NewsItem[]
): AgentAnalysisOutput {
    // 1. Moat Analysis
    const moatAnalysis = analyzeMoat(metrics, lineItems);

    // 2. Financial Strength
    const financialStrength = analyzeFinancialStrength(metrics);

    // 3. Owner Earnings (FCF quality)
    const ownerEarnings = analyzeOwnerEarnings(metrics, lineItems);

    // 4. Margin of Safety
    const marginOfSafety = analyzeMarginOfSafety(metrics, marketCap, lineItems);

    const totalScore = moatAnalysis.score + financialStrength.score +
        ownerEarnings.score + marginOfSafety.score;
    const maxScore = moatAnalysis.max_score + financialStrength.max_score +
        ownerEarnings.max_score + marginOfSafety.max_score;

    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (totalScore >= 0.7 * maxScore) {
        signal = "BULLISH";
    } else if (totalScore <= 0.3 * maxScore) {
        signal = "BEARISH";
    }

    const confidence = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 50;

    return {
        signal,
        confidence,
        analysis_summary: {
            moat: moatAnalysis,
            financial_strength: financialStrength,
            owner_earnings: ownerEarnings,
            margin_of_safety: marginOfSafety,
        },
        total_score: totalScore,
        max_score: maxScore,
    };
}

function analyzeFinancialStrength(metrics: FinancialMetrics): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    // Low debt
    if (metrics.debt_to_equity !== undefined) {
        if (metrics.debt_to_equity < 0.5) {
            score += 2;
            details.push(`Conservative debt D/E ${metrics.debt_to_equity.toFixed(2)}`);
        } else if (metrics.debt_to_equity < 1) {
            score += 1;
            details.push(`Moderate debt D/E ${metrics.debt_to_equity.toFixed(2)}`);
        } else {
            details.push(`High debt D/E ${metrics.debt_to_equity.toFixed(2)}`);
        }
    }

    // Good liquidity
    if (metrics.current_ratio !== undefined) {
        if (metrics.current_ratio > 1.5) {
            score += 2;
            details.push(`Strong liquidity CR ${metrics.current_ratio.toFixed(2)}`);
        } else if (metrics.current_ratio > 1) {
            score += 1;
            details.push(`Adequate liquidity CR ${metrics.current_ratio.toFixed(2)}`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeOwnerEarnings(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[]
): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    // FCF vs Net Income (quality of earnings)
    const fcf = metrics.free_cash_flow || getLatestValue(lineItems, "free_cash_flow");
    const netIncome = getLatestValue(lineItems, "net_income");

    if (fcf && netIncome && netIncome > 0) {
        const fcfToNetIncome = fcf / netIncome;
        if (fcfToNetIncome > 1) {
            score += 3;
            details.push(`High quality earnings FCF/NI ${fcfToNetIncome.toFixed(2)}`);
        } else if (fcfToNetIncome > 0.8) {
            score += 2;
            details.push(`Good earnings quality FCF/NI ${fcfToNetIncome.toFixed(2)}`);
        } else if (fcfToNetIncome > 0) {
            score += 1;
            details.push(`Moderate earnings quality FCF/NI ${fcfToNetIncome.toFixed(2)}`);
        }
    }

    // Positive FCF
    if (fcf && fcf > 0) {
        score += 1;
        details.push(`Positive FCF $${(fcf / 1e9).toFixed(2)}B`);
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeMarginOfSafety(
    metrics: FinancialMetrics,
    marketCap: number | undefined,
    lineItems: Record<string, unknown>[]
): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    // P/E based margin of safety
    if (metrics.price_to_earnings !== undefined && metrics.price_to_earnings > 0) {
        const earningsYield = 1 / metrics.price_to_earnings;
        if (earningsYield > 0.10) { // >10% yield = good margin
            score += 2;
            details.push(`Strong margin of safety (E/P ${(earningsYield * 100).toFixed(1)}%)`);
        } else if (earningsYield > 0.05) {
            score += 1;
            details.push(`Fair margin of safety (E/P ${(earningsYield * 100).toFixed(1)}%)`);
        } else {
            details.push(`Limited margin of safety (E/P ${(earningsYield * 100).toFixed(1)}%)`);
        }
    }

    // P/B based margin of safety
    if (metrics.price_to_book !== undefined && metrics.price_to_book > 0) {
        if (metrics.price_to_book < 1.5) {
            score += 2;
            details.push(`Trading near book value P/B ${metrics.price_to_book.toFixed(2)}`);
        } else if (metrics.price_to_book < 3) {
            score += 1;
            details.push(`Moderate P/B ${metrics.price_to_book.toFixed(2)}`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

// ============================================================================
// GROWTH ANALYST ANALYSIS
// Focus on revenue growth, margin expansion
// ============================================================================

export function analyzeGrowth(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[],
    prices: PriceData[]
): AgentAnalysisOutput {
    // 1. Revenue Growth
    const revenueGrowth = analyzeRevenueGrowth(metrics, lineItems);

    // 2. Earnings Growth
    const earningsGrowth = analyzeEarningsGrowth(metrics, lineItems);

    // 3. Margin Trends
    const marginTrends = analyzeMarginTrends(metrics, lineItems);

    // 4. Valuation vs Growth (PEG)
    const valuationGrowth = analyzeValuationVsGrowth(metrics);

    const totalScore = revenueGrowth.score + earningsGrowth.score +
        marginTrends.score + valuationGrowth.score;
    const maxScore = revenueGrowth.max_score + earningsGrowth.max_score +
        marginTrends.max_score + valuationGrowth.max_score;

    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (totalScore >= 0.7 * maxScore) {
        signal = "BULLISH";
    } else if (totalScore <= 0.3 * maxScore) {
        signal = "BEARISH";
    }

    const confidence = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 50;

    return {
        signal,
        confidence,
        analysis_summary: {
            revenue_growth: revenueGrowth,
            earnings_growth: earningsGrowth,
            margin_trends: marginTrends,
            valuation_growth: valuationGrowth,
        },
        total_score: totalScore,
        max_score: maxScore,
    };
}

function analyzeRevenueGrowth(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[]
): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    if (metrics.revenue_growth !== undefined) {
        if (metrics.revenue_growth > 0.25) {
            score += 4;
            details.push(`Strong growth ${(metrics.revenue_growth * 100).toFixed(1)}% (>25%)`);
        } else if (metrics.revenue_growth > 0.15) {
            score += 3;
            details.push(`Good growth ${(metrics.revenue_growth * 100).toFixed(1)}% (>15%)`);
        } else if (metrics.revenue_growth > 0.05) {
            score += 2;
            details.push(`Moderate growth ${(metrics.revenue_growth * 100).toFixed(1)}%`);
        } else if (metrics.revenue_growth > 0) {
            score += 1;
            details.push(`Slow growth ${(metrics.revenue_growth * 100).toFixed(1)}%`);
        } else {
            details.push(`Declining revenue ${(metrics.revenue_growth * 100).toFixed(1)}%`);
        }
    } else {
        score += 2; // Neutral if unknown
        details.push("Revenue growth data unavailable");
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeEarningsGrowth(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[]
): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    if (metrics.earnings_per_share_growth !== undefined) {
        if (metrics.earnings_per_share_growth > 0.20) {
            score += 4;
            details.push(`Strong EPS growth ${(metrics.earnings_per_share_growth * 100).toFixed(1)}%`);
        } else if (metrics.earnings_per_share_growth > 0.10) {
            score += 3;
            details.push(`Good EPS growth ${(metrics.earnings_per_share_growth * 100).toFixed(1)}%`);
        } else if (metrics.earnings_per_share_growth > 0) {
            score += 2;
            details.push(`Moderate EPS growth ${(metrics.earnings_per_share_growth * 100).toFixed(1)}%`);
        } else {
            details.push(`EPS declining ${(metrics.earnings_per_share_growth * 100).toFixed(1)}%`);
        }
    } else {
        score += 2;
        details.push("EPS growth data unavailable");
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeMarginTrends(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[]
): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    // Current operating margin
    if (metrics.operating_margin !== undefined) {
        if (metrics.operating_margin > 0.20) {
            score += 2;
            details.push(`Strong margin ${(metrics.operating_margin * 100).toFixed(1)}%`);
        } else if (metrics.operating_margin > 0.10) {
            score += 1;
            details.push(`Moderate margin ${(metrics.operating_margin * 100).toFixed(1)}%`);
        } else if (metrics.operating_margin > 0) {
            details.push(`Thin margin ${(metrics.operating_margin * 100).toFixed(1)}%`);
        } else {
            details.push(`Negative margin ${(metrics.operating_margin * 100).toFixed(1)}%`);
        }
    }

    // Gross margin
    if (metrics.gross_margin !== undefined) {
        if (metrics.gross_margin > 0.50) {
            score += 2;
            details.push(`Strong gross margin ${(metrics.gross_margin * 100).toFixed(1)}%`);
        } else if (metrics.gross_margin > 0.30) {
            score += 1;
            details.push(`Moderate gross margin ${(metrics.gross_margin * 100).toFixed(1)}%`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeValuationVsGrowth(metrics: FinancialMetrics): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    // PEG Ratio
    if (metrics.peg_ratio !== undefined && metrics.peg_ratio > 0) {
        if (metrics.peg_ratio < 1) {
            score += 4;
            details.push(`Undervalued for growth PEG ${metrics.peg_ratio.toFixed(2)}`);
        } else if (metrics.peg_ratio < 1.5) {
            score += 3;
            details.push(`Fair PEG ${metrics.peg_ratio.toFixed(2)}`);
        } else if (metrics.peg_ratio < 2) {
            score += 2;
            details.push(`Moderate PEG ${metrics.peg_ratio.toFixed(2)}`);
        } else {
            details.push(`High PEG ${metrics.peg_ratio.toFixed(2)}`);
        }
    } else {
        // Fallback: P/E vs growth rate
        if (metrics.price_to_earnings && metrics.revenue_growth && metrics.revenue_growth > 0) {
            const impliedPEG = metrics.price_to_earnings / (metrics.revenue_growth * 100);
            if (impliedPEG < 1.5) {
                score += 2;
                details.push(`Reasonable valuation vs growth`);
            }
        }
        score += 2; // Neutral
        details.push("PEG ratio unavailable");
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

// ============================================================================
// SENTIMENT ANALYST ANALYSIS
// ============================================================================

export function analyzeSentiment(
    insiderTrades: InsiderTrade[],
    news: NewsItem[]
): AgentAnalysisOutput {
    // 1. Insider Trading Sentiment
    const insiderSentiment = analyzeInsiderSentiment(insiderTrades);

    // 2. News Sentiment
    const newsSentiment = analyzeNewsSentiment(news);

    // Weighted: Insider 30%, News 70% (per original Python)
    const totalScore = insiderSentiment.score + newsSentiment.score;
    const maxScore = insiderSentiment.max_score + newsSentiment.max_score;

    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (totalScore >= 0.65 * maxScore) {
        signal = "BULLISH";
    } else if (totalScore <= 0.35 * maxScore) {
        signal = "BEARISH";
    }

    const confidence = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 50;

    return {
        signal,
        confidence,
        analysis_summary: {
            insider_sentiment: insiderSentiment,
            news_sentiment: newsSentiment,
        },
        total_score: totalScore,
        max_score: maxScore,
    };
}

function analyzeInsiderSentiment(insiderTrades: InsiderTrade[]): AnalysisResult {
    const maxScore = 3;
    let score = 1.5; // Neutral baseline
    const details: string[] = [];

    if (!insiderTrades || insiderTrades.length === 0) {
        return { score: 1.5, max_score: maxScore, details: "No insider data" };
    }

    let buyCount = 0;
    let sellCount = 0;

    for (const trade of insiderTrades) {
        if (trade.transaction_type?.toLowerCase().includes("buy")) {
            buyCount++;
        } else if (trade.transaction_type?.toLowerCase().includes("sell")) {
            sellCount++;
        }
    }

    const total = buyCount + sellCount;
    if (total > 0) {
        const buyRatio = buyCount / total;
        if (buyRatio > 0.7) {
            score = 3;
            details.push(`Strong insider buying (${buyCount} buys vs ${sellCount} sells)`);
        } else if (buyRatio > 0.5) {
            score = 2;
            details.push(`Net insider buying`);
        } else if (buyRatio < 0.3) {
            score = 0;
            details.push(`Strong insider selling`);
        } else {
            details.push(`Mixed insider activity`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeNewsSentiment(news: NewsItem[]): AnalysisResult {
    const maxScore = 7;
    let score = 3.5; // Neutral baseline
    const details: string[] = [];

    if (!news || news.length === 0) {
        return { score: 3.5, max_score: maxScore, details: "No news data" };
    }

    let positive = 0;
    let negative = 0;
    let neutral = 0;

    for (const item of news) {
        const sentiment = item.sentiment?.toLowerCase();
        if (sentiment === "positive" || sentiment === "bullish") {
            positive++;
        } else if (sentiment === "negative" || sentiment === "bearish") {
            negative++;
        } else {
            neutral++;
        }
    }

    const total = positive + negative + neutral;
    if (total > 0) {
        const positiveRatio = positive / total;
        const negativeRatio = negative / total;

        if (positiveRatio > 0.6) {
            score = 7;
            details.push(`Strong positive sentiment (${positive} positive)`);
        } else if (positiveRatio > 0.4) {
            score = 5;
            details.push(`Moderately positive news`);
        } else if (negativeRatio > 0.6) {
            score = 0;
            details.push(`Strong negative sentiment (${negative} negative)`);
        } else if (negativeRatio > 0.4) {
            score = 2;
            details.push(`Moderately negative news`);
        } else {
            details.push(`Mixed news sentiment`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

// ============================================================================
// TECHNICAL ANALYST
// ============================================================================

export function analyzeTechnical(prices: PriceData[]): AgentAnalysisOutput {
    const maxScore = 10;
    let score = 5; // Neutral baseline
    const details: string[] = [];

    if (!prices || prices.length < 20) {
        return {
            signal: "NEUTRAL",
            confidence: 40,
            analysis_summary: { technical: { score: 5, max_score: 10, details: "Insufficient price data" } },
            total_score: 5,
            max_score: 10,
        };
    }

    // Sort prices by date (newest first)
    const sortedPrices = [...prices].sort((a, b) =>
        new Date(b.time).getTime() - new Date(a.time).getTime()
    );

    const latestPrice = sortedPrices[0].close;

    // Calculate SMAs
    const sma20 = sortedPrices.slice(0, 20).reduce((sum, p) => sum + p.close, 0) / 20;
    const sma50 = sortedPrices.length >= 50
        ? sortedPrices.slice(0, 50).reduce((sum, p) => sum + p.close, 0) / 50
        : sma20;

    // Price above/below moving averages
    if (latestPrice > sma20 && latestPrice > sma50) {
        score += 2;
        details.push("Price above 20 & 50 SMA (bullish)");
    } else if (latestPrice < sma20 && latestPrice < sma50) {
        score -= 2;
        details.push("Price below 20 & 50 SMA (bearish)");
    } else {
        details.push("Mixed MA signals");
    }

    // SMA crossover
    if (sma20 > sma50) {
        score += 1;
        details.push("20 SMA > 50 SMA (bullish crossover)");
    } else if (sma20 < sma50) {
        score -= 1;
        details.push("20 SMA < 50 SMA (bearish crossover)");
    }

    // Recent momentum (last 20 days)
    const oldPrice = sortedPrices[Math.min(19, sortedPrices.length - 1)].close;
    const momentum = ((latestPrice - oldPrice) / oldPrice) * 100;

    if (momentum > 10) {
        score += 2;
        details.push(`Strong momentum +${momentum.toFixed(1)}%`);
    } else if (momentum > 5) {
        score += 1;
        details.push(`Positive momentum +${momentum.toFixed(1)}%`);
    } else if (momentum < -10) {
        score -= 2;
        details.push(`Weak momentum ${momentum.toFixed(1)}%`);
    } else if (momentum < -5) {
        score -= 1;
        details.push(`Negative momentum ${momentum.toFixed(1)}%`);
    }

    // Normalize score
    score = Math.max(0, Math.min(maxScore, score));

    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (score >= 7) signal = "BULLISH";
    else if (score <= 3) signal = "BEARISH";

    const confidence = Math.round((score / maxScore) * 100);

    return {
        signal,
        confidence,
        analysis_summary: {
            technical: {
                score,
                max_score: maxScore,
                details: details.join("; ")
            }
        },
        total_score: score,
        max_score: maxScore,
    };
}

// ============================================================================
// FUNDAMENTALS ANALYST
// ============================================================================

export function analyzeFundamentals(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[]
): AgentAnalysisOutput {
    // 1. Profitability
    const profitability = analyzeProfitability(metrics);

    // 2. Solvency
    const solvency = analyzeSolvency(metrics);

    // 3. Efficiency
    const efficiency = analyzeEfficiency(metrics, lineItems);

    const totalScore = profitability.score + solvency.score + efficiency.score;
    const maxScore = profitability.max_score + solvency.max_score + efficiency.max_score;

    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (totalScore >= 0.7 * maxScore) signal = "BULLISH";
    else if (totalScore <= 0.3 * maxScore) signal = "BEARISH";

    const confidence = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 50;

    return {
        signal,
        confidence,
        analysis_summary: {
            profitability,
            solvency,
            efficiency,
        },
        total_score: totalScore,
        max_score: maxScore,
    };
}

function analyzeProfitability(metrics: FinancialMetrics): AnalysisResult {
    const maxScore = 6;
    let score = 0;
    const details: string[] = [];

    // ROE
    if (metrics.return_on_equity !== undefined) {
        if (metrics.return_on_equity > 0.15) {
            score += 2;
            details.push(`High ROE ${(metrics.return_on_equity * 100).toFixed(1)}%`);
        } else if (metrics.return_on_equity > 0.10) {
            score += 1;
            details.push(`Moderate ROE ${(metrics.return_on_equity * 100).toFixed(1)}%`);
        }
    }

    // Operating margin
    if (metrics.operating_margin !== undefined) {
        if (metrics.operating_margin > 0.15) {
            score += 2;
            details.push(`Strong margins ${(metrics.operating_margin * 100).toFixed(1)}%`);
        } else if (metrics.operating_margin > 0.08) {
            score += 1;
            details.push(`Moderate margins ${(metrics.operating_margin * 100).toFixed(1)}%`);
        }
    }

    // Net margin
    if (metrics.net_margin !== undefined) {
        if (metrics.net_margin > 0.10) {
            score += 2;
            details.push(`High net margin ${(metrics.net_margin * 100).toFixed(1)}%`);
        } else if (metrics.net_margin > 0.05) {
            score += 1;
            details.push(`Moderate net margin ${(metrics.net_margin * 100).toFixed(1)}%`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeSolvency(metrics: FinancialMetrics): AnalysisResult {
    const maxScore = 4;
    let score = 0;
    const details: string[] = [];

    // Debt to Equity
    if (metrics.debt_to_equity !== undefined) {
        if (metrics.debt_to_equity < 0.5) {
            score += 2;
            details.push(`Low leverage D/E ${metrics.debt_to_equity.toFixed(2)}`);
        } else if (metrics.debt_to_equity < 1) {
            score += 1;
            details.push(`Moderate leverage D/E ${metrics.debt_to_equity.toFixed(2)}`);
        }
    }

    // Current Ratio
    if (metrics.current_ratio !== undefined) {
        if (metrics.current_ratio > 2) {
            score += 2;
            details.push(`Strong liquidity CR ${metrics.current_ratio.toFixed(2)}`);
        } else if (metrics.current_ratio > 1.5) {
            score += 1;
            details.push(`Adequate liquidity CR ${metrics.current_ratio.toFixed(2)}`);
        }
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}

function analyzeEfficiency(
    metrics: FinancialMetrics,
    lineItems: Record<string, unknown>[]
): AnalysisResult {
    const maxScore = 4;
    let score = 2; // Neutral baseline
    const details: string[] = [];

    // FCF generation
    if (metrics.free_cash_flow !== undefined) {
        if (metrics.free_cash_flow > 0) {
            score += 1;
            details.push("Positive FCF");
        }
    }

    // Revenue per share growth
    if (metrics.revenue_per_share !== undefined && metrics.revenue_per_share > 0) {
        score += 1;
        details.push(`Revenue/Share $${metrics.revenue_per_share.toFixed(2)}`);
    }

    if (details.length === 0) {
        details.push("Limited efficiency data");
    }

    return { score, max_score: maxScore, details: details.join("; ") };
}
