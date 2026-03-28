# Branch 3.1: Rapid Development Process Research Report

> **관점**: "빨리 만들고 피드백 받고 개선한다."
> **리서치 대상**: 주식 정보 모니터링 대시보드를 자동 구현하는 AI Agentic Workflow Automation System
> **작성일**: 2026-03-27

---

## 1. 개발 환경 세팅 (목표: 1시간 이내)

### 1.1 권장 개발 환경 스택

| 구성 요소 | 도구 | 세팅 시간 | 비고 |
|----------|------|----------|------|
| 패키지 관리 | pnpm | 5분 | Turborepo와 최적 조합 |
| 모노레포 | Turborepo + pnpm workspaces | 10분 | 캐시 기반 빌드 — CI 20분 → 1분 이하 |
| 프레임워크 | Next.js 15 (App Router) | 10분 | 병렬 라우트, 인터셉트 라우트 → 대시보드 최적 |
| 컨테이너 | Docker Compose v2 + DevContainer | 15분 | `docker compose watch`로 실시간 리로드 |
| AI 코딩 | Claude Code (터미널) + Cursor IDE | 5분 | 2026년 기준 최고 코드 품질 + 최고 워크플로우 통합 |
| DB/Backend | Supabase (Postgres + Realtime) | 10분 | 인증, DB, 실시간 업데이트 20분 내 완료 |
| 배포 | Vercel | 5분 | Git push → 글로벌 배포 수초 내 |

**총 예상 세팅 시간: 약 40~60분**

### 1.2 Docker DevContainer 구성

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
      args:
        BUILDKIT_INLINE_CACHE: 1
    volumes:
      - .:/workspace:cached      # macOS 최적화: cached 모드
      - node_modules:/workspace/node_modules
    ports:
      - "3000:3000"              # Next.js dev server
      - "54321:54321"            # Supabase local
    environment:
      - CHOKIDAR_USEPOLLING=true # WSL2/macOS 호환
      - WATCHPACK_POLLING=true
    command: pnpm dev

volumes:
  node_modules:
```

**핵심 최적화**:
- WSL2 파일시스템에 직접 마운트 → HMR 문제 해결 + 빌드 속도 향상
- BuildKit 인라인 캐시로 Docker 레이어 캐싱
- `docker compose watch` 명령으로 소스 변경 시 실시간 동기화

### 1.3 AI 에이전트 개발 환경 자동 구성

```bash
#!/bin/bash
# setup.sh — 원커맨드 환경 구성
set -e

# 1. pnpm + Turborepo 프로젝트 생성
pnpm create turbo@latest stock-dashboard --example with-tailwind

# 2. 핵심 의존성 설치
pnpm add next@latest react@latest react-dom@latest
pnpm add @supabase/supabase-js recharts
pnpm add -D typescript tailwindcss postcss autoprefixer
pnpm add -D vitest @testing-library/react playwright

# 3. shadcn/ui 차트 컴포넌트
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add chart card table tabs

# 4. 환경 변수 템플릿
cp .env.example .env.local

# 5. Supabase 로컬 초기화
pnpm dlx supabase init
pnpm dlx supabase start

echo "Setup complete. Run 'pnpm dev' to start."
```

---

## 2. 개발-배포 사이클

### 2.1 CI/CD 파이프라인 아키텍처

```
[코드 작성] → [Git Push] → [GitHub Actions] → [자동 테스트] → [Preview 배포] → [피드백] → [Production 배포]
     ↑                                                                    ↓
     └────────────────────── 피드백 루프 (분 단위) ──────────────────────────┘
```

**2026년 GitHub Actions 현황**:
- 업계 1위 CI/CD 도구 (33% 채택률, Jenkins 28%, GitLab CI 19%)
- 새 4-vCPU "Standard" 러너: 2024년 대비 39% 가격 인하
- Blacksmith: 빌드/테스트/배포 시간 50% 단축

### 2.2 GitHub Actions 워크플로우

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test -- --reporter=verbose
      - run: pnpm build

  preview:
    needs: quality
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          # PR마다 자동 Preview URL 생성

  deploy:
    needs: quality
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-args: '--prod'
```

