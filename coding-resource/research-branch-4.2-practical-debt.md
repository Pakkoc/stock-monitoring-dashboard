# Branch 4.2: Practical Debt -- 부채를 인정하고 현실적으로 관리하는 전문가

## 리서치 대상
"주식 정보 모니터링 대시보드를 자동 구현하는 AI Agentic Workflow Automation System"

## 관점
> "부채는 나중에 갚으면 된다. 지금은 빨리 진행하자."

---

## 1. 부채 허용 전략

### 1.1 현실 인식: 부채는 악이 아니라 레버리지다

Martin Fowler의 Technical Debt Quadrant에 따르면, 모든 기술 부채가 동등한 것은 아니다. 핵심은 **Deliberate & Prudent(의도적이고 신중한) 부채**와 **Reckless(무모한) 부채**를 구분하는 것이다.

| 유형 | 정의 | 본 프로젝트 예시 | 허용 여부 |
|------|------|----------------|----------|
| **Deliberate & Prudent** | 마감 압박 하에 의식적으로 선택한 단축 경로 | "WebSocket 대신 polling으로 먼저 구현, TODO로 기록" | **허용** |
| **Deliberate & Reckless** | 알면서도 품질을 무시하는 선택 | "에러 핸들링 전부 생략, 테스트 제로" | **제한적 허용** (MVP 단계 한정) |
| **Inadvertent & Prudent** | 더 나은 방법을 나중에 발견 | "구현 후 더 효율적인 API 발견" | **자연 발생** -- 관리만 필요 |
| **Inadvertent & Reckless** | 역량 부족으로 인한 실수 | "AI 에이전트가 anti-pattern을 생성" | **경계 필요** -- 리뷰 필수 |

**70개 스타트업 코드베이스 실증 연구(2009-2022)**: ZIRP 시대에 "빠르게 움직이고 부수는" 전략을 택한 스타트업이 더 많은 자금을 유치했다는 데이터가 존재한다. 단, 이는 시장 검증(PMF) 이전 단계에서의 이야기이며, PMF 이후에는 부채 관리가 성장의 핵심 병목이 된다.

### 1.2 본 프로젝트 부채 허용 기준

