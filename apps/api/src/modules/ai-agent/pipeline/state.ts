/**
 * SurgeAnalysisState — LangGraph state annotation for the surge analysis pipeline.
 *
 * Each node writes to its own channel. The state annotation defines reducers
 * (latest-writer-wins) and defaults for every channel.
 *
 * @see planning/step-10-ai-agent-design.md §2.1, §2.2
 */

import { Annotation } from '@langchain/langgraph';

// ---------------------------------------------------------------------------
// Domain value objects (used in state channels)
// ---------------------------------------------------------------------------

export interface StockData {
  /** 종목코드 (6-digit, e.g., "005930") */
  symbol: string;
  /** 종목명 (e.g., "삼성전자") */
  name: string;
  /** 현재가 (KRW) */
  currentPrice: number;
  /** 전일 대비 등락률 (%) */
  changePercent: number;
  /** 전일 대비 등락 금액 (KRW) */
  changeAmount: number;
  /** 당일 거래량 (주) */
  volume: number;
  /** 전일 종가 */
  previousClose: number;
  /** 20일 평균 거래량 */
  avgVolume20d: number;
  /** 거래량 비율 (현재 / 20일 평균) */
  volumeRatio: number;
  /** 52주 최고가 */
  high52w: number;
  /** 52주 최저가 */
  low52w: number;
  /** 시가총액 (억원) */
  marketCap: number;
  /** 소속 시장 */
  market: 'KOSPI' | 'KOSDAQ';
  /** 데이터 조회 시각 (ISO 8601) */
  fetchedAt: string;
}

export interface NewsArticle {
  /** 기사 제목 (HTML 태그 제거 후) */
  title: string;
  /** 출처 매체명 (e.g., "한국경제", "DART") */
  source: string;
  /** 원문 URL */
  url: string;
  /** 발행 시각 (ISO 8601) */
  publishedAt: string;
  /** 기사 요약 (최대 200자) */
  summary: string;
  /** 관련도 점수 [0, 1] */
  relevanceScore: number;
  /** 수집 채널 */
  channel: 'naver' | 'rss' | 'dart';
}

export interface SurgeAnalysis {
  /** 급등의 주된 원인 (한국어, 1-2문장) */
  primaryCause: string;
  /** 부수적 원인 (최대 5개) */
  secondaryCauses: string[];
  /** 근거 자료 (최소 1개) */
  evidence: EvidenceItem[];
  /** 시장 심리 */
  sentiment: 'bullish' | 'bearish' | 'neutral';
  /** 분석 유효 기간 */
  timeHorizon: 'short-term' | 'medium-term' | 'long-term';
  /** 리스크 요인 (최대 5개) */
  riskFactors: string[];
}

export interface EvidenceItem {
  /** 인용된 사실 주장 */
  claim: string;
  /** 출처 매체명 */
  source: string;
  /** 근거 기사 URL */
  url: string;
  /** 원인 관련도 [0, 1] */
  relevance: number;
}

export interface QualityGateResult {
  l1Syntax: {
    passed: boolean;
    errors: string[];
  };
  l2Semantic: {
    passed: boolean;
    inconsistencies: string[];
  };
  l3Factual: {
    passed: boolean;
    mismatches: string[];
  };
  overallPassed: boolean;
  retryCount: number;
}

/** 원인 분류 카테고리 */
export type CauseCategory =
  | 'news' // 뉴스/기사 기반
  | 'disclosure' // DART 공시 기반
  | 'theme' // 테마/섹터 동반 상승
  | 'technical' // 기술적 반등/돌파
  | 'unknown'; // 원인 불명

export interface AnalysisResult {
  /** 종목코드 */
  symbol: string;
  /** 종목명 */
  stockName: string;
  /** AI 분석 내용 */
  analysis: SurgeAnalysis;
  /** 신뢰도 점수 [0, 100] */
  confidenceScore: number;
  /** 원인 카테고리 */
  category: CauseCategory;
  /** 요약 (한국어, 2-3문장) */
  summary: string;
  /** Quality Gate 검증 결과 */
  qualityGate: QualityGateResult;
  /** 생성 시각 (ISO 8601) */
  generatedAt: string;
  /** 사용된 LLM 모델 */
  modelUsed: string;
  /** AI 생성 여부 (항상 true) — PRD: "AI 생성" label mandatory */
  aiGenerated: true;
  /** 검증 상태 */
  verificationStatus: 'verified' | 'unverified' | 'failed';
}

// ---------------------------------------------------------------------------
// LangGraph State Annotation
// ---------------------------------------------------------------------------

export const SurgeAnalysisState = Annotation.Root({
  // --- Input channels ---
  /** 종목코드 (graph invocation input) */
  symbol: Annotation<string>(),
  /** 요청 식별자 (tracing/logging) */
  requestId: Annotation<string>(),

  // --- Node output channels (each node writes to its own channel) ---
  stockData: Annotation<StockData | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  newsArticles: Annotation<NewsArticle[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  surgeAnalysis: Annotation<SurgeAnalysis | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  qualityGateResult: Annotation<QualityGateResult | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  finalResult: Annotation<AnalysisResult | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // --- Control flow channels ---
  currentStep: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => 'dataCollector',
  }),
  retryCount: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  error: Annotation<{
    node: string;
    message: string;
    stack?: string;
    timestamp: string;
  } | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type SurgeAnalysisStateType = typeof SurgeAnalysisState.State;
