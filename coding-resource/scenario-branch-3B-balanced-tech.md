# Branch 3.B: Balanced-Tech Scenario

## 기술 혁신과 실용성의 균형을 맞추는 기술 리더

> **철학: "좋은 기술이지만, 우리가 할 수 있어야 한다."**

---

## 0. 설계 원칙

본 시나리오는 PHASE 1-2에서 도출된 정량 데이터와 4개 관점(최신 기술, 안정성, 개발 속도, 유지보수성)의 수렴점을 기반으로 설계되었다. 핵심 판단 기준은 다음 세 가지이다:

1. **검증 기간 3-5년 이상, 대규모 채택이 확인된 기술**을 주축으로 선택한다
2. **최신 기술은 명확한 생산성 이점이 정량적으로 증명된 경우에만** 도입한다
3. **팀 학습 비용 대비 생산성 향상 ROI가 양수인 기술**만 허용한다

---

## 1. 전체 기술 스택 설계

### 1.1 기술 스택 총괄표

| 계층 | 기술 | 버전 | 선택 근거 (PHASE 1-2 데이터) | 검증 기간 |
|------|------|------|----------------------------|----------|
| **Language** | TypeScript | 5.x | 4/4 관점 합의, Fortune 500 광범위 채택 | 12년 (2012~) |
| **Frontend** | React 19 | 19.x | 4/4 합의, Fortune 500 1,035개사, 시장 지배적 | 11년 (2013~) |
| **UI Framework** | Next.js | 15.x | React 메타프레임워크 사실상 표준, SSR/SSG 내장 | 9년 (2016~) |
| **UI Components** | shadcn/ui + Tailwind CSS 4 | latest | 커스터마이징 자유도 + 접근성 내장, 복사 기반(의존성 없음) | 3년 (shadcn 2023~) |
| **상태 관리** | Zustand + TanStack Query | 5.x / 5.x | 경량 전역 상태 + 서버 상태 분리, 보일러플레이트 최소화 | 5년 / 5년 |
| **차트/시각화** | TradingView Lightweight Charts + Recharts | 4.x / 2.x | 금융 차트 산업 표준 + 범용 대시보드 차트 | 7년 / 8년 |
| **Backend** | NestJS | 11.x | PHASE 2 토론 2:2 분열 중 Balanced 관점 선택, Adidas 일 10억+ 요청, 9년 검증, DI 내장, TypeScript 네이티브 | 9년 (2017~) |
| **ORM** | Prisma | 6.x | TypeScript 생태계 사실상 표준 ORM, 타입 안전 쿼리, 마이그레이션 자동화 | 7년 (2019~) |
| **실시간 통신** | Socket.IO | 4.x | WebSocket 추상화, 자동 재연결, Room 기반 브로드캐스트 | 14년 (2010~) |
| **Database** | PostgreSQL 17 + TimescaleDB | 17.x / 2.x | 4/4 합의 PG 필수, Balanced는 PG + TimescaleDB(검증+시계열), 30년 금융 검증, ACID | 30년+ (PG) / 8년 (TS) |
| **Cache** | Redis 7 | 7.x | 4/4 합의 영역, 17년 검증, Pub/Sub + 캐시 + 세션 | 17년 (2009~) |
| **AI Agent** | LangChain.js + LangGraph.js | 0.3.x / 0.2.x | 47M+ PyPI 다운로드(Python 기준), JS 생태계 급성장, 에이전트 사실상 표준 | 3년 (2023~) |
| **LLM Provider** | OpenAI GPT-4o / Claude 3.5 Sonnet | latest | 비용 효율 + 품질 균형, 프로바이더 교체 가능 설계 | - |
| **증권 API** | 한국투자증권 OpenAPI | v1 | 4/4 합의, 국내 개인투자자 접근성 최고 | 3년 (2022~) |
| **인증** | NextAuth.js (Auth.js) | 5.x | Next.js 생태계 표준, OAuth/Credentials 지원 | 5년 (2020~) |
| **컨테이너** | Docker + Docker Compose | 27.x | 개발 환경 일관성, 배포 자동화 기반 | 12년 (2013~) |
| **CI/CD** | GitHub Actions | - | GitHub 통합, 무료 티어 충분 | 6년 (2019~) |
| **호스팅** | AWS (EC2 + RDS + ElastiCache) | - | 한국 리전 존재, 금융 서비스 검증, 프리 티어 활용 가능 | 19년 (2006~) |
| **모니터링** | Sentry + Grafana + Prometheus | latest | 에러 추적 + 메트릭 시각화 + 알림 | 13년 / 11년 / 12년 |

### 1.2 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Next.js 15 (React 19 + TypeScript 5)                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────┐   │    │
│  │  │Dashboard │ │Watchlist │ │News Feed │ │Theme Groups     │   │    │
│  │  │Widgets   │ │& Filter  │ │& Search  │ │& Sort/Filter    │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────────┘   │    │
│  │  ┌────────────────────────────────────────────────────────┐    │    │
│  │  │  State: Zustand (UI) + TanStack Query (Server State)   │    │    │
│  │  └────────────────────────────────────────────────────────┘    │    │
│  │  ┌────────────────────────────────────────────────────────┐    │    │
│  │  │  Charts: TradingView Lightweight + Recharts            │    │    │
│  │  └────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│         │ REST API              │ WebSocket (Socket.IO)                  │
└─────────┼───────────────────────┼───────────────────────────────────────┘
          │                       │