```
┌─────────────────────────────────────────────────────┐
│          부채 허용 의사결정 흐름도                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [기능 구현 요청]                                     │
│       │                                             │
│       ▼                                             │
│  보안/데이터 무결성에 영향?                             │
│       │                                             │
│    Yes ──► 부채 불허용. 제대로 구현.                    │
│       │                                             │
│    No                                               │
│       │                                             │
│       ▼                                             │
│  핵심 데이터 파이프라인(실시간 주가)?                    │
│       │                                             │
│    Yes ──► 부채 제한 허용. 성능 부채만 허용.            │
│       │     기능 정확성은 반드시 보장.                   │
│    No                                               │
│       │                                             │
│       ▼                                             │
│  UI/UX, 관리 기능, 부가 기능?                          │
│       │                                             │
│    Yes ──► 부채 허용. TODO 태그 + 분기 리뷰.           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**구체적 허용 기준**:

| 영역 | 부채 허용 수준 | 근거 |
|------|--------------|------|
| **실시간 주가 데이터 파이프라인** | 낮음 -- 정확성 필수, 성능 최적화만 후순위 | 잘못된 주가 표시는 투자 의사결정에 치명적 |
| **뉴스 피드 연동** | 중간 -- 기본 동작 보장, 에지 케이스 후순위 | 뉴스 지연/누락은 불편하지만 치명적이지 않음 |
| **테마별 그룹핑 UI** | 높음 -- "동작하면 OK" | UI 개선은 점진적으로 가능 |
| **관리자 기능** | 높음 -- 최소 기능만 | 사용자 1명(개인용), 관리 복잡성 낮음 |
| **위젯 레이아웃 시스템** | 중간 -- 기본 그리드만 | 커스텀 드래그앤드롭은 나중에 |
| **종목 정렬/필터링** | 낮음 -- 정확한 정렬 필수 | 잘못된 정렬은 의사결정 왜곡 |

### 1.3 "Hack" 허용 프로토콜

급할 때 Hack을 허용하되, **반드시 추적 가능**하게 한다:

```javascript
// TODO(DEBT): [P2] WebSocket 대신 5초 polling 사용 중
// - 원인: WebSocket 서버 설정 시간 부족
// - 영향: 서버 부하 증가, 실시간성 저하
// - 해소 조건: WebSocket 인프라 구축 완료 시
// - 예상 해소 시점: 2분기
// - 부채 유형: Deliberate & Prudent
function fetchStockPrice() {
  setInterval(() => { /* polling logic */ }, 5000);
}
```

**TODO 태그 체계**:
- `TODO(DEBT)`: 의도적 기술 부채 (추적 대상)
- `TODO(AI-DEBT)`: AI 에이전트가 생성한 코드 중 검증 필요 항목
- `TODO(PERF)`: 성능 최적화 후순위
- `TODO(HACK)`: 긴급 우회 (가장 높은 상환 우선순위)
- `FIXME`: 알려진 버그 (즉시 수정 대상)

**우선순위 체계**:
- `[P0]`: 다음 스프린트 내 해소 필수
- `[P1]`: 분기 내 해소
- `[P2]`: 반기 내 해소
- `[P3]`: 기회 있을 때 해소

---

## 2. AI 생성 코드의 현실적 관리

### 2.1 데이터가 말하는 AI 코드의 현실

2025년 연구 데이터가 보여주는 냉혹한 현실:

| 지표 | 수치 | 출처 |
|------|------|------|
| AI 코드 중 오류/오해 유도 비율 | 개발자 25%가 "5개 중 1개는 부정확" 평가 | Qodo 2025 State of AI Code Quality |
| GitHub Copilot 코드 수락률 | 약 30% (46% 제안 중) | Qodo Report |
| AI 사용 시 PR당 인시던트 증가율 | +23.5% | CodeRabbit State Report |
| AI 사용 시 변경 실패율 증가 | +30% | CodeRabbit State Report |
| AI 코드의 로직/정확성 이슈 | 인간 코드 대비 75% 더 많음 | GitClear 분석 |
| 중복 코드 블록 증가 | 8배 (2024년) | GitClear 211M lines 분석 |
| AI가 기술 부채 증가시켰다는 응답 | 40% | 개발자 설문 |
| AI 코드 부정적 영향 보고 | 88% (1건 이상) | State of Software Delivery 2025 |
| AI 기반 스타트업 스케일링 실패율 | 73% (6개월 내) | 847개 벤처 분석 |

**핵심 인사이트**: "2025년은 AI 속도의 해였다. 2026년은 AI 품질의 해가 될 것이다." (CodeRabbit)

### 2.2 AI 생성 코드 3계층 관리 체계

본 프로젝트에서 AI 에이전트(Claude Code 등)가 자동 생성하는 코드에 대해 다음 3계층 관리를 적용한다:

```
┌──────────────────────────────────────────────────────┐
│              AI 생성 코드 3계층 관리                     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Layer 1: 즉시 수락 (Auto-Accept)                     │
│  ─────────────────────────────────                    │
│  대상: 보일러플레이트, 설정 파일, 단순 CRUD              │
│  기준: "동작하면 OK"                                   │
│  리뷰: 자동 린트 통과 시 수락                           │
│  부채 태그: 불필요                                     │
│                                                      │
│  Layer 2: 경량 리뷰 (Quick Review)                     │
│  ─────────────────────────────────                    │
│  대상: 비즈니스 로직, API 연동, 데이터 변환              │
│  기준: 로직 정확성 + 에지 케이스 1-2개 확인             │
│  리뷰: 5-10분 내 검토                                  │
│  부채 태그: TODO(AI-DEBT) 필요 시 부착                  │
│                                                      │
│  Layer 3: 심층 리뷰 (Deep Review)                      │
│  ─────────────────────────────────                    │
│  대상: 실시간 데이터 파이프라인, 인증, 금융 계산          │
│  기준: 테스트 커버리지 + 정확성 검증 + 성능 프로파일링    │
│  리뷰: 상세 코드 리뷰 필수                              │
│  부채 태그: 부채 불허용 영역                             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 2.3 "동작하면 충분" 기준의 구체적 정의