### 2.3 배포 시간 목표

| 단계 | 목표 시간 | 도구 |
|------|----------|------|
| Lint + Type Check | 30초 | ESLint + TypeScript |
| Unit Test | 1분 | Vitest |
| Build | 1분 | Turborepo (캐시 hit 시 10초) |
| Preview 배포 | 30초 | Vercel |
| Production 배포 | 30초 | Vercel |
| **전체 파이프라인** | **약 3~4분** | — |

### 2.4 AI 에이전트 코드 생성 → 배포 사이클

```
[프롬프트 작성] → [Claude Code 코드 생성] → [자동 Lint/Type Check] → [자동 테스트] → [커밋]
       │                                                                          │
       │              ← ← ← ← ← 실패 시 자동 수정 루프 ← ← ← ← ←               │
       │                                                                          ↓
       └──────────────────────────────────────── [Push → CI/CD → Deploy (3-4분)]
```

---

## 3. 품질 관리

### 3.1 테스트 전략 (속도 우선)

| 테스트 유형 | 비중 | 도구 | 실행 시간 | 비고 |
|------------|------|------|----------|------|
| Unit Test | 60% | Vitest 4.0 | 초 단위 | 컴포넌트 + 유틸리티, 네이티브 브라우저 지원 |
| Integration Test | 25% | Vitest + MSW | 분 단위 | API 모킹, 데이터 흐름 |
| E2E Test | 15% | Playwright | 분 단위 | 핵심 사용자 흐름만 |

**2026년 테스트 트렌드**:
- Vitest 4.0이 단위/컴포넌트 테스트의 표준 (Jest 30 대비 빠른 속도 + 브라우저 네이티브)
- Playwright + AI (ZeroStep, Playwright MCP) → 자연어로 E2E 테스트 자동 생성
- AI 자가 치유(Self-Healing) 테스트: DOM 변경 시 자동 셀렉터 갱신

### 3.2 AI 생성 코드 검증 방법

```
[AI 코드 생성]
    ↓
[1단계: 정적 분석] ← ESLint + TypeScript strict mode + Biome
    ↓
[2단계: 자동 테스트] ← Vitest (AI가 테스트도 함께 생성)
    ↓
[3단계: SAST 보안 스캔] ← Snyk / CodeQL (SQL injection, XSS 등)
    ↓
[4단계: AI 코드 리뷰] ← Claude Code reviewer agent
    ↓
[5단계: 번들 크기 체크] ← next-bundle-analyzer
    ↓
[통과 → 머지 가능]
```

### 3.3 코드 리뷰 프로세스 (경량화)

- **AI 리뷰 1차**: Claude Code `@reviewer` 에이전트가 PR 자동 리뷰
- **사람 리뷰 2차**: 아키텍처 변경, 보안 관련 코드만 사람이 리뷰
- **QA 기간**: 스프린트 내 1일 (Preview URL 기반 수동 확인)

---

## 4. AI Agent 특화 개발 프로세스

### 4.1 프롬프트 → 코드 → 테스트 → 피드백 루프

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Agent 개발 루프                         │
│                                                             │
│  [1] Intent 정의                                            │
│   │  "거래대금 기준 종목 정렬 위젯 만들어줘"                      │
│   ↓                                                         │
│  [2] Claude Code: 코드 + 테스트 동시 생성                      │
│   │  - 컴포넌트: SortableStockTable.tsx                      │
│   │  - 테스트: SortableStockTable.test.tsx                   │
│   │  - 타입: types/stock.ts                                  │
│   ↓                                                         │
│  [3] 자동 검증 (Hook 기반)                                    │
│   │  - Lint ✓ → Type Check ✓ → Test ✓                       │
│   ↓                                                         │
│  [4] Preview 배포 → 시각적 확인                                │
│   │  - Vercel Preview URL 자동 생성                           │
│   ↓                                                         │
│  [5] 피드백 → 다음 반복                                       │
│   │  "정렬 애니메이션 추가하고 등락률 색상 강조해줘"                 │
│   ↓                                                         │
│  [반복] 1사이클: 5~15분                                       │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 프롬프트 관리 전략

