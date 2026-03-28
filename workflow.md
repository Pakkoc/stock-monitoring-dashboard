# Workflow: Stock Monitoring Dashboard — AI Agentic Auto-Implementation

> **Version**: v1.0 | **Created**: 2026-03-28 | **Based on**: docs/PRD.md (v1.0, 18 Branch Research, 200+ Web Sources)
> **Execution Mode**: ULW + Autopilot (Full Automation)
> **Language**: English-first (AI performance) → Korean translation (@translator)

---

## Inherited DNA

This workflow inherits the complete genome from the parent **AgenticWorkflow** framework.

| DNA Component | Inherited Pattern | Verification |
|---------------|-------------------|--------------|
| Absolute Criteria (3) | Quality > SOT > CCP | W5: Constitutional Principles |
| SOT Pattern | `.claude/state.yaml` single-file, Orchestrator-only write | W4: Inheritance Table |
| 3-Phase Structure | Research → Planning → Implementation | W3: Inherited DNA Header |
| 4-Layer QA | L0 Anti-Skip → L1 Verification → L1.5 pACS → L2 Adversarial Review | quality-gates.md |
| Safety Hooks | block_destructive_commands (exit 2), output_secret_filter, security_sensitive_file_guard | settings.json |
| Adversarial Review | @reviewer (Pre-mortem + min 1 issue) | reviewer.md |
| Decision Log | `autopilot-logs/` per-step decision records | autopilot-decision-template.md |
| Context Preservation | Snapshot + Knowledge Archive + RLM | context-preservation-detail.md |
| Cross-Step Traceability | `[trace:step-N:section-id]` markers, min density ≥ 3 | validate_traceability.py |
| CAP (Coding Anchor Points) | CAP-1 Think, CAP-2 Simplicity, CAP-3 Goal-based, CAP-4 Surgical | code-change-protocol.md |

**parent_genome.version**: 2026-03-28
**parent_genome.source**: AgenticWorkflow

---

## Agents

### Domain Agents (Created for this workflow)

| Agent | Model | Tools | Role |
|-------|-------|-------|------|
| `@stock-api-researcher` | opus | Read, Glob, Grep, WebSearch, WebFetch | KIS OpenAPI deep-dive: REST/WebSocket specs, rate limits, auth flow, real-time subscription patterns |
| `@db-researcher` | opus | Read, Glob, Grep, WebSearch, WebFetch | PostgreSQL 17 + TimescaleDB: hypertable design, continuous aggregates, financial schema patterns |
| `@frontend-researcher` | opus | Read, Glob, Grep, WebSearch, WebFetch | Next.js 15 + React Grid Layout + TradingView Lightweight Charts: widget architecture, real-time rendering |
| `@ai-pipeline-researcher` | opus | Read, Glob, Grep, WebSearch, WebFetch | LangChain.js 1.2 + LangGraph.js: surge analysis pipeline, Quality Gate integration, security patches |
| `@system-architect` | opus | Read, Write, Glob, Grep | Modular Monolith architecture, module boundaries, interface contracts, fitness functions |
| `@schema-designer` | opus | Read, Write, Glob, Grep | Prisma schema, TimescaleDB hypertables, API contract (OpenAPI), entity relationships |
| `@ui-designer` | opus | Read, Write, Glob, Grep | Dashboard wireframe, widget specs, component hierarchy, responsive layout (1920x1080) |
| `@ai-designer` | opus | Read, Write, Glob, Grep | LangGraph state graph, Quality Gate 3-layer spec, confidence scoring, prompt templates |
| `@backend-builder` | opus | Read, Write, Edit, Glob, Grep, Bash | NestJS 11 modules: Stock, News, AI-Agent, Portfolio, Admin, Auth, Shared |
| `@frontend-builder` | opus | Read, Write, Edit, Glob, Grep, Bash | Next.js 15 app: Dashboard, Widgets, Charts, WebSocket, State (Zustand + TanStack Query) |
| `@ai-builder` | opus | Read, Write, Edit, Glob, Grep, Bash | LangGraph.js orchestrator, LangChain chains, Quality Gate pipeline, confidence scoring |
| `@test-engineer` | opus | Read, Write, Edit, Glob, Grep, Bash | Vitest unit/integration, Playwright E2E, Testcontainers, AI eval suite |
| `@devops-engineer` | opus | Read, Write, Edit, Glob, Grep, Bash | Docker Compose, GitHub Actions CI/CD, Sentry, health checks, production deployment |
| `@security-auditor` | opus | Read, Glob, Grep, Bash | SAST/DAST, dependency audit, secret detection, OWASP Top 10, auth flow review |
| `@news-researcher` | opus | Read, Glob, Grep, WebSearch, WebFetch | Naver Search API, RSS feeds, DART API, news-stock relevance scoring |
| `@research-synthesizer` | opus | Read, Write, Glob, Grep | Cross-step synthesis, Context Reset recovery file, conflict resolution |
| `@cross-validator` | opus | Read, Glob, Grep, Bash | Module integration testing, cross-module contract verification, pipeline validation |