"동작하면 충분"이 무한한 품질 타협을 의미하지는 않는다. 최소 기준선을 정의한다:

| 기준 | 최소 요건 | 이상적 수준 | 비고 |
|------|----------|------------|------|
| **기능 정확성** | 주요 시나리오 3개 통과 | 엣지 케이스 포함 전체 통과 | 비타협 |
| **에러 핸들링** | 치명적 에러 catch + 로깅 | 모든 에러 graceful 처리 | Layer 1은 기본 try-catch만 |
| **코드 가독성** | 함수명/변수명 의미 명확 | 주석 + JSDoc 완비 | AI 코드는 변수명 품질 낮을 수 있음 |
| **성능** | 1초 내 응답 (사용자 체감) | 200ms 이내 | 최적화는 나중에 |
| **보안** | SQL Injection, XSS 방지 | OWASP Top 10 전체 대응 | 비타협 |
| **테스트** | 핵심 로직 단위 테스트 | 통합 + E2E 포함 | Layer 1은 테스트 없어도 가능 |

### 2.4 프롬프트 엔지니어링: 빠른 반복 전략

AI 에이전트의 코드 생성 품질을 높이되, 프롬프트 자체에 과도한 시간을 투자하지 않는 전략:

```
프롬프트 반복 주기:
  v1 (30분): 기본 요구사항 기술 → 생성 → 동작 확인
  v2 (15분): 에러/부족 부분 보완 → 재생성
  v3 (10분): 미세 조정 → 최종 수락

  총 1시간 이내. 3회 반복 후에도 만족스럽지 않으면
  → 수동 코딩으로 전환 (시간 효율성 판단)
```

---

## 3. 부채 추적 (가볍게)

### 3.1 자동 수집 파이프라인

무거운 도구를 도입하지 않고, 기존 개발 흐름에 자연스럽게 녹이는 경량 추적 체계:

```
┌─────────────────────────────────────────────────────┐
│         경량 부채 추적 파이프라인                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [코드베이스]                                        │
│       │                                             │
│       ▼                                             │
│  TODO/FIXME 자동 스캔 (CI/CD 통합)                   │
│  ┌────────────────────────────────┐                 │
│  │ grep -rn "TODO\|FIXME\|HACK"  │                 │
│  │ + SonarQube Technical Debt     │                 │
│  │   Ratio 자동 계산              │                 │
│  └────────────────────────────────┘                 │
│       │                                             │
│       ▼                                             │
│  debt-report.md 자동 생성 (주 1회)                   │
│  ┌────────────────────────────────┐                 │
│  │ - 총 부채 항목 수              │                 │
│  │ - 우선순위별 분포              │                 │
│  │ - 신규 발생 vs 해소           │                 │
│  │ - AI 생성 부채 비율           │                 │
│  └────────────────────────────────┘                 │
│       │                                             │
│       ▼                                             │
│  월 1회 부채 정리 회의 (30분)                        │
│  ┌────────────────────────────────┐                 │
│  │ - P0 부채 즉시 할당           │                 │
│  │ - P1 부채 다음 스프린트 포함   │                 │
│  │ - P2/P3 재평가               │                 │
│  │ - 부채 비율 추이 확인         │                 │
│  └────────────────────────────────┘                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 3.2 부채 대시보드 (최소 구현)

프로젝트의 주식 모니터링 대시보드처럼, 기술 부채도 가시화한다. 단, 최소한으로:

```yaml
# debt-dashboard (CI에서 자동 생성)
metrics:
  total_debt_items: 47
  by_priority:
    P0: 2      # 즉시 해소 필요
    P1: 8      # 분기 내
    P2: 22     # 반기 내
    P3: 15     # 기회주의적
  by_type:
    DEBT: 18
    AI-DEBT: 15
    PERF: 9
    HACK: 5
  debt_ratio: 7.3%    # 목표: 10% 이하 유지
  trend: "stable"      # increasing / stable / decreasing
  ai_generated_ratio: 31.9%  # AI 코드 내 부채 비중