**2026년 프롬프트 엔지니어링 현황**:
- 프롬프트 엔지니어링이 **Intent Orchestration**으로 진화
- 3라운드 반복으로 만족도 55% → 85% 향상
- 프롬프트를 코드와 동일하게 관리: 버전 관리, 피어 리뷰, 자동 테스트

**권장 프롬프트 구조**:
```markdown
## 컨텍스트
- 프로젝트: 주식 모니터링 대시보드
- 기술 스택: Next.js 15, shadcn/ui, Recharts, Supabase
- 디자인 시스템: shadcn/ui 기반, 다크 테마

## 작업
[구체적 기능 설명]

## 제약 조건
- 기존 컴포넌트 재사용 우선
- TypeScript strict mode
- 테스트 코드 포함 필수
- 접근성(a11y) 준수
```

### 4.3 에이전트 성능 모니터링

| 지표 | 측정 방법 | 목표 |
|------|----------|------|
| 코드 생성 성공률 | 첫 시도에 Lint+Test 통과 비율 | >70% |
| 반복 횟수 | 기능 완료까지 프롬프트 횟수 | ≤3회 |
| 기능 완료 시간 | 프롬프트 → 배포 완료 | <30분 |
| 버그 발생률 | Production 버그 / 배포 횟수 | <5% |

### 4.4 Harness Engineering 적용

2026년 핵심 개념인 **Harness Engineering** 적용:
- AI 에이전트를 감싸는 시스템(가드레일, 피드백 루프, 관측성 레이어)을 설계
- LangChain 사례: 자가 검증 루프 + 루프 감지만으로 코딩 에이전트 성능 52.8% → 66.5% 향상
- Claude Code Hook 시스템이 이를 이미 구현 (block_destructive, validate_*, output_secret_filter)

---

## 5. 기술 스택 상세 제안

### 5.1 프론트엔드

| 기술 | 버전 | 선택 이유 |
|------|------|----------|
| Next.js | 15+ (App Router) | 병렬 라우트로 대시보드 다중 패널 구현, 2026 표준 |
| React | 19 | Server Components, Suspense 경계 |
| TypeScript | 5.x (strict) | AI 생성 코드 품질 보장 |
| Tailwind CSS | 4.x | 유틸리티 우선, AI 코드 생성 친화적 |
| shadcn/ui | latest | 복사-붙여넣기 컴포넌트, 완전 커스터마이즈 가능 |
| Recharts | v3 | shadcn/ui 차트 컴포넌트 내장, 주식 차트 최적 |
| Zustand | 5.x | 가벼운 상태 관리, 위젯 상태 |

### 5.2 백엔드 / 데이터

| 기술 | 선택 이유 |
|------|----------|
| Supabase | Postgres + Realtime + Auth + Edge Functions 올인원 |
| Supabase Realtime | WebSocket 서버 없이 실시간 주가 업데이트 (200ms 이내) |
| 한국투자증권 Open API | KOSPI/KOSDAQ 실시간 체결가, 호가 WebSocket |
| Yahoo Finance API | 글로벌 주식 데이터 보조 소스 |
| Edge Functions | 뉴스 크롤링, 데이터 정제 서버리스 처리 |

### 5.3 인프라 / DevOps

| 기술 | 선택 이유 |
|------|----------|
| Vercel | Next.js 최적 배포, PR별 Preview URL, 수초 배포 |
| GitHub Actions | CI/CD 업계 1위, 39% 가격 인하 |
| Turborepo | 모노레포 빌드 캐싱, CI 시간 90%+ 절감 |
| Docker Compose | 로컬 개발 환경 표준화 |

### 5.4 테스트 / 품질

| 기술 | 선택 이유 |
|------|----------|
| Vitest 4.0 | 2026년 JS 테스트 표준, 브라우저 네이티브 |
| Playwright | E2E 테스트, AI 자동 생성 지원 |
| ESLint + Biome | 빠른 정적 분석 |
| Langfuse | AI 에이전트 관측성 (프롬프트 버전 ↔ 결과 추적) |

### 5.5 데이터 API 구성

