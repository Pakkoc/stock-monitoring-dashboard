/**
 * qualityGate node — Validate LLM output through 3 progressive layers.
 *
 * Layers run sequentially and short-circuit:
 * - L1 (Syntax)  → Zod schema validation
 * - L2 (Semantic) → Internal consistency (only if L1 passes)
 * - L3 (Factual)  → Cross-validation with stock data (only if L1+L2 pass)
 *
 * Routing after QG:
 * - All pass → resultFormatter
 * - Fail + retryCount < 3 → analyzer (retry with feedback)
 * - Fail + retryCount >= 3 → resultFormatter (unverified label)
 *
 * @see planning/step-10-ai-agent-design.md §3.4, §5.4
 */

import { validateL1Syntax } from '../../quality-gate/l1-syntax.validator';
import { validateL2Semantic } from '../../quality-gate/l2-semantic.validator';
import { validateL3Factual } from '../../quality-gate/l3-factual.validator';
import type { SurgeAnalysisStateType } from '../state';

export async function qualityGateNode(
  state: SurgeAnalysisStateType,
): Promise<Partial<SurgeAnalysisStateType>> {
  const analysis = state.surgeAnalysis;
  const stockData = state.stockData;
  const newsArticles = state.newsArticles;

  // Guard: analysis must exist
  if (!analysis) {
    return {
      qualityGateResult: {
        l1Syntax: { passed: false, errors: ['No analysis to validate'] },
        l2Semantic: { passed: false, inconsistencies: ['Skipped: no analysis'] },
        l3Factual: { passed: false, mismatches: ['Skipped: no analysis'] },
        overallPassed: false,
        retryCount: state.retryCount + 1,
      },
      retryCount: state.retryCount + 1,
    };
  }

  // L1: Syntax Validation
  const l1Result = validateL1Syntax(analysis);

  // L2: Semantic Validation (only run if L1 passes)
  const l2Result = l1Result.passed
    ? validateL2Semantic(analysis, newsArticles)
    : { passed: false, inconsistencies: ['Skipped: L1 failed'] };

  // L3: Factual Validation (only run if L1 and L2 pass)
  const l3Result =
    l1Result.passed && l2Result.passed && stockData
      ? validateL3Factual(analysis, stockData, newsArticles)
      : { passed: false, mismatches: ['Skipped: L1 or L2 failed'] };

  const overallPassed =
    l1Result.passed && l2Result.passed && l3Result.passed;
  const newRetryCount = state.retryCount + (overallPassed ? 0 : 1);

  return {
    qualityGateResult: {
      l1Syntax: l1Result,
      l2Semantic: l2Result,
      l3Factual: l3Result,
      overallPassed,
      retryCount: newRetryCount,
    },
    retryCount: newRetryCount,
  };
}