### Inherited Agents (from AgenticWorkflow DNA)

| Agent | Model | Role |
|-------|-------|------|
| `@reviewer` | opus | Adversarial L2 quality reviewer. Pre-mortem mandatory, min 1 issue, independent pACS |
| `@fact-checker` | opus | Claim-by-claim independent verification. WebSearch 2+ sources |
| `@translator` | opus | EN→KO translation. Glossary-based, self-pACS (Ft/Ct/Nt) |

---

## Phase 1: Research (Steps 1-6)

> **Goal**: Gather deep technical knowledge for all stack components. Each agent produces a grounded research report with citations.

### Step 1: KIS OpenAPI & Real-time Data Pipeline Research

- **Agent**: `@stock-api-researcher`
- **Input**: `docs/PRD.md` §4.1 (KIS OpenAPI row), §4.5 (Data Flow), `docs/market-research-report.md` §카테고리2
- **Output**: `research/step-1-kis-api-research.md`
- **Description**: Deep research on Korea Investment & Securities OpenAPI:
  1. REST API authentication flow (OAuth2, token refresh, access token lifecycle)
  2. WebSocket real-time subscription (connection management, heartbeat, reconnection)
  3. Available endpoints (stock price, order book, chart data, market indices)
  4. Rate limits and throttling patterns (requests/sec, daily limits)
  5. Error handling patterns and retry strategies
  6. Data format and field mapping to our Prisma schema
  7. Reference implementations (GitHub official samples, community SDKs)
  8. Comparison: KIS vs KRX public API vs PyKRX (fallback options)
- **Verification**:
  - [ ] KIS API auth flow documented with code example
  - [ ] WebSocket subscription pattern with reconnection logic documented
  - [ ] Rate limits quantified (exact numbers, not approximations)
  - [ ] At least 3 reference implementations cited with URLs
  - [ ] Fallback API options documented with pros/cons
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate → GREEN (≥70) proceed

### Step 2: Database Architecture Research (PostgreSQL + TimescaleDB)

- **Agent**: `@db-researcher`
- **Input**: `docs/PRD.md` §4.1 (Database rows), §4.4 (Data Model), Branch 1.2 (conservative stack analysis), Branch 5.2 (classical theory — ACID, Codd)
- **Output**: `research/step-2-database-research.md`
- **Description**: Deep research on financial data storage architecture:
  1. TimescaleDB hypertable design patterns for stock price time-series
  2. Continuous Aggregate optimization for technical indicators (MA, RSI, MACD)
  3. PostgreSQL 17 partitioning strategies for stock master data
  4. Prisma 7.x integration with TimescaleDB (raw SQL hybrid approach)
  5. Index strategies for real-time sorting (trading value, %, volume)
  6. Data retention policies (how long to keep tick data vs aggregated)
  7. Benchmark: expected throughput for 2,500 stocks × 1 msg/sec
  8. Migration strategy: Prisma migrate + raw SQL for TimescaleDB extensions
- **Verification**:
  - [ ] Hypertable CREATE statement with chunk_time_interval justified
  - [ ] At least 2 Continuous Aggregate examples for financial indicators
  - [ ] Prisma schema draft covering all 11 entities from PRD §4.4
  - [ ] Throughput benchmark data cited (rows/sec capacity)
  - [ ] Index strategy covers all sort/filter dimensions from PRD §3.2
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate

### Step 3: Frontend Stack Research (Next.js + Widget Dashboard + Charts)

- **Agent**: `@frontend-researcher`
- **Input**: `docs/PRD.md` §3.1 (Widget Dashboard), §3.8 (Design Direction), §4.1 (Frontend rows), scenario-branch-3B
- **Output**: `research/step-3-frontend-research.md`
- **Description**: Deep research on dashboard frontend architecture:
  1. React Grid Layout: configuration for 8 widget types, serialization/persistence
  2. TradingView Lightweight Charts: candlestick, line chart, real-time updates via WebSocket
  3. Recharts: KPI widgets, theme performance bars, market indices
  4. Next.js 15 App Router: SSR strategy for dashboard (static shell + dynamic data)
  5. Zustand + TanStack Query: real-time state management with Socket.IO
  6. shadcn/ui component inventory for dashboard (Card, Table, Select, Sheet, Dialog)
  7. Performance: virtualized lists for 2,500+ stocks, chart rendering optimization
  8. Accessibility: WCAG 2.1 AA, Korean stock color convention (red=up, blue=down)
- **Verification**:
  - [ ] React Grid Layout configuration for 8 widget types with layout JSON
  - [ ] TradingView chart integration code pattern documented
  - [ ] Socket.IO → Zustand → Chart real-time update flow documented
  - [ ] Performance strategy for 2,500+ stock list rendering documented
  - [ ] shadcn/ui component mapping to all PRD §3.1-3.6 UI requirements
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate

### Step 4: AI Agent Pipeline Research (LangChain + LangGraph)

