# Branch 3.2: Robust Development Process Research

> **관점**: "천천히 만들어도 결함 없는 것이 낫다."
> **대상**: 주식 정보 모니터링 대시보드 + AI Agentic Workflow Automation System
> **조사일**: 2026-03-27

---

## 1. 개발 환경 세팅

### 1.1 완전한 로컬 환경 재현

**핵심 원칙**: Docker Compose 기반 단일 파일 정의로 전체 스택을 한 번에 구동하며, 모든 개발자와 CI 러너가 동일한 환경을 보장받는다.

#### 인프라 구성 (docker-compose.dev.yml)

```yaml
# 전체 스택 단일 파일 정의
services:
  # === 애플리케이션 ===
  frontend:          # Next.js/React 개발 서버 (Hot Reload)
  backend:           # FastAPI/NestJS API 서버

  # === 데이터 저장소 ===
  postgres:          # 메인 DB (사용자, 관심종목, 설정)
    healthcheck:     # startup ordering 보장
    tmpfs: /var/lib/postgresql/data  # 테스트 속도 향상
  redis:             # 실시간 데이터 캐시 + 세션
    healthcheck:

  # === 메시지 큐 ===
  rabbitmq:          # 뉴스 수집, 알림 비동기 처리

  # === Mock 서비스 ===
  mock-stock-api:    # 주식 API Mock (Mockoon 기반)
  mock-news-api:     # 뉴스 API Mock
  mock-websocket:    # WebSocket 실시간 시세 Mock 서버

  # === 모니터링 (로컬에서도 동작) ===
  prometheus:        # 메트릭 수집 (v3.9.0)
  grafana:           # 대시보드 시각화 (v12.3.0)
  loki:              # 로그 수집
```

#### Mock 데이터 전략

| 데이터 유형 | Mock 방식 | 도구 |
|------------|----------|------|
| 주식 시세 (REST) | 사전 녹화 응답 + 지연 시뮬레이션 | Mockoon, WireMock |
| 실시간 시세 (WebSocket) | Mock WebSocket 서버 + 시나리오 재생 | MockServer, Custom Node.js |
| 뉴스 피드 | 샘플 뉴스 데이터셋 (500+ 기사) | JSON fixtures |
| 종목 마스터 | NASDAQ 5,715개 실제 기업 데이터 | fake-financial-data-io |

> **근거**: Mockoon은 금융 REST API mock sample을 기본 제공하며, MockServer는 WebSocket 지연 시뮬레이션과 이벤트(연결/해제/에러) 재현을 지원한다.

#### 모니터링 스택 (로컬 동작)

- **Prometheus + Grafana**: 업계 표준 오픈소스 모니터링 스택 (Kubernetes 도입 조직의 63%가 사용)
- **Loki**: 로그 수집 및 Grafana 통합 시각화
- **Sentry**: 프론트엔드 에러 추적 (소스맵 연동)
- 로컬에서도 production과 동일한 대시보드로 메트릭/로그/트레이스 확인 가능

#### AI 에이전트 테스트 환경 (샌드박스)

2026년 기준 AI 에이전트 샌드박스 실행 환경의 3가지 격리 기술:

| 격리 수준 | 기술 | 적합 용도 |
|----------|------|----------|
| 최고 (MicroVM) | Firecracker, Kata Containers | 신뢰할 수 없는 AI 생성 코드 |
| 중간 (gVisor) | gVisor user-space kernel | syscall 가로채기 |
| 기본 (Container) | Docker hardened | 신뢰된 코드만 |

> **권장**: AI 생성 코드는 기본적으로 MicroVM에서 실행하고, 위협 모델이 정당화하는 경우에만 gVisor/Container로 완화한다.

**플랫폼 옵션**: E2B, Daytona, Cloudflare Workers (Dynamic), Modal, Northflank

#### 초기 세팅 시간: 반나절 (4~6시간)

| 단계 | 소요 시간 | 내용 |
|------|----------|------|
| Docker Compose 작성 + 검증 | 2시간 | 전체 서비스 정의, healthcheck, 볼륨 |
| Mock 데이터 준비 | 1시간 | API fixture, WebSocket 시나리오 |
| 모니터링 스택 설정 | 1시간 | Prometheus targets, Grafana 대시보드 |
| AI 샌드박스 환경 | 1시간 | MicroVM/Container 격리 설정 |
| 문서화 + 팀 공유 | 0.5시간 | README, Makefile 명령어 정리 |

