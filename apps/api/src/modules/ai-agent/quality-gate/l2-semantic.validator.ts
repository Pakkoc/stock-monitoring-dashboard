/**
 * L2 — Semantic Validation
 *
 * Verifies internal consistency of the analysis.
 * Target: 95%+ pass rate.
 *
 * Checks:
 * 1. Cause-evidence keyword overlap > 30%
 * 2. Evidence URLs match provided news article URLs
 * 3. Confidence-evidence correlation (multiple causes need multiple evidence)
 * 4. Sentiment consistency (bearish for surging stock is flagged)
 * 5. No self-contradiction between primary cause and risk factors
 *
 * @see planning/step-10-ai-agent-design.md §5.2
 */

import type { SurgeAnalysis, NewsArticle } from '../pipeline/state';
import { extractKoreanKeywords } from '../utils/korean-keywords';

export interface L2Result {
  passed: boolean;
  inconsistencies: string[];
}

export function validateL2Semantic(
  analysis: SurgeAnalysis,
  newsArticles: NewsArticle[],
): L2Result {
  const inconsistencies: string[] = [];

  // -------------------------------------------------------------------------
  // Check 1: Cause-evidence keyword overlap > 30%
  // -------------------------------------------------------------------------
  const causeKeywords = extractKoreanKeywords(analysis.primaryCause);
  const evidenceText = analysis.evidence.map((e) => e.claim).join(' ');
  const evidenceKeywords = extractKoreanKeywords(evidenceText);

  if (causeKeywords.length > 0) {
    const overlapCount = causeKeywords.filter((kw) =>
      evidenceKeywords.includes(kw),
    ).length;
    const overlapRatio = overlapCount / causeKeywords.length;
    if (overlapRatio < 0.3) {
      inconsistencies.push(
        `Cause-evidence keyword overlap is ${(overlapRatio * 100).toFixed(0)}% (minimum 30% required). ` +
          `Cause keywords: [${causeKeywords.join(', ')}]`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Check 2: Evidence URLs must match provided news articles
  // -------------------------------------------------------------------------
  const newsUrlSet = new Set(newsArticles.map((a) => a.url));
  for (const ev of analysis.evidence) {
    if (!newsUrlSet.has(ev.url)) {
      inconsistencies.push(
        `Evidence URL not found in provided news articles: ${ev.url}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Check 3: Confidence-evidence correlation
  // Multiple secondary causes with fewer than 2 evidence sources is suspect
  // -------------------------------------------------------------------------
  if (
    analysis.evidence.length < 2 &&
    analysis.secondaryCauses.length > 2
  ) {
    inconsistencies.push(
      'Multiple secondary causes claimed with fewer than 2 evidence sources',
    );
  }

  // -------------------------------------------------------------------------
  // Check 4: Sentiment consistency
  // Bearish sentiment on a surging stock is suspect
  // -------------------------------------------------------------------------
  if (analysis.sentiment === 'bearish') {
    inconsistencies.push(
      'Bearish sentiment for a surging stock requires explicit justification in risk factors',
    );
  }

  // -------------------------------------------------------------------------
  // Check 5: Self-contradiction check
  // -------------------------------------------------------------------------
  const causeTextLower = analysis.primaryCause.toLowerCase();
  for (const risk of analysis.riskFactors) {
    const riskLower = risk.toLowerCase();
    // Direct contradiction: cause says "실적 호조" but risk says "실적 부진/악화"
    if (
      causeTextLower.includes('실적 호조') &&
      (riskLower.includes('실적 부진') || riskLower.includes('실적 악화'))
    ) {
      inconsistencies.push(
        `Self-contradiction: cause cites "실적 호조" but risk cites "${risk}"`,
      );
    }
  }

  return {
    passed: inconsistencies.length === 0,
    inconsistencies,
  };
}