┌─────────┼───────────────────────┼───────────────────────────────────────┐
│         ▼                       ▼           SERVER                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  NestJS 11 (Modular Monolith)                                  │    │
│  │                                                                 │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐  │    │
│  │  │ Stock       │ │ News        │ │ AI Agent                │  │    │
│  │  │ Module      │ │ Module      │ │ Module                  │  │    │
│  │  │             │ │             │ │                         │  │    │
│  │  │ - 실시간주가│ │ - 뉴스수집  │ │ - LangChain.js          │  │    │
│  │  │ - 정렬/필터 │ │ - 연관분석  │ │ - LangGraph.js          │  │    │
│  │  │ - 테마그룹  │ │ - 요약생성  │ │ - AI Quality Gate       │  │    │
│  │  │ - KIS API   │ │ - RSS/크롤링│ │ - 급등 원인 분석        │  │    │
│  │  └──────┬──────┘ └──────┬──────┘ └───────────┬─────────────┘  │    │
│  │         │               │                     │                │    │
│  │  ┌──────┴───────────────┴─────────────────────┴────────────┐  │    │
│  │  │  Shared Infrastructure Layer                             │  │    │
│  │  │  - Auth (NextAuth.js)  - WebSocket Gateway (Socket.IO)   │  │    │
│  │  │  - Scheduler (Bull Queue + Redis)  - Logger (Pino)       │  │    │
│  │  │  - Config  - Error Handling  - Rate Limiter              │  │    │
│  │  └──────┬───────────────┬─────────────────────┬────────────┘  │    │
│  └─────────┼───────────────┼─────────────────────┼────────────────┘    │
│            │               │                     │                      │
│  ┌─────────▼───────────────▼─────────────────────▼────────────────┐    │
│  │  DATA LAYER                                                    │    │
│  │                                                                 │    │
│  │  ┌──────────────────┐  ┌──────────────┐  ┌─────────────────┐  │    │
│  │  │ PostgreSQL 17    │  │ TimescaleDB  │  │ Redis 7         │  │    │
│  │  │ + Prisma ORM     │  │ (PG 확장)    │  │                 │  │    │
│  │  │                  │  │              │  │ - 실시간 캐시   │  │    │
│  │  │ - 종목 마스터    │  │ - 주가 이력  │  │ - 세션 스토어   │  │    │
│  │  │ - 사용자 설정    │  │ - 거래 데이터│  │ - Pub/Sub       │  │    │
│  │  │ - 테마/그룹      │  │ - 시계열분석 │  │ - Bull Queue    │  │    │
│  │  │ - 뉴스 메타      │  │              │  │ - Rate Limit    │  │    │
│  │  └──────────────────┘  └──────────────┘  └─────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  EXTERNAL SERVICES                                                    │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │한국투자증권   │  │ 뉴스 소스    │  │ AI Provider              │   │
│  │OpenAPI       │  │              │  │                          │   │
│  │              │  │ - 네이버 금융│  │ - OpenAI API             │   │
│  │ - 실시간호가 │  │ - 한경       │  │ - Anthropic API          │   │
│  │ - 체결가     │  │ - 매경       │  │ (LangChain 추상화로      │   │
│  │ - 일봉/분봉  │  │ - RSS 피드   │  │  프로바이더 교체 가능)   │   │
│  │ - 종목정보   │  │              │  │                          │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE & DEVOPS                                             │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Docker       │  │ GitHub       │  │ Monitoring               │   │
│  │ Compose      │  │ Actions      │  │                          │   │
│  │              │  │              │  │ - Sentry (에러 추적)     │   │
│  │ - App        │  │ - Lint/Test  │  │ - Grafana (대시보드)     │   │
│  │ - PG+TS      │  │ - Build      │  │ - Prometheus (메트릭)    │   │
│  │ - Redis      │  │ - Deploy     │  │ - Loki (로그 집계)       │   │
│  │ - Grafana    │  │ - AI Review  │  │                          │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│                                                                       │
│  AWS: EC2 (t3.medium) + RDS (db.t3.medium) + ElastiCache (t3.small) │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.3 Modular Monolith 아키텍처 상세

PHASE 1-2에서 3/4 관점이 합의한 Modular Monolith를 채택한다. NestJS의 Module 시스템이 이를 자연스럽게 지원한다.

```
src/
├── main.ts
├── app.module.ts                    # Root Module (모듈 조합)
│
├── modules/
│   ├── stock/                       # 주식 도메인 모듈
│   │   ├── stock.module.ts
│   │   ├── controllers/
│   │   │   ├── stock.controller.ts          # REST API
│   │   │   └── stock-realtime.gateway.ts    # WebSocket Gateway
│   │   ├── services/
│   │   │   ├── stock-data.service.ts        # 주가 데이터 수집/처리
│   │   │   ├── stock-filter.service.ts      # 정렬/필터링 로직
│   │   │   ├── stock-theme.service.ts       # 테마별 그룹핑
│   │   │   └── kis-api.service.ts           # 한국투자증권 API 연동
│   │   ├── entities/
│   │   ├── dto/
│   │   └── interfaces/
│   │
│   ├── news/                        # 뉴스 도메인 모듈
│   │   ├── news.module.ts
│   │   ├── controllers/
│   │   │   └── news.controller.ts
│   │   ├── services/
│   │   │   ├── news-collector.service.ts    # 뉴스 수집 (RSS, 크롤링)
│   │   │   ├── news-analyzer.service.ts     # 종목-뉴스 연관 분석
│   │   │   └── news-summary.service.ts      # AI 요약 생성
│   │   ├── entities/
│   │   └── dto/
│   │
│   ├── ai-agent/                    # AI 에이전트 모듈
│   │   ├── ai-agent.module.ts
│   │   ├── services/
│   │   │   ├── agent-orchestrator.service.ts    # LangGraph 워크플로우
│   │   │   ├── surge-analyzer.service.ts        # 급등 원인 분석
│   │   │   ├── quality-gate.service.ts          # AI 출력 검증
│   │   │   └── llm-provider.service.ts          # LLM 추상화 (교체 가능)
│   │   └── chains/                              # LangChain 체인 정의
│   │
│   ├── dashboard/                   # 대시보드 설정 모듈
│   │   ├── dashboard.module.ts
│   │   ├── controllers/
│   │   │   └── dashboard.controller.ts
│   │   ├── services/
│   │   │   ├── widget.service.ts            # 위젯 CRUD
│   │   │   └── layout.service.ts            # 레이아웃 관리
│   │   └── entities/
│   │
│   └── admin/                       # 관리자 모듈
│       ├── admin.module.ts
│       ├── controllers/
│       │   └── admin.controller.ts
│       └── services/
│           ├── api-key.service.ts           # API 키 관리
│           └── system-config.service.ts     # 시스템 설정
│
├── shared/                          # 공유 인프라 레이어
│   ├── auth/                        # 인증/인가
│   ├── database/                    # Prisma 설정, 마이그레이션
│   ├── cache/                       # Redis 캐시 전략
│   ├── queue/                       # Bull Queue 작업 스케줄러
│   ├── websocket/                   # Socket.IO 공통 설정
│   ├── logger/                      # Pino 로거
│   ├── config/                      # 환경 변수 관리
│   └── common/                      # DTO, 인터셉터, 필터, 가드
│
└── prisma/
    ├── schema.prisma                # 데이터 모델 정의
    └── migrations/                  # 마이그레이션 이력
```