---

## 2. 개발-배포 사이클

### 2.1 파이프라인 아키텍처

```
[Developer] ──push──> [CI Pipeline] ──pass──> [Staging] ──approve──> [Production]
     │                      │                      │                      │
     ├─ Pre-commit          ├─ Build               ├─ E2E Tests           ├─ Blue-Green Deploy
     ├─ ESLint + Prettier   ├─ Unit Tests          ├─ Performance Tests   ├─ Canary (10% → 50% → 100%)
     ├─ Type Check          ├─ Integration Tests   ├─ Security Pen Test   ├─ Health Gate 자동 검증
     └─ AI Code Review      ├─ SAST (SonarQube)    ├─ Human QA Review     └─ 자동 Rollback
                            ├─ DAST                └─ Compliance Check
                            ├─ SCA (Dependency)
                            ├─ Container Scan (Trivy)
                            └─ AI Code Review (Anthropic)
```

### 2.2 보안 스캐닝 (Shift-Left + 다중 계층)

2026년 엔터프라이즈 CI/CD 보안 7대 필수 사항:

| 스캐닝 유형 | 도구 | 시점 | 목적 |
|------------|------|------|------|
| SAST (정적 분석) | SonarQube, Semgrep | PR 시 | 소스코드 버그, 보안 취약점, 코드 스멜 |
| DAST (동적 분석) | OWASP ZAP | Staging 배포 후 | 실행 중 애플리케이션 취약점 |
| SCA (의존성 분석) | Snyk, npm audit | Build 시 | 오픈소스 의존성 CVE |
| Container 스캔 | Trivy | Image Build 시 | 컨테이너 이미지 취약점 |
| IaC 검증 | Checkov, tfsec | PR 시 | 인프라 코드 오설정 |
| Secret 탐지 | GitLeaks, TruffleHog | Pre-commit + CI | 시크릿 유출 방지 |
| SBOM 생성 | Syft | Release 시 | 소프트웨어 구성 요소 목록 |

> **금융 필수**: SLSA Level 4 (2026년 최고 수준) -- 모든 빌드가 "hermetic"하며, 모든 입력이 완전 명시되고 네트워크 접근 불가. 2026년 Cyber Resilience Act에 따라 자동화된 증명서(attestation)가 법적 필수.

#### SonarQube Quality Gate 구성

SonarQube는 TypeScript/JavaScript 500+ 독자 규칙을 포함하며, ESLint 규칙도 임포트 가능:

```
Quality Gate 조건:
- 신규 코드 커버리지 ≥ 80%
- 신규 코드 중복률 ≤ 3%
- 신규 버그 = 0
- 신규 보안 취약점 = 0
- 신규 보안 핫스팟 검토율 = 100%
- 기술 부채 비율 ≤ 5%
```

> **권장 조합**: 개발 시 ESLint (에디터 + pre-commit) + CI/CD 시 SonarQube (파이프라인 분석 + Quality Gate)

### 2.3 AI 생성 코드 의무적 인간 리뷰

2026년 현재 **Gartner 예측**: 기업 Generative AI 애플리케이션의 90%가 공식적인 Human-in-the-Loop(HITL) 프로세스를 요구한다.

#### 이중 리뷰 모델 (AI + Human)

```
AI 생성 코드 → AI Code Review (1차) → Human Review (2차) → Merge
                   │                        │
                   ├─ 문법, 스타일          ├─ 비즈니스 로직
                   ├─ 일반 버그             ├─ 아키텍처 설계
                   ├─ 보안 취약점            ├─ 복잡한 보안 시나리오
                   └─ 코드 스멜             └─ 전략적 방향
```

> **실증 데이터**: AI 보조 리뷰를 적용한 저장소는 머지 시간 32% 단축, 머지 후 결함 28% 감소. 단, AI 리뷰 도구도 할루시네이션 문제가 있으므로 인간 감독은 필수.

> **주요 도구**: Anthropic Code Review (2026.03 출시, GitHub PR 자동 분석), Qodo, CodeRabbit

