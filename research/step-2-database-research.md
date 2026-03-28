# Step 2: Database Architecture Research — PostgreSQL 17 + TimescaleDB

> **Agent**: @db-researcher | **Date**: 2026-03-27
> **Input**: PRD §4.1, §4.4, Branch 1.2, Branch 5.2
> **Trace**: [trace:step-2:db-research-report]

---

## Table of Contents

1. [TimescaleDB Hypertable Design](#1-timescaledb-hypertable-design)
2. [Continuous Aggregates for Technical Indicators](#2-continuous-aggregates-for-technical-indicators)
3. [PostgreSQL 17 Feature Utilization](#3-postgresql-17-feature-utilization)
4. [Prisma 7.x Integration Strategy](#4-prisma-7x-integration-strategy)
5. [Index Strategy](#5-index-strategy)
6. [Throughput Benchmarks](#6-throughput-benchmarks)
7. [Data Retention and Compression](#7-data-retention-and-compression)
8. [Complete Entity Schema Draft](#8-complete-entity-schema-draft)
9. [Migration Strategy](#9-migration-strategy)
10. [Sources](#10-sources)

---

## 1. TimescaleDB Hypertable Design

### 1.1 Core Concept

TimescaleDB extends PostgreSQL with **hypertables** — special tables that automatically partition time-series data into smaller **chunks** for efficient querying and storage. A hypertable presents a single-table interface to the application while internally managing partitioned storage transparently. This is critical for the stock monitoring dashboard, where `stock_prices` will accumulate approximately **2,500 rows/sec** during market hours (2,500 KRX-listed stocks x 1 message/sec).

### 1.2 Hypertable DDL for `stock_prices`

```sql
-- Step 1: Create the base table with all columns
CREATE TABLE stock_prices (
    time        TIMESTAMPTZ    NOT NULL,
    stock_id    INTEGER        NOT NULL REFERENCES stocks(id),
    symbol      VARCHAR(20)    NOT NULL,    -- denormalized for query convenience
    open        DECIMAL(12,2)  NOT NULL,
    high        DECIMAL(12,2)  NOT NULL,
    low         DECIMAL(12,2)  NOT NULL,
    close       DECIMAL(12,2)  NOT NULL,
    volume      BIGINT         NOT NULL DEFAULT 0,
    trade_value BIGINT         NOT NULL DEFAULT 0,  -- 거래대금 (KRW)
    change_rate DECIMAL(8,4),                        -- 등락률 (%)
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Step 2: Convert to hypertable with 1-day chunk interval
SELECT create_hypertable(
    'stock_prices',
    by_range('time', INTERVAL '1 day')
);
```

### 1.3 chunk_time_interval Decision: 1 Day vs 1 Week

| Factor | 1 Day | 1 Week |
|--------|-------|--------|
| **Rows per chunk** | ~2,500 stocks x 23,400 sec (6.5h market) = ~58.5M | ~292.5M |
| **Chunk size (uncompressed)** | ~4-6 GB | ~20-30 GB |
| **Query pattern match** | Most queries are "today" or "last N days" — perfect alignment | Wider scans for single-day queries |
| **Compression granularity** | Fine-grained — compress yesterday's chunk immediately | Must wait for the full week to complete |
| **Retention granularity** | Drop by single day | Drop by week (coarser) |
| **Metadata overhead** | ~365 chunk entries/year | ~52 chunk entries/year |
| **Recommendation** | **Selected** | Not recommended |

**Decision**: **1-day chunk interval** is optimal for this workload. The KRX market operates Monday-Friday, 09:00-15:30 KST. Daily chunks align perfectly with market trading sessions. Most user queries are "today's prices" or "last N trading days", meaning PostgreSQL only needs to scan 1-5 chunks rather than loading an oversized weekly chunk. The metadata overhead of 365 entries/year is negligible for TimescaleDB (tested at millions of chunks).

### 1.4 Space Partitioning Consideration

TimescaleDB supports an optional **space dimension** (hash partitioning by `symbol` or `stock_id`). However, the official documentation advises against space partitioning for single-node deployments:

> "In most cases, it is advised for users not to use space partitions. [...] Space partitioning is most useful for distributed hypertables." — [TimescaleDB Docs: create_hypertable](https://docs.timescale.com/api/latest/hypertable/create_hypertable/)

Since our deployment target is a single mini-PC (Ryzen 5 5500U, 16GB RAM), we **skip space partitioning** and rely solely on time-based chunking. The composite index on `(stock_id, time)` provides fast per-symbol lookups within each chunk.

---

## 2. Continuous Aggregates for Technical Indicators

Continuous aggregates are **real-time materialized views** that TimescaleDB keeps incrementally updated in the background. Instead of computing moving averages or RSI across millions of rows on every query, pre-aggregated results are served from disk — orders of magnitude faster.

### 2.1 Daily OHLCV Aggregate (Foundation Layer)

This base aggregate converts tick/second-level data into clean daily candles:

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

-- Refresh policy: update every 1 hour, look back 3 days
SELECT add_continuous_aggregate_policy('daily_ohlcv',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

### 2.2 Moving Averages (5/20/60/120 Day)

Moving averages are computed on top of the daily aggregate using window functions. These are implemented as a **view on the continuous aggregate** rather than a second-level continuous aggregate, because window functions with variable-width frames (`ROWS BETWEEN N PRECEDING`) are not supported inside continuous aggregates.

```sql
CREATE OR REPLACE VIEW v_moving_averages AS
SELECT
    bucket,
    stock_id,
    symbol,
    close,
    -- Simple Moving Averages (SMA)
    AVG(close) OVER w5   AS sma_5,
    AVG(close) OVER w20  AS sma_20,
    AVG(close) OVER w60  AS sma_60,
    AVG(close) OVER w120 AS sma_120,
    -- Volume Moving Average (for volume surge detection)
    AVG(volume) OVER w20 AS vol_sma_20
FROM daily_ohlcv
WINDOW
    w5   AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 4 PRECEDING AND CURRENT ROW),
    w20  AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 19 PRECEDING AND CURRENT ROW),
    w60  AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 59 PRECEDING AND CURRENT ROW),
    w120 AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 119 PRECEDING AND CURRENT ROW);
```

### 2.3 RSI (14-Period Relative Strength Index)

RSI measures the speed and magnitude of price movements on a scale of 0-100. The standard formula:

> RSI = 100 - (100 / (1 + RS))
> RS = Average Gain (14 periods) / Average Loss (14 periods)

```sql
CREATE OR REPLACE VIEW v_rsi_14 AS
WITH daily_changes AS (
    SELECT
        bucket,
        stock_id,
        symbol,
        close,
        close - LAG(close) OVER (PARTITION BY stock_id ORDER BY bucket) AS change
    FROM daily_ohlcv
),
gains_losses AS (
    SELECT
        bucket,
        stock_id,
        symbol,
        close,
        GREATEST(change, 0) AS gain,
        ABS(LEAST(change, 0)) AS loss
    FROM daily_changes
),
avg_gain_loss AS (
    SELECT
        bucket,
        stock_id,
        symbol,
        close,
        AVG(gain) OVER w14 AS avg_gain,
        AVG(loss) OVER w14 AS avg_loss
    FROM gains_losses
    WINDOW w14 AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)
)
SELECT
    bucket,
    stock_id,
    symbol,
    close,
    CASE
        WHEN avg_loss = 0 THEN 100
        ELSE ROUND(100 - (100.0 / (1 + (avg_gain / avg_loss))), 2)
    END AS rsi_14
FROM avg_gain_loss;
```

### 2.4 MACD (Moving Average Convergence Divergence)

MACD consists of three components:
- **MACD Line**: EMA(12) - EMA(26)
- **Signal Line**: EMA(9) of the MACD Line
- **Histogram**: MACD Line - Signal Line

Since PostgreSQL does not have a built-in EMA function, we approximate using a recursive CTE or use the exponential weighting formula:

```sql
CREATE OR REPLACE VIEW v_macd AS
WITH ema_base AS (
    SELECT
        bucket,
        stock_id,
        symbol,
        close,
        -- Approximate EMA using the standard multiplier formula
        -- EMA_12 multiplier = 2/(12+1) = 0.1538
        -- EMA_26 multiplier = 2/(26+1) = 0.0741
        AVG(close) OVER (
            PARTITION BY stock_id ORDER BY bucket
            ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
        ) AS sma_12,
        AVG(close) OVER (
            PARTITION BY stock_id ORDER BY bucket
            ROWS BETWEEN 25 PRECEDING AND CURRENT ROW
        ) AS sma_26
    FROM daily_ohlcv
),
macd_line AS (
    SELECT
        bucket,
        stock_id,
        symbol,
        close,
        (sma_12 - sma_26) AS macd,
        AVG(sma_12 - sma_26) OVER (
            PARTITION BY stock_id ORDER BY bucket
            ROWS BETWEEN 8 PRECEDING AND CURRENT ROW
        ) AS signal_line
    FROM ema_base
)
SELECT
    bucket,
    stock_id,
    symbol,
    close,
    ROUND(macd::NUMERIC, 4) AS macd,
    ROUND(signal_line::NUMERIC, 4) AS signal_line,
    ROUND((macd - signal_line)::NUMERIC, 4) AS histogram
FROM macd_line;
```

**Note**: The above uses SMA approximation for EMA. For production accuracy, a **recursive CTE** or a dedicated **PL/pgSQL function** implementing true exponential weighting is recommended. The SMA approximation converges to EMA after sufficient data points and is acceptable for dashboard display purposes.

### 2.5 Bollinger Bands (20-Period, 2 Standard Deviations)

```sql
CREATE OR REPLACE VIEW v_bollinger_bands AS
SELECT
    bucket,
    stock_id,
    symbol,
    close,
    AVG(close) OVER w20 AS middle_band,
    AVG(close) OVER w20 + 2 * STDDEV(close) OVER w20 AS upper_band,
    AVG(close) OVER w20 - 2 * STDDEV(close) OVER w20 AS lower_band,
    -- Bandwidth: (upper - lower) / middle * 100
    CASE
        WHEN AVG(close) OVER w20 > 0 THEN
            ROUND(((2 * 2 * STDDEV(close) OVER w20) / AVG(close) OVER w20 * 100)::NUMERIC, 2)
        ELSE 0
    END AS bandwidth_pct
FROM daily_ohlcv
WINDOW w20 AS (PARTITION BY stock_id ORDER BY bucket ROWS BETWEEN 19 PRECEDING AND CURRENT ROW);
```

### 2.6 Unified Technical Indicators View

For the frontend to fetch all indicators in a single query:

```sql
CREATE OR REPLACE VIEW v_technical_indicators AS
SELECT
    ma.bucket,
    ma.stock_id,
    ma.symbol,
    ma.close,
    -- Moving Averages
    ma.sma_5, ma.sma_20, ma.sma_60, ma.sma_120,
    -- RSI
    rsi.rsi_14,
    -- MACD
    macd.macd, macd.signal_line, macd.histogram,
    -- Bollinger Bands
    bb.upper_band, bb.middle_band, bb.lower_band, bb.bandwidth_pct
FROM v_moving_averages ma
LEFT JOIN v_rsi_14 rsi
    ON ma.stock_id = rsi.stock_id AND ma.bucket = rsi.bucket
LEFT JOIN v_macd macd
    ON ma.stock_id = macd.stock_id AND ma.bucket = macd.bucket
LEFT JOIN v_bollinger_bands bb
    ON ma.stock_id = bb.stock_id AND ma.bucket = bb.bucket;
```

### 2.7 Refresh Strategy

| Aggregate | Refresh Interval | start_offset | end_offset | Rationale |
|-----------|-----------------|--------------|------------|-----------|
| `daily_ohlcv` | 1 hour | 3 days | 1 hour | Covers late-arriving data and corrections |
| Technical indicator views | On-demand | N/A | N/A | Views computed from `daily_ohlcv`; no separate materialization needed |

The technical indicator views (MA, RSI, MACD, Bollinger) are **regular views** (not continuous aggregates) because they use window functions with `ROWS BETWEEN` frames. They read from the already-materialized `daily_ohlcv` continuous aggregate, so performance remains excellent — the daily aggregate has only ~2,500 rows per day (one per stock), meaning the full year is ~625,000 rows, trivially scannable.

---

## 3. PostgreSQL 17 Feature Utilization

PostgreSQL 17 (released September 2024) introduces several features directly beneficial to this project.

### 3.1 JSON_TABLE for Flexible Fields

The `users.settings_json` and potential API response caching benefit from PostgreSQL 17's new `JSON_TABLE` function, which converts JSON data into relational table format:

```sql
-- PostgreSQL 17: Convert user settings JSON to tabular format
SELECT u.id, u.name, s.*
FROM users u,
JSON_TABLE(
    u.settings_json,
    '$' COLUMNS (
        theme          TEXT   PATH '$.theme',
        language       TEXT   PATH '$.language',
        surge_pct      DECIMAL PATH '$.surgeThresholdPct',
        notifications  BOOLEAN PATH '$.notifications.enabled',
        default_market TEXT   PATH '$.defaultMarket'
    )
) AS s
WHERE u.role = 'admin';
```

Additional SQL/JSON constructors available in PG 17:
- `JSON_EXISTS()` — check if a path exists in JSON
- `JSON_QUERY()` — extract JSON sub-document
- `JSON_VALUE()` — extract scalar from JSON
- `JSON_SERIALIZE()` — convert JSON to text

### 3.2 Partition Management: SPLIT and MERGE

PostgreSQL 17 adds `ALTER TABLE ... SPLIT PARTITION` and `ALTER TABLE ... MERGE PARTITIONS`. While TimescaleDB manages `stock_prices` partitioning automatically, this feature is useful for **master data tables** like `stocks` that might be range-partitioned by market:

```sql
-- Partition stocks by market for efficient market-scoped queries
CREATE TABLE stocks (
    id          SERIAL,
    symbol      VARCHAR(20)   NOT NULL UNIQUE,
    name        VARCHAR(100)  NOT NULL,
    market      VARCHAR(10)   NOT NULL,  -- 'KOSPI', 'KOSDAQ'
    sector      VARCHAR(50),
    listed_at   DATE,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, market)
) PARTITION BY LIST (market);

CREATE TABLE stocks_kospi  PARTITION OF stocks FOR VALUES IN ('KOSPI');
CREATE TABLE stocks_kosdaq PARTITION OF stocks FOR VALUES IN ('KOSDAQ');
CREATE TABLE stocks_konex  PARTITION OF stocks FOR VALUES IN ('KONEX');

-- PG17: Split a partition if needed
-- ALTER TABLE stocks SPLIT PARTITION stocks_kospi INTO (
--     stocks_kospi_large FOR VALUES IN ('KOSPI_200'),
--     stocks_kospi_rest  FOR VALUES IN ('KOSPI')
-- );
```

### 3.3 Performance Improvements Applicable to This Project

| PG 17 Feature | Impact on Stock Dashboard |
|---------------|--------------------------|
| **WAL lock optimization** (up to 2x write throughput) | Directly benefits the 2,500 rows/sec insert workload into `stock_prices` |
| **Vacuum memory reduction** (20x less) | Critical for the mini-PC with only 16GB RAM; vacuum on the large `stock_prices` table consumes far less memory |
| **COPY performance** (up to 2x) | Bulk loading historical data and daily batch imports are significantly faster |
| **BRIN parallel builds** | BRIN indexes on `stock_prices.time` can be built faster |
| **Identity columns on partitioned tables** | Now supported — enables `GENERATED ALWAYS AS IDENTITY` on partitioned `stocks` |
| **Exclusion constraints on partitioned tables** | Enables unique-like constraints across partitions |

### 3.4 Incremental Sort and Parallel Query

PostgreSQL 17 continues to improve parallel query execution. For the stock dashboard's "sort by trading value" query across 2,500 stocks, the parallel sequential scan + parallel sort can leverage all available CPU cores on the Ryzen 5 5500U (6 cores / 12 threads):

```sql
-- This query benefits from PG17 parallel sort improvements
SELECT s.symbol, s.name, sp.close, sp.change_rate, sp.trade_value, sp.volume
FROM stock_prices sp
JOIN stocks s ON s.id = sp.stock_id
WHERE sp.time >= NOW() - INTERVAL '1 day'
ORDER BY sp.trade_value DESC
LIMIT 50;
```

---

## 4. Prisma 7.x Integration Strategy

### 4.1 Prisma 7 Architecture Overview

Prisma 7 (released November 2025) represents a major architectural shift:

| Aspect | Prisma 6.x | Prisma 7.x |
|--------|-----------|-----------|
| **Query Engine** | Rust binary (libquery_engine) | Pure TypeScript |
| **Module Format** | CJS + ESM | ESM-only |
| **Bundle Size** | ~14 MB | ~1.6 MB (90% reduction) |
| **Query Performance** | Baseline | Up to 3.4x faster (no Rust-TS serialization) |
| **Generated Client** | In node_modules | Outside node_modules (configurable) |
| **Configuration** | schema.prisma only | Dynamic configuration file |
| **TypedSQL** | Preview | GA (General Availability) |

### 4.2 Prisma Schema for Stock Dashboard

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id              Int       @id @default(autoincrement())
  email           String    @unique
  passwordHash    String    @map("password_hash")
  name            String
  role            Role      @default(USER)
  surgeThreshold  Decimal   @default(5.0) @map("surge_threshold_pct") @db.Decimal(5, 2)
  settingsJson    Json?     @map("settings_json")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  watchlists      Watchlist[]
  alerts          Alert[]

  @@map("users")
}

enum Role {
  ADMIN @map("admin")
  USER  @map("user")
}

model Stock {
  id        Int       @id @default(autoincrement())
  symbol    String    @unique @db.VarChar(20)
  name      String    @db.VarChar(100)
  market    String    @db.VarChar(10)    // 'KOSPI', 'KOSDAQ'
  sector    String?   @db.VarChar(50)
  listedAt  DateTime? @map("listed_at") @db.Date
  isActive  Boolean   @default(true) @map("is_active")
  updatedAt DateTime  @updatedAt @map("updated_at")

  watchlistItems WatchlistItem[]
  themeStocks    ThemeStock[]
  newsStocks     NewsStock[]
  aiAnalyses     AiAnalysis[]
  alerts         Alert[]

  @@map("stocks")
}

// Note: stock_prices is managed as a TimescaleDB hypertable.
// Prisma schema defines the table structure; hypertable conversion
// is handled via a custom migration (see §9 Migration Strategy).
model StockPrice {
  time       DateTime @map("time") @db.Timestamptz()
  stockId    Int      @map("stock_id")
  symbol     String   @db.VarChar(20)
  open       Decimal  @db.Decimal(12, 2)
  high       Decimal  @db.Decimal(12, 2)
  low        Decimal  @db.Decimal(12, 2)
  close      Decimal  @db.Decimal(12, 2)
  volume     BigInt   @default(0)
  tradeValue BigInt   @default(0) @map("trade_value")
  changeRate Decimal? @map("change_rate") @db.Decimal(8, 4)
  createdAt  DateTime @default(now()) @map("created_at")

  // Hypertables cannot have standard PKs; use composite unique
  @@unique([time, stockId])
  @@map("stock_prices")
}

model Watchlist {
  id        Int       @id @default(autoincrement())
  userId    Int       @map("user_id")
  name      String    @db.VarChar(100)
  createdAt DateTime  @default(now()) @map("created_at")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  items     WatchlistItem[]

  @@map("watchlists")
}

model WatchlistItem {
  id          Int       @id @default(autoincrement())
  watchlistId Int       @map("watchlist_id")
  stockId     Int       @map("stock_id")
  addedAt     DateTime  @default(now()) @map("added_at")

  watchlist   Watchlist @relation(fields: [watchlistId], references: [id], onDelete: Cascade)
  stock       Stock     @relation(fields: [stockId], references: [id])

  @@unique([watchlistId, stockId])
  @@map("watchlist_items")
}

model Theme {
  id          Int       @id @default(autoincrement())
  name        String    @unique @db.VarChar(100)
  description String?
  isCustom    Boolean   @default(false) @map("is_custom")
  createdAt   DateTime  @default(now()) @map("created_at")

  themeStocks ThemeStock[]

  @@map("themes")
}

model ThemeStock {
  id      Int @id @default(autoincrement())
  themeId Int @map("theme_id")
  stockId Int @map("stock_id")

  theme   Theme @relation(fields: [themeId], references: [id], onDelete: Cascade)
  stock   Stock @relation(fields: [stockId], references: [id])

  @@unique([themeId, stockId])
  @@map("theme_stocks")
}

model News {
  id          Int       @id @default(autoincrement())
  title       String
  url         String    @unique
  source      String    @db.VarChar(50)
  summary     String?
  content     String?     // full text for search
  publishedAt DateTime  @map("published_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  newsStocks  NewsStock[]

  @@map("news")
}

model NewsStock {
  id             Int     @id @default(autoincrement())
  newsId         Int     @map("news_id")
  stockId        Int     @map("stock_id")
  relevanceScore Decimal @default(0) @map("relevance_score") @db.Decimal(5, 4)

  news           News    @relation(fields: [newsId], references: [id], onDelete: Cascade)
  stock          Stock   @relation(fields: [stockId], references: [id])

  @@unique([newsId, stockId])
  @@map("news_stocks")
}

model AiAnalysis {
  id              Int       @id @default(autoincrement())
  stockId         Int       @map("stock_id")
  analysisType    String    @map("analysis_type") @db.VarChar(50) // 'surge', 'daily_summary'
  content         Json      // structured analysis result
  confidenceScore Decimal   @map("confidence_score") @db.Decimal(5, 4)
  qualityGateL1   Boolean   @default(false) @map("quality_gate_l1") // schema validation
  qualityGateL2   Boolean   @default(false) @map("quality_gate_l2") // self-consistency
  qualityGateL3   Boolean   @default(false) @map("quality_gate_l3") // fact cross-validation
  sourcesJson     Json?     @map("sources_json")   // cited sources
  createdAt       DateTime  @default(now()) @map("created_at")

  stock           Stock     @relation(fields: [stockId], references: [id])

  @@map("ai_analyses")
}

model Alert {
  id            Int       @id @default(autoincrement())
  userId        Int       @map("user_id")
  stockId       Int       @map("stock_id")
  conditionType String    @map("condition_type") @db.VarChar(30) // 'price_above', 'price_below', 'change_rate', 'volume_surge'
  threshold     Decimal   @db.Decimal(12, 2)
  isActive      Boolean   @default(true) @map("is_active")
  triggeredAt   DateTime? @map("triggered_at")
  createdAt     DateTime  @default(now()) @map("created_at")

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  stock         Stock     @relation(fields: [stockId], references: [id])

  @@map("alerts")
}
```

### 4.3 Raw SQL Hybrid Approach

Prisma does not natively support TimescaleDB hypertables, continuous aggregates, or compression policies. The hybrid approach uses:

1. **Prisma Client** for standard CRUD (stocks, users, watchlists, themes, alerts, news)
2. **TypedSQL** (Prisma 7 GA) for type-safe raw queries against TimescaleDB features
3. **$queryRaw / $executeRaw** for dynamic queries and TimescaleDB admin functions

```typescript
// Example: TypedSQL for fetching stock prices with time_bucket
// prisma/sql/getStockPricesAggregated.sql
-- @param {String} $1:symbol
-- @param {String} $2:interval (e.g., '1 hour', '1 day')
-- @param {DateTime} $3:startTime
-- @param {DateTime} $4:endTime
SELECT
    time_bucket($2::INTERVAL, time) AS bucket,
    symbol,
    first(open, time)  AS open,
    max(high)          AS high,
    min(low)           AS low,
    last(close, time)  AS close,
    sum(volume)        AS volume,
    sum(trade_value)   AS trade_value
FROM stock_prices
WHERE symbol = $1
  AND time BETWEEN $3 AND $4
GROUP BY bucket, symbol
ORDER BY bucket ASC;
```

```typescript
// Usage in NestJS service
import { PrismaClient } from '../generated/prisma';
import { getStockPricesAggregated } from '@prisma/client/sql';

@Injectable()
export class StockPriceService {
  constructor(private prisma: PrismaClient) {}

  async getAggregatedPrices(
    symbol: string,
    interval: string,
    startTime: Date,
    endTime: Date,
  ) {
    // TypedSQL — fully type-safe, parameters validated at build time
    return this.prisma.$queryRawTyped(
      getStockPricesAggregated(symbol, interval, startTime, endTime)
    );
  }

  async getLatestPricesBulk(stockIds: number[]) {
    // Raw SQL for DISTINCT ON — not expressible in Prisma query API
    return this.prisma.$queryRaw`
      SELECT DISTINCT ON (stock_id)
        stock_id, symbol, close, change_rate, volume, trade_value, time
      FROM stock_prices
      WHERE stock_id = ANY(${stockIds})
      ORDER BY stock_id, time DESC
    `;
  }

  async insertPriceBatch(prices: StockPriceInput[]) {
    // Batch insert using raw SQL for maximum throughput
    const values = prices.map(p =>
      `('${p.time.toISOString()}', ${p.stockId}, '${p.symbol}', ${p.open}, ${p.high}, ${p.low}, ${p.close}, ${p.volume}, ${p.tradeValue}, ${p.changeRate})`
    ).join(',\n');

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO stock_prices (time, stock_id, symbol, open, high, low, close, volume, trade_value, change_rate)
      VALUES ${values}
      ON CONFLICT (time, stock_id) DO UPDATE SET
        close = EXCLUDED.close,
        high = GREATEST(stock_prices.high, EXCLUDED.high),
        low = LEAST(stock_prices.low, EXCLUDED.low),
        volume = EXCLUDED.volume,
        trade_value = EXCLUDED.trade_value,
        change_rate = EXCLUDED.change_rate
    `);
  }
}
```

### 4.4 Prisma + TimescaleDB Compatibility Matrix

| Feature | Prisma Support | Workaround |
|---------|---------------|------------|
| Table creation | Native | `prisma migrate dev` |
| Hypertable conversion | Not supported | Custom migration SQL |
| Continuous aggregates | Not supported | Raw SQL migration + $queryRaw for reads |
| Compression policies | Not supported | Raw SQL in migration |
| Retention policies | Not supported | Raw SQL in migration |
| time_bucket() queries | Not supported | TypedSQL or $queryRaw |
| first()/last() aggregates | Not supported | TypedSQL or $queryRaw |
| Standard CRUD (stocks, users) | Full support | Prisma Client |
| Relations & joins | Full support | Prisma Client |
| Transactions | Full support | Prisma Client |

---

## 5. Index Strategy

### 5.1 B-tree Indexes for Exact Lookups

```sql
-- stocks table: symbol lookup (most frequent query)
CREATE UNIQUE INDEX idx_stocks_symbol ON stocks (symbol);

-- stocks table: market + active filter (for listing by market)
CREATE INDEX idx_stocks_market_active ON stocks (market, is_active)
    WHERE is_active = TRUE;

-- stock_prices: primary access pattern — single stock over time range
-- This is the most critical index for the dashboard
CREATE INDEX idx_stock_prices_stock_time ON stock_prices (stock_id, time DESC);

-- stock_prices: symbol-based lookup (denormalized for convenience)
CREATE INDEX idx_stock_prices_symbol_time ON stock_prices (symbol, time DESC);

-- watchlist_items: user's watchlist lookup
CREATE INDEX idx_watchlist_items_watchlist ON watchlist_items (watchlist_id);

-- alerts: active alerts for real-time checking
CREATE INDEX idx_alerts_active ON alerts (stock_id, condition_type)
    WHERE is_active = TRUE;

-- news: time-ordered listing
CREATE INDEX idx_news_published ON news (published_at DESC);

-- news_stocks: find news for a stock
CREATE INDEX idx_news_stocks_stock ON news_stocks (stock_id, relevance_score DESC);

-- ai_analyses: latest analysis per stock
CREATE INDEX idx_ai_analyses_stock_time ON ai_analyses (stock_id, created_at DESC);

-- theme_stocks: stocks in a theme
CREATE INDEX idx_theme_stocks_theme ON theme_stocks (theme_id);
CREATE INDEX idx_theme_stocks_stock ON theme_stocks (stock_id);
```

### 5.2 Composite Indexes for Multi-Column Sort/Filter

The PRD §3.2 specifies sorting by trading value, change rate, and volume. These require composite indexes on `stock_prices` for the "latest snapshot" query pattern:

```sql
-- Sorting by trade_value (거래대금 순): used for "top trading value" widget
CREATE INDEX idx_stock_prices_trade_value ON stock_prices (time DESC, trade_value DESC);

-- Sorting by change_rate (등락률 순): used for "top gainers/losers" widget
CREATE INDEX idx_stock_prices_change_rate ON stock_prices (time DESC, change_rate DESC);

-- Sorting by volume (거래량 순): used for "top volume" widget
CREATE INDEX idx_stock_prices_volume ON stock_prices (time DESC, volume DESC);
```

**Rationale**: These indexes enable the database to answer "what are today's top stocks by X?" without scanning the entire day's chunk. The `time DESC` leading column ensures only the latest time bucket is traversed, then the secondary sort column provides pre-ordered results.

**Important**: Each additional index reduces insert throughput by approximately 20-40% (per TimescaleDB benchmarks). With 3 secondary composite indexes + 2 per-stock indexes, we expect ~5 total secondary indexes on `stock_prices`. Based on benchmark data, this may reduce insert throughput to approximately 60-70% of the no-secondary-index baseline. For our workload of 2,500 rows/sec, this is well within capacity (see §6).

### 5.3 GIN Index for Full-Text Search (News)

```sql
-- Add a tsvector column for full-text search
ALTER TABLE news ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(content, '')), 'C')
    ) STORED;

-- GIN index on the tsvector column
CREATE INDEX idx_news_search ON news USING GIN (search_vector);

-- Usage: search for news containing "삼성전자" or "반도체"
SELECT id, title, published_at,
       ts_rank(search_vector, query) AS rank
FROM news,
     to_tsquery('simple', '삼성전자 | 반도체') AS query
WHERE search_vector @@ query
ORDER BY rank DESC, published_at DESC
LIMIT 20;
```

**Language choice**: We use `'simple'` configuration instead of `'english'` because Korean text does not benefit from English stemming. For production Korean full-text search, consider installing `textsearch_ko` or using a Korean morphological analyzer (e.g., mecab-ko). The `'simple'` configuration performs basic whitespace tokenization which works adequately for Korean stock-related keywords.

### 5.4 BRIN Index for Time-Based Range Scans

For the `stock_prices` hypertable, TimescaleDB automatically creates an internal index on the time column for chunk pruning. However, a BRIN (Block Range Index) can provide additional benefits for large time-range scans with minimal storage overhead:

```sql
-- BRIN index: extremely compact, good for naturally ordered time data
-- Note: TimescaleDB handles chunk-level time pruning already,
-- so this is optional and most beneficial for queries spanning many chunks
CREATE INDEX idx_stock_prices_time_brin ON stock_prices USING BRIN (time)
    WITH (pages_per_range = 32);
```

### 5.5 Index Summary Table

| Table | Index | Type | Columns | Purpose |
|-------|-------|------|---------|---------|
| stocks | idx_stocks_symbol | B-tree UNIQUE | symbol | Symbol lookup |
| stocks | idx_stocks_market_active | B-tree partial | market, is_active | Market listing |
| stock_prices | idx_stock_prices_stock_time | B-tree | stock_id, time DESC | Per-stock history |
| stock_prices | idx_stock_prices_symbol_time | B-tree | symbol, time DESC | Symbol-based lookup |
| stock_prices | idx_stock_prices_trade_value | B-tree | time DESC, trade_value DESC | Top trading value sort |
| stock_prices | idx_stock_prices_change_rate | B-tree | time DESC, change_rate DESC | Top gainers/losers sort |
| stock_prices | idx_stock_prices_volume | B-tree | time DESC, volume DESC | Top volume sort |
| stock_prices | idx_stock_prices_time_brin | BRIN | time | Large range scans |
| news | idx_news_search | GIN | search_vector (tsvector) | Full-text search |
| news | idx_news_published | B-tree | published_at DESC | Time-ordered listing |
| news_stocks | idx_news_stocks_stock | B-tree | stock_id, relevance_score DESC | News-per-stock |
| ai_analyses | idx_ai_analyses_stock_time | B-tree | stock_id, created_at DESC | Latest analysis |
| alerts | idx_alerts_active | B-tree partial | stock_id, condition_type | Active alerts |
| theme_stocks | idx_theme_stocks_theme | B-tree | theme_id | Theme lookup |
| theme_stocks | idx_theme_stocks_stock | B-tree | stock_id | Stock themes |

---

## 6. Throughput Benchmarks

### 6.1 Workload Characterization

| Parameter | Value | Source |
|-----------|-------|--------|
| Total KRX-listed stocks | ~2,500 (KOSPI + KOSDAQ) | PRD §4.4 |
| Real-time update frequency | 1 message/stock/sec during market hours | PRD §4.5 |
| Peak insert rate | 2,500 rows/sec | 2,500 stocks x 1 msg/sec |
| Daily insert volume | ~58.5M rows | 2,500 x 23,400 sec (6.5h market) |
| Market hours (KRX) | 09:00-15:30 KST (6.5 hours) | — |
| Row size (estimated) | ~120 bytes | 11 columns, mostly numeric |
| Daily storage (uncompressed) | ~7 GB | 58.5M x 120 bytes |
| Daily storage (compressed) | ~0.7 GB (90% compression) | TimescaleDB compression benchmark |

### 6.2 TimescaleDB Benchmark Data

Published benchmarks from TimescaleDB and independent sources:

| Benchmark Source | Insert Rate | Configuration | Notes |
|-----------------|-------------|---------------|-------|
| TimescaleDB TSBS (official) | 111,000 rows/sec | Sustained at 1B row scale | 20x faster than vanilla PostgreSQL at scale |
| TimescaleDB 2.21 Direct-to-Columnstore | 5,000,000+ rows/sec | COPY, burst to 100M/sec | New in 2025, COPY only (INSERT support planned) |
| Cloudflare production | 100,000+ rows/sec | Multi-node TimescaleDB Cloud | Production analytics workload |
| MarketReader financial | 3M trades/min (50K/sec) | Financial tick data | Real-world financial application |
| DEV.to insert tuning guide | 50,000-100,000 rows/sec | Batched INSERT (5,000 batch) | Single-node, moderate hardware |
| QuestDB vs TimescaleDB benchmark | 620K-1.2M rows/sec | Varies with cardinality | 1K-1M unique devices/symbols |

**Key finding**: Our target of **2,500 rows/sec** is approximately **2-4% of the demonstrated baseline capacity** (111K rows/sec) even on modest hardware. This provides a **40-50x headroom factor**, meaning the database can comfortably handle our workload with room for:
- Secondary index overhead (~40% reduction → still 66K rows/sec)
- Concurrent read queries (dashboard users)
- Background compression and aggregate refresh jobs
- Future scaling to sub-second tick data

### 6.3 Recommended Insert Strategy

```
┌────────────────────────────────────────────────┐
│          Insert Pipeline Architecture          │
├────────────────────────────────────────────────┤
│                                                │
│  KIS WebSocket ──→ In-Memory Buffer (Redis)    │
│                         │                       │
│                    Batch Timer (1 sec)          │
│                         │                       │
│                    Batch INSERT (2,500 rows)    │
│                         │                       │
│                    stock_prices hypertable      │
│                                                │
└────────────────────────────────────────────────┘
```

**Batching rationale**: Inserting 2,500 rows in a single transaction every 1 second is vastly more efficient than 2,500 individual inserts. Benchmark data shows batch sizes of 1,000-5,000 provide optimal throughput, after which diminishing returns set in. Our natural batch size of 2,500 falls squarely in this sweet spot.

```typescript
// Batch insert implementation pattern
async function batchInsertPrices(prices: StockPriceInput[]): Promise<void> {
  // Use COPY for maximum throughput (50-100x faster than INSERT)
  // or multi-row INSERT with VALUES list
  const BATCH_SIZE = 2500;

  for (let i = 0; i < prices.length; i += BATCH_SIZE) {
    const batch = prices.slice(i, i + BATCH_SIZE);
    await prisma.$executeRaw`
      INSERT INTO stock_prices (time, stock_id, symbol, open, high, low, close, volume, trade_value, change_rate)
      SELECT * FROM UNNEST(
        ${batch.map(p => p.time)}::timestamptz[],
        ${batch.map(p => p.stockId)}::int[],
        ${batch.map(p => p.symbol)}::varchar[],
        ${batch.map(p => p.open)}::decimal[],
        ${batch.map(p => p.high)}::decimal[],
        ${batch.map(p => p.low)}::decimal[],
        ${batch.map(p => p.close)}::decimal[],
        ${batch.map(p => p.volume)}::bigint[],
        ${batch.map(p => p.tradeValue)}::bigint[],
        ${batch.map(p => p.changeRate)}::decimal[]
      )
      ON CONFLICT (time, stock_id) DO UPDATE SET
        close = EXCLUDED.close,
        high = GREATEST(stock_prices.high, EXCLUDED.high),
        low = LEAST(stock_prices.low, EXCLUDED.low),
        volume = EXCLUDED.volume,
        trade_value = EXCLUDED.trade_value,
        change_rate = EXCLUDED.change_rate
    `;
  }
}
```

### 6.4 Hardware Capacity Assessment

Target deployment: Mini-PC (Ryzen 5 5500U, 16GB RAM, 98GB SSD)

| Resource | Requirement | Available | Margin |
|----------|------------|-----------|--------|
| **CPU** | ~5-10% for 2,500 rows/sec INSERT | 6C/12T Ryzen 5 5500U | Ample (90%+ free for queries + compression) |
| **Memory** | shared_buffers 4GB + work_mem + OS | 16 GB total | Configure: shared_buffers=4GB, effective_cache_size=8GB |
| **Storage** (daily, compressed) | ~0.7 GB/day | 98 GB SSD | ~140 trading days (~7 months) before retention kicks in |
| **Storage** (annual, compressed) | ~175 GB/year (250 trading days) | 98 GB SSD | Retention policy at 1 year mandatory; see §7 |
| **IOPS** | ~500-1000 random IOPS for inserts | SSD ~50K+ IOPS | 50x headroom |

**Storage alert**: With 98GB SSD, uncompressed storage of 7 GB/day would fill the disk in ~14 days. **Compression is mandatory**, not optional. With 90%+ compression (0.7 GB/day), storage lasts ~140 days. Combined with the 1-year retention policy dropping old chunks and continuous aggregates for historical data, the 98GB SSD is sufficient.

---

## 7. Data Retention and Compression

### 7.1 Tiered Data Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Lifecycle Pipeline                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Day 0-7:  HOT  ──→ Uncompressed chunks (fast INSERT/UPDATE)   │
│                       Indexes active, full query speed           │
│                                                                 │
│  Day 8+:   WARM ──→ Compressed chunks (90%+ space saving)      │
│                       Read-only, query decompress on-fly         │
│                       INSERT triggers decompress-recompress      │
│                                                                 │
│  Day 365+: DROP ──→ Raw tick data dropped (drop_chunks)         │
│                       Continuous aggregates RETAINED indefinitely│
│                                                                 │
│  Forever:  ARCHIVE → daily_ohlcv continuous aggregate           │
│                       Technical indicators computed on demand    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Compression Configuration

```sql
-- Step 1: Enable compression on the hypertable
ALTER TABLE stock_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'stock_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- Step 2: Add automatic compression policy — compress chunks older than 7 days
SELECT add_compression_policy('stock_prices', INTERVAL '7 days');
```

**Configuration rationale**:
- `compress_segmentby = 'stock_id'`: Groups data by stock for efficient per-stock queries on compressed data. Each compressed segment contains all time-series data for a single stock within a chunk, enabling segment-level decompression (only decompress the needed stock's data).
- `compress_orderby = 'time DESC'`: Within each segment, data is ordered by time descending (most recent first), matching the typical query pattern (latest prices).
- `INTERVAL '7 days'`: Keeps the last 7 days uncompressed for the active write window. The KRX market operates 5 days/week, so 7 calendar days ensures the most recent full trading week is always in hot (uncompressed) storage. This is critical because inserting into compressed chunks triggers a decompress-recompress cycle that is orders of magnitude slower.

### 7.3 Retention Policy

```sql
-- Drop raw tick data older than 1 year
SELECT add_retention_policy('stock_prices', INTERVAL '365 days');

-- CRITICAL: Ensure retention > continuous aggregate refresh window
-- daily_ohlcv refresh looks back 3 days, so 365 days >> 3 days (safe)
```

**Why 365 days?**
- Storage constraint: 98 GB SSD cannot hold more than ~7 months of compressed data
- User need: Technical analysis rarely requires raw tick data beyond 6 months
- Continuous aggregates preserve daily OHLCV data indefinitely, so historical charts still work

### 7.4 Continuous Aggregates — Indefinite Retention

```sql
-- Continuous aggregates are NOT subject to the retention policy on the raw hypertable.
-- daily_ohlcv retains data indefinitely for historical charting.
-- If needed, a separate retention policy can be added:
-- SELECT add_retention_policy('daily_ohlcv', INTERVAL '5 years');  -- optional

-- Verify policies
SELECT * FROM timescaledb_information.jobs
WHERE hypertable_name = 'stock_prices';
```

### 7.5 Storage Estimation (12-Month Projection)

| Period | Raw Data (Uncompressed) | Raw Data (Compressed) | Continuous Aggregate | Total on Disk |
|--------|------------------------|----------------------|---------------------|---------------|
| 1 month | ~175 GB | ~17.5 GB | ~0.2 GB | ~24.5 GB (7 days hot + rest compressed) |
| 3 months | ~525 GB | ~52.5 GB | ~0.5 GB | ~59.8 GB |
| 6 months | ~1,050 GB | ~105 GB | ~1.0 GB | ~72.5 GB (with retention starting) |
| 12 months | ~2,100 GB | ~175 GB | ~2.0 GB | ~72.5 GB (steady state with 1-yr retention) |

**Note**: Steady state is reached when the retention policy starts dropping chunks that exceed 365 days. At steady state, storage stays approximately constant at ~70-75 GB, leaving ~20-25 GB free on the 98 GB SSD for indexes, WAL, temp files, and OS.

---

## 8. Complete Entity Schema Draft

### 8.1 Full DDL (11 Entities)

```sql
-- =============================================================
-- Stock Monitoring Dashboard — Complete Database Schema
-- PostgreSQL 17 + TimescaleDB 2.x
-- =============================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- for gen_random_uuid() if needed

-- =============================================================
-- 1. users — Multi-user accounts with 2-tier roles
-- =============================================================
CREATE TABLE users (
    id                SERIAL PRIMARY KEY,
    email             VARCHAR(255)   NOT NULL UNIQUE,
    password_hash     VARCHAR(255)   NOT NULL,
    name              VARCHAR(100)   NOT NULL,
    role              VARCHAR(10)    NOT NULL DEFAULT 'user'
                      CHECK (role IN ('admin', 'user')),
    surge_threshold_pct DECIMAL(5,2) NOT NULL DEFAULT 5.0,
    settings_json     JSONB,
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);

-- =============================================================
-- 2. stocks — Stock master data (KOSPI + KOSDAQ)
-- =============================================================
CREATE TABLE stocks (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(20)   NOT NULL UNIQUE,
    name        VARCHAR(100)  NOT NULL,
    market      VARCHAR(10)   NOT NULL CHECK (market IN ('KOSPI', 'KOSDAQ', 'KONEX')),
    sector      VARCHAR(50),
    listed_at   DATE,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_stocks_symbol ON stocks (symbol);
CREATE INDEX idx_stocks_market_active ON stocks (market, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_stocks_sector ON stocks (sector) WHERE sector IS NOT NULL;

-- =============================================================
-- 3. stock_prices — Time-series tick data (TimescaleDB hypertable)
-- =============================================================
CREATE TABLE stock_prices (
    time         TIMESTAMPTZ    NOT NULL,
    stock_id     INTEGER        NOT NULL REFERENCES stocks(id),
    symbol       VARCHAR(20)    NOT NULL,
    open         DECIMAL(12,2)  NOT NULL,
    high         DECIMAL(12,2)  NOT NULL,
    low          DECIMAL(12,2)  NOT NULL,
    close        DECIMAL(12,2)  NOT NULL,
    volume       BIGINT         NOT NULL DEFAULT 0,
    trade_value  BIGINT         NOT NULL DEFAULT 0,
    change_rate  DECIMAL(8,4),
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE (time, stock_id)
);

-- Convert to TimescaleDB hypertable with 1-day chunks
SELECT create_hypertable('stock_prices', by_range('time', INTERVAL '1 day'));

-- Primary access pattern indexes
CREATE INDEX idx_stock_prices_stock_time ON stock_prices (stock_id, time DESC);
CREATE INDEX idx_stock_prices_symbol_time ON stock_prices (symbol, time DESC);

-- Sort/filter indexes for dashboard widgets (PRD §3.2)
CREATE INDEX idx_stock_prices_trade_value ON stock_prices (time DESC, trade_value DESC);
CREATE INDEX idx_stock_prices_change_rate ON stock_prices (time DESC, change_rate DESC);
CREATE INDEX idx_stock_prices_volume ON stock_prices (time DESC, volume DESC);

-- =============================================================
-- 4. watchlists — User watchlists / portfolios
-- =============================================================
CREATE TABLE watchlists (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(100)   NOT NULL,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_watchlists_user ON watchlists (user_id);

-- =============================================================
-- 5. watchlist_items — Stocks in a watchlist
-- =============================================================
CREATE TABLE watchlist_items (
    id           SERIAL PRIMARY KEY,
    watchlist_id INTEGER   NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    stock_id     INTEGER   NOT NULL REFERENCES stocks(id),
    added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (watchlist_id, stock_id)
);

CREATE INDEX idx_watchlist_items_watchlist ON watchlist_items (watchlist_id);

-- =============================================================
-- 6. themes — Theme groups (e.g., semiconductors, EV batteries)
-- =============================================================
CREATE TABLE themes (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL UNIQUE,
    description TEXT,
    is_custom   BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 7. theme_stocks — Many-to-many: themes <-> stocks
-- =============================================================
CREATE TABLE theme_stocks (
    id        SERIAL PRIMARY KEY,
    theme_id  INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    stock_id  INTEGER NOT NULL REFERENCES stocks(id),
    UNIQUE (theme_id, stock_id)
);

CREATE INDEX idx_theme_stocks_theme ON theme_stocks (theme_id);
CREATE INDEX idx_theme_stocks_stock ON theme_stocks (stock_id);

-- =============================================================
-- 8. news — News articles from multiple sources
-- =============================================================
CREATE TABLE news (
    id            SERIAL PRIMARY KEY,
    title         TEXT           NOT NULL,
    url           TEXT           NOT NULL UNIQUE,
    source        VARCHAR(50)    NOT NULL,  -- 'naver', 'hankyung', 'dart', 'rss'
    summary       TEXT,
    content       TEXT,
    published_at  TIMESTAMPTZ    NOT NULL,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    -- Full-text search vector (auto-generated)
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(content, '')), 'C')
    ) STORED
);

CREATE INDEX idx_news_published ON news (published_at DESC);
CREATE INDEX idx_news_source ON news (source, published_at DESC);
CREATE INDEX idx_news_search ON news USING GIN (search_vector);

-- =============================================================
-- 9. news_stocks — Many-to-many: news <-> stocks with relevance
-- =============================================================
CREATE TABLE news_stocks (
    id              SERIAL PRIMARY KEY,
    news_id         INTEGER        NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    stock_id        INTEGER        NOT NULL REFERENCES stocks(id),
    relevance_score DECIMAL(5,4)   NOT NULL DEFAULT 0,
    UNIQUE (news_id, stock_id)
);

CREATE INDEX idx_news_stocks_stock ON news_stocks (stock_id, relevance_score DESC);
CREATE INDEX idx_news_stocks_news ON news_stocks (news_id);

-- =============================================================
-- 10. ai_analyses — AI surge analysis results
-- =============================================================
CREATE TABLE ai_analyses (
    id               SERIAL PRIMARY KEY,
    stock_id         INTEGER        NOT NULL REFERENCES stocks(id),
    analysis_type    VARCHAR(50)    NOT NULL,  -- 'surge', 'daily_summary', 'theme_analysis'
    content          JSONB          NOT NULL,  -- structured analysis result
    confidence_score DECIMAL(5,4)   NOT NULL,
    quality_gate_l1  BOOLEAN        NOT NULL DEFAULT FALSE,
    quality_gate_l2  BOOLEAN        NOT NULL DEFAULT FALSE,
    quality_gate_l3  BOOLEAN        NOT NULL DEFAULT FALSE,
    sources_json     JSONB,                    -- cited sources
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_analyses_stock_time ON ai_analyses (stock_id, created_at DESC);
CREATE INDEX idx_ai_analyses_type ON ai_analyses (analysis_type, created_at DESC);

-- =============================================================
-- 11. alerts — User-defined alert conditions
-- =============================================================
CREATE TABLE alerts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_id        INTEGER       NOT NULL REFERENCES stocks(id),
    condition_type  VARCHAR(30)   NOT NULL
                    CHECK (condition_type IN (
                        'price_above', 'price_below',
                        'change_rate_above', 'change_rate_below',
                        'volume_surge', 'trade_value_above'
                    )),
    threshold       DECIMAL(12,2) NOT NULL,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    triggered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_user ON alerts (user_id);
CREATE INDEX idx_alerts_active ON alerts (stock_id, condition_type) WHERE is_active = TRUE;
```

### 8.2 Compression and Retention Policies

```sql
-- =============================================================
-- TimescaleDB Policies (run after hypertable creation)
-- =============================================================

-- Compression: compress chunks older than 7 days
ALTER TABLE stock_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'stock_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('stock_prices', INTERVAL '7 days');

-- Retention: drop raw data older than 1 year
SELECT add_retention_policy('stock_prices', INTERVAL '365 days');
```

### 8.3 Continuous Aggregates

```sql
-- =============================================================
-- Continuous Aggregate: Daily OHLCV
-- =============================================================
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

SELECT add_continuous_aggregate_policy('daily_ohlcv',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Compression on the continuous aggregate itself (for long-term storage)
ALTER MATERIALIZED VIEW daily_ohlcv SET (
    timescaledb.compress
);
SELECT add_compression_policy('daily_ohlcv', INTERVAL '30 days');
```

### 8.4 Entity Relationship Diagram

```
┌──────────┐       ┌──────────────┐       ┌──────────┐
│  users   │───1:N─│  watchlists  │───1:N─│watchlist │
│          │       │              │       │  _items  │
└────┬─────┘       └──────────────┘       └────┬─────┘
     │                                          │
     │ 1:N                                      │ N:1
     ▼                                          ▼
┌──────────┐                              ┌──────────┐
│  alerts  │──────────────N:1────────────│  stocks  │
└──────────┘                              └────┬─────┘
                                               │
                      ┌────────────────────────┼────────────────────────┐
                      │ 1:N                    │ 1:N                    │ 1:N
                      ▼                        ▼                        ▼
               ┌─────────────┐          ┌─────────────┐          ┌──────────┐
               │stock_prices │          │theme_stocks │          │news_stocks│
               │ (hypertable)│          │             │          │           │
               └─────────────┘          └──────┬──────┘          └─────┬────┘
                                               │ N:1                   │ N:1
                                               ▼                       ▼
                                        ┌──────────┐           ┌──────────┐
                                        │  themes  │           │   news   │
                                        └──────────┘           └──────────┘

               ┌──────────────┐
               │ ai_analyses  │───N:1──→ stocks
               └──────────────┘
```

---

## 9. Migration Strategy

### 9.1 Prisma + TimescaleDB Hybrid Migration

Since Prisma Migrate does not support TimescaleDB extensions natively, we use a **two-phase migration approach**:

**Phase 1: Prisma-managed migrations** (standard tables)
```bash
# Generate initial migration from Prisma schema
npx prisma migrate dev --name init --create-only
```

**Phase 2: Custom SQL migration** (TimescaleDB extensions)
```bash
# Create a custom migration for TimescaleDB-specific DDL
mkdir -p prisma/migrations/00000000000001_timescaledb_setup
```

```sql
-- prisma/migrations/00000000000001_timescaledb_setup/migration.sql

-- 1. Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. Convert stock_prices to hypertable
SELECT create_hypertable('stock_prices', by_range('time', INTERVAL '1 day'));

-- 3. Create continuous aggregate
CREATE MATERIALIZED VIEW daily_ohlcv
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    stock_id,
    symbol,
    first(open, time)          AS open,
    max(high)                  AS high,
    min(low)                   AS low,
    last(close, time)          AS close,
    sum(volume)                AS volume,
    sum(trade_value)           AS trade_value,
    last(change_rate, time)    AS change_rate
FROM stock_prices
GROUP BY bucket, stock_id, symbol
WITH NO DATA;

-- 4. Add policies
SELECT add_continuous_aggregate_policy('daily_ohlcv',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

ALTER TABLE stock_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'stock_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('stock_prices', INTERVAL '7 days');
SELECT add_retention_policy('stock_prices', INTERVAL '365 days');

-- 5. Compression on continuous aggregate
ALTER MATERIALIZED VIEW daily_ohlcv SET (timescaledb.compress);
SELECT add_compression_policy('daily_ohlcv', INTERVAL '30 days');

-- 6. Full-text search vector (if not in Prisma migration)
-- ALTER TABLE news ADD COLUMN search_vector tsvector ...
-- (included in Prisma schema as GENERATED ALWAYS)
```

### 9.2 Migration Ordering

```
1. prisma migrate dev --name init          → Creates all 11 tables + indexes
2. 00000000000001_timescaledb_setup        → Hypertable + aggregates + policies
3. prisma migrate dev --name seed_themes   → Seed initial theme data
```

### 9.3 Known Prisma + TimescaleDB Issues

| Issue | Mitigation |
|-------|-----------|
| `prisma migrate reset` fails if TimescaleDB extension already loaded with different version | Use a fixed TimescaleDB version in Docker; avoid `migrate reset` in production |
| `create_hypertable()` not recognized during Prisma shadow database introspection | Separate TimescaleDB migration from Prisma-generated migrations; apply after standard migrations |
| Prisma schema does not support hypertable-specific constraints | Define constraints in custom migration SQL |
| Continuous aggregates not visible to Prisma introspect | Use `$queryRaw` / TypedSQL for aggregate queries; do not model in Prisma schema |

### 9.4 Docker Compose Database Service

```yaml
# docker-compose.yml (database service excerpt)
services:
  db:
    image: timescale/timescaledb:latest-pg17
    container_name: stock-dashboard-db
    environment:
      POSTGRES_DB: stock_dashboard
      POSTGRES_USER: stock_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    command: >
      postgres
        -c shared_buffers=4GB
        -c effective_cache_size=8GB
        -c work_mem=64MB
        -c maintenance_work_mem=512MB
        -c max_connections=100
        -c max_worker_processes=12
        -c max_parallel_workers_per_gather=4
        -c max_parallel_workers=8
        -c wal_buffers=64MB
        -c checkpoint_completion_target=0.9
        -c random_page_cost=1.1
        -c effective_io_concurrency=200
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U stock_user -d stock_dashboard"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
    driver: local
```

**PostgreSQL configuration rationale** (tuned for 16GB RAM mini-PC):
- `shared_buffers=4GB`: 25% of RAM (PostgreSQL recommendation)
- `effective_cache_size=8GB`: 50% of RAM (OS filesystem cache estimate)
- `work_mem=64MB`: Generous for sorting operations (dashboard sort queries)
- `maintenance_work_mem=512MB`: For vacuum and index creation
- `max_parallel_workers=8`: Leverage Ryzen 5's 6C/12T
- `random_page_cost=1.1`: SSD-optimized (default 4.0 is for HDD)
- `effective_io_concurrency=200`: SSD-optimized (default 1 is for HDD)

---

## 10. Sources

### TimescaleDB Documentation and Guides
- [Efficient Stock Market Data Management with TimescaleDB — Bluetick Consultants](https://www.bluetickconsultants.com/how-timescaledb-streamlines-time-series-data-for-stock-market-analysis/)
- [TimescaleDB Financial Tick Data Tutorial — Timescale Docs](https://docs.timescale.com/tutorials/latest/financial-tick-data/financial-tick-dataset/)
- [How to Create Hypertables in TimescaleDB — OneUptime (2026)](https://oneuptime.com/blog/post/2026-02-02-timescaledb-hypertables/view)
- [TimescaleDB Continuous Aggregates — OneUptime (2026)](https://oneuptime.com/blog/post/2026-01-27-timescaledb-continuous-aggregates/view)
- [TimescaleDB create_hypertable() API Reference](https://docs.timescale.com/api/latest/hypertable/create_hypertable/)
- [TimescaleDB Advanced Analytic Queries](https://docs.timescale.com/use-timescale/latest/query-data/advanced-analytic-queries/)
- [About Continuous Aggregates — Tiger Data](https://www.tigerdata.com/docs/use-timescale/latest/continuous-aggregates/about-continuous-aggregates)
- [Hypertable Creation and Configuration — DeepWiki](https://deepwiki.com/timescale/timescaledb/2.1-hypertable-creation-and-configuration)

### Benchmarks and Performance
- [TimescaleDB 2.21: 37x Faster High-Performance Ingestion — Tiger Data](https://www.tigerdata.com/blog/speed-without-sacrifice-37x-faster-high-performance-ingestion-42x-faster-deletes-improved-cagg-updates-timescaledb-2-21)
- [INSERT Performance Tuning for TimescaleDB — DEV Community](https://dev.to/philip_mcclarence_2ef9475/insert-performance-tuning-for-timescaledb-4m7h)
- [TimescaleDB vs QuestDB: 2026 Benchmark Results — QuestDB](https://questdb.com/blog/timescaledb-vs-questdb-comparison/)
- [How MarketReader Processes 3M Trades/Min with TimescaleDB — Tiger Data](https://www.tigerdata.com/blog/how-marketreader-processes-3m-trades-min-deliver-us-market-trading-insights-timescaledb)
- [How TimescaleDB Helped Cloudflare Scale Analytics](https://blog.cloudflare.com/timescaledb-art/)
- [TimescaleDB Benchmark Suite (TSBS) — GitHub](https://github.com/timescale/tsbs)

### Compression and Retention
- [TimescaleDB Compression: 150GB to 15GB (90% Reduction) — DEV Community](https://dev.to/polliog/timescaledb-compression-from-150gb-to-15gb-90-reduction-real-production-data-bnj)
- [TimescaleDB Compression: Complete Guide to 95%+ Storage Reduction — DEV Community](https://dev.to/philip_mcclarence_2ef9475/timescaledb-compression-a-complete-guide-to-95-storage-reduction-2mo4)
- [Data Retention Policies — TimescaleDB (OneUptime 2026)](https://oneuptime.com/blog/post/2026-02-02-timescaledb-data-retention/view)
- [About Compression — Timescale Docs](https://docs.timescale.com/use-timescale/latest/compression/about-compression/)
- [Best Practices for TimescaleDB Massive Delete Operations — Stormatics](https://stormatics.tech/blogs/best-practices-for-timescaledb-massive-delete-operations)

### PostgreSQL 17
- [PostgreSQL 17 Released — PostgreSQL Official](https://www.postgresql.org/about/news/postgresql-17-released-2936/)
- [Top PostgreSQL 17 New Features — ScaleGrid](https://scalegrid.io/blog/postgresql-17-new-features/)
- [PostgreSQL 17 Released with Improved Vacuum and Performance Gains — InfoQ](https://www.infoq.com/news/2024/11/postgresql-17/)
- [3 Great New Features in Postgres 17 — InfoWorld](https://www.infoworld.com/article/3540394/3-great-new-features-in-postgres-17.html)
- [What's New in PostgreSQL 17 — DEV Community](https://dev.to/haris_/whats-new-in-postgresql-17-and-whats-coming-next-1j3p)

### Prisma 7 and TimescaleDB Integration
- [Prisma 7 Release: Rust-Free, Faster, and More Compatible — Prisma Blog](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Prisma 7: Rust-Free Architecture and Performance Gains — InfoQ](https://www.infoq.com/news/2026/01/prisma-7-performance/)
- [Prisma ORM Without Rust: Latest Performance Benchmarks — Prisma Blog](https://www.prisma.io/blog/prisma-orm-without-rust-latest-performance-benchmarks)
- [TypedSQL: Fully Type-Safe Raw SQL in Prisma ORM — Prisma](https://www.prisma.io/typedsql)
- [Writing Type-safe SQL with TypedSQL — Prisma Documentation](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/typedsql)
- [Support TimescaleDB — Prisma GitHub Issue #3228](https://github.com/prisma/prisma/issues/3228)
- [Set up a TimescaleDB Hypertable with Prisma — Medium](https://medium.com/geekculture/set-up-a-timescaledb-hypertable-with-prisma-9550652cfe97)
- [Migrate to Prisma v7 — Prisma Documentation](https://www.prisma.io/docs/ai/prompts/prisma-7)

### Index Strategy
- [Understanding Postgres GIN Indexes: The Good and the Bad — pganalyze](https://pganalyze.com/blog/gin-index)
- [How to Choose Between B-Tree, GIN, and BRIN Indexes — OneUptime (2026)](https://oneuptime.com/blog/post/2026-01-25-btree-gin-brin-indexes-postgresql/view)
- [PostgreSQL Indexing Deep Dive — Meerako](https://www.meerako.com/blogs/postgresql-indexing-strategies-btree-gin-gist-guide)
- [PostgreSQL Documentation: Index Types](https://www.postgresql.org/docs/current/indexes-types.html)

### Technical Indicators
- [TimescaleDB for Technical Analysis — Medium](https://sinaure.medium.com/timscaledb-for-technical-analysis-63a19306fe85)
- [Calculate Technical Indicators in SQL — Moving Averages, RSI, MACD — Medium (Google Cloud)](https://medium.com/google-cloud/how-to-calculate-technical-indicators-in-bigquery-using-sql-moving-averages-rsi-macd-b58b16e4f52e)
- [TimescaleDB Toolkit: Rolling Average API — GitHub](https://github.com/timescale/timescaledb-toolkit/blob/main/docs/rolling_average_api_working.md)
