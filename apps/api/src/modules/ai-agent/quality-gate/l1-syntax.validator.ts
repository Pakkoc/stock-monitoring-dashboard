/**
 * L1 — Syntax Validation
 *
 * Ensures LLM output conforms to the Zod schema structure.
 * Target: 99%+ pass rate.
 *
 * Checks:
 * 1. Zod schema parse passes (enforces all field types, min/max constraints)
 * 2. evidence array has at least 1 entry
 * 3. All evidence URLs are valid URL format
 * 4. primaryCause is non-empty, minimum 10 characters
 * 5. sentiment is valid enum value
 * 6. No duplicate evidence URLs
 *
 * @see planning/step-10-ai-agent-design.md §5.1
 */

import { surgeAnalysisSchema } from '../schemas/analysis-output.schema';

export interface L1Result {
  passed: boolean;
  errors: string[];
}

export function validateL1Syntax(analysis: unknown): L1Result {
  const result = surgeAnalysisSchema.safeParse(analysis);

  if (result.success) {
    // Additional checks beyond Zod
    const data = result.data;
    const additionalErrors: string[] = [];

    // Check: confidence on evidence items is within bounds
    for (const ev of data.evidence) {
      if (ev.relevance < 0 || ev.relevance > 1) {
        additionalErrors.push(
          `Evidence relevance out of bounds: ${ev.relevance}`,
        );
      }
    }

    // Check: no duplicate evidence URLs
    const urls = data.evidence.map((e) => e.url);
    const uniqueUrls = new Set(urls);
    if (uniqueUrls.size < urls.length) {
      additionalErrors.push('Duplicate evidence URLs detected');
    }

    return {
      passed: additionalErrors.length === 0,
      errors: additionalErrors,
    };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`,
  );
  return { passed: false, errors };
}
