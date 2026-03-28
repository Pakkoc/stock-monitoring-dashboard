/**
 * Korean keyword extraction utility.
 *
 * Extracts meaningful keywords from Korean text by removing common
 * particles (조사) and short connectors.
 *
 * Used by L2 semantic validator and confidence calculator.
 *
 * @see planning/step-10-ai-agent-design.md §5.2
 */

const KOREAN_PARTICLES = new Set([
  '은',
  '는',
  '이',
  '가',
  '을',
  '를',
  '의',
  '에',
  '에서',
  '로',
  '으로',
  '와',
  '과',
  '도',
  '만',
  '까지',
  '부터',
  '에게',
  '한테',
  '처럼',
  '같이',
  '보다',
  '라고',
  '이라',
  '및',
  '등',
  '그',
  '또',
  '한',
  '더',
]);

/**
 * Extract meaningful keywords from Korean text.
 *
 * Splits on whitespace and common punctuation, filters out particles
 * and single-character words.
 */
export function extractKoreanKeywords(text: string): string[] {
  const words = text
    .split(/[\s,.\-;:()[\]{}'"!?·…~]+/)
    .filter((w) => w.length > 1);

  return words.filter((w) => !KOREAN_PARTICLES.has(w));
}