### 2.4 배포 전략

금융 애플리케이션의 경우 **Blue-Green + Canary 하이브리드** 권장:

#### Phase 1: Blue-Green (기본)
- 두 개의 완전 동일한 Production 환경 유지
- 트래픽 전환은 단일 원자적 작업 (로드 밸런서 또는 DNS 스위칭)
- 문제 시 즉시 이전 환경으로 롤백 (수 초 이내)
- **금융 서비스가 선호하는 이유**: 다운타임 비용이 이중 인프라 비용보다 크기 때문

#### Phase 2: Canary (점진적 전환)
- 10% → 25% → 50% → 100% 단계적 트래픽 이동
- 각 단계에서 Health Gate 자동 검증 (에러율, 응답 시간, 비즈니스 메트릭)
- Gate 실패 시 자동 롤백 -- 트래픽 라우팅 변경만으로 수 초 내 완료
- 새로운 배포 불필요, 코드 작업 불필요

### 2.5 배포 사이클 시간

| 변경 유형 | 개발 | 리뷰 | QA | 배포 | 총 |
|----------|------|------|-----|------|-----|
| Hotfix (긴급 버그) | 1일 | 0.5일 | 0.5일 | 0.5일 | **2~3일** |
| 일반 기능 | 3~5일 | 1~2일 | 2~3일 | 1일 | **1~1.5주** |
| 대규모 기능 | 1~2주 | 2~3일 | 3~5일 | 1~2일 | **2~3주** |
| 인프라 변경 | 1주 | 2~3일 | 3~5일 | 2~3일 | **2~3주** |

> **총평**: 일반 기능 기준 **1주~1.5주** 사이클. 속도보다 안정성을 우선하므로 수용 가능한 범위.

---

## 3. 품질 관리

### 3.1 자동 테스트 전략 (4계층)

| 계층 | 유형 | 커버리지 목표 | 도구 | 실행 시점 |
|------|------|-------------|------|----------|
| L1 | Unit Test | ≥ 80% | Vitest/Jest | 매 커밋 |
| L2 | Integration Test | 핵심 경로 100% | Vitest + Supertest | 매 PR |
| L3 | E2E Test | 핵심 시나리오 100% | **Playwright** | 매 PR + Nightly |
| L4 | Performance/Load Test | P95 < 200ms | k6, Artillery | Weekly + Pre-release |

#### Playwright 선택 근거 (2026년 기준)

| 지표 | Playwright | Cypress |
|------|-----------|---------|
| 테스트당 평균 속도 | **290ms** | 420ms |
| 10개 병렬 테스트 RAM | **2.1 GB** | 3.2 GB |
| Flakiness Rate | **1.8%** | 6.5% |
| 멀티 브라우저 지원 | Chromium, Firefox, **WebKit** | Chromium, Firefox (제한) |
| WebSocket 테스트 | `page.routeWebSocket()` 내장 | 플러그인 필요 |

> **실증 사례**: 의료 기술 기업이 1,200개 Cypress 테스트를 Playwright로 이전 후 실행 시간 90분 → 14분, flakiness 6.5% → 1.8%로 감소.

#### WebSocket 실시간 데이터 테스트 전략

```
[Unit Test]
  └─ WebSocket 클라이언트 로직 단위 테스트 (Mock 주입)

[Integration Test]
  └─ MockServer로 WebSocket 서버 시뮬레이션
     ├─ 정상 시세 수신 시나리오
     ├─ 네트워크 지연 시뮬레이션
     ├─ 연결 끊김 + 자동 재연결
     └─ 에러 응답 처리

[E2E Test]
  └─ Playwright page.routeWebSocket()
     ├─ Mock WebSocket으로 하드코딩된 가격 주입
     ├─ UI에 동일 가격 표시 검증
     └─ 실시간 업데이트 반영 확인

[Load Test]
  └─ Artillery WebSocket 부하 테스트
     ├─ 동시 1,000개 WebSocket 연결
     ├─ 초당 10,000 메시지 처리
     └─ P95 지연 < 100ms 검증
```

### 3.2 AI 생성 코드 품질 게이트