**모듈 간 통신 규칙**:
- 모듈 간 직접 import 금지. 반드시 NestJS의 `exports`를 통한 공개 인터페이스만 사용
- 공유 상태는 Redis (Pub/Sub) 또는 이벤트 버스를 통해 전달
- 각 모듈은 독립적으로 테스트 가능해야 함
- 향후 마이크로서비스 분리 시 모듈 경계가 서비스 경계가 됨

### 1.4 각 계층 선택 근거 상세

#### Frontend: React 19 + Next.js 15

| 평가 항목 | 점수 | 근거 |
|----------|------|------|
| 시장 검증 | **10/10** | Fortune 500 1,035개사, npm 주간 다운로드 2,600만+ |
| 생태계 | **10/10** | shadcn/ui, TradingView Charts, TanStack Query 등 금융 대시보드에 필요한 모든 라이브러리 존재 |
| 학습 곡선 | **8/10** | React 경험자 풍부, Next.js App Router는 학습 필요 |
| 성능 | **9/10** | React 19 자동 메모이제이션, Server Components로 초기 로딩 최적화 |
| 채용 용이성 | **10/10** | 국내 프론트엔드 시장 지배적 |

**왜 Hono+Bun이 아닌가**: PHASE 2 토론에서 2:2 분열이 발생했다. Balanced 관점에서 Hono+Bun은 벤치마크 성능은 우수하나(Bun HTTP 처리량 NestJS 대비 약 3-5x), 프로덕션 사례가 3년 미만이고 엔터프라이즈 검증이 부족하다. NestJS는 Adidas(일 10억+ 요청), ING Bank, Roche 등 금융/엔터프라이즈 검증이 충분하다.

#### Backend: NestJS 11

| 평가 항목 | 점수 | 근거 |
|----------|------|------|
| 시장 검증 | **9/10** | Adidas 일 10억+ 요청, 9년 검증, GitHub 68k+ stars |
| DI/모듈 시스템 | **10/10** | Angular 스타일 DI 내장, Modular Monolith 자연 지원 |
| TypeScript | **10/10** | 네이티브 TypeScript, 프론트엔드와 타입 공유 |
| WebSocket | **9/10** | @nestjs/websockets + Socket.IO 통합 내장 |
| 학습 곡선 | **7/10** | 데코레이터 패턴, DI 컨테이너 개념 학습 필요 |

#### Database: PostgreSQL 17 + TimescaleDB

| 평가 항목 | 점수 | 근거 |
|----------|------|------|
| 금융 검증 | **10/10** | 30년+ 금융 산업 검증, ACID 완전 보장 |
| 시계열 처리 | **9/10** | TimescaleDB 확장으로 주가 이력 최적화 (일반 PG 대비 시계열 쿼리 10-100x 성능) |
| 운영 비용 | **9/10** | 별도 시계열 DB(ClickHouse) 대신 PG 확장 사용으로 운영 복잡도 최소화 |
| 확장성 | **8/10** | 수평 분할 시 Citus 확장 가능, 본 프로젝트 규모에서는 단일 인스턴스 충분 |

**왜 ClickHouse가 아닌가**: PHASE 2에서 PG + ClickHouse 조합이 논의되었으나, 개인용 대시보드 규모(수천 종목, 일 수십만 레코드)에서는 별도 OLAP 엔진이 과잉이다. TimescaleDB는 PostgreSQL 확장이므로 추가 인프라 비용 없이 시계열 최적화를 달성한다.

#### AI Agent Layer: LangChain.js + LangGraph.js

| 평가 항목 | 점수 | 근거 |
|----------|------|------|
| 생태계 | **9/10** | 47M+ PyPI 다운로드(Python), JS 생태계 급성장 중 |
| 에이전트 패턴 | **9/10** | LangGraph의 상태 기계 기반 에이전트 워크플로우 |
| LLM 추상화 | **10/10** | OpenAI, Anthropic, Google 등 프로바이더 교체 한 줄 수정 |
| AI Quality Gate | **10/10** | 4/4 합의, AI 코드 1.7x 부채 축적 데이터 기반 필수 |

**AI Quality Gate 구현 전략** (PHASE 1 데이터: AI 코드 88% 부정적 영향 보고):
1. **Input Validation**: AI에 전달하는 프롬프트/컨텍스트 정제 (P1 원칙: 데이터 정제)
2. **Output Verification**: AI 생성 결과의 사실성/정확성 자동 검증
3. **Hallucination Detection**: 종목명, 가격, 뉴스 팩트의 교차 검증
4. **Confidence Scoring**: 낮은 신뢰도 결과는 사용자에게 명시적 표시