| API | 용도 | 비용 | 실시간 지원 |
|-----|------|------|-----------|
| 한국투자증권 Open API | KOSPI/KOSDAQ 체결가, 호가 | 무료 (계좌 필요) | WebSocket ✓ |
| iTick API | 글로벌 시세, 보조 데이터 | 무료 티어 | WebSocket (<50ms) ✓ |
| FCS API | 보조 시세 데이터 | 무료 500req/월 | WebSocket (1,385 심볼) ✓ |
| Yahoo Finance | 히스토리컬 데이터, 재무제표 | 무료 | REST only |
| KRX Data Marketplace | 공식 한국 시장 데이터 | 유/무료 | REST |
| 뉴스 API (네이버/구글) | 종목 관련 뉴스 피드 | 무료 티어 | REST |

---

## 6. 리스크 분석 및 완화 전략

### 6.1 식별된 리스크

| # | 리스크 | 심각도 | 발생 가능성 | 영향 |
|---|--------|--------|-----------|------|
| R1 | AI 생성 코드의 보안 취약점 | 높음 | 높음 (45% 포함) | 데이터 유출 |
| R2 | 기술 부채 급속 누적 | 높음 | 매우 높음 | 3개월 후 속도 0 |
| R3 | 코드 중복 증가 | 중간 | 높음 (48% 증가) | 유지보수 비용 |
| R4 | 실시간 데이터 API 제한/장애 | 중간 | 중간 | 서비스 중단 |
| R5 | AI 생성 코드 품질 불안정 | 중간 | 높음 | 버그 프로덕션 유입 |
| R6 | 리팩토링 활동 감소 | 중간 | 매우 높음 (60% 감소) | 장기 유지보수 불가 |

### 6.2 완화 전략

| 리스크 | 완화 전략 | 구현 |
|--------|----------|------|
| R1 보안 | SAST 자동 스캔 + 시크릿 필터 | CodeQL GitHub Actions + output_secret_filter Hook |
| R2 기술 부채 | 스프린트 20% 부채 상환 할당 | 매 3스프린트마다 리팩토링 스프린트 |
| R3 코드 중복 | AI 프롬프트에 기존 코드 참조 강제 | Claude Code 컨텍스트에 기존 컴포넌트 목록 포함 |
| R4 API 장애 | 멀티 소스 폴백 + 캐싱 | 한투 → iTick → FCS 폴백 체인, Redis 캐시 |
| R5 품질 불안정 | 5단계 검증 파이프라인 | Lint → Type → Test → SAST → AI Review |
| R6 리팩토링 | 리팩토링 예산 명시 할당 | 엔지니어링 역량 20-30% 부채 상환 |

### 6.3 "Complexity Wall" 방지

Forrester 예측: 2026년 기업 75%가 AI 확장으로 중~고도 기술 부채 경험.
"Vibe Coding"의 함정: 약 3개월 차에 복잡성 벽(Complexity Wall)에 도달 → 새 기능 추가가 기존 기능을 파괴.

**방지 전략**:
1. **아키텍처 결정은 사람이** — AI는 구현 보조, 아키텍처/설계 결정은 시니어가
2. **주 1회 코드 건강 검진** — `@reviewer` 에이전트 전체 코드베이스 스캔
3. **컴포넌트 카탈로그 유지** — Storybook이나 문서로 재사용 가능 컴포넌트 관리
4. **커밋 크기 제한** — 하나의 AI 세션에서 300줄 이상 변경 시 분할

---

## 7. 프로젝트 모노레포 구조 (제안)