```

### 3.3 "중요 부채만 따로 관리" 원칙

**모든 부채를 동등하게 관리하지 않는다.** 파레토 법칙을 적용한다:

- **상위 20% 부채** (비즈니스 영향도 기준): 전용 이슈 트래커에 등록, 담당자 배정
- **나머지 80%**: TODO 주석으로만 관리, 월 1회 리뷰에서 승격 여부 결정
- **AI 생성 코드 태깅**: `TODO(AI-DEBT)` 태그가 붙은 항목은 별도 집계하여 AI 코드 품질 추이를 모니터링

---

## 4. 장기 비용 분석

### 4.1 시간축별 개발 속도 예측

산업 데이터와 본 프로젝트 특성을 결합한 현실적 예측:

```
개발 속도 (상대치, 초기 = 100)

  100 ┤ ████████
      │ ████████  ← Month 1-3: "황금기"
   90 ┤ ████████    AI 에이전트 활용, 빠른 프로토타이핑
      │ ████████    기능 80% 완성
   80 ┤ ████████▓▓▓▓▓▓▓▓
      │             ← Month 4-6: "속도 저하 시작"
   70 ┤             ▓▓▓▓▓▓▓▓  부채 누적 체감
      │                       API 연동 복잡성 증가
   60 ┤                       ░░░░░░░░
      │                        ← Month 7-9: "부채 압박"
   50 ┤                        ░░░░░░░░  새 기능 추가 시
      │                                  기존 코드 수정 필요
   40 ┤                                  ▒▒▒▒▒▒▒▒
      │                                   ← Month 10-12: "임계점"
   35 ┤                                   ▒▒▒▒▒▒▒▒
      │                                    부채 미상환 시
      │                                    개발 속도 65% 하락
      └──────────────────────────────────────────────
        M1-3      M4-6       M7-9       M10-12