---

## 2. 개발 환경 및 프로세스

### 2.1 개발 환경 구성

```yaml
# docker-compose.dev.yml
version: "3.9"
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"    # Next.js (Frontend)
      - "3001:3001"    # NestJS (Backend API)
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://user:pass@postgres:5432/stockdb
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: timescale/timescaledb:latest-pg17
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: stockdb
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3100:3000"
    depends_on:
      - prometheus

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

volumes:
  pgdata:
```

**개발 도구 체인**:

| 도구 | 용도 | 설정 수준 |
|------|------|----------|
| **pnpm** | 패키지 매니저 | Monorepo workspace (apps/web, apps/api, packages/shared) |
| **Turborepo** | 모노레포 빌드 오케스트레이션 | 병렬 빌드, 캐시, 의존성 그래프 |
| **ESLint + Prettier** | 코드 품질 + 포매팅 | Strict TypeScript 규칙, 저장 시 자동 포맷 |
| **Husky + lint-staged** | Git Hook | 커밋 전 린트/포맷 자동 실행 |
| **Vitest** | 유닛 테스트 | Vite 기반 빠른 실행, Jest 호환 API |
| **Playwright** | E2E 테스트 | 핵심 사용자 시나리오 자동 검증 |
| **Prisma Studio** | DB 관리 | 개발 중 데이터 확인/편집 GUI |
| **Storybook** | UI 컴포넌트 개발 | 대시보드 위젯 독립 개발/문서화 |

### 2.2 Monorepo 구조

```
stock-monitoring-dashboard/
├── apps/
│   ├── web/                 # Next.js 15 Frontend
│   │   ├── app/             # App Router
│   │   ├── components/      # UI 컴포넌트
│   │   ├── hooks/           # Custom Hooks
│   │   ├── stores/          # Zustand 스토어
│   │   └── lib/             # 유틸리티
│   │
│   └── api/                 # NestJS 11 Backend
│       ├── src/
│       │   ├── modules/     # Modular Monolith (1.3절 참조)
│       │   └── shared/      # 공유 인프라
│       └── prisma/          # DB 스키마/마이그레이션
│
├── packages/
│   ├── shared-types/        # 프론트/백엔드 공유 TypeScript 타입
│   ├── shared-utils/        # 공유 유틸리티 함수
│   └── ui/                  # 공유 UI 컴포넌트 (shadcn 기반)
│
├── docker/                  # Docker 설정
├── monitoring/              # Grafana/Prometheus 설정
├── .github/workflows/       # CI/CD
├── turbo.json               # Turborepo 설정
├── pnpm-workspace.yaml      # pnpm workspace
└── package.json
```

### 2.3 테스트 전략

PHASE 1 데이터에서 AI 코드의 로직/정확성 이슈가 인간 코드 대비 75% 더 많다는 점을 고려하여, **AI가 생성하는 코드에 비례하여 테스트 밀도를 높이는 전략**을 채택한다.

| 테스트 유형 | 커버리지 목표 | 대상 | 도구 |
|------------|-------------|------|------|
| **Unit Test** | 70% (라인 기준) | 비즈니스 로직, 데이터 변환, AI Quality Gate | Vitest |
| **Integration Test** | 핵심 API 전체 | API 엔드포인트, DB 쿼리, 외부 API 연동 | Vitest + Supertest + Testcontainers |
| **E2E Test** | 핵심 시나리오 10개 | 대시보드 로딩, 실시간 갱신, 종목 검색, 뉴스 피드 | Playwright |
| **Visual Regression** | 주요 화면 5개 | 대시보드 레이아웃, 차트 렌더링 | Playwright Screenshot |
| **AI Output Test** | 100% (AI 출력 경로) | AI 요약 정확성, 할루시네이션 탐지 | 커스텀 검증 스크립트 |

**테스트 피라미드 (Balanced 배분)**:
```
        /\
       /  \        E2E: 10개 핵심 시나리오
      / E2E\       (대시보드 로딩, 실시간 주가, 종목 필터,
     /______\       뉴스 조회, 테마 그룹, 위젯 CRUD,
    /        \      AI 분석, 관리자, 인증, 에러 복구)
   / Integr.  \
  /   Tests    \   Integration: API 전체 + DB 쿼리 + 외부 API
 /______________\
/                \
/   Unit Tests    \ Unit: 비즈니스 로직 70% 커버리지
/__________________\
```

### 2.4 CI/CD 파이프라인

```yaml
# .github/workflows/ci.yml (개념)
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-type-check:
    # ESLint + TypeScript 타입 체크
    # 실행 시간: ~1분

  unit-test:
    # Vitest 유닛 테스트 + 커버리지
    # 실행 시간: ~2분

  integration-test:
    # Testcontainers (PG + Redis) + API 테스트
    # 실행 시간: ~3분

  e2e-test:
    # Playwright E2E (핵심 시나리오)
    # 실행 시간: ~5분
    # main 브랜치 PR에서만 실행

  ai-quality-check:
    # AI 생성 코드 정적 분석
    # 중복 코드 탐지 (GitClear 데이터: AI 코드 중복 8배 증가)
    # TODO(AI-DEBT) 태그 수 추적

  build-and-deploy:
    needs: [lint-and-type-check, unit-test, integration-test]
    # Docker 이미지 빌드 + 배포
    # develop -> Staging, main -> Production
```

**배포 빈도**: 주 2-3회 (develop -> staging 자동, staging -> production 수동 승인)

### 2.5 AI 코드 생성 활용 전략

PHASE 1 데이터 기반: AI 비율 50-60% + 자동 테스트