```
stock-monitoring-dashboard/
├── apps/
│   └── web/                          ← Next.js 15 대시보드 앱
│       ├── app/
│       │   ├── (dashboard)/          ← 대시보드 레이아웃 그룹
│       │   │   ├── @watchlist/       ← 병렬 라우트: 관심종목
│       │   │   ├── @chart/           ← 병렬 라우트: 차트
│       │   │   ├── @news/            ← 병렬 라우트: 뉴스 피드
│       │   │   ├── @theme-groups/    ← 병렬 라우트: 테마별 그룹
│       │   │   └── layout.tsx        ← 위젯 그리드 레이아웃
│       │   ├── admin/                ← 관리자 설정
│       │   └── layout.tsx
│       ├── components/
│       │   ├── widgets/              ← 위젯 컴포넌트
│       │   ├── charts/               ← 차트 컴포넌트 (Recharts)
│       │   └── ui/                   ← shadcn/ui 컴포넌트
│       └── lib/
│           ├── supabase/             ← Supabase 클라이언트
│           ├── stock-api/            ← 주식 API 래퍼
│           └── hooks/                ← React 커스텀 훅
├── packages/
│   ├── ui/                           ← 공유 UI 컴포넌트
│   ├── types/                        ← 공유 TypeScript 타입
│   └── stock-data/                   ← 주식 데이터 유틸리티
├── supabase/
│   ├── migrations/                   ← DB 마이그레이션
│   ├── functions/                    ← Edge Functions
│   └── seed.sql                      ← 테스트 데이터
├── turbo.json
├── pnpm-workspace.yaml
├── docker-compose.dev.yml
└── .github/workflows/ci.yml
```

---

## 8. 개발 스프린트 계획 (6개월)

### 8.1 Phase 1: Foundation (Week 1-2) — 2주

| 작업 | AI 활용도 | 예상 시간 |
|------|----------|----------|
| 개발 환경 + CI/CD 구축 | 높음 | 1일 |
| Supabase DB 스키마 설계 | 중간 | 1일 |
| 한국투자증권 API 연동 프로토타입 | 높음 | 2일 |
| 기본 대시보드 레이아웃 (shadcn/ui) | 매우 높음 | 2일 |
| 인증 (Supabase Auth) | 매우 높음 | 0.5일 |
| 기본 위젯 프레임워크 | 높음 | 2일 |

### 8.2 Phase 2: Core Features (Week 3-6) — 4주

| 작업 | AI 활용도 | 예상 시간 |
|------|----------|----------|
| 실시간 주가 위젯 (WebSocket) | 높음 | 3일 |
| 거래대금/등락률 정렬·필터링 | 매우 높음 | 2일 |
| 테마별 종목 그룹핑 | 매우 높음 | 3일 |
| 종목 연관 뉴스 피드 | 높음 | 3일 |
| 관심종목 관리 (CRUD) | 매우 높음 | 2일 |
| 차트 시각화 (캔들, 라인) | 높음 | 3일 |
| 관리자 설정 페이지 | 매우 높음 | 2일|

### 8.3 Phase 3: Enhancement (Week 7-10) — 4주

| 작업 | AI 활용도 |
|------|----------|
| 위젯 드래그 앤 드롭 커스터마이즈 | 높음 |
| 다중 데이터 소스 폴백 | 중간 |
| 실시간 알림 (급등/급락) | 높음 |
| 고급 필터링 (재무지표 기반) | 높음 |
| 성능 최적화 (가상화, 메모이제이션) | 중간 |
| 반응형 위젯 크기 조절 | 높음 |

### 8.4 Phase 4: Polish & Scale (Week 11-16) — 6주

| 작업 | AI 활용도 |
|------|----------|
| UI/UX 개선 (클라이언트 피드백 반영) | 높음 |
| 다크/라이트 테마 | 매우 높음 |
| 키보드 단축키 | 높음 |
| E2E 테스트 강화 | 매우 높음 (Playwright AI) |
| 리팩토링 스프린트 (기술 부채 상환) | 중간 |
| 문서화 | 높음 |
| 성능 모니터링 대시보드 | 높음 |

### 8.5 Phase 5: Refinement (Week 17-24) — 8주

| 작업 | AI 활용도 |
|------|----------|
| 피드백 기반 개선 사이클 반복 | 높음 |
| 추가 위젯 개발 (사용자 요청) | 매우 높음 |
| API 안정성 강화 | 중간 |
| 보안 감사 | 중간 |
| 프로덕션 모니터링 | 높음 |

---

## 9. 최종 결론

### 9.1 핵심 지표