```

### 4.2 정량적 비용 분석 (2년 프로젝션)

**전제 조건**:
- 개발자 1-2명 + AI 에이전트(Claude Code)
- 초기 개발 비용 기준점: 월 500만원 (인건비 + 인프라 + AI API)

| 기간 | 부채 관리 안 함 | 부채 관리 함 (본 전략) | 차이 |
|------|----------------|---------------------|------|
| **Month 1-3** | 1,500만원 | 1,650만원 (+10% 관리 비용) | -150만원 |
| **Month 4-6** | 2,100만원 (속도 저하 시작) | 1,800만원 | +300만원 |
| **Month 7-12** | 4,800만원 (기능 추가 2-3배 비용) | 3,300만원 | +1,500만원 |
| **Month 13-18** | 5,400만원 (레거시 부담) | 3,000만원 | +2,400만원 |
| **Month 19-24** | 6,000만원 (리라이트 압박) | 2,850만원 | +3,150만원 |
| **2년 합계** | **19,800만원** | **12,600만원** | **+7,200만원 절감** |

> **핵심**: 부채 관리에 초기 10%를 투자하면, 2년간 총 비용의 **36%를 절감**할 수 있다.

**산업 데이터 뒷받침**:
- McKinsey: 기술 부채에 IT 예산의 20%를 할당한 기업은 5개월 내 245% ROI 달성
- 한 SaaS 기업 사례: 3년간 부채 방치 후, 단순 기능 추가에 6주 소요 → 경쟁사는 수일 만에 동일 기능 출시 → 시리즈 B 실패 → 예상 가치의 40%에 매각

### 4.3 AI 에이전트의 부채 자동 해소 가능성

2025-2026년 AI 리팩토링 도구의 현실적 역량 평가:

| 부채 유형 | AI 자동 해소 가능성 | 도구 예시 | 현실적 기대 |
|----------|-------------------|----------|------------|
| **코드 중복 제거** | 높음 (80%+) | Codegen, Byteable | 중복 탐지 + 자동 추출 가능 |
| **변수/함수 명명 개선** | 높음 (85%+) | Cursor, Copilot | 컨텍스트 기반 이름 제안 |
| **단순 리팩토링** (Extract Method 등) | 중간 (60-70%) | Refact.ai, Gemini Code Assist | 패턴 인식 기반 |
| **아키텍처 부채 해소** | 낮음 (10-20%) | 현재 없음 | Gartner 예측: 2026년 기술 부채의 80%가 아키텍처 부채 |
| **비즈니스 로직 리팩토링** | 낮음 (15-25%) | 제한적 | 도메인 이해 부족 |
| **성능 최적화** | 중간 (40-50%) | 프로파일링 기반 도구 | 핫스팟 식별은 가능, 최적화 설계는 한계 |
| **테스트 코드 생성** | 중간-높음 (65-75%) | Copilot, Cursor | 기존 코드 기반 테스트 생성 가능 |

**결론**: AI는 "표면적 부채"(코드 수준)의 60-80%를 자동 해소할 수 있지만, "구조적 부채"(아키텍처 수준)는 여전히 인간의 설계 판단이 필요하다.

### 4.4 주식 모니터링 대시보드 특화 부채 리스크

본 프로젝트 도메인에서 특히 위험한 부채 유형:

```
┌────────────────────────────────────────────────────────────────┐
│           도메인 특화 부채 위험 매트릭스                           │
├──────────────┬──────────┬──────────┬───────────────────────────┤
│ 부채 영역     │ 발생 확률 │ 영향도   │ 구체적 시나리오              │
├──────────────┼──────────┼──────────┼───────────────────────────┤
│ 실시간 데이터  │ 높음     │ 치명적   │ Polling→WebSocket 전환 시   │
│ 파이프라인    │          │          │ 전체 아키텍처 재설계 필요     │
├──────────────┼──────────┼──────────┼───────────────────────────┤
│ API 의존성    │ 높음     │ 높음     │ 증권사 API 변경 시           │
│ 관리         │          │          │ 하드코딩된 엔드포인트 일괄    │
│              │          │          │ 수정 필요                   │
├──────────────┼──────────┼──────────┼───────────────────────────┤
│ 데이터 캐싱   │ 중간     │ 높음     │ 캐시 무효화 로직 미흡 시      │
│ 전략         │          │          │ 오래된 주가 표시             │
├──────────────┼──────────┼──────────┼───────────────────────────┤
│ 위젯 시스템   │ 높음     │ 중간     │ 하드코딩된 레이아웃으로       │
│ 확장성       │          │          │ 새 위젯 추가 시 전면 수정    │
├──────────────┼──────────┼──────────┼───────────────────────────┤
│ 뉴스 파싱     │ 중간     │ 낮음     │ 파싱 로직 취약 시            │
│ 안정성       │          │          │ 특정 뉴스 소스 변경에 취약    │
├──────────────┼──────────┼──────────┼───────────────────────────┤
│ 상태 관리     │ 중간     │ 높음     │ 전역 상태 스파게티로          │
│              │          │          │ 디버깅 불가능               │
└──────────────┴──────────┴──────────┴───────────────────────────┘
```

---

## 5. 부채 갚기 시점과 방법

### 5.1 부채 상환 타이밍 프레임워크

"언제 갚을 것인가?"에 대한 구조적 답변:

```
┌─────────────────────────────────────────────────────────────┐
│              부채 상환 타이밍 프레임워크                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ■ 즉시 상환 트리거 (발견 즉시)                               │
│    - 보안 취약점 (SQL Injection, XSS, 인증 우회)              │
│    - 데이터 정확성 오류 (잘못된 주가 표시)                     │
│    - 시스템 크래시 유발 버그                                   │
│                                                             │
│  ■ 스프린트 내 상환 (현재 스프린트)                            │
│    - P0 태그 부채                                            │
│    - "보이스카웃 규칙": 수정하는 파일의 부채를 함께 정리        │
│    - 매 스프린트 20% 용량을 부채 상환에 할당                   │
│                                                             │
│  ■ 분기별 상환 (3개월 주기)                                   │
│    - P1 태그 부채 일괄 처리                                   │
│    - "부채 스프린트" 1주일 (분기당 1회)                        │
│    - AI 자동 리팩토링 도구 활용한 일괄 정리                    │
│    - 기술 부채 비율(TDR) 10% 이하 목표                       │
│                                                             │
│  ■ 반기별 전략 리뷰 (6개월 주기)                              │
│    - 아키텍처 부채 평가                                       │
│    - AI 생성 코드 품질 추이 분석                              │
│    - 기술 스택 업그레이드 결정                                │
│    - "Polling→WebSocket" 같은 대규모 전환 결정               │
│                                                             │
│  ■ 위험 수준 도달 시 긴급 상환                                │
│    - TDR > 15%: 경고 -- 다음 스프린트에 부채 스프린트 강제     │
│    - TDR > 20%: 위험 -- 신규 기능 개발 중단, 부채 상환 집중   │
│    - TDR > 25%: 임계 -- 아키텍처 재검토 회의 소집             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 AI 에이전트 활용 자동 리팩토링 계획

