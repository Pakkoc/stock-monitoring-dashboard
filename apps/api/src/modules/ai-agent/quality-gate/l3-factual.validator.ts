/**
 * L3 — Factual Validation
 *
 * Cross-validates claims against actual stock data from the KIS API.
 * Target: 90%+ pass rate.
 *
 * Checks:
 * 1. Price direction matches sentiment
 * 2. Volume claim validation (20% tolerance)
 * 3. 상한가 claim validation (changePercent >= 29%)
 * 4. News recency — evidence dates within 24 hours
 *
 * @see planning/step-10-ai-agent-design.md §5.3
 */

import type {
  SurgeAnalysis,
  StockData,
  NewsArticle,
} from '../pipeline/state';

export interface L3Result {
  passed: boolean;
  mismatches: string[];
}

export function validateL3Factual(
  analysis: SurgeAnalysis,
  stockData: StockData,
  newsArticles: NewsArticle[],
): L3Result {
  const mismatches: string[] = [];

  // -------------------------------------------------------------------------
  // Check 1: Price direction matches sentiment
  // -------------------------------------------------------------------------
  if (stockData.changePercent < 0 && analysis.sentiment === 'bullish') {
    mismatches.push(
      `Bullish sentiment but stock is actually down ${stockData.changePercent.toFixed(2)}%`,
    );
  }
  if (stockData.changePercent > 0 && analysis.sentiment === 'bearish') {
    mismatches.push(
      `Bearish sentiment but stock is actually up ${stockData.changePercent.toFixed(2)}%`,
    );
  }

  // -------------------------------------------------------------------------
  // Check 2: Volume claim validation (20% tolerance)
  // If analysis mentions volume surge, actual volume must be >= 1.2x avg
  // (1.5x threshold with 20% tolerance = 1.2x)
  // -------------------------------------------------------------------------
  const mentionsVolumeSurge =
    analysis.primaryCause.includes('거래량') ||
    analysis.secondaryCauses.some((c) => c.includes('거래량'));
  if (mentionsVolumeSurge && stockData.avgVolume20d > 0) {
    const actualRatio = stockData.volume / stockData.avgVolume20d;
    if (actualRatio < 1.2) {
      mismatches.push(
        `Claims volume surge but actual volume ratio is ${actualRatio.toFixed(1)}x ` +
          `(${stockData.volume.toLocaleString()} vs 20d avg ${stockData.avgVolume20d.toLocaleString()})`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Check 3: 상한가 claim validation
  // -------------------------------------------------------------------------
  if (
    analysis.primaryCause.includes('상한가') &&
    stockData.changePercent < 29.0
  ) {
    mismatches.push(
      `Claims 상한가 (limit up, +30%) but actual change is ${stockData.changePercent.toFixed(2)}%`,
    );
  }

  // -------------------------------------------------------------------------
  // Check 4: News recency — evidence dates within 24 hours
  // -------------------------------------------------------------------------
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const ev of analysis.evidence) {
    // Find matching news article to get its publishedAt
    const matchingArticle = newsArticles.find((a) => a.url === ev.url);
    if (matchingArticle) {
      const pubDate = new Date(matchingArticle.publishedAt);
      if (pubDate < twentyFourHoursAgo) {
        mismatches.push(
          `Evidence source "${ev.source}" published at ${matchingArticle.publishedAt} ` +
            `is older than 24 hours`,
        );
      }
    }
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
  };
}
