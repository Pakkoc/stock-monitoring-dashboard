/**
 * errorHandler node — Produce a gracefully degraded result when any upstream node fails.
 *
 * Returns an AnalysisResult with:
 * - verificationStatus: 'failed'
 * - confidenceScore: 0
 * - category: 'unknown'
 * - Korean error message for the user
 *
 * @see planning/step-10-ai-agent-design.md §3.6
 */

import type { SurgeAnalysisStateType, AnalysisResult } from '../state';

export async function errorHandlerNode(
  state: SurgeAnalysisStateType,
): Promise<Partial<SurgeAnalysisStateType>> {
  const errorMsg = state.error?.message ?? 'Unknown error';

  const result: AnalysisResult = {
    symbol: state.symbol,
    stockName: state.stockData?.name ?? state.symbol,
    analysis: {
      primaryCause: '처리 오류로 인해 분석을 완료할 수 없습니다.',
      secondaryCauses: [],
      evidence: [],
      sentiment: 'neutral',
      timeHorizon: 'short-term',
      riskFactors: [`처리 오류: ${errorMsg}`],
    },
    confidenceScore: 0,
    category: 'unknown',
    summary:
      `${state.stockData?.name ?? state.symbol} 종목의 급등 원인 분석 중 오류가 발생했습니다. ` +
      `잠시 후 다시 시도해 주세요.`,
    qualityGate: {
      l1Syntax: { passed: false, errors: ['Processing error'] },
      l2Semantic: { passed: false, inconsistencies: [] },
      l3Factual: { passed: false, mismatches: [] },
      overallPassed: false,
      retryCount: state.retryCount,
    },
    generatedAt: new Date().toISOString(),
    modelUsed: 'none',
    aiGenerated: true,
    verificationStatus: 'failed',
  };

  return { finalResult: result, currentStep: 'done' };
}
