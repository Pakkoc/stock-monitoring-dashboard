/**
 * Unit tests for L1 Syntax Validator.
 *
 * Tests:
 * - Valid surge analysis output passes validation
 * - Missing required fields fail validation
 * - Invalid evidence URL format fails
 * - Duplicate evidence URLs detected
 * - Evidence relevance out of bounds detected
 * - Invalid sentiment enum fails
 * - primaryCause below minimum length fails
 */
import { describe, it, expect } from 'vitest';
import { validateL1Syntax, type L1Result } from './l1-syntax.validator';

/** Factory for a valid surge analysis output */
function createValidAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    primaryCause:
      '삼성전자가 HBM4 메모리 양산 계획을 발표하여 반도체 섹터 전반에 긍정적 영향을 미쳤습니다.',
    secondaryCauses: [
      'AI 데이터센터 투자 확대 기대감',
      '외국인 순매수 전환',
    ],
    evidence: [
      {
        claim: '삼성전자가 HBM4 양산을 2026년 하반기부터 본격화한다고 발표했습니다.',
        source: '한국경제',
        url: 'https://www.hankyung.com/article/2026032700001',
        relevance: 0.95,
      },
      {
        claim: 'AI 반도체 수요 급증으로 HBM 시장이 전년 대비 80% 성장할 전망입니다.',
        source: '매일경제',
        url: 'https://www.mk.co.kr/news/stock/2026032700002',
        relevance: 0.78,
      },
    ],
    sentiment: 'bullish' as const,
    timeHorizon: 'short-term' as const,
    riskFactors: [
      '미국 반도체 수출 규제 강화 가능성',
      '메모리 가격 사이클 하락 전환 리스크',
    ],
    ...overrides,
  };
}