- **Agent**: `@ai-pipeline-researcher`
- **Input**: `docs/PRD.md` §3.6 (AI Surge Analysis), §4.7 (AI Agent Layer), §6.2 (Quality Gate), Branch 5.1 (hallucination rates), market-research-report §카테고리1
- **Output**: `research/step-4-ai-pipeline-research.md`
- **Description**: Deep research on AI surge analysis pipeline:
  1. LangGraph.js state graph design for 5-step orchestration pipeline
  2. LangChain.js 1.2: chain composition for news aggregation + analysis
  3. Quality Gate implementation: L1 (Zod schema), L2 (self-consistency), L3 (KIS API cross-validation)
  4. Confidence scoring algorithm (how to compute and display)
  5. Hallucination mitigation: structured output, citation requirements, fact-grounding
  6. Security: CVE-2025-68664 patch verification, input/output sanitization
  7. Cost optimization: token usage estimation per analysis, caching strategy
  8. Prompt templates for surge cause analysis (news synthesis + cause attribution)
- **Verification**:
  - [ ] LangGraph state graph diagram with all 5 nodes and edges
  - [ ] Quality Gate 3-layer implementation approach documented
  - [ ] Confidence score formula defined with example calculation
  - [ ] Security patch verification steps for CVE-2025-68664
  - [ ] Token cost estimation per analysis request (with Claude/GPT-4o pricing)
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate

### Step 5: News Data Source & Integration Research

- **Agent**: `@news-researcher`
- **Input**: `docs/PRD.md` §3.4 (News Feed), §4.5 (Data Flow), market-research-report §카테고리2
- **Output**: `research/step-5-news-research.md`
- **Description**: Deep research on news data pipeline:
  1. Naver Search API: authentication, rate limits (25,000/day), query patterns for stock news
  2. RSS feed integration: Korean financial news sources (Hankyung, Maeil Business, etc.)
  3. DART public disclosure API: real-time corporate announcements
  4. News-stock relevance scoring algorithm (keyword matching + NLP)
  5. News deduplication strategy across multiple sources
  6. News summarization via LangChain (prompt design for Korean financial news)
  7. Legal compliance: Naver API Terms of Service, RSS attribution requirements
  8. Storage strategy: news retention, full-text vs summary storage
- **Verification**:
  - [ ] Naver Search API integration code pattern with auth
  - [ ] At least 3 RSS feed sources with URLs and update frequency
  - [ ] DART API endpoint and data format documented
  - [ ] News-stock relevance scoring algorithm specified
  - [ ] Legal compliance checklist for all data sources
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate

### Step 6: Research Synthesis + Human Review

- **Agent**: `@research-synthesizer`
- **Checkpoint**: `(human)` — Research Phase Gate
- **Input**: `research/step-1-*.md` through `research/step-5-*.md`
- **Output**: `research/step-6-research-synthesis.md`
- **Description**: Synthesize all 5 research reports into a unified technical foundation:
  1. Cross-reference findings: identify conflicts between research reports
  2. Resolve technology version conflicts (if any)
  3. Extract key architectural decisions confirmed by research
  4. Identify remaining unknowns or risks discovered
  5. Create Context Reset recovery file for session continuity
  6. Produce a decision matrix: confirmed choices, alternatives, and rationale
- **Verification**:
  - [ ] All 5 research reports referenced and synthesized
  - [ ] Conflicts between reports identified and resolved
  - [ ] Decision matrix with confirmed tech choices and rationale
  - [ ] Context Reset recovery file generated
  - [ ] Remaining unknowns listed with mitigation plans
- **Review**: `@reviewer` (L2 Adversarial Review)
- **Translation**: `@translator` → `research/step-6-research-synthesis.ko.md`

---

## Phase 2: Planning (Steps 7-12)

> **Goal**: Produce detailed architecture, schemas, API contracts, and component specifications that serve as blueprints for implementation.

### Step 7: System Architecture Design

- **Agent**: `@system-architect`
- **Input**: `research/step-6-research-synthesis.md`, `docs/PRD.md` §4.2-4.3, Branch 2.1 (Modular Monolith), Branch 5.2 (Clean Architecture)
- **Output**: `planning/step-7-system-architecture.md`
- **Description**: Detailed Modular Monolith architecture design:
  1. Module boundary definitions (Stock, News, AI-Agent, Portfolio, Admin, Auth, Shared)
  2. Inter-module communication contracts (direct import vs event bus)
  3. Dependency flow diagram (outer → inner only, Clean Architecture rule)
  4. Fitness Functions: cyclic dependency detection, P95 < 200ms, deploy ≥ 2x/week
  5. Directory structure for Turborepo monorepo (apps/web, apps/api, packages/shared)
  6. Docker Compose service topology (api, web, postgres, redis)
  7. Environment configuration strategy (.env hierarchy, secret management)
  8. Error handling architecture (global exception filter, error taxonomy)
- **Verification**:
  - [ ] All 7 NestJS modules defined with explicit boundaries
  - [ ] Dependency flow diagram shows no circular dependencies
  - [ ] Fitness Function implementation approach for each metric
  - [ ] Turborepo monorepo directory structure complete
  - [ ] Docker Compose service definitions for all components
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate

### Step 8: Database Schema & API Contract Design

- **Agent**: `@schema-designer`
- **Input**: `research/step-2-database-research.md`, `docs/PRD.md` §4.4-4.5, `planning/step-7-system-architecture.md`
- **Output**: `planning/step-8-schema-api-design.md` + `planning/schema.prisma` (draft)
- **Description**: Detailed database and API specification:
  1. Complete Prisma schema for all 11+ entities with relations
  2. TimescaleDB hypertable DDL for stock_prices
  3. Continuous Aggregate definitions for technical indicators
  4. Index strategy for all sort/filter/search operations
  5. OpenAPI 3.1 specification for all REST endpoints (15+)
  6. WebSocket event contracts (stock-realtime, alerts)
  7. DTO definitions for all request/response types
  8. Migration strategy: Prisma migrate + raw SQL for TimescaleDB
- **Verification**:
  - [ ] Prisma schema covers all entities from PRD §4.4
  - [ ] TimescaleDB hypertable DDL syntactically valid
  - [ ] OpenAPI spec covers all endpoints from PRD §4.5
  - [ ] WebSocket event types and payloads defined
  - [ ] Index strategy mapped to every filter/sort dimension
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate

### Step 9: Frontend Component Architecture Design

- **Agent**: `@ui-designer`
- **Input**: `research/step-3-frontend-research.md`, `docs/PRD.md` §3.1-3.6, §3.8 (Design Direction)
- **Output**: `planning/step-9-frontend-design.md`
- **Description**: Dashboard UI/UX specification:
  1. Page structure: Dashboard (main), Stock Detail, Admin Panel, Login
  2. Widget component specifications for all 8 types
  3. React Grid Layout configuration (breakpoints, default layout, persistence)
  4. TradingView chart component props and data flow
  5. State management architecture (Zustand stores, TanStack Query keys)
  6. Socket.IO client integration pattern (connection, subscription, reconnection)
  7. shadcn/ui component usage plan (which components for which features)
  8. Color system: Korean stock convention (red/blue), dark/light mode support
  9. Responsive layout: 1920x1080 primary, 1440x900 minimum
- **Verification**:
  - [ ] All 8 widget types have component specs with props interface
  - [ ] React Grid Layout default layout JSON defined
  - [ ] Zustand store structure covers all client state needs
  - [ ] Socket.IO subscription plan for real-time data
  - [ ] Color system document with Korean stock conventions
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate

### Step 10: AI Agent & Quality Gate Design

- **Agent**: `@ai-designer`
- **Input**: `research/step-4-ai-pipeline-research.md`, `docs/PRD.md` §3.6, §4.7, §6.2
- **Output**: `planning/step-10-ai-agent-design.md`
- **Description**: AI surge analysis pipeline specification:
  1. LangGraph.js state graph: nodes, edges, conditional routing
  2. Node specifications: DataCollector, NewsSearcher, Analyzer, QualityGate, ResultFormatter
  3. Prompt templates for each LLM call (Korean financial context)
  4. Quality Gate implementation: L1 (Zod), L2 (self-consistency), L3 (KIS cross-validation)
  5. Confidence score computation formula
  6. Retry logic: max 3 regenerations on QG failure
  7. Cost budget per analysis (max tokens, model selection)
  8. "AI Generated" label + confidence display component spec
- **Verification**:
  - [ ] LangGraph state graph diagram is complete and valid
  - [ ] All 5 node specifications defined with I/O types
  - [ ] Quality Gate 3-layer implementation pseudocode
  - [ ] Confidence score formula with example
  - [ ] Prompt templates are Korean-financial-context aware
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate

### Step 11: CI/CD & Deployment Architecture Design

- **Agent**: `@devops-engineer`
- **Input**: `docs/PRD.md` §7.1-7.4, §8 (Milestones), Branch 3.2 (Robust Development)
- **Output**: `planning/step-11-devops-design.md`
- **Description**: CI/CD and production deployment specification:
  1. GitHub Actions workflows: lint, test, build, deploy
  2. Docker Compose configuration: dev + production profiles
  3. Turborepo pipeline configuration (build order, caching)
  4. Deployment target: Ubuntu Mini-PC + Docker Compose + Cloudflare Tunnel
  5. Health check endpoints and monitoring strategy
  6. Sentry integration: error tracking, performance monitoring
  7. Backup strategy: PostgreSQL pg_dump schedule, Redis RDB
  8. Secret management: .env hierarchy, GitHub Secrets for CI
- **Verification**:
  - [ ] GitHub Actions workflow YAML drafts for all stages
  - [ ] Docker Compose files for dev and production
  - [ ] Cloudflare Tunnel setup documented
  - [ ] Health check endpoints specified for all services
  - [ ] Backup strategy with frequency and retention policy
- **pACS**: F/C/L scoring after Pre-mortem
- **Review**: L1.5 pACS gate

### Step 12: Planning Synthesis + Human Review