단계적으로 AI를 부채 상환에 투입하는 로드맵:

| 단계 | 시기 | AI 활용 방법 | 예상 효과 |
|------|------|-------------|----------|
| **Phase 1: 탐지** | Month 1-3 | SonarQube + TODO 스캔 자동화 | 부채 가시성 확보 |
| **Phase 2: 단순 해소** | Month 4-6 | Claude Code로 중복 코드 제거, 네이밍 개선 | 코드 수준 부채 40% 감소 |
| **Phase 3: 테스트 보강** | Month 7-9 | AI 테스트 코드 자동 생성 | 커버리지 30% → 60% |
| **Phase 4: 구조 개선** | Month 10-12 | AI 보조 + 인간 설계 병행 | 아키텍처 부채 착수 |

**구체적 실행 시나리오 (Phase 2 예시)**:

```bash
# Claude Code를 활용한 자동 리팩토링 워크플로우
# 1단계: 부채 항목 수집
grep -rn "TODO(DEBT)\|TODO(AI-DEBT)" src/ > debt-items.txt

# 2단계: AI 에이전트에게 리팩토링 위임
# prompt: "debt-items.txt의 각 항목을 분석하고,
#          안전하게 리팩토링할 수 있는 항목을 식별하여
#          PR을 생성하라. 기존 테스트가 모두 통과해야 한다."

# 3단계: CI/CD에서 자동 검증
# - 기존 테스트 전체 통과 확인
# - 린트 규칙 준수 확인
# - 성능 회귀 없음 확인
```

### 5.3 부채가 위험 수준에 도달하는 시점 예측

본 프로젝트 특성을 고려한 예측 모델:

```
부채 비율 (TDR) 예측 추이

  25% ┤                                          ▲ 미관리 시
      │                                       ╱
  20% ┤                                    ╱     ← 위험 수준
      │                                 ╱
  15% ┤                              ╱           ← 경고 수준
      │                           ╱
  10% ┤         ╱‾‾‾‾‾‾‾‾‾‾╲╱                   ← 본 전략 적용 시
      │      ╱                ‾‾‾‾╲
   7% ┤   ╱                        ‾‾‾‾‾‾‾‾     ← 안정 목표
      │ ╱
   3% ┤╱  ← 프로젝트 시작
      │
      └──────────────────────────────────────────
        M1   M3   M6   M9   M12  M15  M18  M24

  --- 부채 미관리 시: Month 9에 위험 수준(20%) 도달
  ─── 본 전략 적용 시: Month 6 피크(12%) 후 분기별 상환으로 7% 안정화
```

**위험 수준 도달 시점 예측**:
- **부채 미관리 시**: Month 9 (TDR 20% 초과) -- 이 시점에서 기능 추가 비용이 2배로 증가
- **본 전략 적용 시**: 위험 수준 도달 안 함 -- 분기별 상환으로 7-10% 범위 유지

---

## 6. 최종 결론

### 6.1 핵심 수치 요약

| 항목 | 예측값 | 근거 |
|------|-------|------|
| **첫 6개월 개발 시간** | **기존 대비 40-50% 단축** | AI 에이전트 코드 생성 + 부채 허용으로 초기 속도 극대화 |
| **1년 후 개발 속도** | **부채 관리 시 초기의 70-80% 유지** / 미관리 시 35-40%로 하락 | 분기별 상환 스프린트 효과 |
| **팀의 코드 이해도** | **중간** -- AI 생성 코드 비율 높으나 3계층 리뷰로 핵심 로직 이해 유지 | Layer 2/3 리뷰 프로세스 |
| **2년 총 비용** | **관리 시 1.26억원** vs 미관리 시 1.98억원 (**36% 절감**) | 산업 데이터 + 프로젝트 규모 추정 |