```
AI Code Generation
  │
  ├─ [Gate 1] 정적 분석 통과
  │     ├─ ESLint (strict mode)
  │     ├─ TypeScript strict (noImplicitAny, strictNullChecks)
  │     └─ SonarQube Quality Gate
  │
  ├─ [Gate 2] 자동 테스트 통과
  │     ├─ 생성된 코드에 대한 테스트도 함께 생성 요구
  │     ├─ 기존 테스트 스위트 전체 통과
  │     └─ 커버리지 하락 불가 (ratchet 정책)
  │
  ├─ [Gate 3] 보안 스캔 통과
  │     ├─ SAST + SCA 클린
  │     ├─ Secret 탐지 클린
  │     └─ 알려진 취약 패턴 검사
  │
  ├─ [Gate 4] AI Code Review
  │     └─ Anthropic Code Review / Qodo 자동 분석
  │
  └─ [Gate 5] Human Review (의무)
        ├─ 비즈니스 로직 정확성
        ├─ 아키텍처 적합성
        └─ 최종 승인
```

> **핵심 통계**: AI(LLM)는 보안 프롬프팅 없이 정확하고 안전한 코드를 **56%**만 생성하며, 특정 취약점을 명시하더라도 **69%**에 그친다. 따라서 다중 계층 검증이 필수.

### 3.3 Self-Healing 테스트 자동화

2026년 AI 기반 QA의 핵심 트렌드:

- **Self-Healing Automation**: UI 변경 시 AI가 자동으로 로케이터를 업데이트하여 테스트 유지보수 부담 감소
- **AI 기반 테스트 케이스 생성**: 요구사항/유저 스토리에서 자동 테스트 케이스 추출
- **Flakiness 관리**: flake-adjusted coverage 도입으로 참 안정성과 억제된 노이즈 구분
- **예측적 결함 탐지**: 고위험 영역을 사전 식별하여 테스트 우선순위 지정

> **ROI**: AI를 SDLC 전반에 통합한 기업은 소프트웨어 개발 성과 30~45% 향상 (주로 AI 기반 계획, 테스트 자동화, 초기 결함 예측 덕분).

### 3.4 QA 기간 및 전략

| 단계 | 기간 | 활동 |
|------|------|------|
| 자동화 테스트 | 상시 (CI) | Unit + Integration + E2E 자동 실행 |
| 탐색적 테스트 | 릴리스 전 2~3일 | 인간 QA가 시나리오 외 경로 탐색 |
| 보안 테스트 | 릴리스 전 1~2일 | 침투 테스트 + 보안 감사 |
| 성능 테스트 | 릴리스 전 1일 | 부하 테스트 + 스트레스 테스트 |
| UAT (사용자 수용) | 릴리스 전 2~3일 | 실제 사용 시나리오 검증 |
| 총 QA 기간 | **5~7일** (일반 릴리스) | |

---

## 4. AI Agent 특화 안전 프로세스

### 4.1 에이전트 행동 파이프라인

```
[AI Agent 코드 생성]
       │
       ▼
[샌드박스 실행] ─── MicroVM (Firecracker) 격리
       │
       ▼
[자동 검증] ─── 정적 분석 + 테스트 + 보안 스캔
       │
       ├─ PASS ──▶ [AI Code Review]
       │                 │
       │                 ├─ PASS ──▶ [Human Review + 승인]
       │                 │                    │
       │                 │                    ├─ APPROVE ──▶ [Staging 배포]
       │                 │                    │                    │
       │                 │                    │                    ▼
       │                 │                    │              [E2E + 성능 검증]
       │                 │                    │                    │
       │                 │                    │                    ├─ PASS ──▶ [Production 배포]
       │                 │                    │                    └─ FAIL ──▶ [롤백 + 원인 분석]
       │                 │                    │
       │                 │                    └─ REJECT ──▶ [에이전트에 피드백 + 재생성]
       │                 │
       │                 └─ FAIL ──▶ [에이전트에 피드백 + 재생성]
       │
       └─ FAIL ──▶ [에이전트에 피드백 + 재생성 (최대 3회)]
```

### 4.2 에이전트 행동 로깅 및 감사 추적

2026년 기준 AI 에이전트 감사 추적(Audit Trail)의 필수 요소:

#### 기록해야 할 항목

