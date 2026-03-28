/**
 * User prompt template for surge analysis.
 *
 * Template variables are filled by the analyzer node before LLM invocation.
 *
 * @see planning/step-10-ai-agent-design.md §4.2
 */

export const SURGE_ANALYSIS_USER_PROMPT = `## 분석 대상

종목명: {stockName}
종목코드: {symbol}

## 실시간 주가 데이터 (한국투자증권 API 기준)

- 현재가: {currentPrice}원
- 등락률: {changePercent}%
- 거래량: {volume}주
- 거래량 비율: 20일 평균 대비 {volumeRatio}배

## 관련 뉴스 기사

아래는 검증된 뉴스 소스(네이버 검색 API, RSS, DART 공시)에서 수집한 관련 기사입니다:

{newsArticles}

## 요청

위 데이터를 바탕으로, 해당 종목의 급등 원인을 분석해주세요.
반드시 제공된 뉴스 기사에 근거하여 분석하고, 모든 주장에 출처를 명시하세요.
evidence의 url 필드에는 위 뉴스 기사의 URL만 사용하세요.`;