| 항목 | 결론 |
|------|------|
| **개발 사이클** | **5~15분** (프롬프트 → 코드 → 테스트 → Preview 배포) |
| **전체 CI/CD** | **3~4분** (Push → Production) |
| **6개월에 가능한 기능 수** | **25~35개 주요 기능** (AI 가속으로 전통 개발 대비 3~5배) |
| **코드 품질 수준** | **중간** (초기), 지속적 리팩토링으로 **중~상** 목표 |
| **AI 에이전트 활용도** | **매우 높음** (전체 코드의 70~80% AI 생성, 사람이 검증·설계) |

### 9.2 구체적 도구 체인

```
[개발 환경]
  pnpm + Turborepo + Next.js 15 + TypeScript 5
  Docker Compose v2 + DevContainer
  Claude Code + Cursor IDE

[UI/UX]
  Tailwind CSS 4 + shadcn/ui + Recharts v3
  Next.js App Router 병렬 라우트

[백엔드/데이터]
  Supabase (Postgres + Realtime + Auth + Edge Functions)
  한국투자증권 Open API (WebSocket)
  iTick / FCS API (보조/폴백)

[CI/CD]
  GitHub Actions + Turborepo 캐시
  Vercel (Preview + Production 배포)

[테스트]
  Vitest 4.0 (Unit + Integration)
  Playwright + AI (E2E)
  CodeQL / Snyk (SAST 보안)

[관측성]
  Langfuse (AI 에이전트 추적)
  Vercel Analytics (성능)
  Sentry (에러 추적)
```

### 9.3 개발 속도 vs 품질 트레이드오프

```
속도 ████████████████████░░  90% (매우 빠름)
기능 ████████████████████░░  85% (6개월 내 전체 요구사항 구현 가능)
품질 ██████████████░░░░░░░░  65% (초기), 75% (리팩토링 후)
안정 ████████████░░░░░░░░░░  60% (초기), 80% (안정화 후)
부채 ██████████████████░░░░  80% (높음, 적극적 관리 필요)
```

### 9.4 핵심 성공 요인

1. **AI를 구현 가속기로, 아키텍처 결정은 사람이** — AI 생성 코드의 45% 보안 취약점, 48% 중복 증가를 사람의 감독으로 방지
2. **5단계 자동 검증 파이프라인** — Lint → Type → Test → SAST → AI Review로 품질 게이트
3. **20-30% 리팩토링 예산 확보** — 3개월 차 "Complexity Wall" 방지
4. **멀티 데이터 소스 폴백** — 단일 API 장애에 대한 복원력
5. **Preview 배포 기반 빠른 피드백** — PR마다 실제 동작하는 URL로 즉시 확인

---

## Sources