| 카테고리 | 세부 항목 |
|----------|----------|
| 행동 기록 | 파일 생성/수정/삭제, API 호출, 명령어 실행 |
| 의사결정 기록 | 프롬프트, 컨텍스트, 추론 로직 ("왜" 그 행동을 했는지) |
| 입출력 기록 | 모든 입력 프롬프트 + 모든 출력 (코드, 텍스트) |
| 리소스 접근 | 읽은 파일, 접근한 API, 사용한 도구 |
| 타임스탬프 | 모든 행동의 정확한 시점 |

#### 규제 요건

- **EU AI Act**: 고위험 AI 시스템에 대한 자동 로깅 의무화 (추적성 + 책임성)
- **보관 기간**: 최소 6개월 (EU AI Act), 업종별 1~7년 (금융 업계 일반)

#### 감사 추적 아키텍처

```
[AI Agent] ──모든 행동──▶ [Agent Gateway]
                              │
                              ├─ 정책 평가 (실시간)
                              ├─ 위험 점수 산출
                              ├─ 승인/차단 결정
                              │
                              ▼
                     [Immutable Audit Log]
                              │
                              ├─ 실시간 모니터링 대시보드
                              ├─ 이상 탐지 알림
                              └─ 규정 준수 보고서 자동 생성
```

> **현실**: 2026 Gravitee 조사에 따르면 조직의 24.4%만이 AI 에이전트 간 통신에 대한 완전한 가시성을 확보하고 있으며, 절반 이상의 에이전트가 보안 감독이나 로깅 없이 실행되고 있다. -- 이는 심각한 리스크이며 본 프로젝트에서는 반드시 해결해야 함.

### 4.3 롤백 메커니즘

| 수준 | 트리거 | 롤백 방식 | 소요 시간 |
|------|--------|----------|----------|
| 코드 수준 | 테스트 실패 | Git revert + 재배포 | 분 단위 |
| 배포 수준 | Health Gate 실패 | Blue-Green 전환 / Canary 트래픽 라우팅 | **수 초** |
| 데이터 수준 | 데이터 손상 감지 | DB 스냅샷 복원 | 분~시간 |
| 에이전트 수준 | 이상 행동 탐지 | 에이전트 즉시 중지 + 수동 개입 | 즉시 |

### 4.4 Human-in-the-Loop (HITL) 개입 포인트

```
HITL 의무 개입 포인트:

1. [코드 리뷰]     AI 생성 코드 → 인간 승인 필수
2. [배포 승인]     Production 배포 → 인간 승인 필수
3. [설정 변경]     API 키, 보안 설정 → 인간 승인 필수
4. [스키마 변경]   DB 스키마 마이그레이션 → 인간 승인 필수
5. [에이전트 권한] 새로운 도구/권한 부여 → 인간 승인 필수
6. [이상 탐지]     에이전트 비정상 행동 시 → 자동 중지 + 인간 확인
```

### 4.5 AI 에이전트 Guardrail 계층

2026년 권장 다계층 방어 전략:

```
Layer 1: Input Guardrails
  ├─ Prompt injection 탐지 및 차단
  ├─ 입력 길이/형식 제한
  └─ 민감 데이터 마스킹

Layer 2: Execution Guardrails
  ├─ 샌드박스 격리 실행
  ├─ 리소스 제한 (CPU, 메모리, 시간)
  ├─ 네트워크 접근 제한 (허용 목록만)
  └─ 파일시스템 접근 제한

Layer 3: Output Guardrails
  ├─ PII 유출 탐지
  ├─ 할루시네이션 탐지
  ├─ 유해 콘텐츠 필터링
  └─ 코드 보안 검증

Layer 4: Behavioral Guardrails
  ├─ 행동 패턴 모니터링
  ├─ 비정상 행동 자동 탐지
  ├─ 재시도 예산 (최대 3회)
  └─ 에스컬레이션 (인간에게 전달)
```

> **핵심**: "정확도 먼저, 가드레일 나중" -- 검색 및 추론 기법으로 할루시네이션을 측정 가능하게 줄인 후, 비즈니스 리스크에 비례하여 가드레일을 계층적으로 적용한다. 벤더 가드레일만으로는 리스크가 제거되지 않으므로, 에이전트/API/데이터스토어/워크플로우/인간 프로세스 전체에 걸쳐 보안을 계층화해야 한다.

