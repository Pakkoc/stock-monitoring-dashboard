/**
 * Confidence scoring calculator for surge analysis results.
 *
 * Formula:
 *   ConfidenceScore = 0.20 * S_source + 0.30 * S_evidence
 *                   + 0.35 * S_quality + 0.15 * S_consistency
 *
 * Each component: [0, 100]. Final: clamped to [0, 100], rounded integer.
 *
 * @see planning/step-10-ai-agent-design.md §6
 */

import type {
  NewsArticle,
  SurgeAnalysis,
  QualityGateResult,
} from '../pipeline/state';
import { extractKoreanKeywords } from './korean-keywords';

// ---------------------------------------------------------------------------
// Component scores
// ---------------------------------------------------------------------------

/**
 * S_source (Source Count Score) — Weight 0.20
 *
 * Measures diversity of independent news sources cited.
 * 0 sources → 0, 1 → 20, 2 → 40, ... 5+ → 100.
 */
function calculateSourceScore(articles: NewsArticle[]): number {
  const uniqueSources = new Set(articles.map((a) => a.source)).size;
  return Math.min(uniqueSources * 20, 100);
}

/**
 * S_evidence (Evidence Strength Score) — Weight 0.30
 *
 * Evaluates quality and specificity of evidence citations.
 * - Per evidence item (max 3 scored): +15 each (max 45)
 * - All evidence items have valid URLs: +30
 * - All evidence claims are substantive (>10 chars): +25
 */
function calculateEvidenceScore(analysis: SurgeAnalysis): number {
  const evidenceCount = analysis.evidence.length;
  const hasUrls = analysis.evidence.every(
    (e) => e.url && e.url.startsWith('http'),
  );
  const hasClaims = analysis.evidence.every(
    (e) => e.claim && e.claim.length > 10,
  );

  let score = 0;
  score += Math.min(evidenceCount * 15, 45);
  score += hasUrls ? 30 : 0;
  score += hasClaims ? 25 : 0;
  return Math.min(score, 100);
}

/**
 * S_quality (Quality Gate Pass Rate Score) — Weight 0.35
 *
 * Reflects Quality Gate outcomes with retry penalty.
 * - L1 passed: +30
 * - L2 passed: +35
 * - L3 passed: +35
 * - Per retry attempt: -5
 */
function calculateQualityScore(qg: QualityGateResult): number {
  let score = 0;
  score += qg.l1Syntax.passed ? 30 : 0;
  score += qg.l2Semantic.passed ? 35 : 0;
  score += qg.l3Factual.passed ? 35 : 0;
  score -= qg.retryCount * 5;
  return Math.max(0, score);
}

/**
 * S_consistency (Cross-Source Consistency Score) — Weight 0.15
 *
 * Measures agreement between different sources about the primary cause.
 * For each article, if >=2 primary-cause keywords appear in its title+summary,
 * it counts as a matching article.
 */
function calculateConsistencyScore(
  articles: NewsArticle[],
  analysis: SurgeAnalysis,
): number {
  if (articles.length === 0) return 0;

  const primaryKeywords = extractKoreanKeywords(
    analysis.primaryCause.toLowerCase(),
  );

  let articlesMatchingCause = 0;
  for (const article of articles) {
    const text = `${article.title} ${article.summary}`.toLowerCase();
    const matchCount = primaryKeywords.filter((kw) =>
      text.includes(kw),
    ).length;
    if (matchCount >= 2) articlesMatchingCause++;
  }

  const matchRatio = articlesMatchingCause / articles.length;
  return Math.round(matchRatio * 100);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the final confidence score for a surge analysis.
 *
 * @returns Integer in [0, 100]
 */
export function calculateConfidenceScore(
  newsArticles: NewsArticle[],
  analysis: SurgeAnalysis,
  qualityGate: QualityGateResult,
): number {
  const sourceScore = calculateSourceScore(newsArticles);
  const evidenceScore = calculateEvidenceScore(analysis);
  const qualityScore = calculateQualityScore(qualityGate);
  const consistencyScore = calculateConsistencyScore(newsArticles, analysis);

  const raw =
    0.2 * sourceScore +
    0.3 * evidenceScore +
    0.35 * qualityScore +
    0.15 * consistencyScore;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * Get the confidence tier label and color for display.
 */
export function getConfidenceTier(score: number): {
  label: string;
  color: string;
  tailwindClass: string;
} {
  if (score >= 80) {
    return {
      label: '높은 신뢰도',
      color: '#22C55E',
      tailwindClass: 'text-green-500',
    };
  }
  if (score >= 60) {
    return {
      label: '보통 신뢰도',
      color: '#EAB308',
      tailwindClass: 'text-yellow-500',
    };
  }
  if (score >= 40) {
    return {
      label: '낮은 신뢰도',
      color: '#F97316',
      tailwindClass: 'text-orange-500',
    };
  }
  return {
    label: '매우 낮은 신뢰도',
    color: '#EF4444',
    tailwindClass: 'text-red-500',
  };
}