| AI 활용 영역 | 비율 | 리뷰 레벨 | 근거 |
|-------------|------|----------|------|
| **보일러플레이트/설정** | 80% AI | Layer 1 (Auto) | CRUD, DTO, 설정 파일 등 |
| **UI 컴포넌트** | 70% AI | Layer 1-2 | shadcn 기반 컴포넌트, 레이아웃 |
| **비즈니스 로직** | 50% AI | Layer 2 (Quick Review) | 필터/정렬, 데이터 변환 |
| **실시간 데이터 파이프라인** | 30% AI | Layer 3 (Deep Review) | WebSocket, 주가 처리 |
| **AI Agent 로직** | 40% AI | Layer 3 (Deep Review) | LangChain 체인, Quality Gate |
| **인증/보안** | 20% AI | Layer 3 (Deep Review) | 보안 코드는 수동 중심 |
| **인프라/DevOps** | 60% AI | Layer 2 | Docker, CI/CD, 모니터링 설정 |

**가중 평균 AI 비율: 약 55%** (PHASE 2 합의 범위 50-60% 내)

---

## 3. 현실적 평가

### 3.1 개발 난이도 평가: **중간** (10점 만점 중 5-6점)

| 영역 | 난이도 | 상세 |
|------|-------|------|
| React 19 + Next.js 15 | **중** | App Router 패러다임 학습 필요, 기존 React 경험 활용 가능 |
| NestJS 11 | **중** | DI/데코레이터 패턴 학습 필요, Angular 경험자는 즉시 적응 |
| PostgreSQL + TimescaleDB | **중하** | PG는 익숙, TimescaleDB 하이퍼테이블 설정만 추가 학습 |
| LangChain.js + LangGraph | **중상** | AI 에이전트 패턴 학습 필요, 빠르게 변화하는 API |
| 한국투자증권 OpenAPI | **중** | 한국어 문서 존재, WebSocket 실시간 연동이 도전 포인트 |
| Docker + CI/CD | **중하** | 표준적 구성, 템플릿 활용 가능 |
| Socket.IO 실시간 | **중** | 클라이언트-서버 양방향 통신 디버깅 경험 필요 |

### 3.2 팀 학습 필요: **중간** (주요 학습 포인트 5개)

| 학습 항목 | 예상 기간 | 필수도 | 학습 자원 |
|----------|----------|--------|----------|
| Next.js 15 App Router | 1-2주 | 필수 | 공식 문서 + 튜토리얼 |
| NestJS 모듈 시스템/DI | 1-2주 | 필수 | 공식 문서 + Udemy 코스 |
| LangChain.js/LangGraph | 2-3주 | 필수 | 공식 문서 + Cookbook |
| TimescaleDB | 3-5일 | 선택 (PG 경험 있으면) | 공식 Getting Started |
| 한국투자증권 OpenAPI | 1주 | 필수 | 공식 API 문서 + 샘플 |

**총 학습 투자 기간**: 프로젝트 시작 2-3주차에 집중, 이후 실습 병행

### 3.3 예상 개발 기간: 6개월 (24주)

PHASE 2에서 Balanced 관점이 제시한 14-16주를 기반으로, 6개월(24주) 전체 기간에 맞춰 **완성도를 높이는 방향**으로 재설계했다. 14-16주는 핵심 기능 MVP이며, 나머지 8-10주를 고도화/안정화에 투자한다.

### 3.4 비용 추정 (6개월)

#### 인프라 비용 (월간)

| 항목 | 사양 | 월 비용 (USD) | 월 비용 (KRW) | 비고 |
|------|------|-------------|-------------|------|
| **AWS EC2** | t3.medium (2vCPU, 4GB) | $33.41 | ~44,000원 | App 서버 |
| **AWS RDS** | db.t3.medium (PG 17 + TimescaleDB) | $49.06 | ~65,000원 | DB 서버 |
| **AWS ElastiCache** | cache.t3.small (Redis 7) | $24.48 | ~32,000원 | 캐시 |
| **AWS 기타** | EBS, 데이터 전송, Route53 | ~$20 | ~26,000원 | |
| **도메인** | .com | ~$1 | ~1,300원 | 연 $12 |
| **소계 (인프라)** | | **~$128** | **~168,000원** | |

#### SaaS/API 비용 (월간)

| 항목 | 사양 | 월 비용 (USD) | 월 비용 (KRW) | 비고 |
|------|------|-------------|-------------|------|
| **OpenAI API** | GPT-4o, 일 ~100 요청 | ~$30 | ~40,000원 | 뉴스 요약, 급등 분석 |
| **Anthropic API** | Claude 3.5 Sonnet (백업) | ~$15 | ~20,000원 | 교차 검증용 |
| **한국투자증권 OpenAPI** | 무료 | $0 | 0원 | 계좌 개설 필요 |
| **Sentry** | Developer (무료) | $0 | 0원 | 월 5,000 이벤트 |
| **GitHub** | Free tier | $0 | 0원 | Actions 2,000분/월 |
| **소계 (SaaS)** | | **~$45** | **~60,000원** | |

#### 개발 인건비 (6개월)

| 구성 | 인원 | 월 단가 | 6개월 합계 | 비고 |
|------|------|--------|-----------|------|
| **풀스택 개발자** | 1-2명 | 500-700만원 | 3,000-4,200만원 | AI 활용 55%로 생산성 향상 |
| **AI 에이전트 (Claude Code 등)** | - | ~30만원 | ~180만원 | API 비용 |
| **소계 (인건비)** | | | **3,180-4,380만원** | |

#### 6개월 총 비용 요약

| 구분 | 금액 (KRW) |
|------|-----------|
| 인프라 (6개월) | ~1,008,000원 |
| SaaS/API (6개월) | ~360,000원 |
| 인건비 (6개월) | 31,800,000 - 43,800,000원 |
| **총 비용** | **약 3,300만원 - 4,500만원** |

> 개인 프로젝트로 진행 시 인건비를 제외하면 **인프라+API 비용 월 약 23만원**.
> AWS 프리 티어 활용 시 초기 12개월은 **월 약 10만원 이하**로 운영 가능.