---

## 5. 리스크 분석

### 5.1 Robust Development 관점의 리스크

| 리스크 | 심각도 | 발생 가능성 | 완화 전략 |
|--------|--------|------------|----------|
| 개발 속도 느림 | 중 | 높음 | AI 에이전트로 반복 작업 자동화, 병렬 작업 극대화 |
| 시장 변화 느린 대응 | 중 | 중 | Hotfix 경로 별도 운영 (2~3일), Feature Flag |
| AI 활용도 제한 (검증 오버헤드) | 중 | 높음 | 리스크 수준별 차등 검증 (Low: 자동만, High: 전체 파이프라인) |
| 초기 개발 기간 김 | 중 | 높음 | 인프라 세팅 + 파이프라인 구축에 1~2주 선투자, 이후 안정적 속도 |
| AI 코드 품질 부족 (56% 정확도) | 높음 | 높음 | 5단계 Quality Gate + 의무적 Human Review |
| 보안 사고 (AI 에이전트) | 매우 높음 | 중 | 4계층 Guardrail + 샌드박스 + 감사 추적 |
| 에이전트 가시성 부족 (24.4%만 확보) | 높음 | 높음 | Agent Gateway + 모든 행동 불변 로깅 |

### 5.2 이점

| 이점 | 효과 |
|------|------|
| 코드 품질 높음 | 머지 후 결함 28% 감소 (AI 리뷰 적용 시) |
| 배포 안정성 | Blue-Green + Canary로 다운타임 제로 |
| 규정 준수 | EU AI Act, Cyber Resilience Act 대응 |
| 장기적 속도 향상 | 기술 부채 축적 방지로 6개월 후 오히려 빠른 개발 |
| 팀 신뢰성 | 모든 변경이 검증됨 → 배포 공포 제거 |

---

## 6. 최종 결론

### 6.1 정량적 평가

| 항목 | 평가 | 상세 |
|------|------|------|
| **개발 사이클** | **1주 ~ 1.5주** (일반 기능) | Hotfix 2~3일, 대규모 2~3주 |
| **6개월 가능 기능 수** | **15~20개** (핵심 기능 + 주요 개선) | 속도보다 품질, 기술 부채 최소 |
| **코드 품질 수준** | **높음** (A등급) | 5단계 Quality Gate, ≥80% 커버리지 |
| **AI 에이전트 안전성** | **매우 높음** | 4계층 Guardrail + 샌드박스 + HITL + 감사추적 |
| **배포 안정성** | **매우 높음** | Blue-Green + Canary, 수 초 내 롤백 |
| **규정 준수** | **높음** | EU AI Act, SLSA Level 4 대응 가능 |

### 6.2 구체적 도구 체인

#### CI/CD 파이프라인

| 영역 | 도구 | 용도 |
|------|------|------|
| CI/CD 엔진 | **GitHub Actions** | 파이프라인 오케스트레이션 |
| 컨테이너화 | **Docker + Docker Compose** | 환경 일관성 |
| 컨테이너 레지스트리 | **GitHub Container Registry (GHCR)** | 이미지 저장 |
| IaC | **Terraform** | 인프라 코드 관리 |

#### 테스트

| 영역 | 도구 | 용도 |
|------|------|------|
| Unit/Integration | **Vitest** | 빠른 테스트 실행 (Vite 네이티브) |
| E2E | **Playwright** | 브라우저 자동화 (WebSocket 내장 지원) |
| API 테스트 | **Supertest** | HTTP/REST API 테스트 |
| 부하 테스트 | **k6 + Artillery** | HTTP + WebSocket 부하 |
| Mock 서버 | **Mockoon + MockServer** | REST + WebSocket Mock |

#### 보안

| 영역 | 도구 | 용도 |
|------|------|------|
| SAST | **SonarQube** | 정적 분석 + Quality Gate |
| SCA | **Snyk** | 의존성 취약점 |
| Container Scan | **Trivy** | 이미지 취약점 |
| Secret 탐지 | **GitLeaks** | 시크릿 유출 방지 |
| DAST | **OWASP ZAP** | 동적 보안 테스트 |
| 코드 리뷰 | **Anthropic Code Review** | AI 코드 리뷰 |

