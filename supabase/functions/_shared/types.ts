// Supabase Edge Functions - Shared Types
// AI Hedge Fund Agent Types

export interface AnalyzeRequest {
    ticker: string;
    company_name?: string;
    end_date?: string;
    llm_provider: "azure" | "gemini" | "zai";
}

export interface AnalysisResult {
    ticker: string;
    agent: string;
    agent_display_name: string;
    signal: "BULLISH" | "BEARISH" | "NEUTRAL";
    confidence: number; // 0-100
    reasoning: string;
    timestamp: string;
    analysis_data?: Record<string, unknown>;
}

export interface FinancialMetrics {
    ticker: string;
    return_on_equity?: number;
    debt_to_equity?: number;
    operating_margin?: number;
    current_ratio?: number;
    price_to_earnings?: number;
    price_to_book?: number;
    revenue_growth?: number;
    earnings_per_share?: number;
    free_cash_flow?: number;
    market_cap?: number;
}

export interface MacroData {
    vix?: number;
    fed_funds_rate?: number;
    yield_curve_10y_2y?: number;
    yield_curve_inverted: boolean;
}

export interface PeerData {
    peers: string[];
    pe_ratio?: number;
    roe?: number;
    sector?: string;
}

export interface ESGData {
    total_score?: number;
    environment_score?: number;
    social_score?: number;
    governance_score?: number;
    esg_signal: "bullish" | "bearish" | "neutral";
    controversy_level?: string;
}

export interface InsiderTrade {
    transaction_date: string;
    transaction_type: "buy" | "sell";
    transaction_shares: number;
    owner_name?: string;
}

export interface NewsItem {
    title: string;
    published_at: string;
    source?: string;
    sentiment?: "positive" | "negative" | "neutral";
}

export interface PriceData {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// LLM Response Types
export interface LLMSignalResponse {
    signal: "bullish" | "bearish" | "neutral" | "BULLISH" | "BEARISH" | "NEUTRAL";
    confidence: number;
    reasoning: string;
}

// Agent Configuration
export interface AgentConfig {
    key: string;
    display_name: string;
    description: string;
    investing_style: string;
}

export const AGENT_CONFIG: Record<string, AgentConfig> = {
    warren_buffett: {
        key: "warren_buffett",
        display_name: "Warren Buffett",
        description: "The Oracle of Omaha",
        investing_style: "Seeks companies with strong fundamentals and competitive advantages through value investing and long-term ownership.",
    },
    peter_lynch: {
        key: "peter_lynch",
        display_name: "Peter Lynch",
        description: "The 10-Bagger Investor",
        investing_style: "Invests in companies with understandable business models and strong growth potential using the 'buy what you know' strategy.",
    },
    ben_graham: {
        key: "ben_graham",
        display_name: "Ben Graham",
        description: "The Father of Value Investing",
        investing_style: "Emphasizes a margin of safety and invests in undervalued companies with strong fundamentals through systematic value analysis.",
    },
    charlie_munger: {
        key: "charlie_munger",
        display_name: "Charlie Munger",
        description: "The Rational Thinker",
        investing_style: "Advocates for value investing with a focus on quality businesses and long-term growth through rational decision-making.",
    },
    michael_burry: {
        key: "michael_burry",
        display_name: "Michael Burry",
        description: "The Big Short Contrarian",
        investing_style: "Makes contrarian bets, often shorting overvalued markets and investing in undervalued assets through deep fundamental analysis.",
    },
    cathie_wood: {
        key: "cathie_wood",
        display_name: "Cathie Wood",
        description: "The Queen of Growth Investing",
        investing_style: "Focuses on disruptive innovation and growth, investing in companies leading technological advancements.",
    },
    bill_ackman: {
        key: "bill_ackman",
        display_name: "Bill Ackman",
        description: "The Activist Investor",
        investing_style: "Seeks to influence management and unlock value through strategic activism and contrarian positions.",
    },
    stanley_druckenmiller: {
        key: "stanley_druckenmiller",
        display_name: "Stanley Druckenmiller",
        description: "The Macro Investor",
        investing_style: "Focuses on macroeconomic trends, making large bets on currencies, commodities, and interest rates.",
    },
    phil_fisher: {
        key: "phil_fisher",
        display_name: "Phil Fisher",
        description: "The Scuttlebutt Investor",
        investing_style: "Emphasizes investing in companies with strong management and innovative products through scuttlebutt research.",
    },
    mohnish_pabrai: {
        key: "mohnish_pabrai",
        display_name: "Mohnish Pabrai",
        description: "The Dhandho Investor",
        investing_style: "Focuses on value investing with margin of safety, inspired by Buffett and Indian business principles.",
    },
    rakesh_jhunjhunwala: {
        key: "rakesh_jhunjhunwala",
        display_name: "Rakesh Jhunjhunwala",
        description: "The Big Bull of India",
        investing_style: "Leverages macroeconomic insights to invest in high-growth sectors within emerging markets.",
    },
    aswath_damodaran: {
        key: "aswath_damodaran",
        display_name: "Aswath Damodaran",
        description: "The Dean of Valuation",
        investing_style: "Focuses on intrinsic value and financial metrics through rigorous DCF and valuation analysis.",
    },
    technical_analyst: {
        key: "technical_analyst",
        display_name: "Technical Analyst",
        description: "Chart Pattern Specialist",
        investing_style: "Focuses on chart patterns and market trends using technical indicators and price action analysis.",
    },
    fundamentals_analyst: {
        key: "fundamentals_analyst",
        display_name: "Fundamentals Analyst",
        description: "Financial Statement Specialist",
        investing_style: "Delves into financial statements and economic indicators to assess intrinsic value.",
    },
    growth_analyst: {
        key: "growth_analyst",
        display_name: "Growth Analyst",
        description: "Growth Specialist",
        investing_style: "Analyzes growth trends and valuation to identify growth opportunities.",
    },
    news_sentiment_analyst: {
        key: "news_sentiment_analyst",
        display_name: "News Sentiment Analyst",
        description: "News Sentiment Specialist",
        investing_style: "Analyzes news sentiment to predict market movements and identify opportunities.",
    },
    sentiment_analyst: {
        key: "sentiment_analyst",
        display_name: "Sentiment Analyst",
        description: "Market Sentiment Specialist",
        investing_style: "Gauges market sentiment and investor behavior to predict market movements.",
    },
};