describe('L1 Syntax Validator', () => {
  // ─── Valid Inputs ───────────────────────────────────────────────

  describe('valid inputs', () => {
    it('should pass for a well-formed analysis output', () => {
      const result = validateL1Syntax(createValidAnalysis());

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass with minimum required fields', () => {
      const minimal = {
        primaryCause: '최소한의 원인 설명입니다 (10자 이상).',
        secondaryCauses: [],
        evidence: [
          {
            claim: '최소 근거 항목 하나를 제공합니다 (10자 이상).',
            source: 'DART',
            url: 'https://dart.fss.or.kr/disclosure/001',
            relevance: 0.5,
          },
        ],
        sentiment: 'neutral',
        timeHorizon: 'medium-term',
        riskFactors: [],
      };

      const result = validateL1Syntax(minimal);
      expect(result.passed).toBe(true);
    });

    it('should pass with all three sentiment values', () => {
      for (const sentiment of ['bullish', 'bearish', 'neutral'] as const) {
        const result = validateL1Syntax(createValidAnalysis({ sentiment }));
        expect(result.passed).toBe(true);
      }
    });

    it('should pass with all three timeHorizon values', () => {
      for (const timeHorizon of ['short-term', 'medium-term', 'long-term'] as const) {
        const result = validateL1Syntax(createValidAnalysis({ timeHorizon }));
        expect(result.passed).toBe(true);
      }
    });
  });

  // ─── Invalid Inputs — Zod Schema Failures ──────────────────────

  describe('Zod schema failures', () => {
    it('should fail when input is null', () => {
      const result = validateL1Syntax(null);
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail when input is undefined', () => {
      const result = validateL1Syntax(undefined);
      expect(result.passed).toBe(false);
    });

    it('should fail when input is an empty object', () => {
      const result = validateL1Syntax({});
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail when primaryCause is missing', () => {
      const { primaryCause, ...rest } = createValidAnalysis();
      const result = validateL1Syntax(rest);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('primaryCause'))).toBe(true);
    });

    it('should fail when primaryCause is too short (< 10 chars)', () => {
      const result = validateL1Syntax(
        createValidAnalysis({ primaryCause: '짧은 원인' }),
      );
      expect(result.passed).toBe(false);
    });

    it('should fail when evidence is empty array', () => {
      const result = validateL1Syntax(
        createValidAnalysis({ evidence: [] }),
      );
      expect(result.passed).toBe(false);
    });

    it('should fail when evidence URL is not a valid URL', () => {
      const result = validateL1Syntax(
        createValidAnalysis({
          evidence: [
            {
              claim: '유효하지 않은 URL을 가진 근거 항목입니다.',
              source: '한국경제',
              url: 'not-a-valid-url',
              relevance: 0.8,
            },
          ],
        }),
      );
      expect(result.passed).toBe(false);
    });

    it('should fail when sentiment is invalid enum', () => {
      const result = validateL1Syntax(
        createValidAnalysis({ sentiment: 'very-bullish' }),
      );
      expect(result.passed).toBe(false);
    });

    it('should fail when timeHorizon is invalid enum', () => {
      const result = validateL1Syntax(
        createValidAnalysis({ timeHorizon: 'forever' }),
      );
      expect(result.passed).toBe(false);
    });

    it('should fail when secondaryCauses exceeds max 5', () => {
      const result = validateL1Syntax(
        createValidAnalysis({
          secondaryCauses: ['a', 'b', 'c', 'd', 'e', 'f'],
        }),
      );
      expect(result.passed).toBe(false);
    });

    it('should fail when riskFactors exceeds max 5', () => {
      const result = validateL1Syntax(
        createValidAnalysis({
          riskFactors: ['a', 'b', 'c', 'd', 'e', 'f'],
        }),
      );
      expect(result.passed).toBe(false);
    });
  });

  // ─── Invalid Inputs — Additional Checks (post-Zod) ────────────

  describe('additional checks beyond Zod', () => {
    it('should fail when evidence has duplicate URLs', () => {
      const duplicateUrl = 'https://www.hankyung.com/article/2026032700001';
      const result = validateL1Syntax(
        createValidAnalysis({
          evidence: [
            {
              claim: '첫 번째 근거 항목입니다 (중복 URL 테스트).',
              source: '한국경제',
              url: duplicateUrl,
              relevance: 0.9,
            },
            {
              claim: '두 번째 근거 항목입니다 (동일 URL 사용).',
              source: '한국경제',
              url: duplicateUrl,
              relevance: 0.7,
            },
          ],
        }),
      );

      expect(result.passed).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Duplicate evidence URLs')),
      ).toBe(true);
    });

    it('should fail when evidence relevance is negative', () => {
      const result = validateL1Syntax(
        createValidAnalysis({
          evidence: [
            {
              claim: '음수 관련도를 가진 근거 항목입니다.',
              source: 'DART',
              url: 'https://dart.fss.or.kr/disclosure/001',
              relevance: -0.1,
            },
          ],
        }),
      );

      // Zod schema has min(0), so this should fail at the Zod level
      expect(result.passed).toBe(false);
    });

    it('should fail when evidence relevance exceeds 1.0', () => {
      const result = validateL1Syntax(
        createValidAnalysis({
          evidence: [
            {
              claim: '관련도가 1을 초과하는 근거 항목입니다.',
              source: 'DART',
              url: 'https://dart.fss.or.kr/disclosure/001',
              relevance: 1.5,
            },
          ],
        }),
      );

      // Zod schema has max(1), so this should fail at the Zod level
      expect(result.passed).toBe(false);
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should pass with relevance exactly 0', () => {
      const result = validateL1Syntax(
        createValidAnalysis({
          evidence: [
            {
              claim: '관련도가 정확히 0인 근거 항목입니다 (경계값).',
              source: '매일경제',
              url: 'https://www.mk.co.kr/article/001',
              relevance: 0,
            },
          ],
        }),
      );
      expect(result.passed).toBe(true);
    });

    it('should pass with relevance exactly 1', () => {
      const result = validateL1Syntax(
        createValidAnalysis({
          evidence: [
            {
              claim: '관련도가 정확히 1인 근거 항목입니다 (경계값).',
              source: '매일경제',
              url: 'https://www.mk.co.kr/article/001',
              relevance: 1,
            },
          ],
        }),
      );
      expect(result.passed).toBe(true);
    });

    it('should return structured L1Result type', () => {
      const result: L1Result = validateL1Syntax(createValidAnalysis());
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});
