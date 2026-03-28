# Step 6: Research Synthesis — Unified Technical Foundation

> **Agent**: `@research-synthesizer`
> **Date**: 2026-03-27
> **Status**: Complete (Research Phase Gate)
> **Inputs**: Steps 1-5 Research Reports + PRD v2.0
> **Purpose**: Single reference document for Planning and Implementation phases

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Confirmed Technology Decisions](#2-confirmed-technology-decisions)
3. [Cross-Reference Conflict Analysis](#3-cross-reference-conflict-analysis)
4. [Architecture Integration Points](#4-architecture-integration-points)
5. [Risk Register (Updated)](#5-risk-register-updated)
6. [Implementation Priority Matrix](#6-implementation-priority-matrix)
7. [Remaining Unknowns](#7-remaining-unknowns)
8. [Context Reset Recovery Section](#8-context-reset-recovery-section)

---

## 1. Executive Summary

The five research steps have validated every major technology choice in the PRD v2.0 Balanced-Tech stack. The KIS OpenAPI provides the only viable path for real-time Korean stock data via WebSocket (41-subscription limit per session is the binding constraint) and REST endpoints covering OHLCV, orderbook, rankings, and index data, though no official TypeScript SDK exists and one must be built from scratch [trace:step-1:section-10]. PostgreSQL 17 with TimescaleDB delivers 40-50x headroom over our 2,500 rows/sec insert target, with 1-day chunk intervals, continuous aggregates for daily OHLCV, and a tiered compression/retention policy that keeps the 98GB SSD viable for 12+ months of operation [trace:step-2:section-6]. The frontend stack of Next.js 15/16, React Grid Layout, TradingView Lightweight Charts v4, Recharts, Zustand, TanStack Query, and Socket.IO provides a cohesive architecture with sub-millisecond chart updates, drag-and-drop widgets, and a clear separation of server state and client state [trace:step-3:section-10]. The AI pipeline built on LangGraph.js StateGraph with a 5-node orchestration flow (DataCollector, NewsSearcher, Analyzer, QualityGate, ResultFormatter) and 3-layer Quality Gate achieves hallucination mitigation through structured output enforcement, citation requirements, fact-grounding prompts, and L3 factual cross-validation against KIS API data [trace:step-4:section-5]. News ingestion from three verified sources (Naver Search API at 25,000 calls/day, 9 RSS feeds from 5 Korean financial outlets, and DART API for official disclosures) provides comprehensive coverage with a 3-layer deduplication strategy reducing duplicate articles by approximately 73% [trace:step-5:section-5].

### Confidence Assessment

| Technology | Confidence | Basis |
|-----------|-----------|-------|
| KIS OpenAPI (REST + WebSocket) | **HIGH** | Only option for real-time Korean stock data; fully documented with reference implementations [trace:step-1:section-7] |
| PostgreSQL 17 + TimescaleDB | **HIGH** | 40-50x capacity headroom; benchmark-validated; 1-day chunks optimal for KRX trading pattern [trace:step-2:section-6] |
| Prisma 7.x + TypedSQL hybrid | **MEDIUM** | Prisma does not natively support hypertables/continuous aggregates; hybrid raw SQL approach required [trace:step-2:section-4.4] |
| Next.js 15/16 + React 19 | **HIGH** | PPR architecture proven; all widget components have working reference patterns [trace:step-3:section-4] |
| TradingView Lightweight Charts v4 | **HIGH** | 45KB bundle, Canvas-based <1ms updates, Korean color convention validated [trace:step-3:section-2] |
| React Grid Layout v2.x | **HIGH** | De facto standard; full TypeScript support; localStorage persistence pattern proven [trace:step-3:section-1] |
| Zustand + TanStack Query | **HIGH** | Community-standard two-store pattern; clean server/client state separation [trace:step-3:section-5] |
| Socket.IO 4.x | **HIGH** | 14 years of maturity; auto-reconnect; room-based subscription pattern maps directly to stock symbols [trace:step-3:section-6] |
| LangGraph.js + LangChain.js | **MEDIUM** | 1.0 GA reached; critical CVE patches required (CVE-2025-68665 CVSS 8.6); zod@4 support still unstable [trace:step-4:section-6] |
| Naver Search API | **HIGH** | 25,000 calls/day sufficient; 42% budget usage for 50-stock monitoring [trace:step-5:section-1.6] |
| RSS Feeds (5 outlets) | **HIGH** | No rate limits; free; Promise.allSettled isolation pattern ensures resilience [trace:step-5:section-2] |
| DART API | **HIGH** | Official FSS system; structured disclosure data; polling-based real-time monitoring [trace:step-5:section-3] |
| Redis 8 / Valkey 8 | **HIGH** | Cache + Pub/Sub + Queue; license consideration noted (BSD fork Valkey as alternative) [trace:PRD:section-4.1] |
| Better Auth 1.x | **MEDIUM** | Auth.js merged into Better Auth (2026); relatively new (2 years); multi-user session management confirmed [trace:PRD:section-4.1] |

---

## 2. Confirmed Technology Decisions

### 2.1 KIS OpenAPI — Stock Data Layer

| Property | Value | Source |
|----------|-------|--------|
| REST base URL (production) | `https://openapi.koreainvestment.com:9443` | [trace:step-1:section-1.2] |
| REST base URL (simulation) | `https://openapivts.koreainvestment.com:29443` | [trace:step-1:section-1.2] |
| WebSocket URL (production) | `ws://ops.koreainvestment.com:21000` | [trace:step-1:section-2.1] |
| Auth mechanism | OAuth 2.0 client_credentials; token valid 90 days; refresh every 6 hours recommended | [trace:step-1:section-1.4] |
| WebSocket auth | Separate `approval_key` via `/oauth2/Approval` (note: uses `secretkey`, not `appsecret`) | [trace:step-1:section-2.2] |
| REST rate limit (production) | 20 req/s per account; recommended 15 req/s token bucket | [trace:step-1:section-4] |
| REST rate limit (simulation) | 2 req/s per account | [trace:step-1:section-4.1] |
| WebSocket subscription limit | **41 items** combined across all products | [trace:step-1:section-2.9] |
| Real-time data format | Pipe-delimited: `{encrypted}|{tr_id}|{count}|{fields^separated^by^caret}` | [trace:step-1:section-2.5] |
| H0STCNT0 key fields | 15+ fields including: stockCode[0], time[1], currentPrice[2], changeSign[3], changeRate[5], open[7], high[8], low[9], volume[13] | [trace:step-1:section-2.6] |
| All numeric values | Returned as **strings** — parsing layer mandatory | [trace:step-1:section-6.4] |
| TypeScript SDK | **None exists** — must build custom client | [trace:step-1:section-7.3] |
| PINGPONG heartbeat | Must echo back PINGPONG messages; 60s ping_interval | [trace:step-1:section-2.8] |
| Circuit breaker | 3-tier: Closed (<5 errors/60s) → Open (>=5 errors) → Half-Open (30s cooldown) | [trace:step-1:section-5.4] |

**Caveat**: WebSocket uses `ws://` (unencrypted), not `wss://`. For the mini-PC deployment behind Cloudflare Tunnel, external traffic is TLS-encrypted by Cloudflare, but the KIS WebSocket connection from the NestJS backend to KIS servers is unencrypted on KIS's ports. This is a KIS platform limitation, not a configurable option.

### 2.2 PostgreSQL 17 + TimescaleDB — Data Layer

| Property | Value | Source |
|----------|-------|--------|
| Hypertable | `stock_prices` with `by_range('time', INTERVAL '1 day')` | [trace:step-2:section-1.2] |
| Chunk interval decision | 1-day (aligns with KRX sessions; ~58.5M rows/chunk; fine-grained compression) | [trace:step-2:section-1.3] |
| Space partitioning | Skipped (single-node deployment; composite index on stock_id,time suffices) | [trace:step-2:section-1.4] |
| Continuous aggregate | `daily_ohlcv` refreshed every 1 hour, 3-day lookback | [trace:step-2:section-2.1] |
| Technical indicators | Views on `daily_ohlcv`: SMA 5/20/60/120, RSI-14, MACD, Bollinger Bands | [trace:step-2:section-2] |
| Compression | `segmentby=stock_id`, `orderby=time DESC`, policy at 7 days | [trace:step-2:section-7.2] |
| Retention | Raw tick data dropped at 365 days; continuous aggregates retained indefinitely | [trace:step-2:section-7.3] |
| Storage steady state | ~70-75 GB at 12 months (leaves 20-25 GB free on 98 GB SSD) | [trace:step-2:section-7.5] |
| Insert throughput target | 2,500 rows/sec (2-4% of 111K rows/sec baseline capacity) | [trace:step-2:section-6.2] |
| Insert strategy | In-memory buffer (Redis) → Batch INSERT every 1 second → UNNEST + ON CONFLICT | [trace:step-2:section-6.3] |
| Entity count | 11 tables: users, stocks, stock_prices, watchlists, watchlist_items, themes, theme_stocks, news, news_stocks, ai_analyses, alerts | [trace:step-2:section-8.1] |
| PG 17 benefits | 2x WAL write throughput, 20x vacuum memory reduction, 2x COPY performance, JSON_TABLE | [trace:step-2:section-3.3] |
| Full-text search | GIN index on `tsvector` column with `'simple'` config; `pg_cjk_parser` recommended for production Korean | [trace:step-2:section-5.3], [trace:step-5:section-7.2] |
| Prisma 7 hybrid | Prisma Client for CRUD + TypedSQL for TimescaleDB queries + $queryRaw for admin functions | [trace:step-2:section-4.3] |

**Caveat**: Prisma 7 is ESM-only with output generated outside node_modules. All NestJS modules must use ESM imports. The Prisma schema defines `stock_prices` as a regular table; the hypertable conversion and all TimescaleDB-specific DDL (compression, retention, continuous aggregates) must be handled via custom migration SQL files, not Prisma's standard migration flow [trace:step-2:section-4.4].

### 2.3 Frontend Stack

| Component | Version | Role | Key Metric | Source |
|-----------|---------|------|-----------|--------|
| Next.js | 15/16 | App Router, PPR | Static shell + dynamic streaming | [trace:step-3:section-4] |
| React Grid Layout | v2.x | Widget dashboard | 40KB bundle, 12-col grid, 8 widget types | [trace:step-3:section-1] |
| TradingView Lightweight Charts | v4.x | Candlestick/line charts | 45KB bundle, <1ms `.update()`, Canvas renderer | [trace:step-3:section-2] |
| Recharts | v2.x | KPI/supplementary charts | SVG-based, tree-shakeable, 5 widget types | [trace:step-3:section-3] |
| Zustand | v5.x | Client state (UI, layout, WebSocket) | 3 stores: dashboardLayout, userPreferences, realtime | [trace:step-3:section-5.2] |
| TanStack Query | v5.x | Server state (API data) | staleTime=5s, gcTime=5min, hierarchical query keys | [trace:step-3:section-5.3] |
| Socket.IO Client | v4.x | Real-time data pipeline | WebSocket-first transport, infinite reconnection, room-based | [trace:step-3:section-6] |
| shadcn/ui | latest | UI components | Card, Button, Skeleton for widget wrappers | [trace:step-3:section-7] |

**Key architectural decisions**:
- `draggableHandle=".widget-drag-handle"` prevents accidental widget drags during chart interaction [trace:step-3:section-1.4]
- Korean color convention: up=red (#EF4444), down=blue (#3B82F6) applied consistently across all chart types [trace:step-3:section-2.2]
- Layout persistence via `localStorage` with `zustand/persist` middleware [trace:step-3:section-5.2]
- Real-time cache invalidation: WebSocket events trigger TanStack Query `invalidateQueries` for surge alerts, news, and index data [trace:step-3:section-5.5]

### 2.4 AI Pipeline — LangGraph.js + LangChain.js

| Property | Value | Source |
|----------|-------|--------|
| Graph architecture | `StateGraph` with `Annotation.Root` (5 nodes + error handler) | [trace:step-4:section-1] |
| Nodes | DataCollector → NewsSearcher → Analyzer → QualityGate → ResultFormatter | [trace:step-4:section-1.3] |
| State channels | 9 channels: symbol, requestId, stockData, newsArticles, surgeAnalysis, qualityGateResult, finalResult, currentStep, error, retryCount | [trace:step-4:section-1.2] |
| Quality Gate layers | L1 Syntax (Zod, 99%+), L2 Semantic (self-consistency, 95%+), L3 Factual (KIS API cross-check, 90%+) | [trace:step-4:section-3] |
| Retry strategy | Max 3 retries; failed QG routes back to Analyzer with feedback; final failure → "unverified" label | [trace:step-4:section-3.4] |
| Confidence scoring | Weighted: 0.20(source count) + 0.30(evidence quality) + 0.35(QG pass) + 0.15(cross-source consistency) → [0,100] | [trace:step-4:section-4] |
| Hallucination defense | 6 layers: structured output, citation requirements, fact-grounding prompts, L2 self-consistency, L3 factual cross-check, domain glossary | [trace:step-4:section-5] |
| Default model | Claude Sonnet 4.6 ($0.024/analysis single attempt) | [trace:step-4:section-7.3] |
| Monthly cost (1,500 analyses) | ~$36 without caching; ~$22 with prompt caching + Redis response caching | [trace:step-4:section-7.4] |
| Prompt caching | Anthropic `anthropicPromptCachingMiddleware`; 90% discount on cached reads | [trace:step-4:section-7.5.1] |
| Response caching | Redis with 30-minute TTL per `surge-analysis:{symbol}:{date}` | [trace:step-4:section-7.5.2] |
| Security patches required | `@langchain/core >= 1.1.8`, `langchain >= 1.2.3` (CVE-2025-68665 CVSS 8.6) | [trace:step-4:section-6.3] |
| Zod version | Pin to `zod@^3.23` (zod@4 `withStructuredOutput` support unstable) | [trace:step-4:section-2.2] |
| Input sanitization | Regex filter for prompt injection patterns + 2000-char limit | [trace:step-4:section-6.4] |
| Output sanitization | HTML stripping + URL validation before QG | [trace:step-4:section-6.4] |

### 2.5 News Data Sources

| Source | Type | Daily Budget | Rate Limit | Key Constraint | Source |
|--------|------|-------------|-----------|----------------|--------|
| Naver Search API | REST polling | 25,000 calls/day | Not officially documented (recommend max 5 concurrent) | `start` param caps at 1000; varied query patterns needed for coverage | [trace:step-5:section-1] |
| RSS Feeds (9 feeds, 5 outlets) | Push/pull | Unlimited | None | 5-15 min lag behind publisher website; description truncated to 100-200 chars | [trace:step-5:section-2] |
| DART API | REST polling | ~10,000 calls/day | Max 100 results/page | No WebSocket/push; polling every 2 min during 09:00-18:00 KST | [trace:step-5:section-3] |

**RSS Feed Outlets**: Hankyung (증권, 경제), Maeil Business (증권, 경제), Chosun Biz (마켓, 전체), eDaily (증권, 전체), Financial News (증권, 전체) [trace:step-5:section-2.2]

**Deduplication Pipeline**: Layer 1 URL normalization (60%) → Layer 2 title Jaccard similarity at threshold 0.7 (25% additional) → Layer 3 time-window clustering within 2 hours (10% additional) → Total ~73% reduction [trace:step-5:section-5]

**Relevance Scoring**: Layer 1 keyword matching (weight 0.6) + optional Layer 2 NLP semantic scoring (weight 0.4). NLP scoring applied selectively when keyword score is in ambiguous range [0.2, 0.7] [trace:step-5:section-4]

**News Summarization**: gpt-4o-mini recommended for routine summarization ($90/month at 5000 articles/day); "Stuff" approach for individual articles, "Map-Reduce" for cluster summaries [trace:step-5:section-6]

---

## 3. Cross-Reference Conflict Analysis

### 3.1 DB Schema (Step 2) vs KIS API Data Format (Step 1)

**Status**: ALIGNED with one reconciliation needed.

The `stock_prices` hypertable schema [trace:step-2:section-1.2] expects:
- `time TIMESTAMPTZ` — KIS WebSocket provides `HHMMSS` format [trace:step-1:section-2.6]; must construct full timestamp by combining with current date + KST timezone offset.
- `open/high/low/close DECIMAL(12,2)` — KIS returns all prices as **strings** [trace:step-1:section-6.4]; parsing layer converts `"72300"` → `72300.00`.
- `volume BIGINT` — KIS `acml_vol` is string-typed; straightforward `parseInt`.
- `trade_value BIGINT` — KIS `acml_tr_pbmn` is string-typed accumulated trading value in KRW.
- `change_rate DECIMAL(8,4)` — KIS `prdy_ctrt` as percentage string; `"-0.69"` → `-0.6900`.
- `symbol VARCHAR(20)` — KIS `mksc_shrn_iscd` is 6-digit code; direct mapping.
- `stock_id INTEGER` — Requires lookup from `stocks` master table via symbol; not provided by KIS directly.

**Reconciliation needed**: The Step 2 schema includes a denormalized `symbol` column on `stock_prices` for query convenience [trace:step-2:section-1.2], which aligns with the KIS WebSocket data that always provides the stock code. However, the `stock_id` foreign key requires a Redis lookup cache (symbol → stock_id) to avoid per-message database queries during the 2,500 msg/sec ingest flow.

**PRD entity model vs Step 2 schema**: The PRD Section 4.4 defines a simplified entity list [trace:PRD:section-4.4]. Step 2 expands this into full DDL with 11 tables [trace:step-2:section-8.1]. All PRD entities are accounted for; Step 2 adds implementation details (constraints, indexes, generated columns) that do not conflict with the PRD specification.

### 3.2 Frontend Socket.IO (Step 3) vs Backend WebSocket Design

**Status**: ALIGNED — two-tier WebSocket architecture confirmed.

The architecture uses two distinct WebSocket layers:

1. **KIS WebSocket** (backend only): `ws://ops.koreainvestment.com:21000` — connects NestJS to KIS for raw market data. Uses pipe-delimited format, PINGPONG heartbeat, 41-subscription limit [trace:step-1:section-2].

2. **Socket.IO** (backend ↔ frontend): NestJS WebSocket Gateway broadcasts processed/normalized data to connected browser clients via Socket.IO rooms. Each stock symbol maps to a room [trace:step-3:section-6.2].

**Data flow**: KIS WebSocket → NestJS `kis-websocket.service` (parse pipe-delimited → typed object) → Redis cache (TTL 5s) → batch INSERT to TimescaleDB → Socket.IO Gateway emits `price:update` event → Frontend `useRealtimeChartUpdates` hook updates TradingView chart via `.update()` [trace:step-3:section-2.3].

**Event naming alignment**: Step 3 uses `price:update`, `alert:surge`, `news:update`, `index:update` as Socket.IO event names [trace:step-3:section-5.5]. These must be implemented consistently in the NestJS WebSocket Gateway.

**No conflict identified**. The frontend subscribes/unsubscribes to stock symbols via `socket.emit('subscribe', { symbol })` [trace:step-3:section-6.2], and the backend manages the mapping from Socket.IO rooms to the 41-subscription KIS WebSocket limit internally.

### 3.3 AI Pipeline (Step 4) vs News Sources (Step 5)

**Status**: ALIGNED — integration points clearly defined.

The AI pipeline's `NewsSearcher` node [trace:step-4:section-1.3] performs parallel search across all three news sources:
```
Promise.all([
  newsService.searchNaver(`${stockName} 주가 급등`, { display: 10 }),
  newsService.searchRSS(stockName),
  newsService.searchDART(symbol),
])
```

This directly consumes:
- Naver Search API service [trace:step-5:section-1.7]
- RSS Feed service [trace:step-5:section-2.3]
- DART Disclosure service [trace:step-5:section-3.5]

The `mergeAndDeduplicate` function applies the 3-layer deduplication strategy from Step 5 [trace:step-5:section-5.2], and the `relevanceScore` on each `NewsArticle` uses the keyword + optional NLP scoring from Step 5 Section 4 [trace:step-5:section-4].

**Integration detail**: Step 4 defines `NewsArticle` with fields `{title, source, url, publishedAt, summary, relevanceScore}` [trace:step-4:section-1.2]. Step 5's `ParsedNewsItem` has `{title, link, description, pubDate, source, category}` [trace:step-5:section-2.3]. A mapping layer is needed: `link` → `url`, `description` → `summary`, `pubDate` → `publishedAt`, and `relevanceScore` must be computed by the scoring service before passing to the AI pipeline.

### 3.4 Technology Version Conflicts

**Status**: NO CONFLICTS — all versions compatible.

| Potential Conflict Area | Resolution |
|------------------------|------------|
| Zod version (Step 4 pins `^3.23`) vs latest zod@4 | Step 4 explicitly recommends pinning to zod@3.x until LangChain.js zod@4 support stabilizes [trace:step-4:section-2.2]. No other component requires zod@4. |
| Prisma 7 ESM-only vs NestJS 11 | NestJS 11 supports ESM. Prisma 7 output is configurable outside node_modules [trace:step-2:section-4.1]. Compatible. |
| Socket.IO 4.x client (Step 3) vs Socket.IO 4.x server (NestJS) | Same major version. Compatible by definition. |
| `@langchain/core >= 1.1.8` security requirement | Does not conflict with `@langchain/langgraph >= 0.2.40` or `@langchain/anthropic >= 0.3.14` [trace:step-4:section-6.3]. |
| Node.js 22 LTS (PRD §7.1) | All packages (Next.js 15/16, NestJS 11, Prisma 7, LangChain.js 1.2) support Node.js 22. |

### 3.5 Schema Conflict: Step 2 news table vs Step 5 news_articles table

**Status**: RECONCILIATION REQUIRED.

Step 2 defines a `news` table with 7 columns [trace:step-2:section-8.1]. Step 5 defines a more detailed `news_articles` table with 13 columns including `external_id`, `naver_url`, `category`, `content_hash`, `summarized_at` [trace:step-5:section-7.1]. Additionally, Step 5 defines a separate `dart_disclosures` table and a `news_stock_relevance` table with keyword/NLP score breakdown.

**Resolution**: Adopt Step 5's richer schema as the authoritative news schema, since it was designed specifically for the multi-source ingestion pipeline. The Step 2 `news` table was a simplified placeholder. Key merges:
- Use `news_articles` (Step 5) instead of `news` (Step 2)
- Use `news_stock_relevance` (Step 5) instead of `news_stocks` (Step 2), as it includes keyword/NLP score breakdown
- Add the `dart_disclosures` table (Step 5) as a separate entity for regulatory data
- Retain the `ai_analyses` table from Step 2 unchanged
- The full-text search approach converges: both steps recommend GIN index on tsvector. Step 5 adds `pg_cjk_parser` for proper Korean tokenization [trace:step-5:section-7.2]

---

## 4. Architecture Integration Points

### 4.1 System Data Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL DATA SOURCES                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  KIS WebSocket ──────┐    Naver API ──────┐    RSS Feeds ──┐    DART API ──┐│
│  (ws://ops.~:21000)  │    (25K calls/day) │    (9 feeds)   │    (~10K/day) ││
│  41 subs max         │                    │    no limits   │               ││
│                      │                    │                │               ││
└──────────┬───────────┴────────────────────┴────────────────┴───────────────┘│
           │                                                                   │
           ▼                                                                   │
┌──────────────────────────────────────────────────────────────────────────────┐
│                     NestJS 11 MODULAR MONOLITH                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  Stock Module    │  │  News Module    │  │  AI Agent Module            │  │
│  │                  │  │                  │  │                             │  │
│  │  KIS REST Client │  │  Naver Service  │  │  LangGraph.js StateGraph    │  │
│  │  KIS WS Client  │  │  RSS Service    │  │  ┌──────────────────────┐   │  │
│  │  Rate Limiter    │  │  DART Service   │  │  │ DataCollector        │   │  │
│  │  (15 req/s)     │  │  Dedup Pipeline │  │  │ → NewsSearcher       │   │  │
│  │                  │  │  Relevance      │  │  │ → Analyzer (LLM)    │   │  │
│  │  Price Parser    │  │  Scorer         │  │  │ → QualityGate (L1-3)│   │  │
│  │  (string→number) │  │  Summarizer     │  │  │ → ResultFormatter   │   │  │
│  └────────┬─────────┘  │  (gpt-4o-mini) │  │  └──────────────────────┘   │  │
│           │            └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                     │                           │                 │
│           ▼                     ▼                           ▼                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        SHARED INFRASTRUCTURE                            │ │
│  │  Redis 8 (cache + pub/sub)  │  Prisma 7 (CRUD) + TypedSQL (time-series)│ │
│  │  Bull Queue (async AI jobs) │  Better Auth 1.x (sessions)              │ │
│  └──────────┬──────────────────┴──────────────────────┬────────────────────┘ │
│             │                                          │                      │
│             ▼                                          ▼                      │
│  ┌─────────────────┐                       ┌──────────────────────┐          │
│  │  Socket.IO GW   │                       │  PostgreSQL 17       │          │
│  │  price:update   │                       │  + TimescaleDB       │          │
│  │  alert:surge    │                       │  stock_prices (hyper)│          │
│  │  news:update    │                       │  daily_ohlcv (CA)    │          │
│  │  index:update   │                       │  11 entities         │          │
│  └────────┬────────┘                       └──────────────────────┘          │
│           │                                                                   │
└───────────┼──────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 15/16)                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Static Shell (PPR)                                                          │
│  ├── DashboardGrid (React Grid Layout, 12-col, draggable)                   │
│  │   ├── WatchlistWidget (TanStack Query → Table)                           │
│  │   ├── CandlestickWidget (TradingView LW Charts v4 + useRealtimeUpdates) │
│  │   ├── NewsFeedWidget (TanStack Query + Socket.IO invalidation)           │
│  │   ├── ThemeSummaryWidget (Recharts BarChart)                             │
│  │   ├── SurgeAlertsWidget (Socket.IO alert:surge)                          │
│  │   ├── AiAnalysisWidget (TanStack Query → confidence gauge)               │
│  │   ├── MarketIndicesWidget (Recharts AreaChart)                           │
│  │   └── TopVolumeWidget (Recharts BarChart)                                │
│  │                                                                           │
│  State: Zustand (layout, preferences, activeStock, realtime)                │
│  Server State: TanStack Query (staleTime=5s, hierarchical keys)             │
│  Auth: Better Auth (session cookie → middleware redirect)                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Critical Integration Seams

| Seam | Upstream | Downstream | Data Contract | Protocol |
|------|----------|-----------|--------------|----------|
| A | KIS WebSocket | NestJS Stock Module | Pipe-delimited H0STCNT0 payload → `RealTimePrice` TypeScript interface | WebSocket (ws://) |
| B | NestJS Stock Module | Redis | `RealTimePrice` JSON → key `price:{symbol}`, TTL 5s | Redis SET/GET |
| C | NestJS Stock Module | TimescaleDB | `StockPriceInput[]` → batch INSERT via Prisma `$executeRaw` UNNEST | SQL over TCP |
| D | NestJS Stock Module | Socket.IO Gateway | `RealTimePrice` → emit `price:update` to room `stock:{symbol}` | Socket.IO |
| E | Socket.IO Gateway | Frontend hooks | `price:update` event → `useRealtimeChartUpdates` → chart `.update()` | Socket.IO |
| F | Naver/RSS/DART | NestJS News Module | Raw articles → parse → dedup → score → store | HTTP/RSS |
| G | NestJS News Module | AI Agent Module | `NewsArticle[]` (merged, deduplicated, scored) | In-process DI |
| H | AI Agent Module | LLM Provider | LangChain.js `ChatAnthropic` → structured output | HTTPS |
| I | AI Agent Module | Frontend | `AnalysisResult` (stored in PostgreSQL) → REST API + Socket.IO push | HTTP + Socket.IO |
| J | Frontend | NestJS REST API | TanStack Query → `GET /api/stocks/:symbol/prices` etc. | HTTP/REST |

### 4.3 41-Subscription Limit Management Strategy

The KIS WebSocket's 41-subscription limit [trace:step-1:section-2.9] is the tightest constraint in the system. With 2,500+ KRX-listed stocks and potentially dozens of concurrent users, a subscription management layer is required:

**Tiered subscription model**:
1. **Tier 1 — Real-time WebSocket** (up to 41 symbols): Watchlist stocks across all active users (deduplicated). Priority: most-watched symbols first.
2. **Tier 2 — Polling REST** (remaining symbols): REST `inquire-price` endpoint at 5-second intervals, rate-limited to 15 req/s. At 15 req/s, can poll ~75 stocks per 5-second cycle.
3. **Tier 3 — On-demand REST**: Stocks not in any active watchlist, fetched only when a user navigates to the stock detail page.

**Dynamic subscription rotation**: When a user adds a new stock to their watchlist, the backend evaluates whether it can replace a lower-priority subscription. Subscriptions are weighted by: (a) number of users watching, (b) recent surge activity, (c) trading volume.

---

## 5. Risk Register (Updated)

Combines PRD risks R1-R9 [trace:PRD:section-10] with newly discovered risks from research.

| ID | Risk | Probability | Impact | Score | Mitigation | Research Update |
|----|------|------------|--------|-------|-----------|----------------|
| R1 | **AI hallucination producing false analysis** | 30% (↓ from PRD 35%) | 9/10 | 2.70 | 6-layer hallucination defense [trace:step-4:section-5]; L3 factual cross-check against KIS API; "AI 생성" label + confidence 0-100 score | Research validated 6 defense layers; confidence scoring formula defined with 4 weighted components [trace:step-4:section-4] |
| R2 | **KIS API change/outage** | 30% | 8/10 | 2.40 | Circuit breaker (3-tier) [trace:step-1:section-5.4]; Redis cache fallback; krx-stock-api npm as TypeScript fallback for historical data | TLS 1.0/1.1 deprecated 2025-12-12; no breaking API changes identified in current docs |
| R3 | **AI code technical debt accumulation** | 40% | 7/10 | 2.80 | 4-layer prevention (TypeScript strict, pre-commit, SonarQube, sprint 20% refactoring); TDR 15% warning threshold | No change from PRD assessment |
| R4 | **Real-time WebSocket instability** | 25% | 6/10 | 1.50 | Socket.IO auto-reconnect with infinite attempts + exponential backoff [trace:step-3:section-6.1]; KIS PINGPONG heartbeat [trace:step-1:section-2.8]; Redis pub/sub as fallback channel | Research confirmed PINGPONG mechanism is mandatory; missing heartbeat response triggers disconnect |
| R5 | **AI-generated code quality shortfall** | 30% | 8/10 | 2.40 | Modular generation; per-sprint human checkpoints | No change |
| R6 | **LangChain.js version/API change** | 25% (↓ from PRD 30%) | 5/10 | 1.25 | Pin to `@langchain/core >= 1.1.8`, `langchain >= 1.2.3`; use stable LCEL patterns (RunnableSequence, ChatPromptTemplate) [trace:step-4:section-2.3] | Research found zod@4 support still unstable; pin zod@^3.23 specifically |
| R7 | **Performance bottleneck (time-series queries)** | 15% (↓ from PRD 20%) | 5/10 | 0.75 | TimescaleDB continuous aggregates; composite indexes for sort queries; 40-50x headroom confirmed | Benchmarks show 2,500 rows/sec is 2-4% of capacity [trace:step-2:section-6.2]; risk reduced |
| R8 | **News data source limitation** | 10% (↓ from PRD 15%) | 4/10 | 0.40 | 3 sources confirmed: Naver (25K/day), 9 RSS feeds, DART | Budget analysis shows 42% Naver API usage for 50-stock monitoring [trace:step-5:section-1.6]; ample headroom |
| R9 | **LangChain/LangGraph security vulnerability** | 40% | 8/10 | 3.20 | Mandatory patches: CVE-2025-68665 (CVSS 8.6) [trace:step-4:section-6]; input/output sanitization layer [trace:step-4:section-6.4]; `secretsFromEnv: false` default | Research provided exact patched versions and sanitization code patterns |
| **R10** (NEW) | **41-subscription WebSocket limit constrains real-time coverage** | 60% | 5/10 | 3.00 | 3-tier subscription management (WS/polling/on-demand); dynamic subscription rotation based on user demand | This is a hard platform limit that cannot be bypassed [trace:step-1:section-2.9] |
| **R11** (NEW) | **KIS WebSocket uses unencrypted ws:// protocol** | 100% (certain) | 3/10 | 3.00 | Accept as platform limitation; NestJS backend connects to KIS on internal network; all user-facing traffic encrypted via Cloudflare Tunnel | Cannot be mitigated technically; KIS does not offer wss:// [trace:step-1:section-2.1] |
| **R12** (NEW) | **98GB SSD storage exhaustion** | 35% | 7/10 | 2.45 | Compression mandatory (90%+ reduction); 365-day retention policy; steady-state ~70-75 GB [trace:step-2:section-7.5]; monitor daily with alerts at 80% usage | Without compression, disk fills in 14 days [trace:step-2:section-6.4] |
| **R13** (NEW) | **Prisma 7 ESM-only migration complexity** | 25% | 4/10 | 1.00 | Prisma 7 is ESM-only with output outside node_modules [trace:step-2:section-4.1]; all NestJS module imports must be ESM-compatible; test early in scaffolding phase | First-time Prisma 7 integration in NestJS 11 may surface edge cases |
| **R14** (NEW) | **Korean full-text search accuracy without morphological analyzer** | 30% | 3/10 | 0.90 | `'simple'` tsvector config works for keyword-level matching; `pg_cjk_parser` provides 2-gram tokenization for better Korean support [trace:step-5:section-7.2]; install during DB setup | Degraded search quality is acceptable for MVP; upgrade path clear |
| **R15** (NEW) | **No official KIS TypeScript SDK — custom client maintenance burden** | 50% | 4/10 | 2.00 | Build custom TypeScript client using patterns from Step 1 Section 9 [trace:step-1:section-9]; encapsulate in dedicated module (`kis-api.service.ts`, `kis-websocket.service.ts`); API changes require manual client updates | All reference code is Python; TypeScript patterns must be hand-translated |

**Top 5 risks by score**:
1. R9 — LangChain security (3.20)
2. R10 — 41-subscription limit (3.00)
3. R11 — Unencrypted KIS WebSocket (3.00)
4. R3 — AI code technical debt (2.80)
5. R1 — AI hallucination (2.70)

---

## 6. Implementation Priority Matrix

Features ranked by technical dependency (must-build-first), complexity (from research), and business value (from PRD).

### Phase 1: Foundation (Sprint 1 — Day 3-5)

| Priority | Feature | Dependency | Complexity | Business Value | Rationale |
|----------|---------|-----------|-----------|---------------|-----------|
| 1 | Project scaffolding (Turborepo + NestJS + Next.js + Docker Compose) | None | LOW | — | Everything depends on this |
| 2 | PostgreSQL 17 + TimescaleDB setup (Docker + extensions + schema DDL) | Scaffolding | MEDIUM | — | All data depends on DB |
| 3 | Prisma 7 schema + migrations (hybrid approach) | DB setup | MEDIUM | — | ORM layer for all modules |
| 4 | KIS REST authentication module (token lifecycle, rate limiter) | Scaffolding | MEDIUM | HIGH | All stock data depends on auth |
| 5 | KIS REST market data service (current price, OHLCV, rankings) | Auth module | MEDIUM | HIGH | Dashboard requires stock data |
| 6 | KIS WebSocket service (real-time prices, PINGPONG, reconnect) | Auth module | HIGH | HIGH | Core differentiator: real-time |
| 7 | Redis setup + stock price cache (TTL 5s) | Docker setup | LOW | MEDIUM | Performance layer for real-time flow |
| 8 | Batch INSERT pipeline (buffer → UNNEST → stock_prices) | DB + KIS WS | MEDIUM | HIGH | Persistent storage of time-series |

### Phase 2: Core Features (Sprint 2 — Day 6-9)

| Priority | Feature | Dependency | Complexity | Business Value | Rationale |
|----------|---------|-----------|-----------|---------------|-----------|
| 9 | Better Auth setup (email/password, session, role-based) | Scaffolding | MEDIUM | HIGH | All user features require auth |
| 10 | Next.js dashboard shell (App Router, PPR, layout, middleware) | Scaffolding | MEDIUM | HIGH | Frontend foundation |
| 11 | Socket.IO Gateway + frontend connection | KIS WS service | MEDIUM | HIGH | Real-time data to browser |
| 12 | React Grid Layout dashboard with 8 widget types | Dashboard shell | HIGH | HIGH | Core user experience |
| 13 | TradingView Lightweight Charts candlestick widget | Socket.IO + layout | MEDIUM | HIGH | Primary chart visualization |
| 14 | Watchlist CRUD (API + UI) | Auth + DB | MEDIUM | HIGH | Core user feature |
| 15 | Stock filtering/sorting (API + UI) | Stock data service | MEDIUM | HIGH | PRD §3.2 requirement |

### Phase 3: Intelligence Layer (Sprint 2-3 — Day 8-12)

| Priority | Feature | Dependency | Complexity | Business Value | Rationale |
|----------|---------|-----------|-----------|---------------|-----------|
| 16 | News ingestion: Naver API + RSS + DART services | Scaffolding | MEDIUM | HIGH | News feed + AI analysis input |
| 17 | News deduplication pipeline (3-layer) | News ingestion | MEDIUM | MEDIUM | Quality of news feed |
| 18 | News-stock relevance scoring (keyword layer) | News ingestion + stocks | MEDIUM | MEDIUM | Maps news to stocks |
| 19 | LangGraph.js surge analysis pipeline (5 nodes) | News services + KIS API | HIGH | HIGH | Core AI differentiator |
| 20 | Quality Gate 3 layers (L1 Zod, L2 semantic, L3 factual) | AI pipeline | HIGH | CRITICAL | Hallucination defense |
| 21 | News summarization service (gpt-4o-mini) | News ingestion + LangChain | MEDIUM | MEDIUM | News widget enhancement |
| 22 | Theme group management (API + UI) | DB + stock data | MEDIUM | MEDIUM | PRD §3.3 requirement |

### Phase 4: Polish and Integration (Sprint 3-4 — Day 10-14+)

| Priority | Feature | Dependency | Complexity | Business Value | Rationale |
|----------|---------|-----------|-----------|---------------|-----------|
| 23 | Surge alert system (user-configurable threshold) | KIS WS + AI pipeline | MEDIUM | HIGH | Automated monitoring |
| 24 | Recharts widgets (market indices, theme summary, top volume) | Data services | LOW | MEDIUM | Dashboard completeness |
| 25 | Admin panel (API key management, data collection status) | Auth (admin role) | MEDIUM | MEDIUM | Operational management |
| 26 | TimescaleDB continuous aggregates + technical indicator views | DB setup | MEDIUM | MEDIUM | Chart overlays (MA, RSI, etc.) |
| 27 | Docker Compose production config + Cloudflare Tunnel | All modules | MEDIUM | HIGH | Deployment |
| 28 | E2E tests (Playwright, 10 core scenarios) | All features | MEDIUM | HIGH | Quality assurance |
| 29 | Sentry integration + error monitoring | Deployment | LOW | MEDIUM | Operational visibility |

---

## 7. Remaining Unknowns

### 7.1 Questions Research Could Not Fully Answer

| # | Question | Impact | Recommended Action |
|---|---------|--------|-------------------|
| 1 | What is the exact behavior of KIS WebSocket under heavy subscriber load (approaching 41 limit) — does it degrade gracefully or hard-disconnect? | HIGH | Spike test during Sprint 1: subscribe to 40 symbols in simulation environment; observe behavior at boundary |
| 2 | Does TimescaleDB compression work correctly with Prisma 7's `$executeRaw` for UNNEST batch inserts on recently-compressed chunks? | MEDIUM | PoC in Sprint 1: insert into a chunk, compress it, then attempt UNNEST insert into a new chunk to verify no interaction issues |
| 3 | How does Better Auth 1.x handle concurrent sessions across multiple browser tabs on the same machine? | LOW | Test during auth implementation in Sprint 2 |
| 4 | What is the actual latency from KIS WebSocket message receipt to frontend chart update in the full pipeline (KIS → NestJS → Redis → Socket.IO → browser)? | HIGH | End-to-end latency measurement needed in Sprint 2; PRD target is <5 seconds [trace:PRD:section-3.1] |
| 5 | Can Next.js 16 PPR work correctly with the Socket.IO client-side provider pattern? | MEDIUM | Verify during Sprint 2 frontend scaffolding; fallback to Next.js 15 if PPR issues arise |
| 6 | What is the actual DART API daily call limit? Documentation is ambiguous ("~10,000 inferred") | LOW | Monitor during implementation; implement conservative rate limiting with backoff |

### 7.2 Areas Needing Spike/PoC During Implementation

| Spike | Sprint | Duration | Success Criteria |
|-------|--------|----------|-----------------|
| KIS WebSocket 41-symbol subscription management | Sprint 1 | 2-4 hours | Successfully subscribe/unsubscribe dynamically; PINGPONG maintained; auto-reconnect with re-subscription |
| Prisma 7 + TimescaleDB hybrid migration flow | Sprint 1 | 2-3 hours | `prisma migrate dev` creates tables; custom SQL migration converts to hypertable; TypedSQL queries execute correctly |
| LangGraph.js quality gate retry loop | Sprint 2-3 | 3-4 hours | Analyzer → QG fail → Analyzer (retry with feedback) → QG pass, within 3-retry budget |
| Socket.IO room-based stock subscription at scale (50+ concurrent symbols) | Sprint 2 | 2-3 hours | Frontend subscribes to 50 symbols; price updates arrive at <100ms latency; unsubscribe cleans up correctly |

### 7.3 External Dependencies (Accounts and Keys Required)

| Dependency | Provider | Status | Required For | Action |
|-----------|----------|--------|-------------|--------|
| KIS brokerage account + API credentials | Korea Investment & Securities | **Required before Sprint 1** | All stock data (REST + WebSocket) | Open account at KIS; register at apiportal.koreainvestment.com; obtain App Key + App Secret for both production and simulation |
| Naver Developer account + API key | Naver | **Required before Sprint 2** | News search API | Register at developers.naver.com; create application; obtain Client ID + Secret |
| DART API key | Financial Supervisory Service | **Required before Sprint 2** | Disclosure data | Register at opendart.fss.or.kr; obtain 40-character API key (max 2 per entity) |
| Anthropic API key | Anthropic | **Required before Sprint 2-3** | AI surge analysis (Claude Sonnet) | Obtain from console.anthropic.com; estimated $22-36/month |
| OpenAI API key | OpenAI | **Required before Sprint 2-3** | News summarization (gpt-4o-mini) | Obtain from platform.openai.com; estimated ~$90/month for summarization |
| Cloudflare account | Cloudflare | **Required before Sprint 4** | Cloudflare Tunnel for external access | Free tier sufficient; create tunnel for the mini-PC |
| GitHub repository | GitHub | **Required before Sprint 0** | Source control + CI/CD | Free tier sufficient |
| Sentry account | Sentry | **Required before Sprint 4** | Error monitoring | Free tier (5K errors/month) sufficient |

---

## 8. Context Reset Recovery Section

### Project Identity

| Field | Value |
|-------|-------|
| **Project Name** | Stock Monitoring Dashboard |
| **Purpose** | Widget-based PC web dashboard integrating Korean stock data, news, and AI surge analysis |
| **Type** | Client deliverable (outsourced project); AI agentic workflow auto-build |
| **Target Users** | Individual Korean stock investors (desktop, 1920x1080+) |
| **Deployment** | Mini-PC (Ryzen 5 5500U, 16GB RAM, 98GB SSD) + Docker Compose + Cloudflare Tunnel |

### Current Phase

| Field | Value |
|-------|-------|
| **Phase** | Research Phase COMPLETE. Ready for Planning Phase. |
| **This Document** | Research Phase Gate — the single technical reference for all subsequent phases |
| **Next Step** | Planning Phase Step 7: Architecture blueprint and module specification |

### Key File Paths

```
C:\dev\03-1_outsourcing_team\stock-monitoring-dashboard\
├── docs\PRD.md                              ← Product Requirements Document v2.0
├── research\
│   ├── step-1-kis-api-research.md           ← KIS OpenAPI (REST + WebSocket)
│   ├── step-2-database-research.md          ← PostgreSQL 17 + TimescaleDB + Prisma 7
│   ├── step-3-frontend-research.md          ← Next.js + Charts + State + Socket.IO
│   ├── step-4-ai-pipeline-research.md       ← LangGraph.js + Quality Gate
│   ├── step-5-news-research.md              ← Naver + RSS + DART + Dedup + Scoring
│   └── step-6-research-synthesis.md         ← THIS FILE (Research Phase Gate)
├── workflow.md                              ← Workflow definition
└── state.yaml                               ← SOT state file
```

### Critical Decisions Made

1. **Balanced-Tech stack confirmed**: NestJS 11 + Next.js 15/16 + PostgreSQL 17 + TimescaleDB + LangChain.js 1.2 + Socket.IO 4.x [trace:PRD:section-4.1]
2. **1-day chunk interval** for TimescaleDB hypertable (not 1-week) [trace:step-2:section-1.3]
3. **No space partitioning** on TimescaleDB (single-node deployment) [trace:step-2:section-1.4]
4. **Prisma 7 hybrid approach**: Prisma Client for CRUD + TypedSQL/raw SQL for TimescaleDB features [trace:step-2:section-4.3]
5. **15 req/s token bucket** for KIS REST API (not 20 req/s nominal limit) [trace:step-1:section-4.5]
6. **Custom TypeScript KIS client** required (no official SDK exists) [trace:step-1:section-7.3]
7. **Claude Sonnet 4.6** as default AI model for surge analysis ($0.024/request) [trace:step-4:section-7.3]
8. **gpt-4o-mini** for news summarization (10x cheaper than gpt-4o; quality sufficient) [trace:step-5:section-6.5]
9. **Pin zod@^3.23** (zod@4 LangChain support unstable) [trace:step-4:section-2.2]
10. **Step 5 news schema** supersedes Step 2 simplified news table [section-3.5 above]
11. **3-tier subscription management** for 41-symbol WebSocket limit (WS/polling/on-demand) [section-4.3 above]
12. **pg_cjk_parser** recommended for Korean full-text search (install during DB setup) [trace:step-5:section-7.2]
13. **Korean color convention**: up=red (#EF4444), down=blue (#3B82F6) applied globally [trace:step-3:section-2.2]
14. **6-layer hallucination defense**: structured output → citation → fact-grounding → L2 self-consistency → L3 factual → domain glossary [trace:step-4:section-5]
15. **Compression mandatory** on TimescaleDB (without it, 98GB SSD fills in 14 days) [trace:step-2:section-6.4]

### Package Version Constraints

```json
{
  "node": "22.x (LTS)",
  "typescript": "5.x (strict mode)",
  "next": "15.x or 16.x",
  "react": "19.x",
  "@nestjs/core": "11.x",
  "prisma": "7.x",
  "socket.io": "4.x",
  "socket.io-client": "4.x",
  "@langchain/core": ">=1.1.8",
  "@langchain/langgraph": ">=0.2.40",
  "@langchain/anthropic": ">=0.3.14",
  "@langchain/openai": ">=0.4.6",
  "langchain": ">=1.2.3",
  "zod": "^3.23",
  "zustand": "5.x",
  "@tanstack/react-query": "5.x",
  "react-grid-layout": "2.x",
  "lightweight-charts": "4.x",
  "recharts": "2.x",
  "redis": "8.x"
}
```

---

**End of Research Synthesis. This document is the authoritative reference for the Planning and Implementation phases.**
