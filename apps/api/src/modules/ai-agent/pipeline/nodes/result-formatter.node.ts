/**
 * resultFormatter node — Compute confidence score, determine category,
 * format frontend-ready output.
 *
 * Produces the final AnalysisResult with:
 * - Confidence score (0-100) via weighted formula
 * - Cause category classification
 * - Korean summary (2-3 sentences)
 * - Verification status
 * - "AI 생성" flag (always true)
 *
 * @see planning/step-10-ai-agent-design.md §3.5
 */

import { calculateConfidenceScore } from '../../utils/confidence-calculator';
import type {
  SurgeAnalysisStateType,
  SurgeAnalysis,
  NewsArticle,
  StockData,
  CauseCategory,
  AnalysisResult,
} from '../state';

export async function resultFormatterNode(
  state: SurgeAnalysisStateType,
): Promise<Partial<SurgeAnalysisStateType>> {
  const analysis = state.surgeAnalysis!;
  const qg = state.qualityGateResult!;

  // Calculate confidence
  const confidenceScore = calculateConfidenceScore(
    state.newsArticles,
    analysis,
    qg,
  );

  // Determine category from analysis content
  const category = classifyCauseCategory(analysis, state.newsArticles);

  // Generate summary (2-3 sentences in Korean)
  const summary = generateSummary(analysis, state.stockData!, confidenceScore);

  // Determine verification status
  let verificationStatus: 'verified' | 'unverified' | 'failed';
  if (qg.overallPassed) {
    verificationStatus = 'verified';
  } else if (qg.retryCount >= 3) {
    verificationStatus = 'unverified';
  } else {
    verificationStatus = 'failed';
  }

  const result: AnalysisResult = {
    symbol: state.symbol,
    stockName: state.stockData!.name,
    analysis,
    confidenceScore,
    category,
    summary,
    qualityGate: qg,
    generatedAt: new Date().toISOString(),
    modelUsed: 'claude-sonnet-4-20250514',
    aiGenerated: true,
    verificationStatus,
  };

  return { finalResult: result, currentStep: 'done' };
}

// ---------------------------------------------------------------------------
// Category classification logic
// ---------------------------------------------------------------------------

/**
 * Classify the cause category based on analysis content and news source types.
 *
 * Priority order: disclosure > theme > technical > news > unknown
 */
function classifyCauseCategory(
  analysis: SurgeAnalysis,
  articles: NewsArticle[],
): CauseCategory {
  const causeText = analysis.primaryCause.toLowerCase();
  const hasDartSource = articles.some((a) => a.channel === 'dart');
  const hasNewsSource = articles.some(
    (a) => a.channel === 'naver' || a.channel === 'rss',
  );

  // Priority order: disclosure > news > theme > technical > unknown
  if (
    hasDartSource &&
    (causeText.includes('공시') ||
      causeText.includes('실적') ||
      causeText.includes('배당'))
  ) {
    return 'disclosure';
  }

  if (
    causeText.includes('테마') ||
    causeText.includes('섹터') ||
    causeText.includes('동반')
  ) {
    return 'theme';
  }

  if (
    causeText.includes('기술적') ||
    causeText.includes('돌파') ||
    causeText.includes('반등') ||
    causeText.includes('지지선')
  ) {
    return 'technical';
  }

  if (hasNewsSource && analysis.evidence.length > 0) {
    return 'news';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

/**
 * Generate a Korean-language summary (2-3 sentences) of the analysis.
 */
function generateSummary(
  analysis: SurgeAnalysis,
  stockData: StockData,
  confidenceScore: number,
): string {
  const changeDirection =
    stockData.changePercent >= 0 ? '급등' : '급락';
  const changeStr = Math.abs(stockData.changePercent).toFixed(2);

  const primarySentence =
    `${stockData.name}(${stockData.symbol})이(가) ${changeStr}% ${changeDirection}했습니다. ` +
    `${analysis.primaryCause}`;

  const evidenceCount = analysis.evidence.length;
  const evidenceSentence =
    evidenceCount > 0
      ? `총 ${evidenceCount}건의 근거 자료를 기반으로 분석되었으며, ` +
        `신뢰도는 ${confidenceScore}점입니다.`
      : `관련 근거 자료가 제한적이며, 신뢰도는 ${confidenceScore}점입니다.`;

  const riskSentence =
    analysis.riskFactors.length > 0
      ? `주요 리스크 요인으로 ${analysis.riskFactors[0]}이(가) 있습니다.`
      : '';

  return [primarySentence, evidenceSentence, riskSentence]
    .filter(Boolean)
    .join(' ');
}