---

## 4. 리스크와 대응

### 4.1 리스크 매트릭스

| # | 리스크 | 발생 확률 | 영향도 | 리스크 점수 | 완화 전략 |
|---|-------|----------|--------|-----------|----------|
| R1 | **한국투자증권 API 변경/장애** | 중 (40%) | 높음 | **높음** | API 추상화 레이어 구축, 응답 캐싱(Redis 30초), Mock 서버 준비, 대체 API(키움, eBest) 어댑터 인터페이스 사전 설계 |
| R2 | **AI 에이전트 할루시네이션** | 높음 (70%) | 높음 | **매우높음** | AI Quality Gate 4단계 검증, 신뢰도 점수 UI 표시, 팩트체크 교차 검증(2개 LLM), 임계값 미달 시 결과 비표시 |
| R3 | **실시간 WebSocket 안정성** | 중 (50%) | 중 | **중** | Socket.IO 자동 재연결, Fallback polling(5초), 연결 상태 UI 표시, 재연결 실패 시 사용자 알림 |
| R4 | **AI 생성 코드 기술 부채 축적** | 높음 (80%) | 중 | **높음** | 3계층 리뷰 체계(Branch 4.2), TODO(AI-DEBT) 태깅, 월 1회 부채 리뷰, TDR 10% 이하 목표 |
| R5 | **TimescaleDB 학습 곡선** | 낮음 (20%) | 낮음 | **낮음** | PG 확장이므로 기존 SQL 지식 활용 가능, 하이퍼테이블 설정만 추가 학습, 공식 튜토리얼 반일 분량 |
| R6 | **LangChain.js API 변경** | 중 (50%) | 중 | **중** | 버전 고정(lock), 래퍼 패턴으로 직접 의존 최소화, 핵심 체인은 자체 구현 가능하도록 설계 |
| R7 | **개인 프로젝트 모티베이션 저하** | 중 (40%) | 높음 | **높음** | 2주 단위 마일스톤으로 성취감 유지, 초기 3주 내 "동작하는 대시보드" 확보, 데모 가능 상태 지속 유지 |
| R8 | **뉴스 소스 크롤링 차단/변경** | 중 (50%) | 중 | **중** | RSS 피드 우선 활용(크롤링 최소화), 다중 소스(3개+), 소스별 어댑터 패턴, 차단 감지 + 알림 |
| R9 | **AWS 비용 예상 초과** | 낮음 (25%) | 중 | **낮음** | CloudWatch 비용 알림 설정($50/월 임계값), Reserved Instance 검토(3개월 후), 필요 시 EC2->Lightsail 다운그레이드 |
| R10 | **Next.js 15 + NestJS 통합 복잡성** | 중 (35%) | 중 | **중** | Monorepo(Turborepo)로 빌드 격리, 프론트/백엔드 독립 배포, 공유 타입으로 계약 보장 |

### 4.2 리스크 대응 우선순위

```
매우높음 ████████████████████ R2 (AI 할루시네이션)
높  음  ██████████████████   R1 (증권 API), R4 (AI 부채), R7 (모티베이션)
중      ████████████████     R3 (WebSocket), R6 (LangChain), R8 (뉴스), R10 (통합)
낮  음  ████████████         R5 (TimescaleDB), R9 (AWS 비용)
```

**Top 3 리스크 심층 대응**:

**R2 (AI 할루시네이션) - 가장 위험**:
```
AI 출력 → [Step 1: 구조 검증] → [Step 2: 팩트 체크] → [Step 3: 신뢰도 계산] → [Step 4: 표시 결정]
                │                      │                      │                       │
         JSON 스키마 검증        종목명/가격 교차검증      0.0-1.0 점수 산출        ≥0.7 표시
         필수 필드 확인          뉴스 URL 접근 가능 확인    낮은 점수 경고 표시      <0.7 비표시+로깅
```

**R1 (증권 API 변경/장애)**:
```typescript
// 어댑터 패턴으로 증권사 API 교체 가능하게 설계
interface StockDataProvider {
  getRealtimePrice(symbol: string): Promise<StockPrice>;
  getHistoricalData(symbol: string, range: DateRange): Promise<OHLCV[]>;
  getOrderBook(symbol: string): Promise<OrderBook>;
}

class KISProvider implements StockDataProvider { /* 한국투자증권 */ }
class KiwoomProvider implements StockDataProvider { /* 키움 (예비) */ }
```

**R4 (AI 부채 축적)**:
- Branch 4.2의 3계층 관리 체계 전면 적용
- 매주 `grep -rn "TODO(AI-DEBT)"` 자동 집계 (CI/CD 연동)
- TDR(기술 부채 비율) 10% 초과 시 신규 기능 개발 중단, 부채 해소 우선

---

## 5. 6개월 마일스톤 (주 단위)

### Phase 0: 프로젝트 셋업 (Week 1-2)

| 주차 | 작업 | 산출물 | 완료 기준 |
|------|------|--------|----------|
| **W1** | 개발 환경 구성 | Monorepo 초기화, Docker Compose, CI/CD 기본 파이프라인 | `pnpm dev`로 전체 스택 로컬 실행 |
| **W1** | DB 스키마 설계 | Prisma 스키마 v1, TimescaleDB 하이퍼테이블 설정 | 마이그레이션 성공, Prisma Studio에서 데이터 확인 |
| **W2** | 프론트엔드 스캐폴딩 | Next.js 15 + shadcn/ui + Storybook 설정 | 빈 대시보드 페이지 렌더링, Storybook 실행 |
| **W2** | 백엔드 스캐폴딩 | NestJS 11 모듈 구조, 인증 기본 설정 | Health Check API 응답, Swagger 문서 자동 생성 |

### Phase 1: 핵심 데이터 파이프라인 (Week 3-6)