#### 모니터링

| 영역 | 도구 | 용도 |
|------|------|------|
| 메트릭 수집 | **Prometheus** | 시계열 메트릭 |
| 시각화 | **Grafana** | 대시보드 + 알림 |
| 로그 수집 | **Loki** | 로그 집계 |
| 에러 추적 | **Sentry** | 프론트엔드/백엔드 에러 |
| AI 에이전트 감시 | **Agent Gateway (Custom)** | 행동 로깅 + 정책 실행 |

#### AI 에이전트 안전

| 영역 | 도구 | 용도 |
|------|------|------|
| 샌드박스 | **E2B / Firecracker** | MicroVM 격리 실행 |
| Guardrail | **Custom + Guardrails AI** | 4계층 방어 |
| 감사 추적 | **Immutable Audit Log (Custom)** | 불변 행동 기록 |
| 에이전트 리뷰 | **Anthropic Code Review** | AI 생성 코드 자동 분석 |

---

## Sources

### 개발 환경
- [How to Build Local Development Environment](https://oneuptime.com/blog/post/2026-01-30-local-development-environment/view)
- [How to Use Docker Compose for Local Development Environments](https://oneuptime.com/blog/post/2026-02-20-docker-compose-development/view)
- [How to Use Docker for End-to-End Testing Environments](https://oneuptime.com/blog/post/2026-02-08-how-to-use-docker-for-end-to-end-testing-environments/view)
- [Building an E2E Testing Environment with Docker Compose](https://sebastiancoding.com/blog/e2e-testing-and-development-with-docker-compose/)

### CI/CD 보안
- [Secure CI/CD Pipelines: 7 Essential 2026 Best Practices](https://dev.to/dev_narratives_023afd008e/secure-cicd-pipelines-7-essential-2026-best-practices-55mk)
- [CI/CD Pipeline Security Best Practices | Wiz](https://www.wiz.io/academy/application-security/ci-cd-security-best-practices)
- [CI/CD Security Checklist for Businesses in 2026](https://www.sentinelone.com/cybersecurity-101/cloud-security/ci-cd-security-checklist/)
- [Top 10 CI/CD Pipeline Best Practices for Engineering Leaders in 2026](https://www.tekrecruiter.com/post/top-10-ci-cd-pipeline-best-practices-for-engineering-leaders-in-2026)
- [CI/CD Pipeline Best Practices (2026) | ZTABS](https://ztabs.co/blog/ci-cd-pipeline-best-practices)

### AI 코드 품질
- [The State of AI Code Review in 2026](https://dev.to/rahulxsingh/the-state-of-ai-code-review-in-2026-trends-tools-and-whats-next-2gfh)
- [Anthropic launches code review tool](https://techcrunch.com/2026/03/09/anthropic-launches-code-review-tool-to-check-flood-of-ai-generated-code/)
- [8 Best AI Code Review Tools That Catch Real Bugs in 2026](https://www.qodo.ai/blog/best-ai-code-review-tools-2026/)
- [Code Review in 2026: Reviewing the AI, Not the Human](https://raogy.guide/blog/ai-code-review-2026)
- [Will Humans Still Review Code?](https://franciscomt.medium.com/will-humans-still-review-code-a6f7d3f0c39c)

### QA 및 테스트
- [QA Trends Report 2026](https://thinksys.com/qa-testing/qa-trends-report-2026/)
- [13 AI Testing Tools to Streamline Your QA Process in 2026](https://www.digitalocean.com/resources/articles/ai-testing-tools)
- [Smarter QA in 2026](https://talent500.com/blog/smarter-qa-2026-ai-automation-future-of-software-testing/)

### E2E 테스트
- [E2E Testing Tools in 2026: Playwright, Cypress, and the AI Alternative](https://www.getautonoma.com/blog/e2e-testing-tools)
- [Playwright vs Cypress: The 2026 Enterprise Testing Guide](https://devin-rosario.medium.com/playwright-vs-cypress-the-2026-enterprise-testing-guide-ade8b56d3478)
- [Why Playwright Seems to Be Winning Over Cypress](https://www.d4b.dev/blog/2026-02-17-why-playwright-seems-to-be-winning-over-cypress-for-end-to-end-testing)

### AI 에이전트 안전
- [AI Agent Guardrails: Production Guide for 2026](https://authoritypartners.com/insights/ai-agent-guardrails-production-guide-for-2026/)
- [AI Agent Security In 2026: What Enterprises Are Getting Wrong](https://agatsoftware.com/blog/ai-agent-security-enterprise-2026/)
- [As Coders Adopt AI Agents, Security Pitfalls Lurk in 2026](https://www.darkreading.com/application-security/coders-adopt-ai-agents-security-pitfalls-lurk-2026)
- [Security for Production AI Agents in 2026](https://iain.so/security-for-production-ai-agents-in-2026)
- [LLM Security Risks in 2026](https://sombrainc.com/blog/llm-security-risks-2026)

### 감사 추적
- [AI Agent Audit Trail: Complete Guide for 2026](https://fast.io/resources/ai-agent-audit-trail/)
- [Audit Trails for Agents](https://www.adopt.ai/glossary/audit-trails-for-agents)
- [Auditing and Logging AI Agent Activity](https://www.loginradius.com/blog/engineering/auditing-and-logging-ai-agent-activity)
- [Agentic AI Governance Framework](https://www.mintmcp.com/blog/agentic-ai-goverance-framework)
- [Your AI Agent Needs an Audit Trail, Not Just a Guardrail](https://medium.com/@ianloe/your-ai-agent-needs-an-audit-trail-not-just-a-guardrail-6a41de67ae75)

### 샌드박스
- [Top Sandbox Platforms for AI Code Execution in 2026](https://www.koyeb.com/blog/top-sandbox-code-execution-platforms-for-ai-code-execution-2026)
- [AI Agent Sandbox: How to Safely Run Autonomous Agents in 2026](https://www.firecrawl.dev/blog/ai-agent-sandbox)
- [How to sandbox AI agents in 2026: MicroVMs, gVisor & isolation strategies](https://northflank.com/blog/how-to-sandbox-ai-agents)
- [Practical Security Guidance for Sandboxing Agentic Workflows | NVIDIA](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)

### 배포 전략
- [Zero-Downtime Deployment Strategies (2026)](https://www.askantech.com/zero-downtime-deployment-blue-green-canary-rolling-updates/)
- [Blue-Green and Canary Deployments Explained | Harness](https://www.harness.io/blog/blue-green-canary-deployment-strategies)

### 모니터링
- [Grafana & Prometheus Complete Guide 2026](https://aicybr.com/blog/grafana-prometheus-complete-guide)
- [Grafana & Prometheus: Complete Performance Monitoring Stack](https://yrkan.com/blog/grafana-prometheus-monitoring/)

### 정적 분석
- [SonarQube vs ESLint (2026)](https://dev.to/rahulxsingh/sonarqube-vs-eslint-code-quality-platform-vs-javascript-linter-2026-i55)
- [How to Analyse Code: Static, Dynamic, Security & Quality Gates](https://acharyaks90.medium.com/how-to-analyse-code-code-analyzer-101-static-dynamic-security-quality-gates-ee29608d2049)

### WebSocket 테스트
- [WebSocket Testing Essentials: Strategies and Code for Real-Time Apps](https://www.thegreenreport.blog/articles/websocket-testing-essentials-strategies-and-code-for-real-time-apps/websocket-testing-essentials-strategies-and-code-for-real-time-apps.html)
- [Real-Time Application Testing: WebSocket Basics and Mock Interception](https://abigailarmijo.substack.com/p/real-time-application-testing-websocket)

### 금융 API
- [Stock Market API 2026: Real-Time Data for Developers](https://fcsapi.com/blog/stock-market-api-2026-real-time-data-for-developers)
- [Best Financial Data APIs in 2026](https://www.nb-data.com/p/best-financial-data-apis-in-2026)
- [Top 12 Financial Data APIs for Real-Time Stock Market Insights in 2026](https://blog.apilayer.com/top-12-financial-data-apis-for-real-time-stock-market-insights-in-2026/)
- [Mockoon - Financial APIs mock samples](https://mockoon.com/mock-samples/category/financial/)
