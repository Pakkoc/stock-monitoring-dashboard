/**
 * Surge Analysis LangGraph State Graph — assembles and compiles the pipeline.
 *
 * Graph topology:
 *   START → dataCollector → newsSearcher → analyzer → qualityGate
 *     ├─ (all pass)       → resultFormatter → END
 *     ├─ (fail, retry<3)  → analyzer (loop back)
 *     └─ (fail, retry>=3) → resultFormatter → END (unverified)
 *
 *   errorHandler → END (degraded result)
 *
 * @see planning/step-10-ai-agent-design.md §2.3
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import { SurgeAnalysisState } from './state';
import { dataCollectorNode } from './nodes/data-collector.node';
import { newsSearcherNode } from './nodes/news-searcher.node';
import { analyzerNode } from './nodes/analyzer.node';
import { qualityGateNode } from './nodes/quality-gate.node';
import { resultFormatterNode } from './nodes/result-formatter.node';
import { errorHandlerNode } from './nodes/error-handler.node';

const MAX_RETRIES = 3; // PRD section 6.2

/**
 * Build and compile the surge analysis LangGraph state graph.
 *
 * The compiled graph is invoked with:
 * ```ts
 * const result = await graph.invoke(
 *   { symbol: '005930', requestId: 'uuid-...' },
 *   { configurable: { prismaService, redisService, chatModel } },
 * );
 * ```
 */
export function buildSurgeAnalysisGraph() {
  const graph = new StateGraph(SurgeAnalysisState)
    // --- Register nodes ---
    .addNode('dataCollector', dataCollectorNode, {
      retryPolicy: {
        maxAttempts: 3,
        initialInterval: 1000,
        backoffFactor: 2,
        maxInterval: 10000,
      },
    })
    .addNode('newsSearcher', newsSearcherNode, {
      retryPolicy: {
        maxAttempts: 2,
        initialInterval: 500,
        backoffFactor: 2,
        maxInterval: 5000,
      },
    })
    .addNode('analyzer', analyzerNode)
    .addNode('qualityGate', qualityGateNode)
    .addNode('resultFormatter', resultFormatterNode)
    .addNode('errorHandler', errorHandlerNode)

    // --- Static edges: happy path ---
    .addEdge(START, 'dataCollector')
    .addEdge('dataCollector', 'newsSearcher')
    .addEdge('newsSearcher', 'analyzer')
    .addEdge('analyzer', 'qualityGate')

    // --- Conditional edge: Quality Gate routing ---
    .addConditionalEdges('qualityGate', routeAfterQualityGate)

    // --- Terminal edges ---
    .addEdge('resultFormatter', END)
    .addEdge('errorHandler', END);

  return graph.compile();
}

/**
 * Routing function after the Quality Gate node.
 *
 * Returns the name of the next node based on QG result and retry count.
 */
function routeAfterQualityGate(
  state: typeof SurgeAnalysisState.State,
): string {
  // If QG passed, proceed to result formatting
  if (state.qualityGateResult?.overallPassed) {
    return 'resultFormatter';
  }

  // If retries exhausted, proceed with unverified label
  if (state.retryCount >= MAX_RETRIES) {
    return 'resultFormatter';
  }

  // Otherwise, retry the analyzer with QG feedback
  return 'analyzer';
}

/**
 * Type of the compiled graph for dependency injection.
 */
export type SurgeAnalysisGraph = ReturnType<typeof buildSurgeAnalysisGraph>;