| 주차 | 작업 | 산출물 | 완료 기준 |
|------|------|--------|----------|
| **W3** | 한국투자증권 OpenAPI 연동 | KIS API 서비스, 인증 토큰 관리, 종목 마스터 데이터 수집 | 특정 종목의 현재가 API 호출 성공 |
| **W4** | 실시간 주가 수신 | WebSocket Gateway, Socket.IO 클라이언트, Redis 캐싱 | 프론트엔드에서 실시간 주가 표시 (1초 이내 갱신) |
| **W5** | 종목 정렬/필터링 | 거래대금, 등락률, 시가총액 기준 정렬 API + UI | 3개 이상 기준으로 전체 종목 실시간 정렬 |
| **W6** | 주가 이력 저장/조회 | TimescaleDB 시계열 저장, 일봉/분봉 API | 차트에서 1개월 이력 표시, 쿼리 200ms 이내 |

**Phase 1 데모**: "특정 종목의 실시간 가격을 보고, 등락률로 정렬하며, 1개월 차트를 확인할 수 있다"

### Phase 2: 대시보드 & 위젯 시스템 (Week 7-10)

| 주차 | 작업 | 산출물 | 완료 기준 |
|------|------|--------|----------|
| **W7** | 대시보드 레이아웃 | CSS Grid 기반 위젯 그리드, 위젯 추가/제거 | 위젯 3개 이상 배치, 레이아웃 저장/불러오기 |
| **W8** | 관심 종목 위젯 | Watchlist CRUD, 실시간 가격 갱신 | 관심 종목 등록/삭제, 실시간 가격 표시 |
| **W9** | 종목 상세 위젯 | TradingView 차트 통합, 호가창, 기본 정보 | 종목 클릭 시 상세 정보 + 차트 표시 |
| **W10** | 테마별 그룹핑 | 테마 CRUD, 종목-테마 매핑, 테마별 조회 | 테마 3개 이상 생성, 테마별 종목 일괄 조회 |

**Phase 2 데모**: "개인 맞춤형 대시보드에서 관심 종목을 실시간 모니터링하고, 테마별로 그룹 관리한다"

### Phase 3: 뉴스 & AI 분석 (Week 11-16)

| 주차 | 작업 | 산출물 | 완료 기준 |
|------|------|--------|----------|
| **W11** | 뉴스 수집 파이프라인 | RSS 수집기, Bull Queue 스케줄러, 뉴스 DB 저장 | 3개 소스에서 30분 간격 뉴스 자동 수집 |
| **W12** | 종목-뉴스 연관 분석 | 키워드 매칭 + NLP 기반 연관도 점수 | 종목 선택 시 관련 뉴스 시간순 표시 |
| **W13** | AI 뉴스 요약 | LangChain.js 체인, 요약 생성 + 캐싱 | 뉴스 클릭 시 AI 요약 표시 (3초 이내) |
| **W14** | 급등 원인 분석 에이전트 | LangGraph 워크플로우, 급등 감지 + 원인 추론 | 등락률 5% 이상 종목에 대해 원인 분석 자동 생성 |
| **W15** | AI Quality Gate | 출력 검증, 할루시네이션 탐지, 신뢰도 점수 | AI 출력 100% Quality Gate 통과, 신뢰도 UI 표시 |
| **W16** | 뉴스 피드 위젯 통합 | 대시보드 내 뉴스 위젯, 실시간 뉴스 알림 | 대시보드에서 종목별/테마별 뉴스 조회 |

**Phase 3 데모**: "급등 종목 발생 시 AI가 관련 뉴스를 분석하여 원인을 자동으로 설명한다"

### Phase 4: 관리자 & 고도화 (Week 17-20)

| 주차 | 작업 | 산출물 | 완료 기준 |
|------|------|--------|----------|
| **W17** | 관리자 페이지 | API 키 관리, 시스템 설정, 데이터 연동 상태 | API 키 CRUD, 연동 상태 대시보드 |
| **W18** | 성능 최적화 | Redis 캐시 전략 고도화, 쿼리 최적화, 번들 사이즈 | Lighthouse 성능 점수 90+, API 평균 응답 200ms 이내 |
| **W19** | UI/UX 개선 | 다크 모드, 반응형 미세 조정, 키보드 단축키 | 디자인 완성도 향상, 접근성 기본 충족 |
| **W20** | 알림 시스템 | 가격 알림 (목표가 도달), 급등/급락 알림 | 설정한 조건 충족 시 브라우저 알림 발송 |

### Phase 5: 안정화 & 배포 (Week 21-24)

| 주차 | 작업 | 산출물 | 완료 기준 |
|------|------|--------|----------|
| **W21** | E2E 테스트 완성 | 핵심 시나리오 10개 Playwright 테스트 | 전체 E2E 테스트 통과, CI 자동 실행 |
| **W22** | 부채 해소 스프린트 | P0/P1 기술 부채 일괄 처리 | TDR 10% 이하 달성 |
| **W23** | 프로덕션 배포 | AWS 인프라 구성, SSL, 도메인, 모니터링 | 프로덕션 환경에서 전체 기능 동작 확인 |
| **W24** | 안정화 & 문서화 | 운영 매뉴얼, API 문서, 장애 대응 절차 | 1주일 무장애 운영, 문서 완성 |

### 마일스톤 타임라인 시각화

```
Week:  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
       ├──┤                                                                      Phase 0: Setup
              ├──────────┤                                                       Phase 1: Data Pipeline
                            ├──────────┤                                         Phase 2: Dashboard
                                          ├────────────────────┤                 Phase 3: News & AI
                                                                  ├──────────┤   Phase 4: Admin & Polish
                                                                              ├──────────┤ Phase 5: Stabilize

데모:        D0          D1            D2                      D3            D4         LAUNCH
          (환경실행)  (실시간주가)  (대시보드)           (AI분석)       (전체기능)    (프로덕션)
```