- **Agent**: `@research-synthesizer`
- **Checkpoint**: `(human)` — Planning Phase Gate
- **Input**: `planning/step-7-*.md` through `planning/step-11-*.md`
- **Output**: `planning/step-12-planning-synthesis.md`
- **Description**: Synthesize all planning documents into implementation-ready blueprint:
  1. Cross-reference all designs for consistency
  2. Verify module boundary alignment (architecture ↔ schema ↔ frontend ↔ AI)
  3. Generate implementation task dependency graph
  4. Estimate implementation complexity per module
  5. Produce final Sprint allocation (Sprint 0-4 mapping)
  6. Create Context Reset recovery file
- **Verification**:
  - [ ] All planning documents cross-referenced
  - [ ] No design conflicts between modules
  - [ ] Implementation task dependency graph complete
  - [ ] Sprint allocation covers all modules and features
  - [ ] Context Reset recovery file generated
- **Review**: `@reviewer` (L2 Adversarial Review)
- **Translation**: `@translator` → `planning/step-12-planning-synthesis.ko.md`

---

## Phase 3: Implementation (Steps 13-24)

> **Goal**: Build the complete stock monitoring dashboard following the Sprint structure from PRD §8. Each step produces working code verified by tests.

### Step 13: Sprint 0 — Project Scaffolding

- **Agent**: `@devops-engineer`
- **Input**: `planning/step-7-system-architecture.md`, `planning/step-11-devops-design.md`
- **Output**: Project root with complete scaffolding
- **Verification**:
  - [ ] Turborepo monorepo initialized (apps/web, apps/api, packages/shared)
  - [ ] NestJS 11 project created with module stubs
  - [ ] Next.js 15 project created with App Router
  - [ ] Docker Compose file runs all services (`docker compose up -d`)
  - [ ] ESLint + Prettier + TypeScript strict configured
  - [ ] GitHub Actions CI workflow passes on empty project
  - [ ] `.env.example` with all required variables documented
  - [ ] `pnpm install && pnpm dev` starts full stack within 60 seconds
- **pACS**: F/C/L scoring
- **Tools**: Bash (scaffolding commands), Write (config files), Edit (adjustments)

### Step 14: Sprint 1 — Database Schema & Prisma Setup

