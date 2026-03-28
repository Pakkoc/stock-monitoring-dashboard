# PM 시장 리서치 보고서: 주식 모니터링 대시보드 AI Agentic Workflow 자동 구축

> **작성일**: 2026-03-27
> **작성자**: PM Agent
> **목적**: PRD 작성을 위한 시장 조사 및 사례 수집

---

## 카테고리 1: AI Agentic Workflow 자동화 사례

| # | 사례명 | URL | 핵심 내용 | 우리 프로젝트 관련성 |
|---|--------|-----|-----------|---------------------|
| 1 | QuantumBlack (McKinsey) - Agentic Workflows for Software Development | [Medium](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d) | 요구사항 에이전트, 아키텍처 에이전트, 코딩 에이전트, 지식 에이전트 등 전문 에이전트를 마이크로서비스처럼 분리하는 패턴 제시 | **매우 높음** - 우리 프로젝트의 멀티 에이전트 구조 설계에 직접 참조 가능 |
| 2 | CrewAI - Multi-Agent Platform | [crewai.com](https://crewai.com/) | 역할 기반 AI 에이전트 팀 구성, 코드 없이도 에이전트 크루 생성 가능, 엔터프라이즈 자동화 | **높음** - 워크플로우 오케스트레이션 프레임워크 후보 |
| 3 | OpenAI AgentKit | [openai.com](https://openai.com/index/introducing-agentkit/) | Agent Builder(시각적 워크플로우), Connector Registry(데이터/도구 연결) 등 에이전트 구축 도구 세트 | **중간** - 대안 프레임워크로 참고 가능 |
| 4 | Dify - Agentic Workflow Builder | [dify.ai](https://dify.ai/) | 노코드 플랫폼으로 AI 에이전트 개발 민주화, 빠른 배포와 직관적 인터페이스 | **중간** - 노코드 접근 방식 참고 |
| 5 | Claude Code Workflow (GitHub) | [GitHub](https://github.com/catlog22/Claude-Code-Workflow) | JSON 기반 멀티 에이전트 개발 프레임워크, 컨텍스트 우선 아키텍처, 자동 워크플로우 실행 | **매우 높음** - Claude Code 기반 워크플로우 자동화의 직접적 참조 사례 |
| 6 | Anthropic Claude Agent SDK | [anthropic.com](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) | 공식 Agent SDK로 자율 코딩 에이전트 구축, 두 에이전트 패턴(초기화 + 코딩), 체크포인트 시스템 | **매우 높음** - 우리 프로젝트의 기술 기반 |
| 7 | Auto-Claude (Autonomous Multi-Session) | [GitHub](https://github.com/AndyMik90/Auto-Claude) | Claude Code를 비주얼 커맨드 센터로 래핑, 태스크 보드에서 병렬 에이전트 관리 | **높음** - 멀티세션 병렬 에이전트 관리 패턴 참조 |
| 8 | VoltAgent - 100+ Claude Code Subagents | [GitHub](https://github.com/VoltAgent/awesome-claude-code-subagents) | 100개 이상의 전문화된 Claude Code 서브에이전트 컬렉션 | **높음** - 서브에이전트 설계 패턴 및 역할 정의 참조 |

### 상세 요약

**1. QuantumBlack (McKinsey) Agentic Workflows**
- 결정론적 오케스트레이션 + 제한된 에이전트 실행 + 각 단계 자동 평가라는 패턴 제시
- 전문 에이전트 분리: 요구사항 에이전트, 아키텍처 에이전트, 코딩 에이전트, 지식 에이전트
- 마이크로서비스 아키텍처와 유사한 접근 방식으로 확장성 확보

**2. CrewAI vs LangGraph vs AutoGen 비교**
- **CrewAI**: 역할 기반, 직관적, 구조화된 워크플로우에 최적 (보고서, 스케줄링, 루틴 자동화)
- **LangGraph**: 그래프 기반 오케스트레이션, 조건 분기가 많은 복잡한 파이프라인에 최적
- **AutoGen**: 대화 기반, 사람 참여(human-in-the-loop) 워크플로우에 최적
- 우리 프로젝트는 구조화된 단계별 실행이 필요하므로 **CrewAI 스타일 + LangGraph의 조건 분기**가 적합

**3. Devin AI 대안 시장 현황**
- Devin 공식 성공률 13.86%로 낮음, 2026년 여러 대안이 유사/우수한 성능 제공
- Claude Code는 "자율적"이 아닌 "대화형 엔지니어링 파트너" 포지셔닝
- 최선 전략: Claude Code(일상 개발) + 전문 도구(복잡한 멀티세션 작업) 조합

**4. AI 개발 도구 시장 (2026년 3월 기준)**
- 상위 도구: Windsurf, Aider, Cursor, Zed, Claude Code, GitHub Copilot
- 에디터 어시스턴트(Copilot, Tabnine 등)와 레포지토리 레벨 에이전트(Cursor, Claude Code, Devin 등) 이원화
- Claude 4.6 Opus: 1M 컨텍스트 윈도우, 128K 출력으로 복잡한 장기 태스크 처리 가능

---

## 카테고리 2: 주식/금융 대시보드 구축 사례

| # | 사례명 | URL | 핵심 내용 | 우리 프로젝트 관련성 |
|---|--------|-----|-----------|---------------------|
| 1 | Ghostfolio (오픈소스 자산관리) | [GitHub](https://github.com/ghostfolio/ghostfolio) | Angular + NestJS + Prisma + TypeScript, 주식/ETF/암호화폐 추적, 데이터 기반 투자 의사결정 | **높음** - 자산관리 대시보드 아키텍처 참조 |
| 2 | Invester (위젯 기반 대시보드) | [Medium](https://medium.com/@onurcelik.dev/invester-a-customizable-open-source-investment-dashboard-for-traders-and-developers-alike-0a3878d985c8) | 모듈형 React + TypeScript, 위젯 기반 실시간 대시보드, 주식/크립토/ETF/뉴스 추적 | **매우 높음** - 위젯 기반 모듈형 구조가 우리 요구사항과 정확히 일치 |
| 3 | DariusLukasukas/stocks (Next.js) | [GitHub](https://github.com/DariusLukasukas/stocks) | Next.js 14 + React + Shadcn + Tailwind CSS, Yahoo Finance API, 실시간 시세/차트/뉴스 | **매우 높음** - 현대적 프론트엔드 스택과 주식 데이터 통합의 좋은 레퍼런스 |
| 4 | tete-lab/automated-trading-system | [GitHub](https://github.com/tete-lab/automated-trading-system) | Next.js 기반 한국 주식 자동매매 시스템, 실시간 대시보드/차트/뉴스/관심종목 | **매우 높음** - 한국 주식 시장 특화, 우리 프로젝트와 가장 유사 |
| 5 | ErikThiart/ai-stock-dashboard | [GitHub](https://github.com/ErikThiart/ai-stock-dashboard) | Python + Streamlit + scikit-learn, AI 기반 기술적 분석 및 ML 가격 예측 | **중간** - AI 분석 기능 참조 |
| 6 | React Grid Layout (위젯 라이브러리) | [GitHub](https://github.com/react-grid-layout/react-grid-layout) | 드래그앤드롭 + 리사이즈, 반응형 브레이크포인트 지원, 대시보드 위젯에 최적 | **매우 높음** - 위젯 기반 대시보드 UI 구현의 핵심 라이브러리 |
| 7 | Gridstack.js | [gridstackjs.com](https://gridstackjs.com/) | 그리드 기반 레이아웃 전용, 드래그앤드롭/리사이즈, React/Vue/Angular 지원 | **높음** - React Grid Layout의 대안 |
| 8 | vinay-gatech/stocks-insights-ai-agent | [GitHub](https://github.com/vinay-gatech/stocks-insights-ai-agent) | LLM + LangChain + LangGraph 풀스택, 주식 데이터 및 뉴스 검색 AI 에이전트 | **높음** - AI 에이전트 + 주식 분석 통합 사례 |

### 상세 요약

**1. 위젯 기반 대시보드 구현 기술**
- **React Grid Layout**: 드래그앤드롭 + 리사이즈, 반응형 브레이크포인트, 모바일 지원
- **Gridstack.js**: 그리드 특화, 경량, 다수 프레임워크 지원
- **Dazzle/Dashup**: React 전용 대시보드 라이브러리, 위젯 직렬화 지원

**2. 한국 주식 데이터 API 옵션**
- **한국투자증권 OpenAPI**: REST + WebSocket, 실시간 시세, 공식 GitHub 샘플 코드 제공
- **PyKRX**: 무료, KOSPI/KOSDAQ/KONEX, 공개 데이터 스크래핑 기반
- **공공데이터포털 (금융위원회)**: 주식시세정보 공식 API
- **KRX Data Marketplace**: 한국거래소 공식 데이터 마켓플레이스
- **jjlabsio/korea-stock-mcp**: DART + KRX MCP 서버 (Claude Code 직접 연동 가능)

**3. 금융 대시보드 설계 베스트 프랙티스**
- KPI 5~7개로 제한, 목적에 맞는 선별적 지표 표시
- 대시보드 3유형: 정보형(경영진), 분석형(관리자), 탐색형(분석가)
- 가장 중요한 인사이트를 상단에, 스크롤할수록 상세 정보
- 자동 데이터 품질 검증 및 캐싱 메커니즘 필수

---

## 카테고리 3: YouTube/블로그 교육 콘텐츠

| # | 사례명 | URL | 핵심 내용 | 우리 프로젝트 관련성 |
|---|--------|-----|-----------|---------------------|
| 1 | "Agentic Coding: How I 10x'd My Development Workflow" | [Medium](https://medium.com/@dataenthusiast.io/agentic-coding-how-i-10xd-my-development-workflow-e6f4fd65b7f0) | 에이전틱 코딩으로 개발 워크플로우 10배 향상 실사례, 실무 팁 | **높음** - 워크플로우 최적화 실전 경험 |
| 2 | "How to Build Agentic Coding Workflows That Actually Ship" | [Codegen Blog](https://codegen.com/blog/how-to-build-agentic-coding-workflows/) | 실제 배포 가능한 에이전틱 코딩 워크플로우 5요소: 태스크 입력, 컨텍스트 조립, 샌드박스 실행, PR 출력, 인간 리뷰 | **매우 높음** - 워크플로우 설계의 핵심 프레임워크 |
| 3 | freeCodeCamp - "How to Build Agentic AI Workflows" | [freeCodeCamp](https://www.freecodecamp.org/news/how-to-build-agentic-ai-workflows/) | 에이전틱 AI 워크플로우 구축 종합 가이드, LLM 기반 에이전트 설계 | **높음** - 기초 개념 및 구현 가이드 |
| 4 | Google Cloud - "What is Agentic Coding?" | [Google Cloud](https://cloud.google.com/discover/what-is-agentic-coding) | 에이전틱 코딩의 정의, reason-and-act 루프, 도구 사용 패턴 | **중간** - 개념 정립 참조 |
| 5 | "Getting Into Flow State with Agentic Coding" | [kau.sh](https://kau.sh/blog/agentic-coding-flow-state/) | 80% 생각+리뷰, 20% 에이전트 소통, 0% 직접 코딩이라는 시간 분배 제시 | **높음** - 인간-AI 협업 패턴 설계 참고 |
| 6 | Anthropic - Claude Code Autonomous Demo | [GitHub](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding) | 공식 자율 코딩 데모, 두 에이전트 패턴, 200개 테스트 케이스 자동 생성 | **매우 높음** - 공식 참조 구현 |
| 7 | "From Zero to AI Builder" - 마케터의 Claude Code 자동화 | [AdventurePPC](https://www.adventureppc.com/blog/from-zero-to-ai-builder-how-one-marketer-learned-claude-code-and-automated-their-entire-workflow) | 비개발자가 Claude Code로 15시간/주 절감한 사례 | **중간** - 비기술 사용자 관점 참조 |
| 8 | PingCAP - "Lovable.dev"-style AI Agent 구축 | [PingCAP Blog](https://www.pingcap.com/blog/ai-agent-that-builds-full-stack-apps/) | AI 에이전트가 풀스택 앱을 자동 생성하는 과정 상세 설명 | **높음** - 풀스택 자동 생성 아키텍처 참조 |
| 9 | CIO Korea - AI 코딩 도구 12종 리뷰 | [CIO](https://www.cio.com/article/4030150/) | Cursor, Codex, Copilot 등 12종 직접 사용 비교 리뷰 | **중간** - 도구 선택 시 참고 |
| 10 | 삼성SDS - "AI 코딩 에이전트의 부상과 과제" | [삼성SDS](https://www.samsungsds.com/kr/insights/ai-coding-agents.html) | AI 코딩 에이전트 시장 동향 및 과제 분석 | **중간** - 국내 관점 시장 분석 |
| 11 | SK hynix - 에이전트형 AI 시대 소프트웨어 개발자의 미래 | [SK hynix Newsroom](https://news.skhynix.co.kr/decode-ai-5/) | Devin으로 40만 줄 코드 자동 생성 국내 대기업 사례 소개 | **높음** - 국내 대기업 AI 코딩 도입 사례 |

### 상세 요약

**1. 에이전틱 코딩 워크플로우 핵심 패턴**
- 태스크 입력(구조화된 설명 + 수용 기준) -> 컨텍스트 조립 -> 샌드박스 실행 -> PR 출력 -> 인간 리뷰
- 대부분의 구현이 "태스크 입력" 단계에서 가장 취약 -- 명확한 스펙 정의가 핵심
- 의사코드 접근법, 전략적 참조 문서, .cursorrules 파일 등 점진적 도입 권장

**2. 시간 분배 패러다임 변화**
- 기존: 대부분 코드 작성에 소모
- 에이전틱: 80% 생각/리뷰, 20% 에이전트 지시, 0% 직접 코딩
- 에이전트를 "마법의 해결사"가 아닌 "적절한 컨텍스트와 방향이 필요한 강력한 보조자"로 인식해야 함

**3. 국내 AI 코딩 도입 현황**
- Devin 기반 40만 줄 코드 자동 생성 국내 대기업 사례 존재
- GitHub Copilot 코딩 에이전트: 이슈 할당 -> 자동 환경 구성 -> 초안 PR 생성
- AI 코딩의 핵심은 "오류를 찾아내는 유효성 검사 프로세스"

---

## 카테고리 4: 실시간 데이터 처리 기술

| # | 사례명 | URL | 핵심 내용 | 우리 프로젝트 관련성 |
|---|--------|-----|-----------|---------------------|
| 1 | 한국투자증권 OpenAPI (REST + WebSocket) | [KIS Developers](https://apiportal.koreainvestment.com/apiservice) / [GitHub](https://github.com/koreainvestment/open-trading-api) | REST/WebSocket 이원 구조, 실시간 시세 approval_key 기반, Python 샘플 코드 | **매우 높음** - 한국 주식 실시간 데이터의 1순위 API |
| 2 | PyKRX | [GitHub](https://github.com/sharebook-kr/pykrx) | KOSPI/KOSDAQ/KONEX 주가 정보, 무료, 공개 데이터 스크래핑 | **높음** - 무료 대안, 과거 데이터 수집에 유용 |
| 3 | jjlabsio/korea-stock-mcp | [GitHub](https://github.com/jjlabsio/korea-stock-mcp) | DART + KRX MCP 서버, Claude Desktop/Cursor/VS Code 호환, 공시/재무제표/주가 | **매우 높음** - AI 에이전트와 한국 주식 데이터 직접 연동 |
| 4 | iTick Korea API | [Blog](https://blog.itick.org/en/stock-api/korean-stock-api-integration-guide-realtime-historical-data) | KOSPI/KOSDAQ 실시간 데이터, <50ms WebSocket 스트리밍, Python 코드 예제 | **높음** - 초저지연 실시간 데이터 옵션 |
| 5 | Twelve Data (KRX 지원) | [twelvedata.com](https://twelvedata.com/exchanges/xkrx) | 글로벌 API, KRX 지원, ~170ms WebSocket, 시계열/펀더멘탈/분석 | **중간** - 글로벌 데이터 통합 시 유용 |
| 6 | Google Cloud - 실시간 스트리밍 파이프라인 | [Google Cloud Blog](https://cloud.google.com/blog/topics/financial-services/building-real-time-streaming-pipelines-for-market-data) | 금융 시장 데이터 실시간 스트리밍 파이프라인 아키텍처 | **중간** - 확장 가능한 아키텍처 참조 |
| 7 | Confluent - 금융 데이터 스트리밍 | [Confluent](https://www.confluent.io/resources/ebook/5-data-streaming-use-cases-in-financial-services/) | Apache Kafka 기반 금융 데이터 스트리밍 5가지 유즈케이스 | **중간** - 엔터프라이즈급 스트리밍 참조 |
| 8 | Finnhub WebSocket API | [finnhub.io](https://finnhub.io/docs/api/websocket-news) | 실시간 주식/외환/암호화폐, WebSocket 뉴스 피드, 무료 티어 | **중간** - 글로벌 주식 + 뉴스 실시간 피드 |
| 9 | 공공데이터포털 - 금융위원회 주식시세정보 | [data.go.kr](https://www.data.go.kr/data/15094808/openapi.do) | 한국거래소 상장 주식 실시간 시세, 시가/종가/고가/저가/거래량 | **높음** - 공식 무료 API |
| 10 | KRX Data Marketplace | [data.krx.co.kr](https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?locale=en) | 한국거래소 공식 데이터 마켓플레이스, 시장 데이터/공매도/투자분석 | **높음** - 공식 데이터 소스 |

### 상세 요약

**1. WebSocket 아키텍처 핵심**
- WebSocket은 단일 TCP 연결에서 전이중(full-duplex) 통신 제공, REST 폴링 불필요
- 금융 데이터 제공자들은 <50ms 지연으로 실시간 스트리밍 제공
- 다수 WebSocket 연결 병렬 운용 가능 (가격 스트림, 뉴스 스트림 등 분리)
- 바이너리 메시지 포맷으로 배치 전송하여 대역폭 최적화

**2. 실시간 프론트엔드 최적화**
- **스로틀링**: 고정 간격으로 UI 업데이트 (특히 차트에 중요)
- **가상화**: react-window 또는 react-virtual로 DOM 요소 최소화
- **상태 관리**: Recoil 등으로 유연한 실시간 상태 관리

**3. 한국 주식 데이터 통합 전략 (권장)**

| 우선순위 | API | 용도 | 비용 |
|---------|-----|------|------|
| 1 | 한국투자증권 OpenAPI | 실시간 시세 (WebSocket) | 무료 (계좌 필요) |
| 2 | PyKRX | 과거 데이터, 배치 수집 | 무료 |
| 3 | 공공데이터포털 (금융위원회) | 공식 시세 정보 | 무료 |
| 4 | korea-stock-mcp | AI 에이전트 직접 연동 | 무료 (API 키 필요) |
| 5 | KRX Data Marketplace | 공식 심층 데이터 | 부분 무료 |

**4. 스트리밍 아키텍처 베스트 프랙티스**
- 지연시간 최소화: 직렬화/역직렬화 오버헤드 감소
- 확장 가능 아키텍처: 노드 동적 추가, Apache Kafka/Flink 활용
- 보안: 암호화, 접근 제어, 감사 추적
- 모니터링: 처리량/지연시간/오류율 KPI 수집, 실시간 알림

---

## PM 종합 의견

### 1. 시장 트렌드 요약

**AI Agentic 코딩 시장은 폭발적 성장기에 진입했다.**
- 글로벌 에이전틱 AI 시장: 2026년 $9B 돌파, 2030년 $52.6B 예상 (CAGR 46.3%)
- 92% 경영진이 2025년까지 AI 기반 워크플로우 디지털화에 동의
- "챗봇과 대화"에서 "에이전트에게 태스크 할당"으로 패러다임 전환 완료

**주식 대시보드 영역은 AI 통합이 새로운 차별화 요소다.**
- 기존 대시보드(TradingView, 증권사 HTS)는 수동 설정 및 분산된 정보가 한계
- AI 에이전트가 대시보드 자체를 자동 생성하고, 인사이트를 능동적으로 제공하는 방향으로 진화
- MCP 서버를 통해 AI가 한국 주식 데이터(DART/KRX)에 직접 접근 가능한 생태계 형성

**멀티 에이전트 프레임워크가 성숙기에 도달했다.**
- CrewAI, LangGraph, AutoGen, OpenAI AgentKit 등 프로덕션 레디 프레임워크 다수 존재
- 단일 범용 에이전트보다 전문 에이전트 팀(마이크로서비스 아키텍처)이 주류

### 2. PRD 작성 시 반드시 고려해야 할 사항 5가지

**사항 1: 워크플로우 오케스트레이션 패턴 명확화**
- "결정론적 오케스트레이션 + 제한된 에이전트 실행 + 자동 평가" 패턴 채택 필요
- 각 에이전트의 역할, 권한, 실패 시 폴백 전략을 PRD에 명시
- Research -> Planning -> Implementation 3단계 구조 내 에이전트 배치 설계

**사항 2: 한국 주식 데이터 API 전략 및 제약 사항**
- 한국투자증권 OpenAPI는 계좌 개설 필요, API 키 승인 1일 소요
- 실시간 WebSocket은 approval_key 발급 필수, TLS 1.2 이상 요구
- PyKRX는 스크래핑 기반이므로 실시간 용도로 부적합 (배치/과거 데이터 전용)
- 복수 API 조합 전략(실시간 + 과거 + 공시)을 PRD에 반영

**사항 3: 위젯 기반 대시보드 UX 설계 기준**
- React Grid Layout 또는 Gridstack.js 기반 드래그앤드롭/리사이즈 지원
- KPI 5~7개 제한 원칙, 대시보드 유형별(정보형/분석형/탐색형) 프리셋 제공
- 위젯 직렬화를 통한 레이아웃 저장/복원 기능 필수
- 테마별 그룹핑 및 실시간 정렬/필터링 요구사항의 기술적 구현 방안

**사항 4: 실시간 데이터 처리 성능 목표 수치화**
- WebSocket 기반 실시간 시세 업데이트 목표 지연시간 (예: <500ms)
- 프론트엔드 렌더링 최적화: 스로틀링 간격, 가상 스크롤, 메모이제이션
- 동시 접속자/구독 종목 수 기반 확장성 목표
- 장 마감 후 배치 처리 vs. 장중 실시간 처리 분리 아키텍처

**사항 5: AI 에이전트 자동 구현의 품질 보증 전략**
- Devin 성공률 13.86%라는 시장 현실 인식 -- 자동 생성 코드의 검증 체계 필수
- 체크포인트 시스템으로 코드 상태 자동 저장/롤백 지원
- 자동 테스트 생성 및 실행 (200+ 테스트 케이스 패턴 참조)
- 인간 리뷰 포인트 설계: 아키텍처 승인 -> 구현 리뷰 -> 배포 승인

### 3. 경쟁/유사 서비스 분석

| 서비스 | 유형 | 강점 | 약점 | 차별화 기회 |
|--------|------|------|------|------------|
| TradingView | 글로벌 차트 플랫폼 | 강력한 차트, 소셜 기능 | 한국 주식 제한적, 커스텀 대시보드 한계 | 한국 특화 + 위젯 자유도 |
| 키움증권 HTS | 국내 HTS | 풍부한 한국 주식 데이터 | 데스크톱 전용, 구식 UI | 웹 기반 + 현대적 UX |
| Ghostfolio | 오픈소스 자산관리 | 멀티 자산, 오픈소스 | 실시간 거래 미지원, 한국 미특화 | 한국 주식 실시간 + AI |
| Invester | 오픈소스 위젯 대시보드 | 모듈형, 위젯 기반 | 한국 데이터 미지원 | 한국 API 통합 |
| 증권사 MTS | 모바일 앱 | 즉시 거래 가능 | 대시보드 커스텀 불가 | 대시보드 자유 커스텀 |
| **우리 프로젝트** | **AI 자동 생성 대시보드** | **AI 구축 자동화 + 한국 특화 + 위젯 기반** | **구현 복잡도** | **AI가 대시보드를 만드는 시스템** |

### 4. 권장 기술 방향 (고수준)

#### 프론트엔드
- **프레임워크**: Next.js 14+ (App Router) + React 18+
- **UI 라이브러리**: Shadcn/ui + Tailwind CSS
- **위젯 시스템**: React Grid Layout (드래그앤드롭/리사이즈)
- **차트**: TradingView Lightweight Charts 또는 Recharts/Visx
- **상태관리**: Zustand 또는 Jotai (경량, 실시간 데이터 적합)
- **실시간 통신**: WebSocket (native) 또는 Socket.io

#### 백엔드
- **API 서버**: Next.js API Routes 또는 NestJS
- **실시간 데이터**: WebSocket 프록시 서버 (한국투자증권 API <-> 클라이언트)
- **데이터베이스**: PostgreSQL (주가 데이터) + Redis (캐싱/실시간 상태)
- **배치 처리**: Node.js Cron 또는 Bull Queue

#### 데이터 소스 (우선순위 순)
1. 한국투자증권 OpenAPI (실시간 WebSocket)
2. PyKRX/KRX Data Marketplace (과거 데이터/배치)
3. 공공데이터포털 금융위원회 API (공식 시세)
4. korea-stock-mcp (AI 에이전트 연동)

#### AI Agentic 워크플로우
- **오케스트레이션**: Claude Code + Agent SDK (Task tool 기반 멀티 에이전트)
- **에이전트 역할 분리**:
  - Requirements Agent (요구사항 분석)
  - Architecture Agent (시스템 설계)
  - Frontend Agent (UI 구현)
  - Backend Agent (API/데이터 구현)
  - Testing Agent (자동 테스트)
  - Review Agent (코드 리뷰)
- **품질 보증**: 체크포인트 + 자동 테스트 + 인간 리뷰 게이트
- **컨텍스트 관리**: CLAUDE.md 기반 Context Preservation System 활용

---

## Sources

### 카테고리 1: AI Agentic Workflow
- [QuantumBlack - Agentic Workflows for Software Development](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)
- [CrewAI - Multi-Agent Platform](https://crewai.com/)
- [OpenAI - Introducing AgentKit](https://openai.com/index/introducing-agentkit/)
- [Dify - Agentic Workflow Builder](https://dify.ai/)
- [Top 9 AI Agent Frameworks (March 2026)](https://www.shakudo.io/blog/top-9-ai-agent-frameworks)
- [Agentic AI Platforms: 2026 Buyer's Guide](https://www.automationanywhere.com/rpa/agentic-ai-platforms)
- [DataCamp - CrewAI vs LangGraph vs AutoGen](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)
- [LangGraph vs CrewAI vs AutoGen (2026)](https://levelup.gitconnected.com/langgraph-vs-crewai-vs-autogen-which-agent-framework-should-you-actually-use-in-2026-b8b2c84f1229)
- [OpenAI Agents SDK vs LangGraph vs Autogen vs CrewAI](https://composio.dev/blog/openai-agents-sdk-vs-langgraph-vs-autogen-vs-crewai)
- [AI Dev Tool Power Rankings (March 2026)](https://blog.logrocket.com/ai-dev-tool-power-rankings/)
- [Best AI Coding Agents 2026](https://www.faros.ai/blog/best-ai-coding-agents-2026)
- [Best Devin AI Alternatives 2026](https://www.taskade.com/blog/devin-ai-alternatives)
- [2026 AI Agent Selection Guide: Devin vs Manus vs Claude Code](https://mcplato.com/en/blog/ai-agent-2026-comparison/)
- [Claude Code Workflow (GitHub)](https://github.com/catlog22/Claude-Code-Workflow)
- [Anthropic - Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [VoltAgent - 100+ Claude Code Subagents](https://github.com/VoltAgent/awesome-claude-code-subagents)
- [Auto-Claude - Autonomous Multi-Session](https://github.com/AndyMik90/Auto-Claude)
- [Claude Code Common Workflows](https://code.claude.com/docs/en/common-workflows)
- [Anthropic - Enabling Claude Code Autonomous Work](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously)
- [Claude Agent SDK Demos (GitHub)](https://github.com/anthropics/claude-agent-sdk-demos)

### 카테고리 2: 주식/금융 대시보드
- [Ghostfolio (GitHub)](https://github.com/ghostfolio/ghostfolio)
- [Invester Dashboard](https://medium.com/@onurcelik.dev/invester-a-customizable-open-source-investment-dashboard-for-traders-and-developers-alike-0a3878d985c8)
- [DariusLukasukas/stocks (Next.js)](https://github.com/DariusLukasukas/stocks)
- [tete-lab/automated-trading-system](https://github.com/tete-lab/automated-trading-system)
- [ErikThiart/ai-stock-dashboard](https://github.com/ErikThiart/ai-stock-dashboard)
- [stocks-insights-ai-agent](https://github.com/vinay-gatech/stocks-insights-ai-agent)
- [React Grid Layout](https://medium.com/@antstack/building-customizable-dashboard-widgets-using-react-grid-layout-234f7857c124)
- [Gridstack.js](https://gridstackjs.com/)
- [Financial Dashboard Best Practices](https://www.f9finance.com/dashboard-design-best-practices/)
- [Real-Time Financial Dashboard Design](https://www.phoenixstrategy.group/blog/how-to-design-real-time-financial-dashboards)
- [Stock Market Dashboard Templates](https://tailadmin.com/blog/stock-market-dashboard-templates)

### 카테고리 3: 교육 콘텐츠
- [Agentic Coding: 10x Development Workflow](https://medium.com/@dataenthusiast.io/agentic-coding-how-i-10xd-my-development-workflow-e6f4fd65b7f0)
- [Agentic Coding Workflows That Ship](https://codegen.com/blog/how-to-build-agentic-coding-workflows/)
- [freeCodeCamp - Agentic AI Workflows](https://www.freecodecamp.org/news/how-to-build-agentic-ai-workflows/)
- [Google Cloud - What is Agentic Coding](https://cloud.google.com/discover/what-is-agentic-coding)
- [Agentic Coding Flow State](https://kau.sh/blog/agentic-coding-flow-state/)
- [Anthropic Autonomous Coding Demo](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding)
- [PingCAP - AI Agent Builds Full Stack Apps](https://www.pingcap.com/blog/ai-agent-that-builds-full-stack-apps/)
- [Lovable - Best AI App Builders 2026](https://lovable.dev/guides/best-ai-app-builders)
- [삼성SDS - AI 코딩 에이전트의 부상과 과제](https://www.samsungsds.com/kr/insights/ai-coding-agents.html)
- [SK hynix - 에이전트형 AI 시대](https://news.skhynix.co.kr/decode-ai-5/)
- [CIO Korea - AI 코딩 도구 12종](https://www.cio.com/article/4030150/)

### 카테고리 4: 실시간 데이터 처리
- [한국투자증권 OpenAPI](https://apiportal.koreainvestment.com/apiservice)
- [한국투자증권 open-trading-api (GitHub)](https://github.com/koreainvestment/open-trading-api)
- [PyKRX (GitHub)](https://github.com/sharebook-kr/pykrx)
- [korea-stock-mcp (GitHub)](https://github.com/jjlabsio/korea-stock-mcp)
- [iTick Korea API Guide](https://blog.itick.org/en/stock-api/korean-stock-api-integration-guide-realtime-historical-data)
- [Twelve Data KRX](https://twelvedata.com/exchanges/xkrx)
- [공공데이터포털 - 금융위원회 주식시세정보](https://www.data.go.kr/data/15094808/openapi.do)
- [KRX Data Marketplace](https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?locale=en)
- [Google Cloud - Real-Time Streaming Pipelines](https://cloud.google.com/blog/topics/financial-services/building-real-time-streaming-pipelines-for-market-data)
- [Confluent - Data Streaming in Financial Services](https://www.confluent.io/resources/ebook/5-data-streaming-use-cases-in-financial-services/)
- [Finnhub WebSocket API](https://finnhub.io/docs/api/websocket-news)
- [EODHD Real-Time WebSocket API](https://eodhd.com/financial-apis/new-real-time-data-api-websockets)
