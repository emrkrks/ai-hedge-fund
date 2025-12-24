-- ============================================
-- AI HEDGE FUND - SUPABASE DATABASE SCHEMA
-- n8n Workflow Integration Tables
-- ============================================
-- Oluşturulma: 23 Aralık 2025
-- 
-- Bu dosyayı Supabase SQL Editor'da çalıştırın:
-- https://app.supabase.com > SQL Editor > New Query
-- ============================================

-- ============================================
-- MEVCUT TABLOLARI TEMİZLE (varsa)
-- ============================================
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS weekly_reports CASCADE;
DROP TABLE IF EXISTS scuttlebutt_data CASCADE;
DROP TABLE IF EXISTS analyses_enhanced CASCADE;
DROP TABLE IF EXISTS watchlists CASCADE;

-- ============================================
-- 1. WATCHLISTS TABLE
-- Takip edilecek hisse senetleri
-- ============================================
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    company_name TEXT,
    sector TEXT,
    alert_enabled BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Her kullanıcı için benzersiz ticker
    UNIQUE(user_id, ticker)
);

-- RLS (Row Level Security) aktif et
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;

-- Kullanıcı kendi verilerini görebilir (veya herkes görebilir - n8n için)
CREATE POLICY "Allow all access to watchlists" ON watchlists
    FOR ALL USING (true);

-- Örnek veriler ekle (isteğe bağlı)
INSERT INTO watchlists (ticker, company_name, sector, alert_enabled) VALUES
    ('AAPL', 'Apple Inc.', 'Technology', true),
    ('MSFT', 'Microsoft Corporation', 'Technology', true),
    ('GOOGL', 'Alphabet Inc.', 'Technology', true),
    ('TSLA', 'Tesla Inc.', 'Automotive', true),
    ('NVDA', 'NVIDIA Corporation', 'Semiconductors', true),
    ('AMZN', 'Amazon.com Inc.', 'E-commerce', true),
    ('META', 'Meta Platforms Inc.', 'Technology', true),
    ('JPM', 'JPMorgan Chase & Co.', 'Financial', true),
    ('V', 'Visa Inc.', 'Financial', true),
    ('JNJ', 'Johnson & Johnson', 'Healthcare', true)
ON CONFLICT DO NOTHING;


-- ============================================
-- 2. ANALYSES_ENHANCED TABLE
-- AI agent analiz sonuçları (enhanced versiyon)
-- ============================================
CREATE TABLE IF NOT EXISTS analyses_enhanced (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Temel alanlar
    ticker TEXT NOT NULL,
    model TEXT NOT NULL,
    analyst TEXT NOT NULL,
    signal TEXT CHECK (signal IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
    confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
    reasoning TEXT,
    
    -- Agregasyon alanları
    aggregated_signal TEXT,
    aggregated_confidence DECIMAL,
    bullish_count INTEGER,
    bearish_count INTEGER,
    neutral_count INTEGER,
    
    -- Macro alanları (Druckenmiller için)
    macro_signal TEXT,
    macro_vix DECIMAL,
    macro_yield_curve_inverted BOOLEAN,
    
    -- Peer Comparison alanları
    peer_pe_ratio DECIMAL,
    peer_roe DECIMAL,
    peer_count INTEGER,
    
    -- ESG alanları
    esg_total_score DECIMAL,
    esg_signal TEXT,
    esg_controversy TEXT,
    
    -- Cloning alanları (Pabrai için)
    cloning_signal TEXT,
    superinvestors_count INTEGER
);

-- Index'ler ekle (performans için)
CREATE INDEX IF NOT EXISTS idx_analyses_enhanced_ticker ON analyses_enhanced(ticker);
CREATE INDEX IF NOT EXISTS idx_analyses_enhanced_created_at ON analyses_enhanced(created_at);
CREATE INDEX IF NOT EXISTS idx_analyses_enhanced_signal ON analyses_enhanced(signal);

-- RLS
ALTER TABLE analyses_enhanced ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to analyses_enhanced" ON analyses_enhanced
    FOR ALL USING (true);


-- ============================================
-- 3. SCUTTLEBUTT_DATA TABLE
-- Reddit sentiment analizi (Phil Fisher için)
-- ============================================
CREATE TABLE IF NOT EXISTS scuttlebutt_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker TEXT UNIQUE NOT NULL,
    company_name TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    -- Sentiment özeti
    total_posts INTEGER,
    avg_sentiment DECIMAL,
    sentiment_signal TEXT,
    wsb_mentions INTEGER,
    stocks_mentions INTEGER,
    investing_mentions INTEGER,
    
    -- JSON alanları
    key_topics JSONB,
    top_posts JSONB,
    
    -- Phil Fisher insights
    phil_fisher_insight TEXT,
    
    -- Güncellenme tarihi
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_scuttlebutt_ticker ON scuttlebutt_data(ticker);

-- RLS
ALTER TABLE scuttlebutt_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to scuttlebutt_data" ON scuttlebutt_data
    FOR ALL USING (true);


-- ============================================
-- 4. WEEKLY_REPORTS TABLE
-- Haftalık özet raporları
-- ============================================
CREATE TABLE IF NOT EXISTS weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date TIMESTAMPTZ DEFAULT NOW(),
    
    -- Macro veriler
    vix DECIMAL,
    vix_status TEXT,
    yield_curve DECIMAL,
    yield_curve_status TEXT,
    
    -- Özet istatistikler
    total_analyses INTEGER,
    
    -- HTML rapor
    report_html TEXT,
    
    -- Ek meta veriler
    metadata JSONB
);

-- RLS
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to weekly_reports" ON weekly_reports
    FOR ALL USING (true);


-- ============================================
-- 5. NOTIFICATIONS TABLE
-- Bildirim geçmişi
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    title TEXT,
    message TEXT,
    type TEXT CHECK (type IN ('SIGNAL', 'ALERT', 'REPORT', 'SCUTTLEBUTT')),
    
    -- Enhanced alanlar
    vix DECIMAL,
    esg_score DECIMAL,
    enhanced BOOLEAN DEFAULT true,
    
    -- Durum
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    read BOOLEAN DEFAULT false
);

-- Index
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to notifications" ON notifications
    FOR ALL USING (true);


-- ============================================
-- TABLOLARI DOĞRULA
-- ============================================
-- Aşağıdaki sorguyu çalıştırarak tabloların oluştuğunu doğrulayabilirsiniz:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- ============================================
-- ÖZET
-- ============================================
-- Oluşturulan tablolar:
-- 1. watchlists         - Takip listesi (10 örnek ticker ile)
-- 2. analyses_enhanced  - AI analiz sonuçları
-- 3. scuttlebutt_data   - Reddit sentiment verileri
-- 4. weekly_reports     - Haftalık raporlar
-- 5. notifications      - Bildirimler
--
-- Tüm tablolarda RLS aktif ve herkese açık policy var.
-- Production'da bu policy'leri kısıtlamalısınız!
-- ============================================