### 개발 환경
- [Hot Reload for Development Containers in Portainer](https://oneuptime.com/blog/post/2026-03-20-hot-reload-dev-containers-portainer/view)
- [VS Code DevContainers](https://code.visualstudio.com/docs/devcontainers/containers)
- [Best Docker Tools 2026](https://thesoftwarescout.com/best-docker-tools-2026-desktop-apps-guis-and-container-management/)
- [Ultimate Guide to Dev Containers](https://www.daytona.io/dotfiles/ultimate-guide-to-dev-containers)

### AI 코딩 도구
- [AI-Assisted Coding in 2026: Copilot, Cursor, Amazon Q](https://www.javacodegeeks.com/2025/12/ai-assisted-coding-in-2026-how-github-copilot-cursor-and-amazon-q-are-reshaping-developer-workflows.html)
- [Claude Code vs Cursor vs GitHub Copilot: 2026 Showdown](https://dev.to/alexcloudstar/claude-code-vs-cursor-vs-github-copilot-the-2026-ai-coding-tool-showdown-53n4)
- [AI Coding Agents 2026 Comparison](https://lushbinary.com/blog/ai-coding-agents-comparison-cursor-windsurf-claude-copilot-kiro-2026/)
- [Best AI Coding Tools in 2026](https://emergent.sh/learn/best-ai-models-for-coding)

### CI/CD
- [Build CI/CD Pipeline in 20 Min with GitHub Actions 2026](https://tech-insider.org/github-actions-ci-cd-pipeline-tutorial-2026/)
- [Best CI/CD Tools 2026](https://thesoftwarescout.com/best-ci-cd-tools-2026-complete-guide-to-continuous-integration-deployment/)
- [Best CI/CD Tools 2026 - JetBrains](https://blog.jetbrains.com/teamcity/2026/03/best-ci-tools/)
- [Blacksmith - Fastest GitHub Actions](https://www.blacksmith.sh/)

### 배포
- [Deploying Next.js Apps in 2026](https://dev.to/zahg_81752b307f5df5d56035/the-complete-guide-to-deploying-nextjs-apps-in-2026-vercel-self-hosted-and-everything-in-between-48ia)
- [Vercel & Next.js: Edge Functions, Preview Deployments](https://medium.com/@takafumi.endo/how-vercel-simplifies-deployment-for-developers-beaabe0ada32)

### AI 에이전트 개발
- [AI Deployment 2026: CI/CD for LLMs & Agents](https://www.harness.io/blog/ai-deployment-in-production-orchestrate-llms-rag-agents)
- [State of Agent Engineering - LangChain](https://www.langchain.com/state-of-agent-engineering)
- [LLM Testing Tools and Frameworks 2026](https://contextqa.com/blog/llm-testing-tools-frameworks-2026/)
- [Evaluating LLM Agents in Multi-Step Workflows](https://www.codeant.ai/blogs/evaluate-llm-agentic-workflows)

### 프롬프트 엔지니어링
- [Ultimate Guide to Prompt Engineering 2026](https://www.lakera.ai/blog/prompt-engineering-guide)
- [How Agentic AI Will Reshape Engineering Workflows 2026](https://www.cio.com/article/4134741/how-agentic-ai-will-reshape-engineering-workflows-in-2026.html)
- [Harness Engineering: Guide for AI Agent Development 2026](https://www.nxcode.io/resources/news/what-is-harness-engineering-complete-guide-2026)

### 테스트
- [Vitest vs Jest 30: 2026 Browser-Native Testing](https://dev.to/dataformathub/vitest-vs-jest-30-why-2026-is-the-year-of-browser-native-testing-2fgb)
- [Best AI Test Generation Tools for Playwright 2026](https://testdino.com/blog/ai-test-generation-tools/)
- [Playwright MCP AI Test Automation 2026](https://www.testleaf.com/blog/playwright-mcp-ai-test-automation-2026/)

### 데이터 API
- [Best Real-Time Stock Market Data APIs 2026](https://medium.com/@wutainfofu/best-real-time-stock-market-data-apis-compared-2026-guide-6335773814bc)
- [Korea Stocks API Integration Guide - iTick](https://blog.itick.org/en/stock-api/korean-stock-api-integration-guide-realtime-historical-data)
- [한국투자증권 Open API](https://apiportal.koreainvestment.com/apiservice)
- [한국투자증권 Open Trading API - GitHub](https://github.com/koreainvestment/open-trading-api)

### UI/차트
- [shadcn/ui Charts](https://ui.shadcn.com/docs/components/radix/chart)
- [Build Dashboard with shadcn/ui 2026](https://designrevision.com/blog/shadcn-dashboard-tutorial)
- [Stock Market Dashboard Templates 2026](https://tailadmin.com/blog/stock-market-dashboard-templates)

### 모노레포
- [Build Production Monorepo with Turborepo, Next.js](https://noqta.tn/en/tutorials/turborepo-nextjs-monorepo-shared-packages-2026)
- [Monorepo Tools 2026: Turborepo vs Nx vs Lerna](https://viadreams.cc/en/blog/monorepo-tools-2026/)

### 기술 부채 / 리스크
- [AI Technical Debt: How Vibe Coding Increases TCO](https://www.baytechconsulting.com/blog/ai-technical-debt-how-vibe-coding-increases-tco-and-how-to-fix-it)
- [AI Coding Technical Debt Crisis 2026-2027](https://www.pixelmojo.io/blogs/vibe-coding-technical-debt-crisis-2026-2027)
- [AI-Generated Code Creates New Wave of Technical Debt](https://www.infoq.com/news/2025/11/ai-code-technical-debt/)

### 백엔드
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Supabase Realtime: Live Dashboards Without WebSocket Server](https://cotera.co/articles/supabase-realtime-guide)