### 각 Phase 종료 시 기대 상태

| Phase | 종료 시점 | 동작하는 기능 | 누적 완성도 |
|-------|----------|-------------|-----------|
| 0 | Week 2 | 개발 환경 실행, 빈 페이지 | 5% |
| 1 | Week 6 | 실시간 주가 조회, 정렬, 차트 | 30% |
| 2 | Week 10 | 위젯 대시보드, 관심종목, 테마 | 55% |
| 3 | Week 16 | 뉴스 피드, AI 요약, 급등 분석 | 80% |
| 4 | Week 20 | 관리자, 알림, UI 완성 | 95% |
| 5 | Week 24 | 프로덕션 배포, 안정화 | 100% |

---

## 6. 최종 결론

### 6.1 핵심 판단 요약

| 항목 | 평가 | 근거 |
|------|------|------|
| **기술 리더십 필요** | **중간** | NestJS/Next.js는 문서화 우수하고 커뮤니티 활발. LangChain이 가장 높은 학습 곡선이나 공식 문서+예제 풍부. 시니어 레벨의 아키텍처 결정은 본 문서가 대부분 커버. |
| **6개월 개발 현실성** | **현실적** | Phase 1-3(16주)로 핵심 기능 80% 완성, Phase 4-5(8주)로 고도화+안정화. AI 55% 활용으로 1-2인 팀 생산성 충분. |
| **예상 성공 확률** | **높음 (75-85%)** | 4/4 합의 기술 위주, 검증 3-5년+ 스택, Modular Monolith로 복잡도 제어. 주요 리스크(R1, R2, R4)에 구체적 완화 전략 존재. |
| **팀 만족도** | **높음** | 최신 기술(React 19, Next.js 15)로 학습 동기 부여 + 검증된 기술(NestJS, PG)로 안정감. "멋지면서도 동작하는" 기술 스택. |

### 6.2 6개월 후 달성하는 현실적 기능 세트

**반드시 완성 (Must-Have)**:
- 실시간 주가 모니터링 대시보드 (위젯 기반, 커스터마이징 가능)
- 관심 종목 등록/관리 + 다양한 기준 정렬/필터
- 테마별 종목 그룹핑 관리
- 종목 연관 뉴스 시간순 피드
- AI 기반 뉴스 요약 + 급등 원인 분석
- AI Quality Gate (할루시네이션 방지)
- 관리자 기능 (API 키, 시스템 설정)
- 가격/급등 알림

**가능하면 완성 (Should-Have)**:
- 위젯 드래그앤드롭 레이아웃
- 다크 모드
- 키보드 단축키
- 뉴스 감성 분석 스코어

**후순위 (Nice-to-Have, Phase 6 이후)**:
- 모바일 반응형 (현재는 PC Web 전용)
- 포트폴리오 수익률 추적
- 종목 간 상관관계 분석
- 매매 신호 알림 (기술적 분석 기반)

### 6.3 Balanced-Tech 시나리오의 차별점

**Cutting Edge (3.A) 대비**:
- 개발 기간 예측 가능성이 높음 (검증된 기술 기반 일정 산출)
- 버그 위험이 현저히 낮음 (프로덕션 검증 완료된 스택)
- 팀 온보딩 시간 50% 단축 (풍부한 학습 자료, 대규모 커뮤니티)

**Proven Stack (3.C) 대비**:
- React 19의 자동 메모이제이션, Server Components로 성능 우위
- LangChain/LangGraph로 AI 에이전트 구현 속도 3-5배 향상
- Next.js 15 App Router로 프론트엔드 개발 경험 현대화
- 개발자 학습 동기 부여 (이력서에 기재할 만한 기술 스택)

### 6.4 의사결정 투명성

본 시나리오의 모든 기술 선택은 다음 데이터에 근거한다:

| 근거 | 출처 | 적용 |
|------|------|------|
| React 19: Fortune 500 1,035개사 | PHASE 1 Core Tech Research | Frontend 선택 |
| NestJS: Adidas 일 10억+ 요청, 9년 검증 | PHASE 1 Core Tech Research | Backend 선택 |
| PostgreSQL: 30년 금융 검증, ACID | PHASE 1 Core Tech Research | Database 선택 |
| Redis 7: 17년 검증, Pub/Sub + 캐시 | PHASE 1 Core Tech Research | Cache 선택 |
| LangChain: 47M+ 다운로드 | PHASE 1 Core Tech Research | AI Layer 선택 |
| AI 코드: 1.7x 부채 축적 | PHASE 1 Debt Research | AI 비율 50-60% 결정 |
| AI 코드: 88% 부정적 영향 보고 | PHASE 1 Debt Research | AI Quality Gate 필수 결정 |
| AI 코드: 중복 8배 증가 | PHASE 1 Debt Research (GitClear) | CI 중복 탐지 포함 |
| Modular Monolith: 3/4 합의 | PHASE 2 토론 | 아키텍처 패턴 선택 |
| NestJS vs Hono+Bun: 2:2 분열 | PHASE 2 토론 | Balanced는 검증 우선 NestJS |
| PG vs PG+ClickHouse | PHASE 2 토론 | Balanced는 PG+TimescaleDB |
| AI 비율: 50-60% + 자동 테스트 | PHASE 2 합의 | AI 활용 전략 |
| 개발 기간: 14-16주 핵심 | PHASE 2 합의 | 6개월 중 16주 핵심 + 8주 고도화 |

> **"좋은 기술이지만, 우리가 할 수 있어야 한다."**
>
> 이 시나리오는 검증된 기술의 안정성 위에 최신 기술의 생산성을 올려놓는다.
> 모험하지 않되, 뒤처지지도 않는다.
> 6개월 후 "동작하는 개인 맞춤형 주식 대시보드"를 확실히 손에 쥐는 것이 목표다.
