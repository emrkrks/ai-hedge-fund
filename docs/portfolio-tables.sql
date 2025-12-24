-- ============================================
-- PORTFOLIO ANALYSIS TABLES
-- ============================================
-- Bu SQL'i Supabase SQL Editor'da çalıştırın

-- 1. PORTFOLIO ANALYSES (Günlük Her Holding Detayı)
-- Her hisse için günlük analiz kayıtları
CREATE TABLE IF NOT EXISTS portfolio_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker TEXT NOT NULL,
    shares NUMERIC,
    buy_price NUMERIC,
    current_price NUMERIC,
    total_cost NUMERIC,
    current_value NUMERIC,
    unrealized_pl NUMERIC,
    unrealized_pl_percent NUMERIC,
    daily_pl NUMERIC,
    ai_signal TEXT,
    ai_confidence INTEGER,
    recommendation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PORTFOLIO SUMMARIES (Günlük Toplam Özet)
-- Tüm portföyün günlük özeti
CREATE TABLE IF NOT EXISTS portfolio_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total_cost NUMERIC,
    total_value NUMERIC,
    total_daily_pl NUMERIC,
    total_unrealized_pl NUMERIC,
    total_pl_percent NUMERIC,
    holding_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS POLİCY'LER (Gerekli olursa)
ALTER TABLE portfolio_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to portfolio_analyses" 
ON portfolio_analyses FOR ALL USING (true);

CREATE POLICY "Allow all access to portfolio_summaries" 
ON portfolio_summaries FOR ALL USING (true);

-- 4. INDEX'LER (Hızlı arama için)
CREATE INDEX IF NOT EXISTS idx_portfolio_analyses_ticker ON portfolio_analyses(ticker);
CREATE INDEX IF NOT EXISTS idx_portfolio_analyses_date ON portfolio_analyses(created_at);
CREATE INDEX IF NOT EXISTS idx_portfolio_summaries_date ON portfolio_summaries(created_at);

-- ============================================
-- ÖRNEK: Portföy performans trendi çekmek
-- ============================================
-- Son 30 günlük portföy değeri:
-- SELECT 
--   DATE(created_at) as date,
--   total_value,
--   total_unrealized_pl,
--   total_pl_percent
-- FROM portfolio_summaries 
-- WHERE created_at > NOW() - INTERVAL '30 days'
-- ORDER BY created_at;