- **Agent**: `@backend-builder`
- **Checkpoint**: `(human)` — DB Schema Review (HITL #1: financial data integrity)
- **Input**: `planning/step-8-schema-api-design.md`, `planning/schema.prisma`
- **Output**: `apps/api/prisma/schema.prisma` + migration files
- **Verification**:
  - [ ] Prisma schema matches all 11+ entities from planning
  - [ ] TimescaleDB hypertable created via raw SQL migration
  - [ ] Continuous Aggregates for MA, RSI defined
  - [ ] All indexes from planning step applied
  - [ ] `npx prisma migrate dev` runs without errors
  - [ ] `npx prisma generate` produces typed client
  - [ ] Seed script populates test data (10 stocks, 1 week of prices)
- **pACS**: F/C/L scoring
- **Review**: `@reviewer` (L2 — DB schema is HITL-critical)

### Step 15: Sprint 1 — Backend Core Modules (Stock, News, Portfolio, Admin, Auth)

- **Agent**: `@backend-builder`
- **Input**: `planning/step-7-system-architecture.md`, `planning/step-8-schema-api-design.md`
- **Output**: `apps/api/src/modules/` — all NestJS modules
- **Description**: Implement all backend modules:
  1. **Stock Module**: CRUD, sort/filter/pagination, theme grouping, market indices
  2. **News Module**: Naver Search API client, RSS parser, DART client, relevance scoring
  3. **Portfolio Module**: Watchlist CRUD, alert CRUD, threshold configuration
  4. **Admin Module**: System status, API key management, data collection monitoring
  5. **Auth Module**: Better Auth integration, signup/login/session, role-based access
  6. **Shared Module**: Database service, Redis service, Logger, Rate Limiter, Scheduler
- **Verification**:
  - [ ] All REST endpoints from OpenAPI spec implemented
  - [ ] Unit tests for each service (≥ 80% coverage per module)
  - [ ] Integration tests with Testcontainers (PG + Redis)
  - [ ] No circular dependencies between modules
  - [ ] ESLint + TypeScript strict pass with zero errors
  - [ ] API response P95 < 200ms on test data
- **pACS**: F/C/L scoring
- **Review**: L1.5 pACS gate

### Step 16: Sprint 1 — KIS API Integration & WebSocket Real-time Pipeline

- **Agent**: `@backend-builder`
- **Checkpoint**: `(human)` — External API Integration (HITL #4: rate limits, auth patterns)
- **Input**: `research/step-1-kis-api-research.md`, `planning/step-8-schema-api-design.md`
- **Output**: `apps/api/src/modules/stock/services/kis-api.service.ts` + WebSocket gateway
- **Description**: Implement real-time stock data pipeline:
  1. KIS OpenAPI client: OAuth2 auth, token refresh, REST endpoints
  2. KIS WebSocket client: real-time price subscription, heartbeat, reconnection
  3. Redis Pub/Sub: price broadcast from KIS → Redis → Socket.IO
  4. Socket.IO gateway: client subscription management, room-based broadcasting
  5. TimescaleDB ingestion: batch insert from Redis queue
  6. Bull Queue: async data processing jobs (price aggregation, alert checking)
  7. Error handling: KIS API failures, WebSocket disconnection recovery
- **Verification**:
  - [ ] KIS API auth flow works (token acquisition + refresh)
  - [ ] WebSocket real-time price received for at least 5 stocks
  - [ ] Redis Pub/Sub → Socket.IO pipeline delivers prices to client
  - [ ] TimescaleDB receives and stores price data correctly
  - [ ] Auto-reconnection works on WebSocket disconnect
  - [ ] Rate limit handling prevents API blocking
- **pACS**: F/C/L scoring
- **Review**: `@reviewer` (L2 — External API is HITL-critical)

### Step 17: Sprint 2 — Frontend Dashboard Layout & Widgets

- **Agent**: `@frontend-builder`
- **Input**: `planning/step-9-frontend-design.md`, `research/step-3-frontend-research.md`
- **Output**: `apps/web/src/` — Dashboard pages and widget components
- **Description**: Implement widget-based dashboard UI:
  1. App shell: Layout with sidebar navigation, header, responsive container
  2. React Grid Layout: drag-and-drop, resize, layout persistence (localStorage)
  3. Widget components for all 8 types (watchlist, chart, news, theme, surge alert, AI analysis, indices, top volume)
  4. Zustand stores: dashboard layout, user preferences, active stock
  5. TanStack Query: REST API hooks for all endpoints
  6. shadcn/ui integration: consistent component library
  7. Stock list: virtualized list for 2,500+ stocks with real-time sort/filter
  8. Theme grouping UI: theme cards with performance summary
- **Verification**:
  - [ ] Dashboard renders with all 8 widget types
  - [ ] Drag-and-drop layout works and persists
  - [ ] Stock list handles 2,500+ items without lag (< 16ms frame time)
  - [ ] All shadcn/ui components render correctly
  - [ ] Korean stock color convention applied (red=up, blue=down)
  - [ ] Responsive layout works at 1920x1080 and 1440x900
- **pACS**: F/C/L scoring
- **Review**: L1.5 pACS gate

### Step 18: Sprint 2 — Real-time Charts & Socket.IO Client

- **Agent**: `@frontend-builder`
- **Input**: `planning/step-9-frontend-design.md`, Step 16 output (WebSocket gateway)
- **Output**: `apps/web/src/components/charts/` + Socket.IO client setup
- **Description**: Implement real-time data visualization:
  1. TradingView Lightweight Charts: candlestick chart with real-time updates
  2. Recharts: KPI widgets, volume bars, theme performance
  3. Socket.IO client: connection management, auto-reconnection, subscription
  4. Zustand real-time store: price updates → chart re-render pipeline
  5. Alert visualization: surge notification toast, threshold indicators
  6. Market indices widget: KOSPI/KOSDAQ real-time tracking
  7. Performance optimization: requestAnimationFrame, memo, useMemo
- **Verification**:
  - [ ] Candlestick chart renders historical + real-time data
  - [ ] Socket.IO receives and displays live price updates (< 5 sec latency)
  - [ ] Chart re-renders don't exceed 16ms frame budget
  - [ ] Auto-reconnection works when WebSocket drops
  - [ ] All chart types render with correct Korean number formatting
- **pACS**: F/C/L scoring
- **Review**: L1.5 pACS gate

### Step 19: Sprint 2 — AI Agent Module (LangGraph Surge Analysis)

- **Agent**: `@ai-builder`
- **Checkpoint**: `(human)` — AI Analysis Validation (HITL #6: hallucination prevention)
- **Input**: `planning/step-10-ai-agent-design.md`, `research/step-4-ai-pipeline-research.md`
- **Output**: `apps/api/src/modules/ai-agent/` — LangGraph pipeline
- **Description**: Implement AI surge cause analysis pipeline:
  1. LangGraph.js state graph: 5 nodes (DataCollector, NewsSearcher, Analyzer, QualityGate, ResultFormatter)
  2. DataCollector node: fetch stock data from DB + KIS API for target stock
  3. NewsSearcher node: aggregate news from Naver Search + RSS + DART
  4. Analyzer node: LLM call with structured output (surge cause + evidence + confidence)
  5. QualityGate node: L1 (Zod validation), L2 (self-consistency check), L3 (KIS data cross-validation)
  6. ResultFormatter node: format for frontend display with "AI Generated" label
  7. Retry logic: up to 3 regenerations on QG failure
  8. Bull Queue integration: async analysis job processing
- **Verification**:
  - [ ] LangGraph pipeline executes end-to-end for a test stock
  - [ ] Quality Gate L1 catches malformed outputs (Zod validation)
  - [ ] Quality Gate L2 detects self-contradictions
  - [ ] Quality Gate L3 cross-validates with actual KIS data
  - [ ] Confidence score calculated and within [0, 100] range
  - [ ] "AI Generated" label and confidence displayed in output
  - [ ] Retry logic triggers on QG failure (max 3x)
  - [ ] Total analysis time < 30 seconds per stock
- **pACS**: F/C/L scoring
- **Review**: `@reviewer` (L2 — AI output is HITL-critical) + `@fact-checker` (verify analysis accuracy)

### Step 20: Sprint 3 — Integration & News Pipeline

- **Agent**: `@cross-validator`
- **Input**: All Step 13-19 outputs
- **Output**: `testing/step-20-integration-report.md`
- **Description**: Full system integration and validation:
  1. End-to-end flow: KIS API → Backend → WebSocket → Frontend chart update
  2. News pipeline: Naver Search → Backend → Frontend news widget
  3. AI analysis: surge detection → LangGraph pipeline → QG → frontend card
  4. Authentication: signup → login → dashboard → watchlist → alerts
  5. Admin: API key management → data collection status → user management
  6. Theme grouping: create theme → add stocks → view performance
  7. Cross-module data consistency: stock-news linking, theme-stock mapping
- **Verification**:
  - [ ] All 6 functional requirements (PRD §3.1-3.6) demonstrated working
  - [ ] Real-time price update end-to-end in < 5 seconds
  - [ ] AI analysis produces valid output for 3+ test stocks
  - [ ] Auth flow works for admin and regular user roles
  - [ ] No console errors in frontend during full workflow
  - [ ] All API endpoints return correct HTTP status codes
- **pACS**: F/C/L scoring
- **Review**: L1.5 pACS gate

### Step 21: Sprint 3 — Testing & Security Audit

- **Agent**: `@test-engineer` + `@security-auditor`
- **Checkpoint**: `(human)` — Security + Financial Logic Review (HITL #2, #3)
- **Input**: All implementation code, `docs/PRD.md` §6.2-6.4, §7.3, Branch 3.2 (6 Security Layers)
- **Output**: `testing/step-21-test-security-report.md`
- **Description**: Comprehensive testing and security audit:
  1. **Unit Tests**: Vitest, target ≥ 80% coverage across all modules
  2. **Integration Tests**: Testcontainers for PG + Redis, all API endpoints
  3. **E2E Tests**: Playwright, 10 core scenarios (PRD §7.3)
  4. **AI Eval Suite**: Quality Gate pass rates (L1: 99%, L2: 95%, L3: 90%)
  5. **Security Audit**:
     - SAST: ESLint security rules, TypeScript strict
     - Dependency audit: `pnpm audit`, known CVE check
     - Secret detection: no hardcoded keys/tokens
     - Auth flow: session management, CSRF protection
     - Input validation: Zod on all API endpoints
     - Financial calculation: decimal precision verification
  6. **Performance**: API P95 < 200ms, dashboard load < 3 seconds
- **Verification**:
  - [ ] Unit test coverage ≥ 80%
  - [ ] All integration tests pass
  - [ ] Playwright E2E: 10 scenarios pass
  - [ ] AI Quality Gate: L1 ≥ 99%, L2 ≥ 95%, L3 ≥ 90%
  - [ ] No critical/high severity CVEs in dependencies
  - [ ] No hardcoded secrets in codebase
  - [ ] Financial calculations verified with known test cases
  - [ ] API P95 < 200ms under load
- **pACS**: F/C/L scoring
- **Review**: `@reviewer` (L2 Adversarial Review — security critical)

### Step 22: Sprint 4 — Performance Optimization & Bug Fixes

- **Agent**: `@backend-builder` + `@frontend-builder`
- **Input**: `testing/step-21-test-security-report.md`, integration findings from Step 20
- **Output**: Optimized codebase
- **Description**: Address all issues found in testing:
  1. Fix all bugs discovered in E2E tests
  2. Performance optimization: query optimization, Redis caching tuning
  3. WebSocket stability: reconnection edge cases, heartbeat tuning
  4. Frontend performance: lazy loading, code splitting, image optimization
  5. SonarQube analysis: resolve all code smells and bugs
  6. TDR check: ensure < 10% technical debt ratio
- **Verification**:
  - [ ] All previously failing tests now pass
  - [ ] SonarQube Quality Gate: A grade
  - [ ] TDR < 10%
  - [ ] Dashboard initial load < 3 seconds (Lighthouse)
  - [ ] WebSocket stable for 24+ hours continuous operation
  - [ ] Memory usage stable (no leaks over 24-hour test)
- **pACS**: F/C/L scoring
- **Review**: L1.5 pACS gate

### Step 23: Sprint 4 — Production Deployment

- **Agent**: `@devops-engineer`
- **Checkpoint**: `(human)` — Deployment Configuration Review (HITL #5)
- **Input**: `planning/step-11-devops-design.md`, optimized codebase from Step 22
- **Output**: Production deployment on Mini-PC
- **Description**: Deploy to production environment:
  1. Docker Compose production profile (resource limits, restart policies)
  2. PostgreSQL production configuration (connection pooling, WAL settings)
  3. Redis production configuration (maxmemory, eviction policy)
  4. Cloudflare Tunnel setup for HTTPS external access
  5. Sentry DSN configuration for error tracking
  6. Backup automation: pg_dump cron job, Redis RDB schedule
  7. Health check endpoints: /health, /ready for all services
  8. Monitoring: docker logs + Sentry alerts
  9. Documentation: deployment guide, operations manual
- **Verification**:
  - [ ] All services run in Docker Compose production profile
  - [ ] Cloudflare Tunnel provides HTTPS access
  - [ ] Health check endpoints return 200 for all services
  - [ ] Sentry receives test error
  - [ ] Backup cron job scheduled and tested
  - [ ] Deployment guide documents full recovery procedure
  - [ ] System survives Docker restart (data persistence verified)
- **pACS**: F/C/L scoring
- **Review**: `@reviewer` (L2 — deployment is HITL-critical)

### Step 24: Final Review + MVP Launch

- **Agent**: `@cross-validator`
- **Checkpoint**: `(human)` — Final Acceptance (HITL #6: complete validation)
- **Input**: All outputs from Steps 13-23
- **Output**: `final/step-24-launch-report.md`
- **Description**: Final validation and launch:
  1. Full feature checklist: verify all PRD §3.1-3.6 requirements
  2. KPI verification: all technical + business KPIs from PRD §11
  3. Risk mitigation verification: all R1-R9 mitigations in place
  4. Quality Gate verification: all 3 layers operational
  5. Documentation completeness: API docs, deployment guide, user guide
  6. Launch readiness checklist sign-off
- **Verification**:
  - [ ] All 6 functional requirements (§3.1-3.6) working in production
  - [ ] API P95 < 200ms in production
  - [ ] WebSocket latency < 5 seconds in production
  - [ ] AI analysis produces valid, QG-passed results
  - [ ] Test coverage ≥ 80%
  - [ ] SonarQube A grade
  - [ ] TDR < 10%
  - [ ] All documentation complete
  - [ ] MVP launch successful
- **Review**: `@reviewer` (L2 Final Adversarial Review)
- **Translation**: `@translator` → `final/step-24-launch-report.ko.md`

---

## Execution Configuration

### Autopilot Mode
```yaml
autopilot:
  enabled: true
  decision_log_dir: "autopilot-logs/"
  auto_approved_steps: []  # Populated at runtime
```

### ULW Mode (Ultrawork)
- **I-1 Sisyphus Persistence**: Max 3 retries per step with different approaches; quality-gate retries 15 (ULW budget)
- **I-2 Mandatory Task Decomposition**: All non-trivial steps use TaskCreate → TaskUpdate → TaskList
- **I-3 Bounded Retry Escalation**: >3 consecutive same-target retries → escalate to user

### Quality Gates per Step
```
Output → L0 (file exists, ≥100 bytes)
       → L1 (Verification criteria met)
       → L1.5 (pACS ≥ 70 GREEN, 50-69 YELLOW, <50 RED → retry)
       → L2 (Adversarial Review for marked steps)
       → Translation (after L2 PASS, for marked steps)
```

### HITL Checkpoints (6 from PRD, mapped to steps)
| HITL # | PRD Intervention Point | Workflow Step |
|--------|----------------------|--------------|
| 1 | DB Schema Changes | Step 14 |
| 2 | Authentication/Authorization Logic | Step 21 |
| 3 | Financial Calculation Logic | Step 21 |
| 4 | External API Integration | Step 16 |
| 5 | Deployment Configuration | Step 23 |
| 6 | AI Analysis Result Validation | Step 19, Step 24 |

### Context Reset Points
- After Step 6 (Research Synthesis) — recovery file in `research/`
- After Step 12 (Planning Synthesis) — recovery file in `planning/`
- After Step 20 (Integration) — recovery file in `testing/`
- After Step 24 (Launch) — final archive

---

## SOT: `.claude/state.yaml`

Initialized at workflow start. Only the Orchestrator writes to this file.

```yaml
workflow:
  name: "stock-monitoring-dashboard"
  current_step: 1
  status: "in_progress"
  parent_genome:
    source: "AgenticWorkflow"
    version: "2026-03-28"
    inherited_dna:
      - "absolute-criteria"
      - "sot-pattern"
      - "3-phase-structure"
      - "4-layer-qa"
      - "safety-hooks"
      - "adversarial-review"
      - "decision-log"
      - "context-preservation"
      - "cross-step-traceability"
      - "cap-coding-anchors"
  outputs: {}
  pending_human_action:
    step: null
    options: []
  autopilot:
    enabled: true
    decision_log_dir: "autopilot-logs/"
    auto_approved_steps: []
  pacs:
    current_step_score: null
    dimensions: {F: null, C: null, L: null}
    weak_dimension: null
    pre_mortem_flag: null
    history: {}
  verification:
    last_verified_step: 0
    retries: {}
```
