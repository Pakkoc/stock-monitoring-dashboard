# Step 7: System Architecture — Modular Monolith Blueprint

> **Agent**: `@system-architect`
> **Date**: 2026-03-27
> **Status**: Complete (Planning Phase)
> **Inputs**: Step 6 Research Synthesis + PRD v2.0 (Sections 4.2-4.3)
> **Purpose**: Definitive architecture reference for Implementation phase

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Turborepo Monorepo Structure](#2-turborepo-monorepo-structure)
3. [Module Boundaries and Responsibilities](#3-module-boundaries-and-responsibilities)
4. [Module Communication Patterns](#4-module-communication-patterns)
5. [Dependency Flow Diagram](#5-dependency-flow-diagram)
6. [Detailed Module Specifications](#6-detailed-module-specifications)
7. [Docker Compose Services](#7-docker-compose-services)
8. [Environment Configuration](#8-environment-configuration)
9. [Error Handling Architecture](#9-error-handling-architecture)
10. [Fitness Functions](#10-fitness-functions)
11. [Data Flow Architecture](#11-data-flow-architecture)
12. [Security Architecture](#12-security-architecture)

---

## 1. Architecture Overview

### 1.1 Architecture Style: Modular Monolith

The Stock Monitoring Dashboard adopts a **Modular Monolith** architecture deployed as a single NestJS 11 process. This is the optimal choice for the deployment target (mini-PC with Ryzen 5 5500U, 16GB RAM, 98GB SSD) where microservices would introduce unnecessary network overhead, operational complexity, and resource consumption. The modular monolith provides clear module boundaries with explicit interfaces, enabling future extraction to microservices if scaling demands arise — a "modular monolith today, microservices tomorrow" escape hatch.

**Key architectural principles**:

- **Clean Architecture dependency rule**: outer layers depend on inner layers, never the reverse. Domain logic has zero knowledge of infrastructure.
- **Module isolation**: each module encapsulates its own controllers, services, DTOs, and domain types. Cross-module access is permitted only through exported interfaces.
- **Single process, multiple modules**: all 7 NestJS modules run in the same Node.js process, enabling synchronous in-process calls where latency matters (e.g., stock data lookup during AI analysis) and asynchronous event-driven communication where decoupling matters (e.g., surge detection triggering alerts).
- **Shared infrastructure layer**: database access (Prisma), caching (Redis), scheduling (Bull), logging, and rate limiting are centralized in SharedModule to prevent duplication and ensure consistent configuration.

### 1.2 High-Level Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        BROWSER["Browser (PC Web 1920x1080+)"]
    end

    subgraph "Frontend Application"
        NEXTJS["Next.js 16 + React 19<br/>PPR + App Router<br/>shadcn/ui + TailwindCSS 4"]
    end

    subgraph "API Gateway Layer"
        REST["REST API<br/>(NestJS Controllers)"]
        WSGW["Socket.IO Gateway<br/>(WebSocket)"]
    end

    subgraph "NestJS 11 — Modular Monolith"
        direction TB

        subgraph "Domain Modules"
            STOCK["StockModule"]
            NEWS["NewsModule"]
            AIAGENT["AiAgentModule"]
            PORTFOLIO["PortfolioModule"]
            ADMIN["AdminModule"]
        end

        AUTH["AuthModule"]
        SHARED["SharedModule<br/>(Prisma, Redis, Bull, Logger, RateLimiter, Scheduler)"]
    end

    subgraph "Data Layer"
        PG["PostgreSQL 17<br/>+ TimescaleDB"]
        REDIS["Redis 8"]
    end

    subgraph "External Services"
        KIS["KIS OpenAPI<br/>(REST + WebSocket)"]
        NAVER["Naver Search API"]
        RSS["RSS Feeds (9)"]
        DART["DART API"]
        LLM["LLM Providers<br/>(Claude / GPT-4o-mini)"]
    end

    BROWSER <-->|"HTTPS + WSS<br/>(via Cloudflare Tunnel)"| NEXTJS
    NEXTJS <-->|"REST + Socket.IO"| REST
    NEXTJS <-->|"Socket.IO"| WSGW

    REST --> STOCK & NEWS & AIAGENT & PORTFOLIO & ADMIN
    WSGW --> STOCK

    STOCK & NEWS & AIAGENT & PORTFOLIO & ADMIN --> AUTH
    STOCK & NEWS & AIAGENT & PORTFOLIO & ADMIN --> SHARED

    SHARED --> PG & REDIS
    STOCK -->|"REST + WS"| KIS
    NEWS -->|"REST"| NAVER
    NEWS -->|"HTTP"| RSS
    NEWS -->|"REST"| DART
    AIAGENT -->|"HTTPS"| LLM
```

---

## 2. Turborepo Monorepo Structure

The project uses **Turborepo** with **pnpm workspaces** for monorepo management, separating the backend API and frontend web application into distinct apps, with shared packages for types, configurations, and tooling.

```
stock-monitoring-dashboard/
├── apps/
│   ├── api/                           # NestJS 11 Backend
│   │   ├── src/
│   │   │   ├── main.ts               # Bootstrap + global pipes/filters
│   │   │   ├── app.module.ts          # Root module — imports all domain modules
│   │   │   ├── modules/
│   │   │   │   ├── stock/             # StockModule
│   │   │   │   │   ├── stock.module.ts
│   │   │   │   │   ├── controllers/
│   │   │   │   │   │   ├── stock.controller.ts
│   │   │   │   │   │   └── stock-realtime.gateway.ts  # Socket.IO Gateway
│   │   │   │   │   ├── services/
│   │   │   │   │   │   ├── kis-rest.service.ts        # KIS REST API client
│   │   │   │   │   │   ├── kis-websocket.service.ts   # KIS WebSocket client
│   │   │   │   │   │   ├── stock-data.service.ts      # Aggregation & queries
│   │   │   │   │   │   ├── price-buffer.service.ts    # In-memory → batch INSERT
│   │   │   │   │   │   ├── subscription-manager.service.ts  # 41-sub limit mgmt
│   │   │   │   │   │   └── market-index.service.ts    # KOSPI/KOSDAQ indices
│   │   │   │   │   ├── dto/
│   │   │   │   │   ├── interfaces/
│   │   │   │   │   │   └── stock-module.interface.ts   # Exported module contract
│   │   │   │   │   └── __tests__/
│   │   │   │   ├── news/              # NewsModule
│   │   │   │   │   ├── news.module.ts
│   │   │   │   │   ├── controllers/
│   │   │   │   │   │   └── news.controller.ts
│   │   │   │   │   ├── services/
│   │   │   │   │   │   ├── naver-news.service.ts      # Naver Search API
│   │   │   │   │   │   ├── rss-feed.service.ts        # RSS feed parser
│   │   │   │   │   │   ├── dart-disclosure.service.ts # DART API client
│   │   │   │   │   │   ├── news-dedup.service.ts      # 3-layer deduplication
│   │   │   │   │   │   ├── news-relevance.service.ts  # Keyword + NLP scoring
│   │   │   │   │   │   └── news-summarizer.service.ts # gpt-4o-mini summarization
│   │   │   │   │   ├── dto/
│   │   │   │   │   ├── interfaces/
│   │   │   │   │   │   └── news-module.interface.ts
│   │   │   │   │   └── __tests__/
│   │   │   │   ├── ai-agent/          # AiAgentModule
│   │   │   │   │   ├── ai-agent.module.ts
│   │   │   │   │   ├── controllers/
│   │   │   │   │   │   └── ai-analysis.controller.ts
│   │   │   │   │   ├── services/
│   │   │   │   │   │   ├── surge-analysis.service.ts  # LangGraph orchestrator
│   │   │   │   │   │   ├── quality-gate.service.ts    # L1/L2/L3 validation
│   │   │   │   │   │   └── confidence-scorer.service.ts
│   │   │   │   │   ├── graph/
│   │   │   │   │   │   ├── surge-graph.ts             # StateGraph definition
│   │   │   │   │   │   ├── nodes/
│   │   │   │   │   │   │   ├── data-collector.node.ts
│   │   │   │   │   │   │   ├── news-searcher.node.ts
│   │   │   │   │   │   │   ├── analyzer.node.ts
│   │   │   │   │   │   │   ├── quality-gate.node.ts
│   │   │   │   │   │   │   └── result-formatter.node.ts
│   │   │   │   │   │   └── state.ts                   # Annotation.Root (9 channels)
│   │   │   │   │   ├── prompts/
│   │   │   │   │   │   ├── surge-analysis.prompt.ts
│   │   │   │   │   │   └── domain-glossary.ts
│   │   │   │   │   ├── dto/
│   │   │   │   │   ├── interfaces/
│   │   │   │   │   │   └── ai-agent-module.interface.ts
│   │   │   │   │   └── __tests__/
│   │   │   │   ├── portfolio/         # PortfolioModule
│   │   │   │   │   ├── portfolio.module.ts
│   │   │   │   │   ├── controllers/
│   │   │   │   │   │   ├── watchlist.controller.ts
│   │   │   │   │   │   └── alert.controller.ts
│   │   │   │   │   ├── services/
│   │   │   │   │   │   ├── watchlist.service.ts
│   │   │   │   │   │   ├── alert.service.ts
│   │   │   │   │   │   └── surge-detector.service.ts  # Threshold comparison
│   │   │   │   │   ├── dto/
│   │   │   │   │   ├── interfaces/
│   │   │   │   │   │   └── portfolio-module.interface.ts
│   │   │   │   │   └── __tests__/
│   │   │   │   ├── admin/             # AdminModule
│   │   │   │   │   ├── admin.module.ts
│   │   │   │   │   ├── controllers/
│   │   │   │   │   │   └── admin.controller.ts
│   │   │   │   │   ├── services/
│   │   │   │   │   │   ├── system-status.service.ts
│   │   │   │   │   │   ├── api-key-manager.service.ts
│   │   │   │   │   │   └── data-collection-monitor.service.ts
│   │   │   │   │   ├── dto/
│   │   │   │   │   └── __tests__/
│   │   │   │   ├── auth/              # AuthModule
│   │   │   │   │   ├── auth.module.ts
│   │   │   │   │   ├── controllers/
│   │   │   │   │   │   └── auth.controller.ts
│   │   │   │   │   ├── services/
│   │   │   │   │   │   └── auth.service.ts            # Better Auth integration
│   │   │   │   │   ├── guards/
│   │   │   │   │   │   ├── auth.guard.ts              # JWT/session verification
│   │   │   │   │   │   └── roles.guard.ts             # Role-based access (admin/user)
│   │   │   │   │   ├── decorators/
│   │   │   │   │   │   ├── current-user.decorator.ts
│   │   │   │   │   │   └── roles.decorator.ts
│   │   │   │   │   └── __tests__/
│   │   │   │   └── shared/            # SharedModule
│   │   │   │       ├── shared.module.ts
│   │   │   │       ├── database/
│   │   │   │       │   ├── prisma.service.ts          # Prisma Client wrapper
│   │   │   │       │   └── typed-sql/                 # TypedSQL queries for TimescaleDB
│   │   │   │       ├── cache/
│   │   │   │       │   └── redis.service.ts           # Redis client + helpers
│   │   │   │       ├── queue/
│   │   │   │       │   └── bull.config.ts             # Bull queue configuration
│   │   │   │       ├── scheduler/
│   │   │   │       │   └── scheduler.service.ts       # Cron-based tasks
│   │   │   │       ├── logger/
│   │   │   │       │   └── app-logger.service.ts      # Structured JSON logger
│   │   │   │       ├── rate-limiter/
│   │   │   │       │   └── rate-limiter.service.ts    # Token bucket (KIS API)
│   │   │   │       ├── event-bus/
│   │   │   │       │   └── event-bus.service.ts       # EventEmitter wrapper
│   │   │   │       ├── filters/
│   │   │   │       │   └── global-exception.filter.ts
│   │   │   │       ├── interceptors/
│   │   │   │       │   └── logging.interceptor.ts
│   │   │   │       └── pipes/
│   │   │   │           └── validation.pipe.ts
│   │   │   └── config/
│   │   │       ├── app.config.ts                      # @nestjs/config schema
│   │   │       ├── database.config.ts
│   │   │       ├── redis.config.ts
│   │   │       ├── kis.config.ts
│   │   │       └── ai.config.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma                          # Prisma 7 schema (ESM-only)
│   │   │   └── migrations/
│   │   │       ├── 001_init/migration.sql             # Standard tables
│   │   │       ├── 002_timescaledb/migration.sql      # Hypertable + compression + retention
│   │   │       └── 003_continuous_aggregates/migration.sql  # daily_ohlcv + indicator views
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── package.json
│   │
│   └── web/                           # Next.js 16 Frontend
│       ├── src/
│       │   ├── app/                   # App Router
│       │   │   ├── layout.tsx         # Root layout (providers, fonts, metadata)
│       │   │   ├── page.tsx           # Landing / redirect to dashboard
│       │   │   ├── (auth)/
│       │   │   │   ├── login/page.tsx
│       │   │   │   └── signup/page.tsx
│       │   │   ├── (dashboard)/
│       │   │   │   ├── layout.tsx     # Dashboard layout (sidebar, header)
│       │   │   │   ├── page.tsx       # Main dashboard (widget grid)
│       │   │   │   └── stock/[symbol]/page.tsx  # Stock detail
│       │   │   ├── admin/
│       │   │   │   ├── layout.tsx     # Admin layout (admin role guard)
│       │   │   │   ├── page.tsx       # System status
│       │   │   │   ├── api-keys/page.tsx
│       │   │   │   └── users/page.tsx
│       │   │   └── api/auth/[...all]/route.ts  # Better Auth API handler
│       │   ├── components/
│       │   │   ├── widgets/
│       │   │   │   ├── WatchlistWidget.tsx
│       │   │   │   ├── CandlestickWidget.tsx
│       │   │   │   ├── NewsFeedWidget.tsx
│       │   │   │   ├── ThemeSummaryWidget.tsx
│       │   │   │   ├── SurgeAlertsWidget.tsx
│       │   │   │   ├── AiAnalysisWidget.tsx
│       │   │   │   ├── MarketIndicesWidget.tsx
│       │   │   │   └── TopVolumeWidget.tsx
│       │   │   ├── dashboard/
│       │   │   │   └── DashboardGrid.tsx  # React Grid Layout container
│       │   │   ├── charts/
│       │   │   │   ├── TradingViewChart.tsx
│       │   │   │   └── RechartsWrapper.tsx
│       │   │   └── ui/                # shadcn/ui components
│       │   ├── hooks/
│       │   │   ├── useRealtimeChartUpdates.ts
│       │   │   ├── useSocket.ts
│       │   │   └── useAuth.ts
│       │   ├── stores/
│       │   │   ├── dashboard-layout.store.ts   # Zustand + persist
│       │   │   ├── user-preferences.store.ts
│       │   │   └── realtime.store.ts
│       │   ├── lib/
│       │   │   ├── api-client.ts      # Fetch wrapper for API
│       │   │   ├── socket-client.ts   # Socket.IO singleton
│       │   │   ├── query-keys.ts      # TanStack Query key hierarchy
│       │   │   └── auth-client.ts     # Better Auth client
│       │   ├── providers/
│       │   │   ├── QueryProvider.tsx   # TanStack Query provider
│       │   │   ├── SocketProvider.tsx  # Socket.IO context
│       │   │   └── AuthProvider.tsx    # Better Auth session provider
│       │   └── types/                 # Frontend-only types (re-exports from @shared)
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── package.json
│
├── packages/
│   ├── shared/                        # Shared Types, Utils, Constants
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── stock.types.ts     # RealTimePrice, StockInfo, OHLCV, etc.
│   │   │   │   ├── news.types.ts      # NewsArticle, DartDisclosure, etc.
│   │   │   │   ├── ai.types.ts        # AnalysisResult, QualityGateResult, etc.
│   │   │   │   ├── portfolio.types.ts # Watchlist, Alert, etc.
│   │   │   │   ├── auth.types.ts      # User, Role, Session
│   │   │   │   ├── api.types.ts       # API response wrappers, pagination
│   │   │   │   └── events.types.ts    # Socket.IO event payloads
│   │   │   ├── constants/
│   │   │   │   ├── socket-events.ts   # price:update, alert:surge, news:update, index:update
│   │   │   │   ├── korean-colors.ts   # UP_RED=#EF4444, DOWN_BLUE=#3B82F6
│   │   │   │   └── api-endpoints.ts   # Endpoint path constants
│   │   │   ├── utils/
│   │   │   │   ├── number-format.ts   # Korean number formatting (천 단위 콤마)
│   │   │   │   ├── date-utils.ts      # KST timezone helpers
│   │   │   │   └── validators.ts      # Zod schemas shared between frontend and backend
│   │   │   └── index.ts               # Barrel export
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── eslint-config/                 # Shared ESLint Configuration
│   │   ├── base.js                    # Common rules
│   │   ├── nestjs.js                  # NestJS-specific rules
│   │   ├── nextjs.js                  # Next.js-specific rules
│   │   └── package.json
│   │
│   └── tsconfig/                      # Shared TypeScript Configuration
│       ├── base.json                  # Strict mode, ESM, target ES2022
│       ├── nestjs.json                # NestJS overrides (decorators, etc.)
│       ├── nextjs.json                # Next.js overrides (jsx, paths)
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml             # Development environment
│   ├── docker-compose.prod.yml        # Production environment (mini-PC)
│   ├── Dockerfile.api                 # NestJS multi-stage build
│   ├── Dockerfile.web                 # Next.js multi-stage build
│   └── init-scripts/
│       └── 01-init-timescaledb.sql    # CREATE EXTENSION timescaledb; pg_cjk_parser
│
├── .env.example                       # Template for environment variables
├── .gitignore
├── turbo.json                         # Turborepo pipeline configuration
├── pnpm-workspace.yaml                # pnpm workspace definition
├── package.json                       # Root package.json
└── README.md
```

### 2.1 Turborepo Pipeline Configuration

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "db:migrate": {
      "cache": false
    },
    "db:generate": {
      "cache": false
    }
  }
}
```

### 2.2 pnpm Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## 3. Module Boundaries and Responsibilities

### 3.1 Module Boundary Matrix

Each module has a clearly defined boundary. Cross-module communication is permitted only through exported interfaces and the event bus. Direct imports of internal services across module boundaries are prohibited.

| Module | Owns | Exposes (Public Interface) | Consumes |
|--------|------|---------------------------|----------|
| **StockModule** | KIS API clients, price data, market indices, subscription management, price buffer | `IStockDataService`: getCurrentPrice, getHistoricalPrices, getStockInfo, searchStocks, filterStocks, getRankings, getMarketIndices | SharedModule |
| **NewsModule** | News collection services (Naver, RSS, DART), dedup pipeline, relevance scoring, summarization | `INewsService`: getNewsByStock, searchNews, getLatestNews, getDartDisclosures, getNewsSummary | SharedModule |
| **AiAgentModule** | LangGraph surge pipeline, quality gate, confidence scoring | `IAiAnalysisService`: analyzeSurge, getAnalysis, getAnalysisHistory, retriggerAnalysis | SharedModule, StockModule (IStockDataService), NewsModule (INewsService) |
| **PortfolioModule** | Watchlists, alerts, surge detection, threshold management | `IPortfolioService`: CRUD watchlists, CRUD alerts, getActiveAlerts, getSurgeAlerts | SharedModule, StockModule (IStockDataService) |
| **AdminModule** | System settings, API key management, data collection monitoring, user management | `IAdminService`: getSystemStatus, getCollectionStats, manageApiKeys, listUsers | SharedModule, StockModule, NewsModule |
| **AuthModule** | Better Auth integration, user registration, login, session, role-based access control | `IAuthService`: signup, login, logout, validateSession, getUserRoles; Guards: AuthGuard, RolesGuard | SharedModule |
| **SharedModule** | Prisma, Redis, Bull, Logger, Scheduler, RateLimiter, EventBus, GlobalExceptionFilter | All infrastructure services exported as providers | — (leaf module, no domain dependencies) |

### 3.2 Module Dependency Rules

```
RULE 1: Domain modules MAY import SharedModule (infrastructure).
RULE 2: Domain modules MAY import AuthModule (guards and decorators).
RULE 3: AiAgentModule MAY import StockModule and NewsModule (data providers for analysis).
RULE 4: PortfolioModule MAY import StockModule (price data for surge detection).
RULE 5: AdminModule MAY import StockModule and NewsModule (monitoring status).
RULE 6: SharedModule MUST NOT import any domain module (leaf dependency).
RULE 7: NO circular imports between domain modules. If StockModule needs to notify PortfolioModule, use the EventBus (async), not a direct import.
RULE 8: Frontend (web app) MUST NOT import backend code directly — only via @shared package types.
```

---

## 4. Module Communication Patterns

The modular monolith uses three communication mechanisms, each suited to a specific interaction pattern.

### 4.1 Synchronous Direct Import (In-Process DI)

Used for request-response interactions where the caller needs an immediate result. The NestJS dependency injection system manages these relationships.

```mermaid
sequenceDiagram
    participant Client as Frontend
    participant AIC as AiAnalysis Controller
    participant SAS as SurgeAnalysis Service
    participant SDS as StockData Service (StockModule)
    participant NS as News Service (NewsModule)

    Client->>AIC: POST /api/ai/analyze/005930
    AIC->>SAS: analyzeSurge("005930")
    SAS->>SDS: getCurrentPrice("005930")
    SDS-->>SAS: RealTimePrice
    SAS->>NS: getNewsByStock("005930", { limit: 10 })
    NS-->>SAS: NewsArticle[]
    SAS->>SAS: Execute LangGraph StateGraph
    SAS-->>AIC: AnalysisResult
    AIC-->>Client: 200 OK { analysis }
```

**Implementation pattern**: AiAgentModule imports StockModule and NewsModule in its `@Module()` declaration. The imported modules export their service interfaces, which NestJS injects into AiAgentModule's services.

```typescript
// ai-agent.module.ts
@Module({
  imports: [StockModule, NewsModule, SharedModule],
  controllers: [AiAnalysisController],
  providers: [SurgeAnalysisService, QualityGateService, ConfidenceScorerService],
  exports: [SurgeAnalysisService],
})
export class AiAgentModule {}
```

### 4.2 Asynchronous Event Bus (Node.js EventEmitter)

Used for fire-and-forget notifications where the emitter does not need a response and should not be coupled to the handler. The EventBus wraps Node.js `EventEmitter` with typed event definitions.

```mermaid
sequenceDiagram
    participant SM as StockModule
    participant EB as EventBus (SharedModule)
    participant PM as PortfolioModule
    participant WSGW as Socket.IO Gateway
    participant AI as AiAgentModule

    SM->>EB: emit("stock:price-update", { symbol, price, changeRate })
    EB-->>PM: on("stock:price-update") → SurgeDetector checks threshold
    PM->>PM: changeRate > user.surgeThreshold?
    alt Surge detected
        PM->>EB: emit("alert:surge-detected", { symbol, changeRate, userId })
        EB-->>WSGW: on("alert:surge-detected") → emit to user Socket.IO room
        EB-->>AI: on("alert:surge-detected") → Queue surge analysis job
    end
```

**Typed event definitions** (in `@shared` package):

```typescript
// packages/shared/src/types/events.types.ts
export interface StockEvents {
  'stock:price-update': { symbol: string; price: number; changeRate: number; timestamp: Date };
  'stock:market-close': { market: 'KOSPI' | 'KOSDAQ'; date: string };
}

export interface AlertEvents {
  'alert:surge-detected': { symbol: string; stockName: string; changeRate: number; userId: string; threshold: number };
  'alert:threshold-hit': { alertId: string; symbol: string; currentValue: number };
}

export interface NewsEvents {
  'news:new-article': { articleId: string; symbol: string; title: string; source: string };
  'news:dart-disclosure': { disclosureId: string; symbol: string; title: string };
}

export interface AiEvents {
  'ai:analysis-complete': { analysisId: string; symbol: string; confidence: number };
  'ai:analysis-failed': { symbol: string; reason: string; retryCount: number };
}
```

### 4.3 Module Interface Contracts

Each module exports a TypeScript interface that serves as its public API contract. Internal services, helpers, and implementation details are not exported.

```typescript
// modules/stock/interfaces/stock-module.interface.ts
export interface IStockDataService {
  getCurrentPrice(symbol: string): Promise<RealTimePrice | null>;
  getHistoricalPrices(symbol: string, params: HistoricalPriceParams): Promise<OHLCV[]>;
  getStockInfo(symbol: string): Promise<StockInfo | null>;
  searchStocks(query: string, params: SearchParams): Promise<PaginatedResult<StockInfo>>;
  filterStocks(filters: StockFilter): Promise<PaginatedResult<StockInfo>>;
  getRankings(type: RankingType, params: PaginationParams): Promise<PaginatedResult<StockRanking>>;
  getMarketIndices(): Promise<MarketIndex[]>;
}

// modules/news/interfaces/news-module.interface.ts
export interface INewsService {
  getNewsByStock(symbol: string, params: PaginationParams): Promise<PaginatedResult<NewsArticle>>;
  searchNews(query: string, params: SearchParams): Promise<PaginatedResult<NewsArticle>>;
  getLatestNews(params: PaginationParams): Promise<PaginatedResult<NewsArticle>>;
  getDartDisclosures(symbol: string): Promise<DartDisclosure[]>;
  getNewsSummary(articleIds: string[]): Promise<NewsSummary[]>;
}

// modules/ai-agent/interfaces/ai-agent-module.interface.ts
export interface IAiAnalysisService {
  analyzeSurge(symbol: string, options?: AnalysisOptions): Promise<AnalysisResult>;
  getAnalysis(analysisId: string): Promise<AnalysisResult | null>;
  getAnalysisHistory(symbol: string, params: PaginationParams): Promise<PaginatedResult<AnalysisResult>>;
}

// modules/portfolio/interfaces/portfolio-module.interface.ts
export interface IPortfolioService {
  // Watchlist
  getWatchlists(userId: string): Promise<Watchlist[]>;
  createWatchlist(userId: string, data: CreateWatchlistDto): Promise<Watchlist>;
  updateWatchlist(watchlistId: string, data: UpdateWatchlistDto): Promise<Watchlist>;
  deleteWatchlist(watchlistId: string): Promise<void>;
  addStockToWatchlist(watchlistId: string, symbol: string): Promise<WatchlistItem>;
  removeStockFromWatchlist(watchlistId: string, symbol: string): Promise<void>;
  // Alerts
  getAlerts(userId: string): Promise<Alert[]>;
  createAlert(userId: string, data: CreateAlertDto): Promise<Alert>;
  updateAlert(alertId: string, data: UpdateAlertDto): Promise<Alert>;
  deleteAlert(alertId: string): Promise<void>;
}
```

---

## 5. Dependency Flow Diagram

### 5.1 Module Dependency Graph (Directed Acyclic Graph)

```mermaid
graph TD
    subgraph "Layer 1: Presentation"
        REST_CTRL["REST Controllers"]
        WS_GW["Socket.IO Gateway"]
    end

    subgraph "Layer 2: Domain Modules"
        ADMIN["AdminModule"]
        AIAGENT["AiAgentModule"]
        PORTFOLIO["PortfolioModule"]
        STOCK["StockModule"]
        NEWS["NewsModule"]
    end

    subgraph "Layer 3: Cross-Cutting"
        AUTH["AuthModule"]
    end

    subgraph "Layer 4: Infrastructure"
        SHARED["SharedModule"]
    end

    subgraph "Layer 5: External"
        PG["PostgreSQL + TimescaleDB"]
        REDIS["Redis 8"]
        KIS_API["KIS OpenAPI"]
        NEWS_API["Naver/RSS/DART"]
        LLM_API["LLM Providers"]
    end

    REST_CTRL --> ADMIN & AIAGENT & PORTFOLIO & STOCK & NEWS & AUTH
    WS_GW --> STOCK

    ADMIN -->|"status queries"| STOCK
    ADMIN -->|"status queries"| NEWS
    ADMIN --> AUTH
    ADMIN --> SHARED

    AIAGENT -->|"stock data"| STOCK
    AIAGENT -->|"news data"| NEWS
    AIAGENT --> AUTH
    AIAGENT --> SHARED

    PORTFOLIO -->|"price data"| STOCK
    PORTFOLIO --> AUTH
    PORTFOLIO --> SHARED

    STOCK --> SHARED
    NEWS --> SHARED
    AUTH --> SHARED

    SHARED --> PG & REDIS
    STOCK -.->|"external"| KIS_API
    NEWS -.->|"external"| NEWS_API
    AIAGENT -.->|"external"| LLM_API

    classDef presentation fill:#E8F5E9,stroke:#4CAF50
    classDef domain fill:#E3F2FD,stroke:#2196F3
    classDef crosscutting fill:#FFF3E0,stroke:#FF9800
    classDef infra fill:#F3E5F5,stroke:#9C27B0
    classDef external fill:#FFEBEE,stroke:#F44336

    class REST_CTRL,WS_GW presentation
    class ADMIN,AIAGENT,PORTFOLIO,STOCK,NEWS domain
    class AUTH crosscutting
    class SHARED infra
    class PG,REDIS,KIS_API,NEWS_API,LLM_API external
```

### 5.2 Dependency Flow Validation

| From → To | Allowed? | Reason |
|-----------|----------|--------|
| AiAgentModule → StockModule | YES | AI analysis requires stock price data |
| AiAgentModule → NewsModule | YES | AI analysis requires news articles |
| PortfolioModule → StockModule | YES | Surge detection requires current price |
| AdminModule → StockModule | YES | Admin monitors data collection status |
| AdminModule → NewsModule | YES | Admin monitors news ingestion status |
| StockModule → PortfolioModule | NO | Would create circular dependency. Use EventBus instead. |
| NewsModule → AiAgentModule | NO | Would create circular dependency. Use EventBus instead. |
| SharedModule → Any Domain Module | NO | Infrastructure must be domain-agnostic. |
| Any Module → AuthModule | YES | All endpoints require authentication. |

### 5.3 Circular Dependency Prevention via EventBus

Two potential circular dependencies exist in the domain and are resolved via the asynchronous EventBus:

1. **StockModule ↔ PortfolioModule**: StockModule detects price changes but PortfolioModule owns surge thresholds. Resolution: StockModule emits `stock:price-update` → EventBus → PortfolioModule's `SurgeDetectorService` listens and evaluates thresholds.

2. **NewsModule ↔ AiAgentModule**: New high-relevance news could trigger AI analysis, but AiAgentModule already depends on NewsModule for data. Resolution: NewsModule emits `news:new-article` → EventBus → AiAgentModule's queue listener can decide whether to trigger auto-analysis based on relevance score.

---

## 6. Detailed Module Specifications

### 6.1 StockModule

**Responsibility**: All stock price data acquisition, processing, storage, and delivery. Sole owner of the KIS API connection lifecycle.

**External dependencies**: KIS OpenAPI (REST + WebSocket)

**Key services**:

| Service | Responsibility | Key Details |
|---------|---------------|-------------|
| `KisRestService` | KIS REST API client for price queries, rankings, historical data | OAuth 2.0 token lifecycle (90-day validity, 6-hour refresh); rate limiter at 15 req/s token bucket [trace:step-1:section-4.5] |
| `KisWebsocketService` | KIS WebSocket client for real-time H0STCNT0 price stream | PINGPONG heartbeat (60s); pipe-delimited parsing; auto-reconnect; manages 41-subscription limit [trace:step-1:section-2] |
| `SubscriptionManagerService` | 3-tier subscription allocation (WebSocket/polling/on-demand) | Weighted priority: users watching count + surge activity + volume [trace:step-6:section-4.3] |
| `PriceBufferService` | In-memory buffer → batch INSERT every 1 second | UNNEST + ON CONFLICT batch insert to TimescaleDB `stock_prices` hypertable [trace:step-2:section-6.3] |
| `StockDataService` | Aggregation layer: combines Redis cache + DB queries | Exposes the `IStockDataService` interface; used by AiAgentModule and PortfolioModule |
| `MarketIndexService` | KOSPI/KOSDAQ index data collection and serving | REST polling for market indices; emits `index:update` via Socket.IO |

**Data flow**:

```mermaid
flowchart LR
    KIS_WS["KIS WebSocket<br/>(41 subs)"] -->|"pipe-delimited"| PARSE["Parser<br/>(string→typed)"]
    KIS_REST["KIS REST<br/>(15 req/s)"] -->|"JSON"| PARSE

    PARSE --> REDIS_CACHE["Redis Cache<br/>price:{symbol}<br/>TTL 5s"]
    PARSE --> BUFFER["Price Buffer<br/>(in-memory)"]
    BUFFER -->|"batch every 1s"| TSDB["TimescaleDB<br/>stock_prices<br/>(hypertable)"]
    PARSE --> EVENTBUS["EventBus<br/>stock:price-update"]
    PARSE --> SOCKETIO["Socket.IO<br/>price:update event"]
```

### 6.2 NewsModule

**Responsibility**: All news data collection from three sources, deduplication, relevance scoring, storage, and summarization.

**External dependencies**: Naver Search API, 9 RSS feeds (5 outlets), DART API

**Key services**:

| Service | Responsibility | Key Details |
|---------|---------------|-------------|
| `NaverNewsService` | Naver Search API client | 25,000 calls/day budget; `start` param max 1000; varied query patterns for coverage [trace:step-5:section-1] |
| `RssFeedService` | RSS feed parser for 9 feeds across 5 Korean financial outlets | Promise.allSettled isolation; 5-15 min lag behind publisher; `xml2js` or `rss-parser` [trace:step-5:section-2] |
| `DartDisclosureService` | DART API client for FSS official disclosures | Polling every 2 min during 09:00-18:00 KST; max 100 results/page [trace:step-5:section-3] |
| `NewsDedupService` | 3-layer deduplication pipeline | L1 URL normalization (60%) → L2 Jaccard title similarity 0.7 threshold (25%) → L3 time-window clustering 2h (10%) → ~73% reduction [trace:step-5:section-5] |
| `NewsRelevanceService` | Stock-news relevance scoring | L1 keyword matching (weight 0.6) + optional L2 NLP semantic scoring (weight 0.4) when keyword score in [0.2, 0.7] [trace:step-5:section-4] |
| `NewsSummarizerService` | gpt-4o-mini news summarization | Stuff approach for individual articles; Map-Reduce for cluster summaries; $90/month at 5000 articles/day [trace:step-5:section-6] |

**Scheduled tasks** (via SharedModule Scheduler):
- Naver API polling: every 5 minutes during market hours (09:00-15:30 KST), every 15 minutes off-hours
- RSS feed polling: every 5 minutes (no rate limits)
- DART API polling: every 2 minutes during 09:00-18:00 KST

### 6.3 AiAgentModule

**Responsibility**: AI-powered surge analysis using LangGraph.js StateGraph, Quality Gate validation, and confidence scoring.

**External dependencies**: Claude Sonnet 4.6 (primary LLM), LangChain.js, LangGraph.js

**Architecture — LangGraph StateGraph (5 nodes)**:

```mermaid
stateDiagram-v2
    [*] --> DataCollector
    DataCollector --> NewsSearcher
    NewsSearcher --> Analyzer
    Analyzer --> QualityGate

    state QualityGate {
        [*] --> L1_Syntax
        L1_Syntax --> L2_Semantic: pass
        L1_Syntax --> RetryDecision: fail
        L2_Semantic --> L3_Factual: pass
        L2_Semantic --> RetryDecision: fail
        L3_Factual --> [*]: pass
        L3_Factual --> RetryDecision: fail
    }

    QualityGate --> ResultFormatter: pass
    QualityGate --> Analyzer: retry (max 3)
    QualityGate --> ResultFormatter: final fail → "unverified" label

    ResultFormatter --> [*]
```

**State channels** (9 channels via `Annotation.Root`):

```typescript
const SurgeAnalysisState = Annotation.Root({
  symbol: Annotation<string>,
  requestId: Annotation<string>,
  stockData: Annotation<RealTimePrice | null>,
  newsArticles: Annotation<NewsArticle[]>,
  surgeAnalysis: Annotation<SurgeAnalysisOutput | null>,
  qualityGateResult: Annotation<QualityGateResult | null>,
  finalResult: Annotation<AnalysisResult | null>,
  currentStep: Annotation<string>,
  error: Annotation<Error | null>,
  retryCount: Annotation<number>,
});
```

**Quality Gate layers**:

| Layer | Validation | Target Pass Rate | Method |
|-------|-----------|-----------------|--------|
| L1 Syntax | Zod structured output validation | 99%+ | `z.object()` schema enforcement |
| L2 Semantic | Self-consistency check, numerical range validation | 95%+ | Cross-reference analysis claims against provided data |
| L3 Factual | KIS API cross-check, citation verification | 90%+ | Compare mentioned prices/rates against actual KIS data |

**Confidence scoring formula**: `0.20 * sourceCount + 0.30 * evidenceQuality + 0.35 * qgPassScore + 0.15 * crossSourceConsistency` → normalized to [0, 100]

**Cost**: ~$0.024/analysis (Claude Sonnet 4.6); ~$22-36/month for 1,500 analyses with prompt caching + Redis response caching (30-min TTL per `surge-analysis:{symbol}:{date}`)

### 6.4 PortfolioModule

**Responsibility**: User watchlist management, alert configuration, and surge detection based on user-configurable thresholds.

**Key services**:

| Service | Responsibility |
|---------|---------------|
| `WatchlistService` | CRUD for watchlists and watchlist items; notifies SubscriptionManager when watchlist changes affect KIS WebSocket subscriptions |
| `AlertService` | CRUD for user alerts (surge threshold, price target, volume spike) |
| `SurgeDetectorService` | Listens to `stock:price-update` events; compares `changeRate` against each user's `surge_threshold_pct`; emits `alert:surge-detected` when threshold exceeded |

**Surge detection flow**:

```mermaid
flowchart TD
    EVENT["EventBus: stock:price-update<br/>{symbol, changeRate}"] --> DETECTOR["SurgeDetectorService"]
    DETECTOR --> QUERY["Query: users watching this symbol<br/>+ their surge_threshold_pct"]
    QUERY --> COMPARE{"changeRate ><br/>user.threshold?"}
    COMPARE -->|"Yes"| EMIT["EventBus: alert:surge-detected<br/>{symbol, changeRate, userId}"]
    COMPARE -->|"No"| SKIP["Skip"]
    EMIT --> SOCKET["Socket.IO: alert:surge<br/>→ user's room"]
    EMIT --> QUEUE["Bull Queue: AI surge analysis job"]
    EMIT --> DB["Save to alerts table<br/>(triggered_at = now)"]
```

### 6.5 AdminModule

**Responsibility**: System administration, API key lifecycle management, data collection monitoring, and user management.

**Key services**:

| Service | Responsibility |
|---------|---------------|
| `SystemStatusService` | Aggregates health metrics: DB connection, Redis connectivity, KIS API status, WebSocket subscription count, queue depth |
| `ApiKeyManagerService` | Encrypted storage/retrieval of external API keys (KIS, Naver, DART, Anthropic, OpenAI) using pgcrypto; rotation support |
| `DataCollectionMonitorService` | Tracks ingestion rates: stock prices/sec, news articles/hour, DART disclosures/day; exposes dashboard metrics |

**Access control**: All AdminModule endpoints require `@Roles('admin')` decorator + `RolesGuard`.

### 6.6 AuthModule

**Responsibility**: User authentication and authorization via Better Auth 1.x integration.

**Key features**:
- Email + password registration (bcrypt hashing via Better Auth)
- Session-based authentication (HTTP-only secure cookies)
- 2-tier role model: `admin` (1 account) and `user` (N accounts)
- NestJS guards (`AuthGuard`, `RolesGuard`) for route protection
- Session validation middleware for both REST and Socket.IO connections

**Better Auth configuration**:

```typescript
// Conceptual Better Auth setup
export const auth = betterAuth({
  database: prismaAdapter(prisma),
  emailAndPassword: { enabled: true },
  session: {
    strategy: 'database',       // Store sessions in PostgreSQL
    maxAge: 30 * 24 * 60 * 60,  // 30 days
  },
  user: {
    additionalFields: {
      role: { type: 'string', default: 'user' },
      surgeThresholdPct: { type: 'number', default: 5.0 },
      settingsJson: { type: 'string', default: '{}' },
    },
  },
});
```

### 6.7 SharedModule

**Responsibility**: All cross-cutting infrastructure concerns. This is the only module that interacts directly with PostgreSQL and Redis.

**Exported providers**:

| Provider | Implementation | Key Configuration |
|----------|---------------|-------------------|
| `PrismaService` | Prisma 7 Client wrapper with `onModuleInit`/`onModuleDestroy` lifecycle | ESM-only; output directory outside `node_modules`; connection pool via `DATABASE_URL` |
| `RedisService` | Redis 8 client with typed helpers (get/set/del/pub/sub) | Connection via `REDIS_URL`; JSON serialization for complex objects |
| `BullQueueModule` | Bull queue for async jobs (AI analysis, news summarization) | Redis-backed; configurable concurrency; retry with exponential backoff |
| `SchedulerService` | NestJS `@nestjs/schedule` wrapper for cron-based tasks | Declarative cron expressions; market-hours-aware scheduling |
| `AppLoggerService` | Structured JSON logger (Winston or Pino) | Log levels: error, warn, info, debug; Sentry integration for error level |
| `RateLimiterService` | Token bucket rate limiter for external API calls | KIS: 15 req/s; Naver: configurable; configurable per-endpoint |
| `EventBusService` | Typed EventEmitter wrapper | Typed event map; max listeners configurable; error handling for listener failures |
| `GlobalExceptionFilter` | NestJS global exception filter | Catches all unhandled exceptions; returns structured error response; logs to Sentry |

---

## 7. Docker Compose Services

### 7.1 Development Environment

```yaml
# docker/docker-compose.yml
version: "3.9"

services:
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
      target: development
    ports:
      - "3001:3001"        # REST API
      - "3002:3002"        # Socket.IO (if separate port)
      - "9229:9229"        # Node.js debugger
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/stock_dashboard?schema=public
      - REDIS_URL=redis://redis:6379
    env_file:
      - ../.env
    volumes:
      - ../apps/api/src:/app/apps/api/src       # Hot reload
      - ../packages:/app/packages               # Shared packages
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: pnpm --filter api dev

  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web
      target: development
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - NEXT_PUBLIC_API_URL=http://localhost:3001
      - NEXT_PUBLIC_WS_URL=ws://localhost:3001
    env_file:
      - ../.env
    volumes:
      - ../apps/web/src:/app/apps/web/src
      - ../packages:/app/packages
    depends_on:
      - api
    command: pnpm --filter web dev

  postgres:
    image: timescale/timescaledb:latest-pg17
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: stock_dashboard
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:8-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru

volumes:
  postgres_data:
  redis_data:
```

### 7.2 Production Environment

```yaml
# docker/docker-compose.prod.yml
version: "3.9"

services:
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
      target: production
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"     # Bind to localhost only (Cloudflare Tunnel handles external)
    environment:
      - NODE_ENV=production
    env_file:
      - ../.env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 4G               # Max 4GB for NestJS (of 16GB total)
          cpus: "4"                 # 4 of 6 cores for API

  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web
      target: production
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - ../.env.production
    depends_on:
      - api
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2"

  postgres:
    image: timescale/timescaledb:latest-pg17
    restart: unless-stopped
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: stock_dashboard
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 6G               # TimescaleDB needs memory for compression/aggregation
          cpus: "4"
    command: >
      postgres
        -c shared_buffers=2GB
        -c effective_cache_size=4GB
        -c work_mem=64MB
        -c maintenance_work_mem=512MB
        -c max_connections=100
        -c wal_buffers=64MB
        -c checkpoint_completion_target=0.9
        -c timescaledb.max_background_workers=4

  redis:
    image: redis:8-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "1"
    command: >
      redis-server
        --appendonly yes
        --maxmemory 768mb
        --maxmemory-policy allkeys-lru
        --save 60 1000
        --requirepass ${REDIS_PASSWORD}

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
```

### 7.3 Production Resource Allocation (Mini-PC: 16GB RAM, 6 cores)

| Service | Memory Limit | CPU Limit | Rationale |
|---------|-------------|-----------|-----------|
| PostgreSQL + TimescaleDB | 6 GB | 4 cores | Heaviest workload: 2,500 rows/sec insert, compression, continuous aggregates |
| NestJS API | 4 GB | 4 cores | LangGraph.js and multiple WebSocket connections are memory-intensive |
| Next.js Web | 2 GB | 2 cores | SSR/PPR rendering; mostly static after initial load |
| Redis | 1 GB | 1 core | Cache + Pub/Sub + Bull queue; `maxmemory 768mb` with LRU eviction |
| OS + Cloudflare Tunnel | ~3 GB | shared | Ubuntu 24.04 base + cloudflared daemon |
| **Total** | **16 GB** | **6 cores** | Fully allocated; no headroom for additional services |

---

## 8. Environment Configuration

### 8.1 Environment File Hierarchy

```
stock-monitoring-dashboard/
├── .env.example          # Template with placeholder values (committed to git)
├── .env                  # Local development defaults (gitignored)
├── .env.local            # Developer-specific overrides (gitignored)
├── .env.production       # Production secrets (gitignored, deployed separately)
└── .env.test             # Test environment (gitignored)
```

**Loading order** (later overrides earlier):
1. `.env` — base defaults
2. `.env.local` — developer overrides (optional)
3. Environment variables from Docker Compose `environment:` block
4. Process environment variables (highest priority)

### 8.2 Environment Variable Template

```bash
# .env.example — Copy to .env and fill in values

# ========================
# Application
# ========================
NODE_ENV=development
API_PORT=3001
WEB_PORT=3000
API_BASE_URL=http://localhost:3001
WEB_BASE_URL=http://localhost:3000

# ========================
# Database (PostgreSQL + TimescaleDB)
# ========================
POSTGRES_USER=postgres
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_DB=stock_dashboard
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}?schema=public

# ========================
# Redis
# ========================
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# ========================
# KIS OpenAPI (한국투자증권)
# ========================
KIS_APP_KEY=
KIS_APP_SECRET=
KIS_ACCOUNT_NUMBER=
KIS_ACCOUNT_PRODUCT_CODE=01
KIS_ENV=simulation                    # simulation | production
# Derived URLs (set by config module based on KIS_ENV):
# production: https://openapi.koreainvestment.com:9443
# simulation: https://openapivts.koreainvestment.com:29443

# ========================
# Naver Search API
# ========================
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# ========================
# DART API
# ========================
DART_API_KEY=

# ========================
# LLM Providers
# ========================
ANTHROPIC_API_KEY=                    # Claude Sonnet for surge analysis
OPENAI_API_KEY=                       # gpt-4o-mini for news summarization

# ========================
# Better Auth
# ========================
BETTER_AUTH_SECRET=                    # JWT/session signing secret (min 32 chars)
BETTER_AUTH_URL=http://localhost:3001  # Auth server URL

# ========================
# Sentry (Error Monitoring)
# ========================
SENTRY_DSN=
SENTRY_ENVIRONMENT=development

# ========================
# Cloudflare Tunnel (Production only)
# ========================
CLOUDFLARE_TUNNEL_TOKEN=
```

### 8.3 NestJS Configuration Module

Configuration is validated at startup using Zod schemas via `@nestjs/config`. Missing or invalid values cause immediate startup failure with descriptive error messages.

```typescript
// apps/api/src/config/app.config.ts
import { z } from 'zod';

export const AppConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KIS_APP_KEY: z.string().min(1),
  KIS_APP_SECRET: z.string().min(1),
  KIS_ENV: z.enum(['simulation', 'production']).default('simulation'),
  NAVER_CLIENT_ID: z.string().min(1),
  NAVER_CLIENT_SECRET: z.string().min(1),
  DART_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  SENTRY_DSN: z.string().optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
```

### 8.4 Secret Management Rules

1. **No secrets in source code**: all secrets live in `.env` files or environment variables. `.env`, `.env.local`, `.env.production`, `.env.test` are gitignored.
2. **`.env.example` is committed**: contains only placeholder values, never real credentials.
3. **Production secrets**: deployed to the mini-PC via secure copy (scp) or Docker secrets. Never transmitted via git or CI/CD logs.
4. **API key encryption at rest**: AdminModule stores external API keys encrypted in PostgreSQL using `pgcrypto` extension. Keys are decrypted only in memory when needed.
5. **Rotation support**: KIS tokens auto-refresh every 6 hours [trace:step-1:section-1.4]. Naver/DART/LLM keys can be rotated via AdminModule without restart.

---

## 9. Error Handling Architecture

### 9.1 Error Taxonomy

All application errors extend a base `AppException` class that carries structured metadata for logging, client response, and Sentry reporting.

```mermaid
classDiagram
    class AppException {
        +string code
        +string message
        +number statusCode
        +string category
        +object metadata
        +Date timestamp
    }

    class HttpException {
        +number statusCode
    }

    class DatabaseException {
        +string query
        +string table
    }

    class ExternalApiException {
        +string provider
        +number apiStatusCode
        +string endpoint
        +number retryCount
    }

    class AiAnalysisException {
        +string symbol
        +string stage
        +number retryCount
        +string qualityGateLayer
    }

    class ValidationException {
        +object validationErrors
        +string dto
    }

    class AuthException {
        +string userId
        +string action
    }

    AppException <|-- HttpException
    AppException <|-- DatabaseException
    AppException <|-- ExternalApiException
    AppException <|-- AiAnalysisException
    AppException <|-- ValidationException
    AppException <|-- AuthException
```

**Error categories**:

| Category | Code Prefix | HTTP Status | Examples |
|----------|-----------|-------------|---------|
| `CLIENT_ERROR` | `CE_` | 400-499 | Invalid DTO, unauthorized, not found |
| `DATABASE_ERROR` | `DB_` | 500 | Connection failure, query timeout, constraint violation |
| `EXTERNAL_API_ERROR` | `EA_` | 502/503 | KIS API timeout, Naver rate limit, DART unavailable |
| `AI_ANALYSIS_ERROR` | `AI_` | 500/422 | LLM timeout, quality gate failure, hallucination detected |
| `VALIDATION_ERROR` | `VE_` | 422 | Zod schema violation, business rule violation |
| `AUTH_ERROR` | `AU_` | 401/403 | Invalid session, insufficient role, expired token |
| `SYSTEM_ERROR` | `SY_` | 500 | Uncaught exception, Redis connection lost, OOM |

### 9.2 Global Exception Filter

```typescript
// Conceptual implementation
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const errorResponse: StructuredErrorResponse = {
      success: false,
      error: {
        code: this.extractCode(exception),
        message: this.extractMessage(exception),
        category: this.extractCategory(exception),
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId: request.headers['x-request-id'] || crypto.randomUUID(),
      },
    };

    // Log to structured logger
    this.logger.error({
      ...errorResponse.error,
      stack: exception instanceof Error ? exception.stack : undefined,
      metadata: exception instanceof AppException ? exception.metadata : undefined,
    });

    // Report to Sentry (500-level errors only)
    if (errorResponse.error.statusCode >= 500) {
      Sentry.captureException(exception, {
        extra: errorResponse.error,
      });
    }

    response.status(this.extractStatusCode(exception)).json(errorResponse);
  }
}
```

### 9.3 Structured Error Response Format

All API error responses follow a consistent JSON structure:

```typescript
interface StructuredErrorResponse {
  success: false;
  error: {
    code: string;           // e.g., "EA_KIS_TIMEOUT"
    message: string;        // Human-readable message
    category: string;       // Error category
    timestamp: string;      // ISO 8601
    path: string;           // Request URL
    requestId: string;      // UUID for tracing
    details?: unknown;      // Optional: validation errors, etc.
  };
}
```

**Example responses**:

```json
// KIS API timeout
{
  "success": false,
  "error": {
    "code": "EA_KIS_TIMEOUT",
    "message": "KIS API request timed out after 10000ms",
    "category": "EXTERNAL_API_ERROR",
    "timestamp": "2026-03-27T14:30:00.000Z",
    "path": "/api/stocks/005930/prices",
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}

// AI quality gate failure
{
  "success": false,
  "error": {
    "code": "AI_QUALITY_GATE_FAILED",
    "message": "Surge analysis failed L3 factual validation after 3 retries",
    "category": "AI_ANALYSIS_ERROR",
    "timestamp": "2026-03-27T14:30:00.000Z",
    "path": "/api/ai/analyze/005930",
    "requestId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "details": {
      "symbol": "005930",
      "retryCount": 3,
      "lastFailedLayer": "L3",
      "fallbackAction": "Returned with 'unverified' label"
    }
  }
}
```

### 9.4 External API Error Recovery

| Provider | Circuit Breaker | Retry Policy | Fallback |
|----------|----------------|-------------|----------|
| KIS REST API | 3-tier: Closed (<5 errors/60s) → Open → Half-Open (30s) | 3 retries, exponential backoff (1s, 2s, 4s) | Redis cached price (TTL 5s) |
| KIS WebSocket | Auto-reconnect with exponential backoff (1s → 30s max) | Infinite reconnection attempts | Switch affected symbols to REST polling |
| Naver Search API | Circuit breaker at 10 errors/5min | 2 retries, 500ms delay | Return cached news (Redis, TTL 5min) |
| RSS Feeds | `Promise.allSettled` isolation per feed | No retry (next poll cycle) | Skip failed feed; other feeds unaffected |
| DART API | Circuit breaker at 5 errors/5min | 2 retries, 1s delay | Return cached disclosures |
| Claude API (LLM) | Circuit breaker at 3 errors/5min | 3 retries per QG cycle, then "unverified" | Return analysis with "unverified" label + confidence 0 |
| OpenAI API (summarization) | Circuit breaker at 5 errors/5min | 2 retries | Return raw article without summary |

---

## 10. Fitness Functions

Fitness functions are automated checks that continuously validate the architecture's health. They run in CI (GitHub Actions) and locally during development.

### 10.1 Structural Fitness Functions

| ID | Fitness Function | Tool | Threshold | Frequency |
|----|-----------------|------|-----------|-----------|
| FF-1 | **Cyclic dependency detection** | `eslint-plugin-import` with `no-cycle` rule + `madge --circular` | 0 cycles allowed | Every commit (pre-commit hook + CI) |
| FF-2 | **Module coupling** | Custom ESLint rule counting cross-module imports | Max 3 direct imports between any two modules | Every PR (CI) |
| FF-3 | **SharedModule independence** | ESLint rule: SharedModule must not import from `modules/*` | 0 violations | Every commit |
| FF-4 | **Type safety** | `tsc --noEmit` with strict mode | 0 type errors | Every commit |
| FF-5 | **Bundle size (frontend)** | `@next/bundle-analyzer` | Total JS < 500KB gzipped | Every PR |

### 10.2 Performance Fitness Functions

| ID | Fitness Function | Tool | Threshold | Frequency |
|----|-----------------|------|-----------|-----------|
| FF-6 | **API response time P95** | Vitest integration tests + custom timing | < 200ms for standard endpoints | Every PR |
| FF-7 | **Stock price insert throughput** | Custom benchmark script | ≥ 2,500 rows/sec batch INSERT | Weekly (scheduled CI) |
| FF-8 | **WebSocket message latency** | Custom E2E test (KIS mock → Socket.IO client) | < 100ms parse + broadcast | Every PR |
| FF-9 | **Database query performance** | `EXPLAIN ANALYZE` in migration tests | No sequential scans on indexed columns | Every migration |

### 10.3 Operational Fitness Functions

| ID | Fitness Function | Tool | Threshold | Frequency |
|----|-----------------|------|-----------|-----------|
| FF-10 | **Deploy frequency** | GitHub Actions deployment counter | ≥ 2 deployments/week | Weekly metric |
| FF-11 | **Test coverage** | Vitest coverage + Istanbul | ≥ 80% line coverage for domain modules | Every PR |
| FF-12 | **Security vulnerability scan** | `npm audit` + Snyk | 0 critical/high vulnerabilities | Daily (scheduled CI) |
| FF-13 | **Docker image size** | Docker build output | API image < 500MB, Web image < 300MB | Every PR |

### 10.4 ESLint Module Boundary Rules

```javascript
// packages/eslint-config/nestjs.js (relevant excerpt)
module.exports = {
  rules: {
    'import/no-cycle': ['error', { maxDepth: Infinity }],

    // Custom rule: enforce module boundaries
    'no-restricted-imports': ['error', {
      patterns: [
        // SharedModule must not import domain modules
        {
          group: ['**/modules/stock/**', '**/modules/news/**', '**/modules/ai-agent/**',
                  '**/modules/portfolio/**', '**/modules/admin/**', '**/modules/auth/**'],
          importNames: ['*'],
          message: 'SharedModule must not import domain modules.',
          // Applied only to files in modules/shared/
        },
        // Direct cross-module internal imports are forbidden
        // Modules must use exported interfaces only
        {
          group: ['**/modules/*/services/*', '**/modules/*/controllers/*'],
          message: 'Import from module interface, not internal services directly.',
        },
      ],
    }],
  },
};
```

---

## 11. Data Flow Architecture

### 11.1 Real-Time Stock Price Flow (End-to-End)

```mermaid
sequenceDiagram
    participant KIS as KIS WebSocket<br/>(ws://ops.~:21000)
    participant KISWSS as KisWebsocketService
    participant PARSER as Price Parser
    participant REDIS as Redis Cache
    participant BUFFER as PriceBuffer
    participant TSDB as TimescaleDB
    participant EVENTBUS as EventBus
    participant SIOGW as Socket.IO Gateway
    participant BROWSER as Browser

    KIS->>KISWSS: Pipe-delimited H0STCNT0 message
    KISWSS->>KISWSS: Echo PINGPONG (every 60s)
    KISWSS->>PARSER: Raw string message
    PARSER->>PARSER: Split by | and ^<br/>Parse strings → typed RealTimePrice
    PARSER->>PARSER: Lookup stock_id from Redis<br/>(symbol→stock_id cache)

    par Parallel Fanout
        PARSER->>REDIS: SET price:{symbol} TTL 5s
        PARSER->>BUFFER: Append to in-memory buffer
        PARSER->>EVENTBUS: emit stock:price-update
        PARSER->>SIOGW: emit price:update to room stock:{symbol}
    end

    BUFFER->>TSDB: Batch INSERT every 1s<br/>(UNNEST + ON CONFLICT)
    EVENTBUS->>EVENTBUS: PortfolioModule.SurgeDetector listens
    SIOGW->>BROWSER: Socket.IO price:update event
    BROWSER->>BROWSER: chart.update() via<br/>useRealtimeChartUpdates hook
```

### 11.2 AI Surge Analysis Flow

```mermaid
sequenceDiagram
    participant USER as User / SurgeDetector
    participant CTRL as AiAnalysis Controller
    participant BULL as Bull Queue
    participant GRAPH as LangGraph StateGraph
    participant DC as DataCollector Node
    participant NS as NewsSearcher Node
    participant AN as Analyzer Node (LLM)
    participant QG as QualityGate Node
    participant RF as ResultFormatter Node
    participant DB as PostgreSQL
    participant SIO as Socket.IO

    USER->>CTRL: POST /api/ai/analyze/005930
    CTRL->>BULL: Add job: surge-analysis
    BULL->>GRAPH: Process job

    GRAPH->>DC: Collect stock data
    DC->>DC: KisRestService.getCurrentPrice("005930")
    DC->>DC: StockDataService.getHistoricalPrices(1 week)

    GRAPH->>NS: Search related news
    NS->>NS: Promise.all([naver, rss, dart])
    NS->>NS: mergeAndDeduplicate()
    NS->>NS: scoreRelevance()

    GRAPH->>AN: Analyze with Claude Sonnet 4.6
    AN->>AN: Structured output (Zod schema)
    AN->>AN: Citation requirements enforced

    GRAPH->>QG: Validate analysis
    QG->>QG: L1 Syntax (Zod validation)
    QG->>QG: L2 Semantic (self-consistency)
    QG->>QG: L3 Factual (KIS API cross-check)

    alt QG Failed (retry < 3)
        QG->>AN: Retry with feedback
    else QG Passed
        GRAPH->>RF: Format result
        RF->>RF: Compute confidence score
        RF->>RF: Add "AI 생성" label
    else QG Failed (retry >= 3)
        GRAPH->>RF: Format with "unverified" label
    end

    RF->>DB: INSERT ai_analyses
    RF->>SIO: emit ai:analysis-complete
    SIO->>USER: Push result to browser
```

### 11.3 News Ingestion Pipeline

```mermaid
flowchart TD
    subgraph "Data Sources"
        NAVER["Naver Search API<br/>(every 5min)"]
        RSS["9 RSS Feeds<br/>(every 5min)"]
        DART["DART API<br/>(every 2min)"]
    end

    subgraph "Collection Layer"
        NS["NaverNewsService"]
        RS["RssFeedService<br/>(Promise.allSettled)"]
        DS["DartDisclosureService"]
    end

    subgraph "Processing Pipeline"
        MERGE["Merge all articles"]
        DEDUP["3-Layer Deduplication<br/>L1: URL normalization (60%)<br/>L2: Jaccard similarity ≥0.7 (25%)<br/>L3: Time-window clustering 2h (10%)"]
        SCORE["Relevance Scoring<br/>L1: Keyword (0.6 weight)<br/>L2: NLP semantic (0.4 weight)"]
        STORE["Store to news_articles + news_stock_relevance"]
    end

    subgraph "Downstream"
        EVENT["EventBus: news:new-article"]
        SUMM["Summarizer (gpt-4o-mini)<br/>Async via Bull Queue"]
    end

    NAVER --> NS --> MERGE
    RSS --> RS --> MERGE
    DART --> DS --> MERGE
    MERGE --> DEDUP
    DEDUP --> SCORE
    SCORE --> STORE
    STORE --> EVENT
    STORE --> SUMM
```

---

## 12. Security Architecture

### 12.1 Authentication Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant NJ as Next.js Middleware
    participant BA as Better Auth (NestJS)
    participant DB as PostgreSQL

    Note over B,DB: Registration Flow
    B->>BA: POST /api/auth/signup {email, password, name}
    BA->>BA: Validate input, hash password (bcrypt)
    BA->>DB: INSERT users (role='user', surge_threshold_pct=5.0)
    BA->>BA: Create session
    BA->>DB: INSERT sessions
    BA-->>B: Set-Cookie: session_token (HttpOnly, Secure, SameSite=Strict)

    Note over B,DB: Authenticated Request
    B->>NJ: GET /dashboard (with cookie)
    NJ->>NJ: Check session cookie exists
    NJ->>BA: Validate session (server-side)
    BA->>DB: Query sessions table
    BA-->>NJ: { user, session } or 401
    alt Valid Session
        NJ->>NJ: Forward to page
    else Invalid/Expired
        NJ->>B: Redirect to /login
    end

    Note over B,DB: API Request (REST)
    B->>BA: GET /api/stocks (with cookie)
    BA->>BA: AuthGuard extracts session from cookie
    BA->>DB: Validate session
    BA->>BA: Attach user to request
    BA-->>B: 200 OK { stocks }

    Note over B,DB: Admin Request
    B->>BA: GET /api/admin/status (with cookie)
    BA->>BA: AuthGuard validates session
    BA->>BA: RolesGuard checks user.role === 'admin'
    alt Admin
        BA-->>B: 200 OK { status }
    else Not Admin
        BA-->>B: 403 Forbidden
    end
```

### 12.2 Security Layers

| Layer | Measure | Implementation |
|-------|---------|---------------|
| **Transport** | TLS 1.3 for all external traffic | Cloudflare Tunnel auto-HTTPS; internal Docker network unencrypted (accepted tradeoff for mini-PC) |
| **Authentication** | Session-based with HttpOnly cookies | Better Auth 1.x; 30-day session TTL; database-backed sessions |
| **Authorization** | 2-tier RBAC (admin/user) | NestJS `RolesGuard` + `@Roles()` decorator |
| **CORS** | Whitelist-based | NestJS CORS middleware; production: only Cloudflare Tunnel domain |
| **CSRF** | SameSite=Strict cookie + CSRF token | Better Auth built-in CSRF protection |
| **XSS** | CSP headers + input sanitization | Helmet.js for CSP; DOMPurify for user-generated content |
| **Rate Limiting** | IP-based + user-based dual limiting | NestJS `ThrottlerModule`; 100 req/min per IP, 200 req/min per user |
| **API Key Security** | Environment variables + encrypted storage | `.env` files (gitignored); AdminModule encrypts keys at rest via pgcrypto |
| **SQL Injection** | Parameterized queries | Prisma Client auto-parameterizes; `$executeRaw` uses tagged template literals |
| **LLM Security** | Input/output sanitization | Regex filter for prompt injection (2000-char limit); HTML stripping on output; `secretsFromEnv: false` |
| **Dependency Security** | Automated vulnerability scanning | `npm audit` + Snyk in CI; LangChain CVE-2025-68665 patched in required minimum versions |

### 12.3 Socket.IO Authentication

WebSocket connections are authenticated using the same session cookie as REST requests:

```typescript
// Conceptual Socket.IO auth middleware
io.use(async (socket, next) => {
  const cookie = socket.handshake.headers.cookie;
  const session = await authService.validateSessionFromCookie(cookie);
  if (!session) {
    return next(new Error('Authentication required'));
  }
  socket.data.user = session.user;
  next();
});
```

---

## Appendix A: Key Technology Version Constraints

All versions are validated for mutual compatibility per the research synthesis [trace:step-6:section-3.4].

```json
{
  "node": "22.x (LTS)",
  "typescript": "5.x (strict mode)",
  "next": "15.x or 16.x",
  "react": "19.x",
  "@nestjs/core": "11.x",
  "prisma": "7.x (ESM-only)",
  "socket.io": "4.x",
  "socket.io-client": "4.x",
  "@langchain/core": ">=1.1.8",
  "@langchain/langgraph": ">=0.2.40",
  "@langchain/anthropic": ">=0.3.14",
  "@langchain/openai": ">=0.4.6",
  "langchain": ">=1.2.3",
  "zod": "^3.23 (NOT zod@4)",
  "zustand": "5.x",
  "@tanstack/react-query": "5.x",
  "react-grid-layout": "2.x",
  "lightweight-charts": "4.x",
  "recharts": "2.x",
  "redis": "8.x",
  "better-auth": "1.x"
}
```

## Appendix B: Database Entity Summary

Authoritative entity list (reconciled from Step 2 and Step 5 schemas):

| # | Table | Type | Module Owner |
|---|-------|------|-------------|
| 1 | `users` | Regular | AuthModule |
| 2 | `sessions` | Regular | AuthModule (Better Auth managed) |
| 3 | `stocks` | Regular | StockModule |
| 4 | `stock_prices` | TimescaleDB Hypertable (1-day chunks) | StockModule |
| 5 | `daily_ohlcv` | TimescaleDB Continuous Aggregate | StockModule |
| 6 | `watchlists` | Regular | PortfolioModule |
| 7 | `watchlist_items` | Regular | PortfolioModule |
| 8 | `themes` | Regular | StockModule |
| 9 | `theme_stocks` | Regular | StockModule |
| 10 | `news_articles` | Regular (Step 5 schema) | NewsModule |
| 11 | `news_stock_relevance` | Regular (Step 5 schema) | NewsModule |
| 12 | `dart_disclosures` | Regular (Step 5 addition) | NewsModule |
| 13 | `ai_analyses` | Regular | AiAgentModule |
| 14 | `alerts` | Regular | PortfolioModule |

## Appendix C: API Endpoint Summary by Module

| Module | Method | Endpoint | Auth | Role |
|--------|--------|----------|------|------|
| **StockModule** | GET | `/api/stocks` | Yes | user |
| | GET | `/api/stocks/:symbol` | Yes | user |
| | GET | `/api/stocks/:symbol/prices` | Yes | user |
| | GET | `/api/stocks/rankings/:type` | Yes | user |
| | GET | `/api/stocks/indices` | Yes | user |
| | GET | `/api/themes` | Yes | user |
| | POST | `/api/themes` | Yes | user |
| **NewsModule** | GET | `/api/stocks/:symbol/news` | Yes | user |
| | GET | `/api/news` | Yes | user |
| | GET | `/api/news/dart/:symbol` | Yes | user |
| **AiAgentModule** | POST | `/api/ai/analyze/:symbol` | Yes | user |
| | GET | `/api/ai/analyses/:id` | Yes | user |
| | GET | `/api/ai/analyses/stock/:symbol` | Yes | user |
| **PortfolioModule** | GET/POST/PUT/DELETE | `/api/watchlists/*` | Yes | user |
| | GET/POST/PUT/DELETE | `/api/alerts/*` | Yes | user |
| **AdminModule** | GET | `/api/admin/status` | Yes | admin |
| | GET | `/api/admin/collection-stats` | Yes | admin |
| | GET/PUT | `/api/admin/api-keys` | Yes | admin |
| | GET | `/api/admin/users` | Yes | admin |
| **AuthModule** | POST | `/api/auth/signup` | No | — |
| | POST | `/api/auth/login` | No | — |
| | POST | `/api/auth/logout` | Yes | user |
| | GET | `/api/auth/session` | Yes | user |

**Socket.IO Events**:

| Event | Direction | Module | Payload |
|-------|-----------|--------|---------|
| `price:update` | Server → Client | StockModule | `{ symbol, price, changeRate, volume, timestamp }` |
| `alert:surge` | Server → Client | PortfolioModule | `{ symbol, stockName, changeRate, threshold }` |
| `news:update` | Server → Client | NewsModule | `{ articleId, symbol, title, source }` |
| `index:update` | Server → Client | StockModule | `{ market, value, changeRate }` |
| `ai:analysis-complete` | Server → Client | AiAgentModule | `{ analysisId, symbol, confidence }` |
| `subscribe` | Client → Server | StockModule | `{ symbols: string[] }` |
| `unsubscribe` | Client → Server | StockModule | `{ symbols: string[] }` |

---

**End of System Architecture. This document is the definitive architectural reference for the Implementation phase.**
