-- =============================================================================
-- Stock Monitoring Dashboard — TimescaleDB Views Migration
-- =============================================================================
-- Creates: Continuous Aggregate (daily_ohlcv), Technical Indicator Views
-- Depends on: 00000000000000_init (stock_prices hypertable must exist)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Continuous Aggregate: Daily OHLCV
-- ---------------------------------------------------------------------------
-- Converts tick/second-level data into clean daily candles.
-- Uses TimescaleDB first() / last() aggregates for OHLCV semantics.

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

-- ---------------------------------------------------------------------------
-- 2. Technical Indicator Views
-- ---------------------------------------------------------------------------
-- These are regular PostgreSQL views (not continuous aggregates) because they
-- use window functions with ROWS BETWEEN frames not supported in CA.
-- They read from the already-materialized daily_ohlcv for good performance.

-- 2.1 Moving Averages (5/20/60/120 day)
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

-- 2.2 RSI (14-Period)
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

-- 2.3 MACD (12/26/9)
-- NOTE: Uses SMA approximation instead of true EMA for SQL simplicity.
-- For production accuracy, consider computing EMA via recursive CTE or application layer.
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

-- 2.4 Bollinger Bands (20-period, 2 standard deviations)
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

-- 2.5 Unified Technical Indicators View
-- Joins all indicator views for convenient single-query access.
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