### 6.2 실용적 부채 허용 기준 (최종)

```
┌─────────────────────────────────────────────────────────────┐
│              실용적 부채 허용 기준 매트릭스                     │
├──────────────────┬──────────────────┬───────────────────────┤
│                  │   PMF 전 (M1-6)  │   PMF 후 (M7-24)     │
├──────────────────┼──────────────────┼───────────────────────┤
│ 보안/데이터 정확성 │ 부채 불허용       │ 부채 불허용            │
│ 핵심 비즈니스 로직 │ Prudent 부채 허용 │ 부채 최소화            │
│ UI/UX            │ 높은 부채 허용    │ Prudent 부채 허용      │
│ 인프라/DevOps     │ 중간 부채 허용    │ 부채 최소화            │
│ 테스트 커버리지    │ 핵심 로직만      │ 60%+ 목표             │
│ 문서화           │ 높은 부채 허용    │ 핵심 아키텍처 문서화     │
│ 코드 품질 전반    │ TDR 12% 이하    │ TDR 7% 이하           │
├──────────────────┴──────────────────┴───────────────────────┤
│ AI 생성 코드: Layer 1(수락)/2(경량리뷰)/3(심층리뷰) 적용      │
│ 모든 부채: TODO 태그 + 우선순위(P0-P3) 필수                   │
│ 상환 주기: 스프린트 20% + 분기 1주 부채 스프린트               │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 AI 자동 리팩토링 활용 계획 (최종)

```
Phase 1 (M1-3):  [탐지] SonarQube + TODO 자동 수집
                  → 부채 가시성 확보

Phase 2 (M4-6):  [단순 해소] AI로 중복 제거 + 네이밍 개선
                  → 코드 수준 부채 40% 감소

Phase 3 (M7-9):  [테스트 보강] AI 테스트 자동 생성
                  → 커버리지 30% → 60%

Phase 4 (M10-12): [구조 개선] AI 보조 + 인간 설계 병행
                  → 아키텍처 부채 착수
                  → Polling→WebSocket 전환 등 대규모 변경

Phase 5 (M13-24): [자동화 성숙] CI/CD 내 AI 리팩토링 자동 실행
                  → 코드 PR 시 자동 부채 탐지 + 개선 제안
                  → TDR 7% 이하 안정 유지
