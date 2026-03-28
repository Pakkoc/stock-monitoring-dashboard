/**
 * DTO for AI analysis responses.
 */

import type { AnalysisResult, CauseCategory } from '../pipeline/state';

/**
 * Response DTO for a single analysis result.
 */
export class AnalysisResultDto {
  /** Analysis ID (from database) */
  id!: number;

  /** 종목코드 */
  symbol!: string;

  /** 종목명 */
  stockName!: string;

  /** AI 분석 내용 (full structured analysis) */
  analysis!: AnalysisResult['analysis'];

  /** 신뢰도 점수 [0, 100] */
  confidenceScore!: number;

  /** 원인 카테고리 */
  category!: CauseCategory;

  /** 요약 (한국어, 2-3문장) */
  summary!: string;

  /** Quality Gate 검증 결과 */
  qualityGate!: AnalysisResult['qualityGate'];

  /** 생성 시각 (ISO 8601) */
  generatedAt!: string;

  /** 사용된 LLM 모델 */
  modelUsed!: string;

  /** AI 생성 여부 (항상 true) */
  aiGenerated!: true;

  /** 검증 상태 */
  verificationStatus!: 'verified' | 'unverified' | 'failed';
}

/**
 * Response DTO for the async analysis trigger endpoint.
 */
export class AnalyzeTriggeredDto {
  /** Job ID for tracking async processing */
  jobId!: string;

  /** 종목코드 */
  symbol!: string;

  /** Status message */
  message!: string;
}

/**
 * Response DTO for analysis history.
 */
export class AnalysisHistoryDto {
  /** List of analysis results */
  data!: AnalysisResultDto[];

  /** Total count */
  total!: number;

  /** 종목코드 */
  symbol!: string;
}
