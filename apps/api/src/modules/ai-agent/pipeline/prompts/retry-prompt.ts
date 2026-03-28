/**
 * Quality Gate retry prompt suffix.
 *
 * Appended to the user message on retry (retryCount > 0) with QG feedback
 * so the LLM can self-correct.
 *
 * @see planning/step-10-ai-agent-design.md §4.3
 */

export const RETRY_PROMPT_SUFFIX = `

## 이전 분석 피드백

이전 분석이 품질 검증(Quality Gate)을 통과하지 못했습니다. 아래 문제를 수정하여 다시 분석해주세요:

### 구문 검증(L1) 오류:
{l1Errors}

### 의미 검증(L2) 불일치:
{l2Inconsistencies}

### 사실 검증(L3) 불일치:
{l3Mismatches}

위 피드백을 반영하여 수정된 분석을 생성해주세요. 특히:
- L1 오류가 있다면, 출력 형식이 요구된 스키마와 정확히 일치하는지 확인하세요.
- L2 불일치가 있다면, evidence의 URL이 제공된 뉴스 기사의 URL과 정확히 일치하는지 확인하세요.
- L3 불일치가 있다면, 주가/거래량 수치가 제공된 팩트 데이터와 일치하는지 확인하세요.`;