```

### 6.4 Branch 4.2 관점의 핵심 메시지

> **"부채는 나중에 갚으면 된다"는 절반만 맞다.**
>
> 데이터가 말하는 현실:
> - AI 생성 코드는 인간 코드보다 75% 더 많은 로직 이슈를 가진다
> - 부채를 방치하면 9개월 만에 개발 속도가 65% 하락한다
> - AI 기반 스타트업의 73%가 6개월 내 스케일링에 실패한다
>
> 그러나 동시에:
> - 부채 관리에 20%를 투자하면 245% ROI를 달성한다
> - AI 도구로 코드 수준 부채의 60-80%를 자동 해소할 수 있다
> - 42%의 스타트업이 시장 수요 부재로 실패한다 -- 완벽한 코드의 쓸모없는 제품보다 부채 있는 동작하는 제품이 낫다
>
> **실용적 결론**: 속도와 품질은 이항대립이 아니라 **시간축 위의 포트폴리오**다.
> 초기에는 속도에 80%를 배팅하되, 부채를 추적하고 상환 일정을 미리 잡아라.
> AI가 만든 부채는 AI로 갚아라. 그리고 아키텍처 부채만은 인간이 설계하라.

---

## Sources

- [Pragmatic Technical Debt Management - InfoQ](https://www.infoq.com/articles/pragmatic-technical-debt/)
- [Technical Debt: When to Fix It vs When to Ship Faster 2026 Guide](https://sikdartechnologies.in/technical-debt-when-to-fix-it-vs-when-to-ship-faster-2026-guide/)
- [Technical Debt Management Strategies for Growing Startups](https://technori.com/2026/02/24479-technical-debt-management-strategies-for-growing-startups/gabriel/)
- [What Is Technical Debt? A Pragmatic Guide for Startup Teams](https://www.damiangalarza.com/posts/2025-06-26-tech-debt-for-startups/)
- [Technical Debt 2026 - How to Measure and Pay Down](https://ardura.consulting/blog/technical-debt-2026-how-to-measure-pay-down/)
- [Paying Down Tech Debt - Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/paying-down-tech-debt)
- [State of AI Code Quality in 2025 - Qodo](https://www.qodo.ai/reports/state-of-ai-code-quality/)
- [46% of Code Is AI-Generated: The Quality Assurance Challenge](https://cleanaim.com/resources/silent-wiring/46-percent-ai-generated-code-quality-challenge/)
- [AI vs Human Code Gen Report: AI Code Creates 1.7x More Issues](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report)
- [2025 Was the Year of AI Speed, 2026 Will Be the Year of AI Quality](https://www.coderabbit.ai/blog/2025-was-the-year-of-ai-speed-2026-will-be-the-year-of-ai-quality)
- [AI-Generated Code Creates New Wave of Technical Debt - InfoQ](https://www.infoq.com/news/2025/11/ai-code-technical-debt/)
- [How AI Generated Code Compounds Technical Debt - LeadDev](https://leaddev.com/technical-direction/how-ai-generated-code-accelerates-technical-debt)
- [The $30,000 Technical Debt Trap: Why 73% of AI-Built Startups Fail to Scale](https://medium.com/@ahmadfiazjan/the-30-000-technical-debt-trap-why-73-of-ai-built-startups-fail-to-scale-7c81ce4602f9)
- [AI Technical Debt: How AI-Generated Code Creates Hidden Costs - Tembo](https://www.tembo.io/blog/ai-technical-debt)
- [I Analyzed 70 Startups' Codebases - The Ones With More Technical Debt Raised More Money](https://bytevagabond.com/post/technical-debt-startup-funding/)
- [Breaking Technical Debt's Vicious Cycle - McKinsey](https://www.mckinsey.com/capabilities/mckinsey-digital/our-insights/breaking-technical-debts-vicious-cycle-to-modernize-your-business)
- [Bottleneck #01: Tech Debt - Martin Fowler](https://martinfowler.com/articles/bottlenecks-of-scaleups/01-tech-debt.html)
- [Technical Debt Quadrant - Martin Fowler](https://martinfowler.com/bliki/TechnicalDebtQuadrant.html)
- [It's Time to Ditch the 'Move Fast and Break Things' Innovation Playbook](https://trellis.net/article/its-time-to-ditch-the-move-fast-and-break-things-innovation-playbook/)
- [The Hidden Cost of 'Move Fast and Break Things' When Your System Already Has 200K Users](https://altersquare.io/hidden-cost-move-fast-break-things-system-200k-users/)
- [Top AI Code Refactoring Tools for Tackling Technical Debt in 2026](https://www.byteable.ai/blog/top-ai-code-refactoring-tools-for-tackling-technical-debt-in-2026)
- [8 AI Tools for Technical Debt That Actually Reduce It - Codegen](https://codegen.com/blog/ai-tools-for-technical-debt/)
- [Why IT Leaders Should Use AI to Reduce Technical Debt in 2026](https://www.secondtalent.com/resources/ai-strategies-for-cios-to-reduce-technical-debt/)
- [Top Technical Debt Measurement Tools for Developers in 2026](https://www.codeant.ai/blogs/tools-measure-technical-debt)
- [Technical Debt: A Strategic Guide for 2026 - Monday.com](https://monday.com/blog/rnd/technical-debt/)
- [Technical Debt: A Repayment Plan - InfoQ](https://www.infoq.com/articles/tech-debt-repayment/)
- [Financial Impact of Technical Debt in 2026](https://www.ai-infra-link.com/how-technical-debt-drains-profits-and-how-to-fix-it/)
- [Agentic Workflows for Software Development - McKinsey/QuantumBlack](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)
- [CodeIT: Trading Dashboard and Stock Monitoring System](https://codeit.us/trading-dashboard-and-stock-monitoring-system)
