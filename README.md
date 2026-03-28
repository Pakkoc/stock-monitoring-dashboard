# Stock Monitoring Dashboard

> **AI Agentic Workflow로 자동 구현한 주식 모니터링 대시보드**

여러 웹사이트와 HTS에 분산된 주식 정보를 하나의 위젯 기반 대시보드에 통합하고, AI 에이전트가 급등 원인을 실시간 분석하여 투자 의사결정을 가속하는 **개인 맞춤형 PC Web 대시보드**입니다.

---

## 핵심 기능

### 1. 위젯 기반 대시보드
드래그앤드롭으로 자유롭게 배치할 수 있는 8종 위젯

| 위젯 | 설명 |
|------|------|
| 관심종목 | 실시간 시세, 등락률, 거래량 |
| 캔들스틱 차트 | TradingView 차트 + 실시간 업데이트 |
| 뉴스 피드 | 종목별 관련 뉴스 시간순 |
| 테마 요약 | 반도체, 2차전지 등 테마별 등락 |
| 급등 알림 | 급등 종목 실시간 감지 |
| AI 분석 | 급등 원인 AI 자동 분석 + 신뢰도 |
| 시장 지수 | KOSPI / KOSDAQ 실시간 |
| 거래량 TOP | 거래량 상위 종목 |

### 2. AI 급등 원인 분석
- LangGraph.js 기반 5단계 분석 파이프라인
- 3계층 Quality Gate (구문 / 의미 / 사실 검증)
- "AI 생성" 라벨 + 신뢰도 점수 표시
- 뉴스 + 공시 + 테마 정보 종합 분석

### 3. 실시간 데이터
- 한국투자증권 OpenAPI WebSocket 연동
- 5초 이내 시세 반영
- Redis Pub/Sub → Socket.IO → 브라우저 차트

### 4. 개인화
- 관심 종목 등록 및 관리
- 테마별 그룹핑 (커스텀 테마 생성)
- 조건별 알림 설정 (급등률, 가격, 거래량)

---

## 기술 스택

| 계층 | 기술 |
|------|------|
| Frontend | Next.js 15, React 19, TypeScript 5 |
| UI | shadcn/ui, Tailwind CSS 4 |
| 차트 | TradingView Lightweight Charts, Recharts |
| 상태관리 | Zustand, TanStack Query |
| Backend | NestJS 11, TypeScript strict |
| ORM | Prisma 7 |
| 실시간 | Socket.IO 4 |
| AI | LangChain.js + LangGraph.js (Claude / GPT-4o) |
| DB | PostgreSQL 17 + TimescaleDB |
| Cache | Redis 8 |
| 증권API | 한국투자증권 OpenAPI |
| CI/CD | GitHub Actions |
| 배포 | Vercel (프론트) + Docker + Cloudflare Tunnel (백엔드) |

---

## 프로젝트 구조

```
stock-monitoring-dashboard/
├── apps/
│   ├── api/                    # NestJS 백엔드
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── stock/      # 주식 시세, 정렬/필터, KIS API 연동
│   │   │   │   ├── news/       # 뉴스 수집 (Naver, RSS, DART)
│   │   │   │   ├── ai-agent/   # LangGraph 급등 분석 파이프라인
│   │   │   │   ├── portfolio/  # 관심종목, 알림
│   │   │   │   ├── admin/      # 관리자 기능
│   │   │   │   └── auth/       # 인증/인가
│   │   │   ├── shared/         # DB, Redis, Logger, Scheduler
│   │   │   └── common/         # 필터, 파이프, 데코레이터
│   │   └── prisma/             # 스키마, 마이그레이션, 시드
│   └── web/                    # Next.js 프론트엔드
│       └── src/
│           ├── app/            # 페이지 (대시보드, 종목 상세, 관리자)
│           ├── components/
│           │   ├── widgets/    # 8종 위젯 컴포넌트
│           │   ├── layout/     # Sidebar, Header
│           │   └── ui/         # StockPrice, ChangeRate, NumberFormat
│           ├── hooks/          # API 훅 (useStocks, useNews 등)
│           ├── stores/         # Zustand 스토어 (dashboard, realtime, auth)
│           └── lib/            # Socket.IO, API 클라이언트, 설정
├── packages/
│   ├── shared/                 # 공유 타입, 상수
│   ├── eslint-config/          # 공유 ESLint 설정
│   └── tsconfig/               # 공유 TypeScript 설정
├── docker-compose.yml          # 개발용
├── docker-compose.minipc.yml   # 미니PC 배포용
├── DEPLOY.md                   # 배포 가이드 (한국어)
└── workflow.md                 # AgenticWorkflow 24단계 워크플로우
```

---

## 시작하기

### 사전 준비

- Node.js 22 LTS
- pnpm 9+
- Docker & Docker Compose
- API 키: 한국투자증권, Naver Developer, DART, Anthropic (또는 OpenAI)

### 로컬 개발

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일을 열어 API 키 입력

# 3. DB + Redis 실행
docker compose up -d

# 4. DB 마이그레이션
cd apps/api && npx prisma migrate deploy

# 5. 시드 데이터 (초기 종목, 테마, 테스트 계정)
npx prisma db seed

# 6. 개발 서버 시작
cd ../.. && pnpm dev
```

- 프론트엔드: http://localhost:3000
- 백엔드 API: http://localhost:3001
- 테스트 계정: `admin@example.com` / `admin123`

### 배포 (Vercel + 미니PC)

상세 가이드: [DEPLOY.md](DEPLOY.md)

```bash
# 미니PC에서
docker compose -f docker-compose.minipc.yml up -d

# Vercel에서
# GitHub 연동 → 환경변수 설정 → Deploy
```

---

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | /api/auth/signup | 회원가입 |
| POST | /api/auth/login | 로그인 |
| GET | /api/stocks | 종목 목록 (필터/정렬/페이징) |
| GET | /api/stocks/:symbol | 종목 상세 |
| GET | /api/stocks/:symbol/prices | 시세 이력 (OHLCV) |
| GET | /api/stocks/:symbol/news | 종목 관련 뉴스 |
| POST | /api/ai/analyze/:symbol | AI 급등 분석 요청 |
| GET | /api/ai/analyses/:symbol | AI 분석 이력 |
| GET/POST | /api/watchlists | 관심종목 CRUD |
| GET/POST | /api/alerts | 알림 CRUD |
| GET | /api/admin/status | 시스템 상태 |
| GET | /api/health | 헬스체크 |

**WebSocket 이벤트**: `stock:price`, `stock:surge`, `alert:triggered`, `ai:analysis:complete`

---

## 테스트

```bash
# 전체 테스트
pnpm test

# 백엔드 단위 테스트
pnpm test:api

# 프론트엔드 단위 테스트
pnpm test:web

# E2E 테스트
pnpm test:e2e
```

---

## 개발 배경

이 프로젝트는 [AgenticWorkflow](https://github.com/idoforgod/AgenticWorkflow) 프레임워크를 활용하여 **PRD 하나에서 24단계 자동 워크플로우**로 생성되었습니다.

```
PRD 문서 → Research (6단계) → Planning (6단계) → Implementation (12단계) → MVP
```

- 리서치 6건 (33,600+ words, 150+ sources)
- 설계서 6건 (34,200+ words)
- 소스코드 161개 파일
- API 30개 엔드포인트
- 위젯 8종

---

## 라이선스

이 프로젝트는 외주 납품용으로 제작되었습니다. 무단 복제 및 배포를 금합니다.
