/**
 * analyzer node — Invoke LLM with structured output to produce surge cause analysis.
 *
 * Uses ChatAnthropic (Claude Sonnet) or ChatOpenAI (GPT-4o) with
 * withStructuredOutput() and the Zod schema for type-safe LLM responses.
 *
 * On retry (retryCount > 0): appends QG failure feedback for guided self-correction.
 *
 * Timeout: 30 seconds
 *
 * @see planning/step-10-ai-agent-design.md §3.3
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { surgeAnalysisSchema } from '../../schemas/analysis-output.schema';
import { SURGE_ANALYSIS_SYSTEM_PROMPT } from '../prompts/system-prompt';
import { SURGE_ANALYSIS_USER_PROMPT } from '../prompts/analysis-prompt';
import { RETRY_PROMPT_SUFFIX } from '../prompts/retry-prompt';
import { sanitizeInput, sanitizeOutput } from '../../utils/sanitizer';
import type { SurgeAnalysisStateType } from '../state';

export async function analyzerNode(
  state: SurgeAnalysisStateType,
  config?: RunnableConfig,
): Promise<Partial<SurgeAnalysisStateType>> {
  try {
    const chatModel = config?.configurable?.chatModel as BaseChatModel;

    if (!chatModel) {
      throw new Error('chatModel not provided in configurable');
    }

    // Create structured output model using Zod schema
    const structuredModel = chatModel.withStructuredOutput(surgeAnalysisSchema);

    // Build prompt messages
    const messages: Array<[string, string]> = [
      ['system', SURGE_ANALYSIS_SYSTEM_PROMPT],
      ['human', SURGE_ANALYSIS_USER_PROMPT],
    ];

    // On retry: append QG feedback
    if (state.retryCount > 0 && state.qualityGateResult) {
      messages.push(['human', RETRY_PROMPT_SUFFIX]);
    }

    const prompt = ChatPromptTemplate.fromMessages(messages);
    const chain = RunnableSequence.from([prompt, structuredModel]);

    // Format news articles for prompt
    const formattedNews =
      state.newsArticles.length > 0
        ? state.newsArticles
            .map(
              (a, i) =>
                `[${i + 1}] ${a.title}\n    출처: ${a.source}\n    URL: ${a.url}\n    발행: ${a.publishedAt}\n    요약: ${a.summary}`,
            )
            .join('\n\n')
        : '(관련 뉴스 기사가 없습니다. 가능한 범위에서 분석해주세요.)';

    // Invoke LLM
    const analysis = await chain.invoke({
      stockName: sanitizeInput(state.stockData!.name),
      symbol: state.symbol,
      currentPrice: state.stockData!.currentPrice.toLocaleString('ko-KR'),
      changePercent: state.stockData!.changePercent.toFixed(2),
      volume: state.stockData!.volume.toLocaleString('ko-KR'),
      volumeRatio: state.stockData!.volumeRatio.toFixed(1),
      newsArticles: sanitizeInput(formattedNews),
      // Retry feedback fields (empty strings on first attempt)
      l1Errors:
        state.qualityGateResult?.l1Syntax.errors.join('\n') ?? '',
      l2Inconsistencies:
        state.qualityGateResult?.l2Semantic.inconsistencies.join('\n') ?? '',
      l3Mismatches:
        state.qualityGateResult?.l3Factual.mismatches.join('\n') ?? '',
    });

    // Sanitize LLM output before passing to Quality Gate
    const sanitized = sanitizeOutput(
      analysis as Record<string, unknown>,
    );

    return {
      surgeAnalysis: sanitized as unknown as SurgeAnalysisStateType['surgeAnalysis'],
      currentStep: 'qualityGate',
    };
  } catch (err) {
    return {
      error: {
        node: 'analyzer',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        timestamp: new Date().toISOString(),
      },
      currentStep: 'errorHandler',
    };
  }
}
