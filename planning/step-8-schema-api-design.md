# Step 8: Database Schema & API Contract Design

> **Agent**: @schema-designer | **Date**: 2026-03-27
> **Input**: Step 1 (KIS API Research), Step 2 (Database Research), Step 5 (News Research), PRD §4.4-4.5
> **Trace**: [trace:step-8:schema-api-design]

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Complete Database Schema](#2-complete-database-schema)
3. [TimescaleDB DDL & Policies](#3-timescaledb-ddl--policies)
4. [Index Strategy](#4-index-strategy)
5. [OpenAPI 3.1 Specification](#5-openapi-31-specification)
6. [WebSocket Event Contracts](#6-websocket-event-contracts)
7. [DTO Definitions (TypeScript)](#7-dto-definitions-typescript)
8. [Migration Strategy](#8-migration-strategy)
9. [Cross-Cutting Concerns](#9-cross-cutting-concerns)

---

## 1. Design Philosophy

### 1.1 Guiding Principles

This schema-API design is governed by three foundational constraints derived from the PRD and research phases:

1. **TimescaleDB-first for time-series**: All price data flows through a hypertable with continuous aggregates. Prisma handles relational entities; raw SQL handles time-series features. This hybrid approach (Step 2, §4.3) avoids fighting Prisma's limitations while preserving type safety for 90% of application code.

2. **Denormalization where latency matters**: The `stock_prices` table includes a denormalized `symbol` column (in addition to `stock_id`) to eliminate JOINs on the hottest query path — real-time price lookups. The 20-byte-per-row overhead is negligible against the 58.5M rows/day volume (Step 2, §6.1).

3. **API-first contract**: The OpenAPI specification defines the contract between frontend and backend teams. Every endpoint includes request validation schemas, response envelopes, error codes, and pagination cursors. WebSocket events use the same DTO types as REST responses for consistency.

### 1.2 Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Prisma model | PascalCase | `StockPrice` |
| Database table | snake_case (via `@@map`) | `stock_prices` |
| Database column | snake_case (via `@map`) | `stock_id` |
| API endpoint | kebab-case | `/api/watchlists/:id/items` |
| TypeScript DTO | PascalCase with suffix | `StockListResponseDto` |
| JSON field | camelCase | `changeRate` |
| Enum (DB) | snake_case | `price_above` |
| Enum (TS) | SCREAMING_SNAKE_CASE | `PRICE_ABOVE` |

### 1.3 Input Data Traceability

Every design decision traces back to research artifacts:

| Decision | Source |
|----------|--------|
| Hypertable chunk interval = 1 day | Step 2, §1.3 |
| Compression after 7 days | Step 2, §7.1 |
| Retention drop after 365 days | Step 2, §7.1 |
| `symbol` denormalized in `stock_prices` | Step 2, §1.2 |
| KIS WebSocket field mapping (50+ fields) | Step 1, §2.6 |
| News full-text search via `tsvector` + GIN | Step 2, §5.3 |
| Naver News API response fields | Step 5, §1.4 |
| Better Auth for authentication | PRD §4.6 |
| Max 41 WebSocket subscriptions per session | Step 1, §2.9 |

---

## 2. Complete Database Schema

### 2.1 Entity-Relationship Overview

```
users 1──N watchlists 1──N watchlist_items N──1 stocks
users 1──N alerts N──1 stocks
stocks 1──N stock_prices (hypertable)
stocks N──M themes (via theme_stocks)
stocks N──M news (via news_stocks)
stocks 1──N ai_analyses
```

### 2.2 Prisma Schema

The complete Prisma schema is in the companion file `planning/schema.prisma`. Below is a table-level summary of all 11 entities:

| Model | DB Table | PK Strategy | Key Fields | Relations |
|-------|----------|-------------|------------|-----------|
| `User` | `users` | autoincrement | email (unique), passwordHash, name, role, surgeThreshold, settingsJson | has many: watchlists, alerts |
| `Stock` | `stocks` | autoincrement | symbol (unique), name, market (enum), sector, isActive, listedAt | has many: watchlistItems, themeStocks, newsStocks, aiAnalyses, alerts |
| `StockPrice` | `stock_prices` | composite unique (time, stockId) | time, stockId, symbol, open, high, low, close, volume, tradeValue, changeRate | none (hypertable, no FK) |
| `Watchlist` | `watchlists` | autoincrement | userId, name | belongs to: user; has many: items |
| `WatchlistItem` | `watchlist_items` | autoincrement | watchlistId, stockId (unique together) | belongs to: watchlist, stock |
| `Theme` | `themes` | autoincrement | name (unique), description, isSystem | has many: themeStocks |
| `ThemeStock` | `theme_stocks` | autoincrement | themeId, stockId (unique together), addedAt | belongs to: theme, stock |
| `News` | `news` | autoincrement | title, url (unique), source, summary, content, publishedAt | has many: newsStocks |
| `NewsStock` | `news_stocks` | autoincrement | newsId, stockId (unique together), relevanceScore | belongs to: news, stock |
| `AiAnalysis` | `ai_analyses` | autoincrement | stockId, analysisType (enum), result (JSON), confidenceScore, qgL1Pass/L2/L3, sourcesJson | belongs to: stock |
| `Alert` | `alerts` | autoincrement | userId, stockId, conditionType (enum), threshold, isActive, lastTriggeredAt | belongs to: user, stock |

### 2.3 Enum Definitions

Four enums are defined to enforce type safety at both the database and application layers:

**Role** (`role`): `ADMIN` / `USER` — Two-tier access control as specified in PRD §3.5. Admin has full system access; User has dashboard and portfolio features.

**Market** (`market`): `KOSPI` / `KOSDAQ` — The two primary Korean stock exchanges. KONEX is omitted from the enum since it is not in scope for the dashboard (PRD §3.1 focuses on KOSPI/KOSDAQ listed equities), but can be added later if needed.

**AlertConditionType** (`alert_condition_type`): `PRICE_ABOVE` / `PRICE_BELOW` / `CHANGE_RATE` / `VOLUME_SURGE` — Covers the four alert trigger types specified in PRD §3.1 (widget 5: surge alert with user-configurable thresholds).

**AnalysisType** (`analysis_type`): `SURGE` / `DAILY_SUMMARY` / `THEME_REPORT` — Types of AI analyses. `SURGE` is the MVP-critical analysis triggered by real-time price spikes (PRD §3.6). `DAILY_SUMMARY` and `THEME_REPORT` support the AI analysis card widget.

### 2.4 Design Decisions

**Why no FK from `stock_prices` to `stocks`**: TimescaleDB hypertables have restrictions on foreign key constraints (they cannot be the target of FKs from other tables, and FKs from hypertables to regular tables add overhead to the INSERT-hot path). The referential integrity is enforced at the application layer: the data ingestion pipeline always validates `stock_id` against the `stocks` table before inserting.

**Why `settingsJson` on `User`**: PostgreSQL 17's `JSON_TABLE` function (Step 2, §3.1) enables efficient SQL-level extraction of user preferences (theme, language, default market, notification settings) without needing a separate `user_settings` table. This keeps the schema flat while supporting extensible per-user configuration.

**Why `isSystem` on `Theme` instead of `isCustom`**: The field name `isSystem` more clearly communicates intent — system themes are pre-seeded and cannot be deleted by users; user-created themes have `isSystem = false`. This is more intuitive than the inverse boolean `isCustom` used in the Step 2 draft, and avoids the "double negative" anti-pattern when querying deletable themes (`WHERE NOT is_custom` becomes `WHERE is_system = false`).

**Why `qgL1Pass`, `qgL2Pass`, `qgL3Pass` on `AiAnalysis`**: The 3-layer Quality Gate (PRD §4.7) is a core differentiator. Storing pass/fail flags per layer enables the frontend to display which gates passed and allows administrators to filter analyses by quality level. The JSON `result` field stores the full structured analysis, while the boolean flags provide fast filtering.

---

## 3. TimescaleDB DDL & Policies

All DDL in this section is executed as custom Prisma migration SQL (i.e., placed in a `migration.sql` file within `prisma/migrations/` and run after the Prisma-generated table creation).

### 3.1 Hypertable Creation

```sql
-- Convert stock_prices to a hypertable with 1-day chunk interval.
-- Must be run AFTER Prisma creates the base table.
-- The 1-day interval aligns with KRX trading sessions (Step 2, §1.3).
SELECT create_hypertable(
    'stock_prices',
    by_range('time', INTERVAL '1 day')
);
```

### 3.2 Continuous Aggregate: Daily OHLCV

The foundation layer that converts tick/second-level data into clean daily candles:

```sql
CREATE MATERIALIZED VIEW daily_ohlcv
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time)  AS bucket,
    stock_id,
    symbol,
    first(open, time)           AS open,
    max(high)                   AS high,
    min(low)                    AS low,
    last(close, time)           AS close,
    sum(volume)                 AS volume,
    sum(trade_value)            AS trade_value,
    last(change_rate, time)     AS change_rate
FROM stock_prices
GROUP BY bucket, stock_id, symbol
WITH NO DATA;

-- Refresh policy: every 1 hour, look back 3 days for late-arriving corrections
SELECT add_continuous_aggregate_policy('daily_ohlcv',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

### 3.3 Technical Indicator Views

These are regular PostgreSQL views (not continuous aggregates) because they use window functions with `ROWS BETWEEN` frames that are not supported in TimescaleDB continuous aggregates. They read from the already-materialized `daily_ohlcv`, so performance is excellent (Step 2, §2.7).

**Moving Averages (5/20/60/120 day)**:

```sql
CREATE OR REPLACE VIEW v_moving_averages AS
SELECT
    bucket,
    stock_id,
    symbol,
    close,
    AVG(close) OVER w5   AS sma_5,
    AVG(close) OVER w20  AS sma_20,
    AVG(close) OVER w60  AS sma_60,
    AVG(close) OVER w120 AS sma_120,
    AVG(volume) OVER w20 AS vol_sma_20
FROM daily_ohlcv
WINDOW
    w5   AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 4 PRECEDING AND CURRENT ROW),
    w20  AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 19 PRECEDING AND CURRENT ROW),
    w60  AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 59 PRECEDING AND CURRENT ROW),
    w120 AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 119 PRECEDING AND CURRENT ROW);
```

**RSI (14-Period)**:

```sql
CREATE OR REPLACE VIEW v_rsi_14 AS
WITH daily_changes AS (
    SELECT
        bucket, stock_id, symbol, close,
        close - LAG(close) OVER (PARTITION BY stock_id ORDER BY bucket) AS change
    FROM daily_ohlcv
),
gains_losses AS (
    SELECT
        bucket, stock_id, symbol, close,
        GREATEST(change, 0) AS gain,
        ABS(LEAST(change, 0)) AS loss
    FROM daily_changes
),
avg_gain_loss AS (
    SELECT
        bucket, stock_id, symbol, close,
        AVG(gain) OVER w14 AS avg_gain,
        AVG(loss) OVER w14 AS avg_loss
    FROM gains_losses
    WINDOW w14 AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)
)
SELECT
    bucket, stock_id, symbol, close,
    CASE
        WHEN avg_loss = 0 THEN 100
        ELSE ROUND(100 - (100.0 / (1 + (avg_gain / avg_loss))), 2)
    END AS rsi_14
FROM avg_gain_loss;
```

**MACD (12/26/9)**:

```sql
CREATE OR REPLACE VIEW v_macd AS
WITH ema_base AS (
    SELECT
        bucket, stock_id, symbol, close,
        AVG(close) OVER (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS sma_12,
        AVG(close) OVER (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 25 PRECEDING AND CURRENT ROW) AS sma_26
    FROM daily_ohlcv
),
macd_line AS (
    SELECT
        bucket, stock_id, symbol, close,
        (sma_12 - sma_26) AS macd,
        AVG(sma_12 - sma_26) OVER (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS signal_line
    FROM ema_base
)
SELECT
    bucket, stock_id, symbol, close,
    ROUND(macd::NUMERIC, 4) AS macd,
    ROUND(signal_line::NUMERIC, 4) AS signal_line,
    ROUND((macd - signal_line)::NUMERIC, 4) AS histogram
FROM macd_line;
```

**Bollinger Bands (20-period, 2 std dev)**:

```sql
CREATE OR REPLACE VIEW v_bollinger_bands AS
SELECT
    bucket, stock_id, symbol, close,
    AVG(close) OVER w20 AS middle_band,
    AVG(close) OVER w20 + 2 * STDDEV(close) OVER w20 AS upper_band,
    AVG(close) OVER w20 - 2 * STDDEV(close) OVER w20 AS lower_band,
    CASE
        WHEN AVG(close) OVER w20 > 0 THEN
            ROUND(((2 * 2 * STDDEV(close) OVER w20) / AVG(close) OVER w20 * 100)::NUMERIC, 2)
        ELSE 0
    END AS bandwidth_pct
FROM daily_ohlcv
WINDOW w20 AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 19 PRECEDING AND CURRENT ROW);
```

**Unified Technical Indicators View**:

```sql
CREATE OR REPLACE VIEW v_technical_indicators AS
SELECT
    ma.bucket, ma.stock_id, ma.symbol, ma.close,
    ma.sma_5, ma.sma_20, ma.sma_60, ma.sma_120,
    rsi.rsi_14,
    macd.macd, macd.signal_line, macd.histogram,
    bb.upper_band, bb.middle_band, bb.lower_band, bb.bandwidth_pct
FROM v_moving_averages ma
LEFT JOIN v_rsi_14 rsi ON ma.stock_id = rsi.stock_id AND ma.bucket = rsi.bucket
LEFT JOIN v_macd macd ON ma.stock_id = macd.stock_id AND ma.bucket = macd.bucket
LEFT JOIN v_bollinger_bands bb ON ma.stock_id = bb.stock_id AND ma.bucket = bb.bucket;
```

### 3.4 Compression Policy

```sql
-- Enable compression on the hypertable.
-- segmentby = stock_id: each segment contains one stock's data,
-- enabling efficient per-stock decompression.
-- orderby = time DESC: within each segment, data is ordered newest-first
-- for optimal range scan performance.
ALTER TABLE stock_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'stock_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- Automatically compress chunks older than 7 days.
-- Days 0-7 remain uncompressed (HOT tier) for fast INSERT/UPDATE.
-- Days 8+ are compressed (WARM tier) with ~90% space savings.
SELECT add_compression_policy('stock_prices', INTERVAL '7 days');
```

### 3.5 Retention Policy

```sql
-- Drop raw tick data older than 365 days.
-- The daily_ohlcv continuous aggregate is RETAINED indefinitely,
-- preserving historical daily candles for long-term charts.
SELECT add_retention_policy('stock_prices', INTERVAL '365 days');
```

**Storage math** (Step 2, §6.4): With 98 GB SSD, compressed daily storage of ~0.7 GB/day yields ~140 trading-day capacity. The 365-day retention policy keeps roughly 250 trading days of raw data (~175 GB uncompressed, ~17.5 GB compressed). Combined with compression, this fits within the 98 GB constraint with headroom for other tables, indexes, and WAL.

---

## 4. Index Strategy

### 4.1 Indexes Defined in Prisma Schema

The following indexes are declared directly in `schema.prisma` via `@@index`:

| Table | Index Name | Columns | Purpose |
|-------|-----------|---------|---------|
| `stocks` | `idx_stocks_market_active` | (market, is_active) | Market-filtered stock listings |
| `stock_prices` | `idx_stock_prices_stock_time` | (stock_id, time DESC) | Per-stock price history (hottest query) |
| `stock_prices` | `idx_stock_prices_symbol_time` | (symbol, time DESC) | Symbol-based lookups (API convenience) |
| `watchlists` | `idx_watchlists_user` | (user_id) | User's watchlist lookup |
| `news` | `idx_news_published` | (published_at DESC) | Time-ordered news listing |
| `news_stocks` | `idx_news_stocks_stock_relevance` | (stock_id, relevance_score DESC) | Top-relevant news per stock |
| `ai_analyses` | `idx_ai_analyses_stock_time` | (stock_id, created_at DESC) | Latest analysis per stock |
| `alerts` | `idx_alerts_user_active` | (user_id, is_active) | User's active alerts dashboard |
| `alerts` | `idx_alerts_stock_condition` | (stock_id, condition_type) | Real-time alert evaluation |
| `theme_stocks` | `idx_theme_stocks_theme` | (theme_id) | Stocks in a theme |
| `theme_stocks` | `idx_theme_stocks_stock` | (stock_id) | Themes containing a stock |

### 4.2 Custom Migration Indexes (SQL)

These indexes require features not expressible in Prisma's schema language:

```sql
-- 1. Composite sort indexes on stock_prices for "top N" widgets
--    These enable the dashboard's "top trading value", "top gainers", "top volume" queries
--    without full-chunk scans.
CREATE INDEX idx_stock_prices_trade_value ON stock_prices (time DESC, trade_value DESC);
CREATE INDEX idx_stock_prices_change_rate ON stock_prices (time DESC, change_rate DESC);
CREATE INDEX idx_stock_prices_volume ON stock_prices (time DESC, volume DESC);

-- 2. BRIN index for large time-range scans (optional, supplements chunk pruning)
CREATE INDEX idx_stock_prices_time_brin ON stock_prices USING BRIN (time)
    WITH (pages_per_range = 32);

-- 3. Full-text search on news (Korean-optimized)
--    Uses 'simple' tokenizer since Korean text does not benefit from English stemming.
--    For production Korean morphological analysis, consider textsearch_ko or mecab-ko.
ALTER TABLE news ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(content, '')), 'C')
    ) STORED;

CREATE INDEX idx_news_search ON news USING GIN (search_vector);

-- 4. Partial index on alerts for active-only queries
CREATE INDEX idx_alerts_active_partial ON alerts (stock_id, condition_type)
    WHERE is_active = TRUE;
```

### 4.3 Index Impact on Write Performance

Per Step 2 benchmarks (§5, §6.2), each secondary index on `stock_prices` reduces insert throughput by approximately 20-40%. With 5 secondary indexes (2 Prisma-defined + 3 composite sort), the expected throughput reduction is to ~60-70% of baseline. Against the demonstrated TimescaleDB baseline of 111,000 rows/sec, this yields ~66,000-77,000 rows/sec effective capacity — still 26-31x above our 2,500 rows/sec target.

---

## 5. OpenAPI 3.1 Specification

### 5.1 API Base Configuration

```yaml
openapi: "3.1.0"
info:
  title: Stock Monitoring Dashboard API
  version: "1.0.0"
  description: REST API for the stock monitoring dashboard with real-time Korean stock data, AI analysis, and portfolio management.
servers:
  - url: /api
    description: Application API prefix
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

### 5.2 Authentication Endpoints

#### POST /api/auth/signup

Create a new user account.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123!",
  "name": "Kim Investor"
}
```

**Validation Rules**:
- `email`: valid email format, max 255 chars, unique
- `password`: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special char
- `name`: min 2 chars, max 100 chars

**Response 201**:
```json
{
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "Kim Investor",
    "role": "USER",
    "createdAt": "2026-03-27T10:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Error 409**: `{ "error": "EMAIL_ALREADY_EXISTS", "message": "An account with this email already exists." }`

#### POST /api/auth/login

Authenticate and receive a JWT token.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123!"
}
```

**Response 200**:
```json
{
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "Kim Investor",
    "role": "USER"
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-03-28T10:00:00.000Z"
}
```

**Error 401**: `{ "error": "INVALID_CREDENTIALS", "message": "Email or password is incorrect." }`

#### POST /api/auth/logout

Invalidate the current session.

**Headers**: `Authorization: Bearer {token}`

**Response 200**: `{ "message": "Logged out successfully." }`

#### GET /api/auth/me

Get the currently authenticated user's profile.

**Headers**: `Authorization: Bearer {token}`

**Response 200**:
```json
{
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "Kim Investor",
    "role": "USER",
    "surgeThresholdPct": 5.0,
    "settings": {
      "theme": "dark",
      "defaultMarket": "KOSPI",
      "notifications": { "enabled": true, "sound": false }
    },
    "createdAt": "2026-03-27T10:00:00.000Z",
    "updatedAt": "2026-03-27T10:00:00.000Z"
  }
}
```

### 5.3 Stock Endpoints

#### GET /api/stocks

List stocks with filtering, sorting, and pagination.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `market` | enum | — | Filter by market: `KOSPI`, `KOSDAQ` |
| `sector` | string | — | Filter by sector name |
| `search` | string | — | Search by symbol or name (prefix match) |
| `sortBy` | enum | `tradeValue` | Sort field: `tradeValue`, `changeRate`, `volume`, `name`, `symbol` |
| `sortOrder` | enum | `desc` | Sort direction: `asc`, `desc` |
| `page` | int | 1 | Page number (1-based) |
| `limit` | int | 50 | Items per page (max 100) |
| `themeId` | int | — | Filter stocks belonging to a specific theme |
| `watchlistId` | int | — | Filter stocks in a specific watchlist |

**Response 200**:
```json
{
  "data": [
    {
      "id": 1,
      "symbol": "005930",
      "name": "삼성전자",
      "market": "KOSPI",
      "sector": "반도체",
      "currentPrice": 72500,
      "changeRate": 2.34,
      "changeAmount": 1700,
      "volume": 15432100,
      "tradeValue": 1123456789000,
      "high": 73000,
      "low": 71200,
      "open": 71500,
      "updatedAt": "2026-03-27T06:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 2487,
    "totalPages": 50,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### GET /api/stocks/:symbol

Get detailed information for a single stock.

**Path Parameters**: `symbol` (string) — 6-digit KRX stock code (e.g., `005930`)

**Response 200**:
```json
{
  "data": {
    "id": 1,
    "symbol": "005930",
    "name": "삼성전자",
    "market": "KOSPI",
    "sector": "반도체",
    "isActive": true,
    "listedAt": "1975-06-11",
    "currentPrice": 72500,
    "changeRate": 2.34,
    "changeAmount": 1700,
    "volume": 15432100,
    "tradeValue": 1123456789000,
    "high": 73000,
    "low": 71200,
    "open": 71500,
    "previousClose": 70800,
    "themes": [
      { "id": 1, "name": "반도체" },
      { "id": 5, "name": "AI/HBM" }
    ],
    "technicalIndicators": {
      "sma5": 71800,
      "sma20": 70200,
      "sma60": 68500,
      "sma120": 66900,
      "rsi14": 62.5,
      "macd": 1250.0,
      "macdSignal": 980.0,
      "macdHistogram": 270.0,
      "bollingerUpper": 75600,
      "bollingerMiddle": 70200,
      "bollingerLower": 64800
    },
    "updatedAt": "2026-03-27T06:30:00.000Z"
  }
}
```

**Error 404**: `{ "error": "STOCK_NOT_FOUND", "message": "Stock with symbol '999999' not found." }`

#### GET /api/stocks/:symbol/prices

Historical OHLCV price data for charting.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `interval` | enum | `1d` | Time bucket: `1m`, `5m`, `15m`, `1h`, `1d`, `1w`, `1M` |
| `from` | ISO8601 | 30 days ago | Start timestamp |
| `to` | ISO8601 | now | End timestamp |
| `limit` | int | 200 | Max data points (max 1000) |

**Response 200**:
```json
{
  "data": {
    "symbol": "005930",
    "interval": "1d",
    "candles": [
      {
        "time": "2026-03-26T00:00:00.000Z",
        "open": 70800,
        "high": 71500,
        "low": 70200,
        "close": 70800,
        "volume": 12300000,
        "tradeValue": 874000000000,
        "changeRate": -0.42
      }
    ]
  },
  "meta": {
    "count": 30,
    "from": "2026-02-25T00:00:00.000Z",
    "to": "2026-03-27T00:00:00.000Z"
  }
}
```

#### GET /api/stocks/:symbol/news

News articles related to a specific stock.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Items per page (max 50) |
| `minRelevance` | float | 0.5 | Minimum relevance score (0.0-1.0) |

**Response 200**:
```json
{
  "data": [
    {
      "id": 42,
      "title": "삼성전자, 반도체 수출 호조로 3% 급등",
      "url": "https://n.news.naver.com/article/009/0005300001",
      "source": "한국경제 증권",
      "summary": "삼성전자가 반도체 수출 호조에 힘입어 주가가 3% 이상 급등했다...",
      "publishedAt": "2026-03-27T09:30:00.000Z",
      "relevanceScore": 0.92
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### 5.4 AI Analysis Endpoints

#### POST /api/ai/analyze/:symbol

Trigger an AI surge analysis for a stock. This is an asynchronous operation — the endpoint queues the analysis and returns immediately with a job ID.

**Path Parameters**: `symbol` (string)

**Request Body** (optional):
```json
{
  "analysisType": "SURGE",
  "context": "User noticed 5%+ spike at 10:15 AM"
}
```

**Response 202 (Accepted)**:
```json
{
  "data": {
    "jobId": "analysis_005930_1711526400",
    "status": "QUEUED",
    "estimatedCompletionSec": 15,
    "message": "AI analysis queued for 005930 (삼성전자)"
  }
}
```

**Error 429**: `{ "error": "ANALYSIS_RATE_LIMITED", "message": "Maximum 5 analysis requests per minute." }`

#### GET /api/ai/analyses/:symbol

Get AI analysis history for a stock.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | enum | — | Filter: `SURGE`, `DAILY_SUMMARY`, `THEME_REPORT` |
| `page` | int | 1 | Page number |
| `limit` | int | 10 | Items per page (max 50) |
| `minConfidence` | float | — | Minimum confidence score (0.0-1.0) |

**Response 200**:
```json
{
  "data": [
    {
      "id": 101,
      "stockId": 1,
      "symbol": "005930",
      "analysisType": "SURGE",
      "result": {
        "summary": "삼성전자 주가 급등은 HBM4 양산 소식과 NVIDIA 신규 공급 계약 체결 보도에 기인합니다.",
        "factors": [
          {
            "type": "NEWS",
            "description": "HBM4 양산 계약 체결 보도",
            "impact": "HIGH",
            "source": "한국경제",
            "url": "https://..."
          },
          {
            "type": "SECTOR",
            "description": "반도체 섹터 전반 강세 (SOX +2.1%)",
            "impact": "MEDIUM"
          }
        ],
        "outlook": "단기 추가 상승 가능성 있으나, 차익 실현 매물 출회 주의",
        "relatedStocks": ["000660", "042700"]
      },
      "confidenceScore": 0.847,
      "qualityGate": {
        "l1Pass": true,
        "l2Pass": true,
        "l3Pass": true
      },
      "sources": [
        { "type": "news", "title": "삼성전자 HBM4 양산...", "url": "https://..." },
        { "type": "price_data", "description": "Recent 30-day OHLCV from TimescaleDB" }
      ],
      "createdAt": "2026-03-27T10:16:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 5
  }
}
```

### 5.5 Portfolio Endpoints (Watchlists)

#### GET /api/watchlists

List all watchlists for the authenticated user.

**Response 200**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "반도체 관심",
      "itemCount": 8,
      "createdAt": "2026-03-20T10:00:00.000Z"
    }
  ]
}
```

#### POST /api/watchlists

Create a new watchlist.

**Request Body**:
```json
{
  "name": "2차전지 모니터링"
}
```

**Response 201**:
```json
{
  "data": {
    "id": 2,
    "name": "2차전지 모니터링",
    "itemCount": 0,
    "createdAt": "2026-03-27T10:00:00.000Z"
  }
}
```

#### PUT /api/watchlists/:id

Update watchlist name.

**Request Body**: `{ "name": "Updated Name" }`

**Response 200**: Updated watchlist object.

#### DELETE /api/watchlists/:id

Delete a watchlist and all its items (cascade).

**Response 204**: No content.

#### GET /api/watchlists/:id/items

List stocks in a watchlist with real-time price data.

**Response 200**:
```json
{
  "data": [
    {
      "id": 1,
      "stockId": 1,
      "symbol": "005930",
      "name": "삼성전자",
      "market": "KOSPI",
      "currentPrice": 72500,
      "changeRate": 2.34,
      "volume": 15432100,
      "tradeValue": 1123456789000,
      "addedAt": "2026-03-25T10:00:00.000Z"
    }
  ]
}
```

#### POST /api/watchlists/:id/items

Add a stock to a watchlist.

**Request Body**: `{ "stockId": 42 }`

**Response 201**: Created watchlist item.

**Error 409**: `{ "error": "STOCK_ALREADY_IN_WATCHLIST" }`

#### DELETE /api/watchlists/:id/items/:stockId

Remove a stock from a watchlist.

**Response 204**: No content.

### 5.6 Alert Endpoints

#### GET /api/alerts

List all alerts for the authenticated user.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `isActive` | boolean | — | Filter by active/inactive status |
| `stockId` | int | — | Filter by stock |

**Response 200**:
```json
{
  "data": [
    {
      "id": 1,
      "stock": {
        "id": 1,
        "symbol": "005930",
        "name": "삼성전자"
      },
      "conditionType": "CHANGE_RATE",
      "threshold": 5.0,
      "isActive": true,
      "lastTriggeredAt": null,
      "createdAt": "2026-03-25T10:00:00.000Z"
    }
  ]
}
```

#### POST /api/alerts

Create a new alert.

**Request Body**:
```json
{
  "stockId": 1,
  "conditionType": "CHANGE_RATE",
  "threshold": 5.0
}
```

**Validation Rules**:
- `conditionType`: one of `PRICE_ABOVE`, `PRICE_BELOW`, `CHANGE_RATE`, `VOLUME_SURGE`
- `threshold`: positive number; for `CHANGE_RATE` represents percentage; for `VOLUME_SURGE` represents multiplier of 20-day average volume

**Response 201**: Created alert object.

#### PUT /api/alerts/:id

Update an alert's threshold or active status.

**Request Body**:
```json
{
  "threshold": 7.5,
  "isActive": false
}
```

**Response 200**: Updated alert object.

#### DELETE /api/alerts/:id

Delete an alert.

**Response 204**: No content.

### 5.7 Theme Endpoints

#### GET /api/themes

List all themes with aggregate statistics.

**Response 200**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "반도체",
      "description": "반도체 관련 종목 (삼성전자, SK하이닉스 등)",
      "isSystem": true,
      "stockCount": 15,
      "avgChangeRate": 1.85,
      "createdAt": "2026-03-01T00:00:00.000Z"
    }
  ]
}
```

#### POST /api/themes (ADMIN only)

Create a custom theme.

**Request Body**:
```json
{
  "name": "AI/HBM",
  "description": "AI and High Bandwidth Memory related stocks",
  "stockIds": [1, 42, 105]
}
```

**Response 201**: Created theme with stock list.

#### PUT /api/themes/:id (ADMIN only)

Update theme details or stock membership.

#### DELETE /api/themes/:id (ADMIN only)

Delete a custom theme (system themes cannot be deleted).

**Error 403**: `{ "error": "CANNOT_DELETE_SYSTEM_THEME" }`

### 5.8 Admin Endpoints

#### GET /api/admin/status (ADMIN only)

System health and data collection status.

**Response 200**:
```json
{
  "data": {
    "system": {
      "uptime": 86400,
      "version": "1.0.0",
      "nodeVersion": "22.x",
      "memoryUsageMb": 512,
      "cpuUsagePct": 12.5
    },
    "database": {
      "connected": true,
      "totalStocks": 2487,
      "totalPriceRows": 58500000,
      "oldestPriceData": "2025-04-01T00:00:00.000Z",
      "compressionRatio": 0.91,
      "diskUsageGb": 24.5
    },
    "dataCollection": {
      "kisWebsocket": {
        "connected": true,
        "subscribedStocks": 41,
        "lastMessageAt": "2026-03-27T06:29:59.000Z",
        "messagesPerSec": 2480
      },
      "newsIngestion": {
        "lastNaverApiCall": "2026-03-27T06:25:00.000Z",
        "naverApiCallsToday": 5200,
        "naverApiDailyLimit": 25000,
        "rssFeedsActive": 9,
        "totalNewsToday": 342
      },
      "aiAnalysis": {
        "analysesToday": 15,
        "avgConfidenceScore": 0.82,
        "avgProcessingTimeSec": 12.3,
        "queueDepth": 0
      }
    },
    "redis": {
      "connected": true,
      "memoryUsageMb": 128,
      "keysCount": 5200
    }
  }
}
```

#### GET /api/admin/settings (ADMIN only)

Get system-wide configuration.

**Response 200**:
```json
{
  "data": {
    "kisApi": {
      "environment": "production",
      "tokenExpiresAt": "2026-06-25T14:04:07.000Z",
      "websocketSubscriptions": 41
    },
    "dataCollection": {
      "priceUpdateIntervalMs": 1000,
      "newsQueryIntervalMin": 5,
      "rssRefreshIntervalMin": 5
    },
    "aiAnalysis": {
      "provider": "claude",
      "model": "claude-sonnet-4-20250514",
      "maxConcurrentAnalyses": 3,
      "dailyAnalysisLimit": 100
    },
    "retention": {
      "rawPriceDays": 365,
      "compressionAfterDays": 7,
      "newsRetentionDays": 730
    }
  }
}
```

#### PUT /api/admin/settings (ADMIN only)

Update system-wide configuration (partial update supported).

#### GET /api/admin/users (ADMIN only)

List all registered users.

**Response 200**:
```json
{
  "data": [
    {
      "id": 1,
      "email": "admin@example.com",
      "name": "Admin",
      "role": "ADMIN",
      "watchlistCount": 3,
      "alertCount": 12,
      "lastLoginAt": "2026-03-27T08:00:00.000Z",
      "createdAt": "2026-03-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 5
  }
}
```

### 5.9 Common Response Envelope

All API responses follow a consistent envelope structure:

**Success**: `{ "data": <payload>, "meta"?: <pagination> }`

**Error**: `{ "error": "<ERROR_CODE>", "message": "<human-readable description>", "details"?: <validation errors> }`

**Standard Error Codes**:

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 400 | `VALIDATION_ERROR` | Request body/params failed validation |
| 401 | `UNAUTHORIZED` | Missing or invalid auth token |
| 403 | `FORBIDDEN` | Insufficient role permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Resource already exists (duplicate) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 6. WebSocket Event Contracts

WebSocket communication uses Socket.IO 4.x with the `/ws` namespace. All events use the same DTO types as REST responses for consistency.

### 6.1 Connection & Authentication

```typescript
// Client connects with auth token
const socket = io('/ws', {
  auth: { token: 'Bearer eyJhbGciOi...' },
  transports: ['websocket'],
});

// Server emits on successful connection
// Event: 'connected'
{
  "userId": 1,
  "subscribedStocks": [],
  "serverTime": "2026-03-27T06:30:00.000Z"
}
```

### 6.2 Subscription Management

```typescript
// Client subscribes to stock price updates
// Event: 'subscribe:stock'
{ "symbols": ["005930", "000660", "035420"] }

// Server confirms subscription
// Event: 'subscribed'
{
  "symbols": ["005930", "000660", "035420"],
  "totalSubscriptions": 3,
  "maxSubscriptions": 41
}

// Client unsubscribes
// Event: 'unsubscribe:stock'
{ "symbols": ["035420"] }
```

### 6.3 Event: `stock:price` — Real-time Price Update

Emitted for every subscribed stock when a new price tick arrives (approximately 1/sec per stock during market hours).

```typescript
// Event: 'stock:price'
{
  "symbol": "005930",
  "time": "2026-03-27T06:30:01.000Z",
  "currentPrice": 72500,
  "changeRate": 2.34,
  "changeAmount": 1700,
  "changeDirection": "UP",     // "UP" | "DOWN" | "FLAT" | "CEILING" | "FLOOR"
  "open": 71500,
  "high": 73000,
  "low": 71200,
  "volume": 15432100,
  "tradeValue": 1123456789000,
  "executionVolume": 500,       // volume of this specific trade
  "weightedAvgPrice": 72150,
  "askPrice1": 72600,
  "bidPrice1": 72500
}
```

**Field mapping from KIS WebSocket** (Step 1, §2.6):
- `currentPrice` = field index 2 (`stck_prpr`)
- `changeDirection` = field index 3 (`prdy_vrss_sign`): 1=UP, 2=DOWN, 3=FLAT, 4=CEILING, 5=FLOOR
- `changeAmount` = field index 4 (`prdy_vrss`)
- `changeRate` = field index 5 (`prdy_ctrt`)
- `open` = field index 7 (`stck_oprc`)
- `high` = field index 8 (`stck_hgpr`)
- `low` = field index 9 (`stck_lwpr`)
- `askPrice1` = field index 10 (`askp1`)
- `bidPrice1` = field index 11 (`bidp1`)
- `executionVolume` = field index 12 (`cntg_vol`)
- `volume` = field index 13 (`acml_vol`)
- `tradeValue` = field index 14 (`acml_tr_pbmn`)

### 6.4 Event: `stock:surge` — Surge Detection Alert

Emitted when a stock's change rate exceeds the system's surge detection threshold or the user's personal threshold. This event triggers the AI analysis pipeline.

```typescript
// Event: 'stock:surge'
{
  "symbol": "005930",
  "name": "삼성전자",
  "time": "2026-03-27T10:15:30.000Z",
  "currentPrice": 74500,
  "changeRate": 5.23,
  "changeAmount": 3700,
  "previousClose": 70800,
  "volume": 28500000,
  "volumeRatio": 3.2,          // current volume / 20-day avg volume
  "surgeType": "PRICE_UP",     // "PRICE_UP" | "PRICE_DOWN" | "VOLUME_SPIKE"
  "thresholdPct": 5.0,
  "aiAnalysis": {
    "jobId": "analysis_005930_1711526130",
    "status": "PROCESSING",
    "estimatedCompletionSec": 15
  }
}
```

### 6.5 Event: `alert:triggered` — User Alert Triggered

Emitted when a user-defined alert condition is met.

```typescript
// Event: 'alert:triggered'
{
  "alertId": 42,
  "stock": {
    "symbol": "005930",
    "name": "삼성전자"
  },
  "conditionType": "CHANGE_RATE",
  "threshold": 5.0,
  "currentValue": 5.23,
  "triggeredAt": "2026-03-27T10:15:30.000Z",
  "message": "삼성전자 (005930) 등락률이 5.0% 임계값을 초과했습니다 (현재: +5.23%)"
}
```

### 6.6 Event: `ai:analysis:complete` — AI Analysis Result Ready

Emitted when a queued AI analysis completes processing.

```typescript
// Event: 'ai:analysis:complete'
{
  "jobId": "analysis_005930_1711526130",
  "analysisId": 101,
  "symbol": "005930",
  "status": "COMPLETED",       // "COMPLETED" | "FAILED"
  "confidenceScore": 0.847,
  "summary": "삼성전자 주가 급등은 HBM4 양산 소식과 NVIDIA 공급 계약에 기인합니다.",
  "qualityGate": {
    "l1Pass": true,
    "l2Pass": true,
    "l3Pass": true
  },
  "createdAt": "2026-03-27T10:16:00.000Z"
}
```

### 6.7 Event: `market:status` — Market Session Status

Emitted at market open, close, and during pre/post-market sessions.

```typescript
// Event: 'market:status'
{
  "status": "OPEN",             // "PRE_MARKET" | "OPEN" | "POST_MARKET" | "CLOSED"
  "market": "KRX",
  "openAt": "2026-03-27T00:00:00.000Z",     // 09:00 KST
  "closeAt": "2026-03-27T06:30:00.000Z",    // 15:30 KST
  "serverTime": "2026-03-27T02:15:00.000Z"
}
```

---

## 7. DTO Definitions (TypeScript)

### 7.1 Common Types

```typescript
// ─── Pagination ───────────────────────────────────────────────
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface SingleResponse<T> {
  data: T;
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}

// ─── Enums ────────────────────────────────────────────────────
export type Role = 'ADMIN' | 'USER';
export type Market = 'KOSPI' | 'KOSDAQ';
export type AlertConditionType = 'PRICE_ABOVE' | 'PRICE_BELOW' | 'CHANGE_RATE' | 'VOLUME_SURGE';
export type AnalysisType = 'SURGE' | 'DAILY_SUMMARY' | 'THEME_REPORT';
export type ChangeDirection = 'UP' | 'DOWN' | 'FLAT' | 'CEILING' | 'FLOOR';
export type SurgeType = 'PRICE_UP' | 'PRICE_DOWN' | 'VOLUME_SPIKE';
export type MarketStatus = 'PRE_MARKET' | 'OPEN' | 'POST_MARKET' | 'CLOSED';
export type SortBy = 'tradeValue' | 'changeRate' | 'volume' | 'name' | 'symbol';
export type SortOrder = 'asc' | 'desc';
export type PriceInterval = '1m' | '5m' | '15m' | '1h' | '1d' | '1w' | '1M';
```

### 7.2 Auth DTOs

```typescript
// ─── Requests ─────────────────────────────────────────────────
export interface SignupRequestDto {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

// ─── Responses ────────────────────────────────────────────────
export interface AuthUserDto {
  id: number;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface AuthResponseDto {
  data: AuthUserDto;
  token: string;
  expiresAt?: string;
}

export interface UserProfileDto {
  id: number;
  email: string;
  name: string;
  role: Role;
  surgeThresholdPct: number;
  settings: UserSettingsDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettingsDto {
  theme?: 'light' | 'dark';
  defaultMarket?: Market;
  notifications?: {
    enabled: boolean;
    sound?: boolean;
  };
}
```

### 7.3 Stock DTOs

```typescript
// ─── Requests ─────────────────────────────────────────────────
export interface StockListQueryDto {
  market?: Market;
  sector?: string;
  search?: string;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
  themeId?: number;
  watchlistId?: number;
}

export interface StockPricesQueryDto {
  interval?: PriceInterval;
  from?: string;   // ISO 8601
  to?: string;     // ISO 8601
  limit?: number;
}

// ─── Responses ────────────────────────────────────────────────
export interface StockListItemDto {
  id: number;
  symbol: string;
  name: string;
  market: Market;
  sector: string | null;
  currentPrice: number;
  changeRate: number;
  changeAmount: number;
  volume: number;
  tradeValue: number;
  high: number;
  low: number;
  open: number;
  updatedAt: string;
}

export interface TechnicalIndicatorsDto {
  sma5: number | null;
  sma20: number | null;
  sma60: number | null;
  sma120: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
}

export interface StockDetailDto extends StockListItemDto {
  isActive: boolean;
  listedAt: string | null;
  previousClose: number;
  themes: Array<{ id: number; name: string }>;
  technicalIndicators: TechnicalIndicatorsDto;
}

export interface CandleDto {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeValue: number;
  changeRate: number | null;
}

export interface StockPricesResponseDto {
  data: {
    symbol: string;
    interval: PriceInterval;
    candles: CandleDto[];
  };
  meta: {
    count: number;
    from: string;
    to: string;
  };
}
```

### 7.4 News DTOs

```typescript
export interface StockNewsItemDto {
  id: number;
  title: string;
  url: string;
  source: string;
  summary: string | null;
  publishedAt: string;
  relevanceScore: number;
}
```

### 7.5 AI Analysis DTOs

```typescript
// ─── Requests ─────────────────────────────────────────────────
export interface TriggerAnalysisRequestDto {
  analysisType?: AnalysisType;
  context?: string;
}

export interface AnalysisListQueryDto {
  type?: AnalysisType;
  page?: number;
  limit?: number;
  minConfidence?: number;
}

// ─── Responses ────────────────────────────────────────────────
export interface AnalysisJobDto {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  estimatedCompletionSec: number;
  message: string;
}

export interface AnalysisFactorDto {
  type: 'NEWS' | 'SECTOR' | 'TECHNICAL' | 'DISCLOSURE' | 'FOREIGN_INVESTOR';
  description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  source?: string;
  url?: string;
}

export interface AnalysisResultDto {
  summary: string;
  factors: AnalysisFactorDto[];
  outlook: string;
  relatedStocks: string[];
}

export interface AnalysisSourceDto {
  type: 'news' | 'price_data' | 'disclosure' | 'technical';
  title?: string;
  description?: string;
  url?: string;
}

export interface QualityGateDto {
  l1Pass: boolean;
  l2Pass: boolean;
  l3Pass: boolean;
}

export interface AiAnalysisDto {
  id: number;
  stockId: number;
  symbol: string;
  analysisType: AnalysisType;
  result: AnalysisResultDto;
  confidenceScore: number;
  qualityGate: QualityGateDto;
  sources: AnalysisSourceDto[];
  createdAt: string;
}
```

### 7.6 Watchlist DTOs

```typescript
// ─── Requests ─────────────────────────────────────────────────
export interface CreateWatchlistDto {
  name: string;
}

export interface UpdateWatchlistDto {
  name: string;
}

export interface AddWatchlistItemDto {
  stockId: number;
}

// ─── Responses ────────────────────────────────────────────────
export interface WatchlistDto {
  id: number;
  name: string;
  itemCount: number;
  createdAt: string;
}

export interface WatchlistItemDto {
  id: number;
  stockId: number;
  symbol: string;
  name: string;
  market: Market;
  currentPrice: number;
  changeRate: number;
  volume: number;
  tradeValue: number;
  addedAt: string;
}
```

### 7.7 Alert DTOs

```typescript
// ─── Requests ─────────────────────────────────────────────────
export interface CreateAlertDto {
  stockId: number;
  conditionType: AlertConditionType;
  threshold: number;
}

export interface UpdateAlertDto {
  threshold?: number;
  isActive?: boolean;
}

// ─── Responses ────────────────────────────────────────────────
export interface AlertDto {
  id: number;
  stock: {
    id: number;
    symbol: string;
    name: string;
  };
  conditionType: AlertConditionType;
  threshold: number;
  isActive: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface AlertListQueryDto {
  isActive?: boolean;
  stockId?: number;
}
```

### 7.8 Theme DTOs

```typescript
export interface ThemeDto {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  stockCount: number;
  avgChangeRate: number | null;
  createdAt: string;
}

export interface CreateThemeDto {
  name: string;
  description?: string;
  stockIds: number[];
}

export interface UpdateThemeDto {
  name?: string;
  description?: string;
  stockIds?: number[];
}
```

### 7.9 WebSocket Event DTOs

```typescript
// ─── Price Update ─────────────────────────────────────────────
export interface StockPriceEventDto {
  symbol: string;
  time: string;
  currentPrice: number;
  changeRate: number;
  changeAmount: number;
  changeDirection: ChangeDirection;
  open: number;
  high: number;
  low: number;
  volume: number;
  tradeValue: number;
  executionVolume: number;
  weightedAvgPrice: number;
  askPrice1: number;
  bidPrice1: number;
}

// ─── Surge Detection ──────────────────────────────────────────
export interface StockSurgeEventDto {
  symbol: string;
  name: string;
  time: string;
  currentPrice: number;
  changeRate: number;
  changeAmount: number;
  previousClose: number;
  volume: number;
  volumeRatio: number;
  surgeType: SurgeType;
  thresholdPct: number;
  aiAnalysis: {
    jobId: string;
    status: 'QUEUED' | 'PROCESSING';
    estimatedCompletionSec: number;
  };
}

// ─── Alert Triggered ──────────────────────────────────────────
export interface AlertTriggeredEventDto {
  alertId: number;
  stock: {
    symbol: string;
    name: string;
  };
  conditionType: AlertConditionType;
  threshold: number;
  currentValue: number;
  triggeredAt: string;
  message: string;
}

// ─── AI Analysis Complete ─────────────────────────────────────
export interface AiAnalysisCompleteEventDto {
  jobId: string;
  analysisId: number;
  symbol: string;
  status: 'COMPLETED' | 'FAILED';
  confidenceScore: number | null;
  summary: string | null;
  qualityGate: QualityGateDto | null;
  createdAt: string;
}

// ─── Market Status ────────────────────────────────────────────
export interface MarketStatusEventDto {
  status: MarketStatus;
  market: 'KRX';
  openAt: string;
  closeAt: string;
  serverTime: string;
}

// ─── Subscription Management ──────────────────────────────────
export interface SubscribeRequestDto {
  symbols: string[];
}

export interface SubscriptionConfirmDto {
  symbols: string[];
  totalSubscriptions: number;
  maxSubscriptions: number;   // 41 per KIS WebSocket limit (Step 1, §2.9)
}
```

### 7.10 Admin DTOs

```typescript
export interface SystemStatusDto {
  system: {
    uptime: number;
    version: string;
    nodeVersion: string;
    memoryUsageMb: number;
    cpuUsagePct: number;
  };
  database: {
    connected: boolean;
    totalStocks: number;
    totalPriceRows: number;
    oldestPriceData: string;
    compressionRatio: number;
    diskUsageGb: number;
  };
  dataCollection: {
    kisWebsocket: {
      connected: boolean;
      subscribedStocks: number;
      lastMessageAt: string;
      messagesPerSec: number;
    };
    newsIngestion: {
      lastNaverApiCall: string;
      naverApiCallsToday: number;
      naverApiDailyLimit: number;
      rssFeedsActive: number;
      totalNewsToday: number;
    };
    aiAnalysis: {
      analysesToday: number;
      avgConfidenceScore: number;
      avgProcessingTimeSec: number;
      queueDepth: number;
    };
  };
  redis: {
    connected: boolean;
    memoryUsageMb: number;
    keysCount: number;
  };
}

export interface SystemSettingsDto {
  kisApi: {
    environment: 'production' | 'simulation';
    tokenExpiresAt: string;
    websocketSubscriptions: number;
  };
  dataCollection: {
    priceUpdateIntervalMs: number;
    newsQueryIntervalMin: number;
    rssRefreshIntervalMin: number;
  };
  aiAnalysis: {
    provider: string;
    model: string;
    maxConcurrentAnalyses: number;
    dailyAnalysisLimit: number;
  };
  retention: {
    rawPriceDays: number;
    compressionAfterDays: number;
    newsRetentionDays: number;
  };
}

export interface AdminUserDto {
  id: number;
  email: string;
  name: string;
  role: Role;
  watchlistCount: number;
  alertCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}
```

---

## 8. Migration Strategy

### 8.1 Migration Order

Prisma migrations run sequentially. The recommended order ensures referential integrity at each step:

1. **Migration 001**: Create enums (`role`, `market`, `alert_condition_type`, `analysis_type`)
2. **Migration 002**: Create `users` table
3. **Migration 003**: Create `stocks` table
4. **Migration 004**: Create `stock_prices` table (Prisma-managed base table)
5. **Migration 005** (custom SQL): Convert `stock_prices` to hypertable, add compression/retention policies, create continuous aggregate, create technical indicator views, add sort indexes and BRIN index
6. **Migration 006**: Create `watchlists` and `watchlist_items`
7. **Migration 007**: Create `themes` and `theme_stocks`
8. **Migration 008**: Create `news` and `news_stocks`, add `search_vector` column and GIN index
9. **Migration 009**: Create `ai_analyses`
10. **Migration 010**: Create `alerts`

### 8.2 Custom Migration Template

The custom SQL migration (step 5) should be placed in `prisma/migrations/<timestamp>_timescaledb_setup/migration.sql`:

```sql
-- TimescaleDB extension (must be enabled by superuser)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert stock_prices to hypertable
SELECT create_hypertable('stock_prices', by_range('time', INTERVAL '1 day'));

-- Compression policy
ALTER TABLE stock_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'stock_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('stock_prices', INTERVAL '7 days');

-- Retention policy
SELECT add_retention_policy('stock_prices', INTERVAL '365 days');

-- Continuous aggregate: daily_ohlcv
-- [full DDL from §3.2]

-- Sort indexes
CREATE INDEX idx_stock_prices_trade_value ON stock_prices (time DESC, trade_value DESC);
CREATE INDEX idx_stock_prices_change_rate ON stock_prices (time DESC, change_rate DESC);
CREATE INDEX idx_stock_prices_volume ON stock_prices (time DESC, volume DESC);

-- BRIN index
CREATE INDEX idx_stock_prices_time_brin ON stock_prices USING BRIN (time) WITH (pages_per_range = 32);
```

### 8.3 Seed Data

Initial seed data includes:
- 1 admin user (password set via environment variable)
- ~2,500 stocks from KRX master data (fetched via KIS API on first run)
- 15-20 system themes (반도체, 2차전지, AI, 바이오, 자동차, 금융, 건설, 에너지, 화학, 방산, 엔터, 게임, IT, 조선, 통신, etc.)

---

## 9. Cross-Cutting Concerns

### 9.1 Decimal Handling

All monetary values (prices, trade values) use `Decimal` in Prisma / `DECIMAL(12,2)` in PostgreSQL. At the API/DTO layer, these are serialized as `number` in JSON. The NestJS serialization pipeline must handle `Prisma.Decimal` to `number` conversion via a global transform interceptor:

```typescript
// In a global response interceptor
if (value instanceof Prisma.Decimal) {
  return value.toNumber();
}
```

### 9.2 Timezone Handling

All timestamps in the database are stored as `TIMESTAMPTZ` (UTC). The API returns ISO 8601 strings in UTC. The frontend converts to KST (Asia/Seoul, UTC+9) for display. The KIS API returns times in KST (HHMMSS format without timezone), so the backend must explicitly attach the `+09:00` offset during ingestion.

### 9.3 Rate Limiting

| Endpoint Group | Rate Limit | Window |
|---------------|-----------|--------|
| Auth (signup/login) | 5 requests | 1 minute per IP |
| AI analysis | 5 requests | 1 minute per user |
| Stock list/detail | 60 requests | 1 minute per user |
| Watchlist/Alert CRUD | 30 requests | 1 minute per user |
| Admin endpoints | 30 requests | 1 minute per user |
| WebSocket subscriptions | 10 changes | 1 minute per connection |

### 9.4 Pagination Defaults and Limits

| Endpoint | Default Limit | Max Limit |
|----------|--------------|-----------|
| Stock list | 50 | 100 |
| Price candles | 200 | 1000 |
| News list | 20 | 50 |
| AI analyses | 10 | 50 |
| Watchlist items | 100 | 200 |
| Admin users | 50 | 100 |

### 9.5 Authentication Flow

The system uses Better Auth 1.x (PRD §4.6) for authentication. Better Auth provides:
- Email + password authentication
- JWT tokens with configurable expiration (default: 24 hours)
- Session management with automatic refresh
- Built-in CSRF protection via `SameSite=Strict` cookies

The API supports both cookie-based (for SSR/browser) and `Authorization: Bearer` header (for API clients) authentication methods.

### 9.6 Soft Constraints from KIS WebSocket

Per Step 1, §2.9, the KIS WebSocket allows a maximum of **41 real-time subscriptions** per session. This constraint propagates through the system:

- The WebSocket gateway enforces a per-connection subscription limit
- The `SubscriptionConfirmDto` reports `maxSubscriptions: 41` so the frontend can display remaining capacity
- When a user subscribes to more than 41 stocks across all their watchlists, the system prioritizes by most-recently-added and rotates subscriptions during idle detection
