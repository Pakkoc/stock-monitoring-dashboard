-- =============================================================================
-- Stock Monitoring Dashboard — Initial Migration
-- =============================================================================
-- Target: PostgreSQL 17 + TimescaleDB 2.x
-- This migration creates all tables, enums, indexes, and TimescaleDB features.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "role" AS ENUM ('admin', 'user');
CREATE TYPE "market" AS ENUM ('KOSPI', 'KOSDAQ');
CREATE TYPE "alert_condition_type" AS ENUM ('price_above', 'price_below', 'change_rate', 'volume_surge');
CREATE TYPE "analysis_type" AS ENUM ('surge', 'daily_summary', 'theme_report');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- 2.1 Users
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" "role" NOT NULL DEFAULT 'user',
    "surge_threshold_pct" DECIMAL(5,2) NOT NULL DEFAULT 5.0,
    "settings_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");

-- 2.2 Stocks
CREATE TABLE "stocks" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "market" "market" NOT NULL,
    "sector" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "listed_at" DATE,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stocks_symbol_key" ON "stocks" ("symbol");
CREATE INDEX "idx_stocks_market_active" ON "stocks" ("market", "is_active");

-- 2.3 Stock Prices (will become hypertable)
CREATE TABLE "stock_prices" (
    "time" TIMESTAMPTZ NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "open" DECIMAL(12,2) NOT NULL,
    "high" DECIMAL(12,2) NOT NULL,
    "low" DECIMAL(12,2) NOT NULL,
    "close" DECIMAL(12,2) NOT NULL,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "trade_value" BIGINT NOT NULL DEFAULT 0,
    "change_rate" DECIMAL(8,4),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "uq_stock_prices_time_stock" ON "stock_prices" ("time", "stock_id");
CREATE INDEX "idx_stock_prices_stock_time" ON "stock_prices" ("stock_id", "time" DESC);
CREATE INDEX "idx_stock_prices_symbol_time" ON "stock_prices" ("symbol", "time" DESC);

-- 2.4 Watchlists
CREATE TABLE "watchlists" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_watchlists_user" ON "watchlists" ("user_id");

-- 2.5 Watchlist Items
CREATE TABLE "watchlist_items" (
    "id" SERIAL NOT NULL,
    "watchlist_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_watchlist_items_wl_stock" ON "watchlist_items" ("watchlist_id", "stock_id");

-- 2.6 Themes
CREATE TABLE "themes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "themes_name_key" ON "themes" ("name");

-- 2.7 Theme Stocks
CREATE TABLE "theme_stocks" (
    "id" SERIAL NOT NULL,
    "theme_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "theme_stocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_theme_stocks_theme_stock" ON "theme_stocks" ("theme_id", "stock_id");
CREATE INDEX "idx_theme_stocks_theme" ON "theme_stocks" ("theme_id");
CREATE INDEX "idx_theme_stocks_stock" ON "theme_stocks" ("stock_id");

-- 2.8 News
CREATE TABLE "news" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "published_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_url_key" ON "news" ("url");
CREATE INDEX "idx_news_published" ON "news" ("published_at" DESC);

-- 2.9 News Stocks
CREATE TABLE "news_stocks" (
    "id" SERIAL NOT NULL,
    "news_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "relevance_score" DECIMAL(5,4) NOT NULL DEFAULT 0,

    CONSTRAINT "news_stocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_news_stocks_news_stock" ON "news_stocks" ("news_id", "stock_id");
CREATE INDEX "idx_news_stocks_stock_relevance" ON "news_stocks" ("stock_id", "relevance_score" DESC);

-- 2.10 AI Analyses
CREATE TABLE "ai_analyses" (
    "id" SERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "analysis_type" "analysis_type" NOT NULL,
    "result" JSONB NOT NULL,
    "confidence_score" DECIMAL(5,4) NOT NULL,
    "qg_l1_pass" BOOLEAN NOT NULL DEFAULT false,
    "qg_l2_pass" BOOLEAN NOT NULL DEFAULT false,
    "qg_l3_pass" BOOLEAN NOT NULL DEFAULT false,
    "sources_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_ai_analyses_stock_time" ON "ai_analyses" ("stock_id", "created_at" DESC);

-- 2.11 Alerts
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "condition_type" "alert_condition_type" NOT NULL,
    "threshold" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_alerts_user_active" ON "alerts" ("user_id", "is_active");
CREATE INDEX "idx_alerts_stock_condition" ON "alerts" ("stock_id", "condition_type");

-- ---------------------------------------------------------------------------
-- 3. Foreign Keys
-- ---------------------------------------------------------------------------

-- Watchlists → Users (CASCADE on delete)
ALTER TABLE "watchlists"
    ADD CONSTRAINT "watchlists_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Watchlist Items → Watchlists (CASCADE on delete)
ALTER TABLE "watchlist_items"
    ADD CONSTRAINT "watchlist_items_watchlist_id_fkey"
    FOREIGN KEY ("watchlist_id") REFERENCES "watchlists" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Watchlist Items → Stocks
ALTER TABLE "watchlist_items"
    ADD CONSTRAINT "watchlist_items_stock_id_fkey"
    FOREIGN KEY ("stock_id") REFERENCES "stocks" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Theme Stocks → Themes (CASCADE on delete)
ALTER TABLE "theme_stocks"
    ADD CONSTRAINT "theme_stocks_theme_id_fkey"
    FOREIGN KEY ("theme_id") REFERENCES "themes" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Theme Stocks → Stocks
ALTER TABLE "theme_stocks"
    ADD CONSTRAINT "theme_stocks_stock_id_fkey"
    FOREIGN KEY ("stock_id") REFERENCES "stocks" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- News Stocks → News (CASCADE on delete)
ALTER TABLE "news_stocks"
    ADD CONSTRAINT "news_stocks_news_id_fkey"
    FOREIGN KEY ("news_id") REFERENCES "news" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- News Stocks → Stocks
ALTER TABLE "news_stocks"
    ADD CONSTRAINT "news_stocks_stock_id_fkey"
    FOREIGN KEY ("stock_id") REFERENCES "stocks" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AI Analyses → Stocks
ALTER TABLE "ai_analyses"
    ADD CONSTRAINT "ai_analyses_stock_id_fkey"
    FOREIGN KEY ("stock_id") REFERENCES "stocks" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Alerts → Users (CASCADE on delete)
ALTER TABLE "alerts"
    ADD CONSTRAINT "alerts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Alerts → Stocks
ALTER TABLE "alerts"
    ADD CONSTRAINT "alerts_stock_id_fkey"
    FOREIGN KEY ("stock_id") REFERENCES "stocks" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. TimescaleDB: Hypertable
-- ---------------------------------------------------------------------------

-- Convert stock_prices to a hypertable with 1-day chunk interval.
-- The 1-day interval aligns with KRX trading sessions.
-- NOTE: No FK from stock_prices to stocks — integrity enforced at application layer.
SELECT create_hypertable(
    'stock_prices',
    by_range('time', INTERVAL '1 day')
);

-- ---------------------------------------------------------------------------
-- 5. TimescaleDB: Compression Policy
-- ---------------------------------------------------------------------------

-- Enable compression: segment by stock_id, order by time DESC within each segment.
ALTER TABLE stock_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'stock_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- Automatically compress chunks older than 7 days.
-- Days 0-7: uncompressed (HOT tier) for fast INSERT/UPDATE.
-- Days 8+: compressed (WARM tier) with ~90% space savings.
SELECT add_compression_policy('stock_prices', INTERVAL '7 days');

-- ---------------------------------------------------------------------------
-- 6. TimescaleDB: Retention Policy
-- ---------------------------------------------------------------------------

-- Drop raw tick data older than 365 days.
-- The daily_ohlcv continuous aggregate is RETAINED indefinitely,
-- preserving historical daily candles for long-term charts.
SELECT add_retention_policy('stock_prices', INTERVAL '365 days');

-- ---------------------------------------------------------------------------
-- 7. Custom Indexes (not expressible in Prisma)
-- ---------------------------------------------------------------------------

-- Composite sort indexes on stock_prices for "top N" dashboard widgets
CREATE INDEX idx_stock_prices_trade_value ON stock_prices (time DESC, trade_value DESC);
CREATE INDEX idx_stock_prices_change_rate ON stock_prices (time DESC, change_rate DESC);
CREATE INDEX idx_stock_prices_volume ON stock_prices (time DESC, volume DESC);

-- BRIN index for large time-range scans (supplements chunk pruning)
CREATE INDEX idx_stock_prices_time_brin ON stock_prices USING BRIN (time)
    WITH (pages_per_range = 32);

-- Full-text search on news (Korean-optimized, 'simple' tokenizer)
ALTER TABLE news ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(content, '')), 'C')
    ) STORED;

CREATE INDEX idx_news_search ON news USING GIN (search_vector);

-- Partial index on alerts for active-only queries
CREATE INDEX idx_alerts_active_partial ON alerts (stock_id, condition_type)
    WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- 8. Migration Marker
-- ---------------------------------------------------------------------------
-- Prisma uses this table to track applied migrations.
-- This file is managed by Prisma Migrate (baseline migration).
