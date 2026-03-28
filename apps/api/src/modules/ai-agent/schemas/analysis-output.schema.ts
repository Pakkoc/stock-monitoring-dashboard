/**
 * Zod schema for LLM structured output — surge analysis.
 *
 * Used by:
 * - analyzer.node.ts → withStructuredOutput()
 * - l1-syntax.validator.ts → safeParse()
 *
 * @see planning/step-10-ai-agent-design.md §4.4
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Evidence Item Schema
// ---------------------------------------------------------------------------

export const evidenceItemSchema = z.object({
  claim: z
    .string()
    .min(10)
    .describe('인용된 사실 주장 (한국어, 최소 10자)'),
  source: z
    .string()
    .min(1)
    .describe('출처 매체명 (e.g., 한국경제, DART)'),
  url: z
    .string()
    .url()
    .describe('근거 기사의 URL (반드시 제공된 뉴스 중 하나)'),
  relevance: z
    .number()
    .min(0)
    .max(1)
    .describe('이 근거가 급등 원인과 얼마나 관련되는지 [0, 1]'),
});

// ---------------------------------------------------------------------------
// Surge Analysis Schema (LLM output format)
// ---------------------------------------------------------------------------

export const surgeAnalysisSchema = z.object({
  primaryCause: z
    .string()
    .min(10)
    .describe('급등의 가장 주된 원인 (한국어, 1-2문장)'),
  secondaryCauses: z
    .array(z.string())
    .max(5)
    .describe('부수적 원인 (최대 5개)'),
  evidence: z
    .array(evidenceItemSchema)
    .min(1)
    .describe('근거 자료 (최소 1개 필수)'),
  sentiment: z
    .enum(['bullish', 'bearish', 'neutral'])
    .describe('현재 시장 심리'),
  timeHorizon: z
    .enum(['short-term', 'medium-term', 'long-term'])
    .describe('분석 유효 기간'),
  riskFactors: z
    .array(z.string())
    .max(5)
    .describe('향후 주의해야 할 리스크 요인 (최대 5개)'),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type SurgeAnalysisOutput = z.infer<typeof surgeAnalysisSchema>;
