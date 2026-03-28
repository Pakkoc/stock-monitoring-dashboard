/**
 * AiAgentService — Orchestrator for the LangGraph surge analysis pipeline.
 *
 * Responsibilities:
 * - Build and cache the compiled LangGraph state graph
 * - Create the appropriate LLM client (ChatAnthropic or ChatOpenAI)
 * - Run the pipeline and persist results via Prisma
 * - Provide analysis history queries
 *
 * @see planning/step-10-ai-agent-design.md
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '@/shared/database/prisma.service';
import { RedisService } from '@/shared/redis/redis.service';
import {
  buildSurgeAnalysisGraph,
  type SurgeAnalysisGraph,
} from './pipeline/surge-analysis.graph';
import type { AnalysisResult } from './pipeline/state';

/** Supported LLM model identifiers */
type ModelId =
  | 'claude-sonnet-4-20250514'
  | 'claude-opus-4-20250514'
  | 'gpt-4o';

const DEFAULT_MODEL: ModelId = 'claude-sonnet-4-20250514';
const ANALYSIS_CACHE_TTL_SECONDS = 3600; // 60 minutes

@Injectable()
export class AiAgentService implements OnModuleInit {
  private readonly logger = new Logger(AiAgentService.name);
  private graph!: SurgeAnalysisGraph;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.graph = buildSurgeAnalysisGraph();
    this.logger.log('Surge analysis LangGraph pipeline compiled');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Run the full surge analysis pipeline for a stock symbol.
   *
   * @param symbol - 6-digit stock code (e.g., "005930")
   * @param model - LLM model to use (defaults to Claude Sonnet 4)
   * @returns The final AnalysisResult
   */
  async analyzeStock(
    symbol: string,
    model?: string,
  ): Promise<AnalysisResult> {
    const requestId = randomUUID();
    const modelId = (model as ModelId) || DEFAULT_MODEL;

    this.logger.log(
      `Starting surge analysis for ${symbol} [requestId=${requestId}, model=${modelId}]`,
    );

    // Check cache first
    const dateHour = new Date().toISOString().slice(0, 13);
    const cacheKey = `surge-analysis:${symbol}:${dateHour}`;
    const cached = await this.redis.getJson<AnalysisResult>(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for ${symbol}, returning cached analysis`);
      return cached;
    }

    // Create LLM client
    const chatModel = this.createChatModel(modelId);

    // Invoke the LangGraph pipeline
    const startTime = Date.now();
    const result = await this.graph.invoke(
      {
        symbol,
        requestId,
      },
      {
        configurable: {
          prismaService: this.prisma,
          redisService: this.redis,
          chatModel,
        },
      },
    );

    const elapsed = Date.now() - startTime;
    this.logger.log(
      `Surge analysis for ${symbol} completed in ${elapsed}ms ` +
        `[status=${result.finalResult?.verificationStatus ?? 'unknown'}, ` +
        `confidence=${result.finalResult?.confidenceScore ?? 0}]`,
    );

    const finalResult = result.finalResult!;

    // Persist to database
    await this.persistAnalysis(finalResult);

    // Cache the result
    await this.redis.setJson(cacheKey, finalResult, ANALYSIS_CACHE_TTL_SECONDS);

    return finalResult;
  }

  /**
   * Get analysis history for a stock symbol.
   *
   * @param symbol - 6-digit stock code
   * @param limit - Maximum number of results (default 10)
   */
  async getAnalysisHistory(
    symbol: string,
    limit = 10,
  ): Promise<{ data: AnalysisResult[]; total: number }> {
    const stock = await this.prisma.stock.findUnique({
      where: { symbol },
    });

    if (!stock) {
      return { data: [], total: 0 };
    }

    const [analyses, total] = await Promise.all([
      this.prisma.aiAnalysis.findMany({
        where: {
          stockId: stock.id,
          analysisType: 'SURGE',
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.aiAnalysis.count({
        where: {
          stockId: stock.id,
          analysisType: 'SURGE',
        },
      }),
    ]);

    const data = analyses.map((a) =>
      this.mapDbAnalysisToResult(a, symbol, stock.name),
    );

    return { data, total };
  }

  /**
   * Get the latest analysis for a stock symbol.
   *
   * @param symbol - 6-digit stock code
   * @returns The latest AnalysisResult or null
   */
  async getLatestAnalysis(symbol: string): Promise<AnalysisResult | null> {
    // Check cache first
    const dateHour = new Date().toISOString().slice(0, 13);
    const cacheKey = `surge-analysis:${symbol}:${dateHour}`;
    const cached = await this.redis.getJson<AnalysisResult>(cacheKey);
    if (cached) return cached;

    const stock = await this.prisma.stock.findUnique({
      where: { symbol },
    });

    if (!stock) return null;

    const latest = await this.prisma.aiAnalysis.findFirst({
      where: {
        stockId: stock.id,
        analysisType: 'SURGE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) return null;

    return this.mapDbAnalysisToResult(latest, symbol, stock.name);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Create the appropriate LangChain chat model based on model ID.
   */
  private createChatModel(modelId: ModelId): BaseChatModel {
    switch (modelId) {
      case 'claude-sonnet-4-20250514':
      case 'claude-opus-4-20250514': {
        const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
        if (!apiKey) {
          throw new Error('ANTHROPIC_API_KEY not configured');
        }
        return new ChatAnthropic({
          model: modelId,
          anthropicApiKey: apiKey,
          temperature: 0,
          maxTokens: 1024,
        });
      }

      case 'gpt-4o': {
        const apiKey = this.config.get<string>('OPENAI_API_KEY');
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY not configured');
        }
        return new ChatOpenAI({
          model: 'gpt-4o',
          openAIApiKey: apiKey,
          temperature: 0,
          maxTokens: 1024,
        });
      }

      default:
        throw new Error(`Unsupported model: ${modelId}`);
    }
  }

  /**
   * Persist an AnalysisResult to the database via Prisma.
   */
  private async persistAnalysis(result: AnalysisResult): Promise<void> {
    try {
      const stock = await this.prisma.stock.findUnique({
        where: { symbol: result.symbol },
      });

      if (!stock) {
        this.logger.warn(
          `Cannot persist analysis: stock ${result.symbol} not found in DB`,
        );
        return;
      }

      await this.prisma.aiAnalysis.create({
        data: {
          stockId: stock.id,
          analysisType: 'SURGE',
          result: result as unknown as Record<string, unknown>,
          confidenceScore: result.confidenceScore / 100, // DB stores as 0-1 decimal
          qgL1Pass: result.qualityGate.l1Syntax.passed,
          qgL2Pass: result.qualityGate.l2Semantic.passed,
          qgL3Pass: result.qualityGate.l3Factual.passed,
          sourcesJson: result.analysis.evidence as unknown as Record<
            string,
            unknown
          >[],
        },
      });

      this.logger.log(`Analysis persisted for ${result.symbol}`);
    } catch (err) {
      this.logger.error(
        `Failed to persist analysis for ${result.symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Non-fatal: the analysis result is still returned to the caller
    }
  }

  /**
   * Map a database AiAnalysis record to the AnalysisResult interface.
   */
  private mapDbAnalysisToResult(
    dbRecord: {
      id: number;
      result: unknown;
      confidenceScore: unknown;
      qgL1Pass: boolean;
      qgL2Pass: boolean;
      qgL3Pass: boolean;
      createdAt: Date;
    },
    symbol: string,
    stockName: string,
  ): AnalysisResult {
    // The `result` JSON column stores the full AnalysisResult
    const stored = dbRecord.result as Record<string, unknown>;

    // If the stored result already has the full structure, return it
    if (stored && stored.analysis && stored.symbol) {
      return stored as unknown as AnalysisResult;
    }

    // Fallback: reconstruct from DB fields
    return {
      symbol,
      stockName,
      analysis: (stored?.analysis as AnalysisResult['analysis']) ?? {
        primaryCause: '데이터 복원 실패',
        secondaryCauses: [],
        evidence: [],
        sentiment: 'neutral',
        timeHorizon: 'short-term',
        riskFactors: [],
      },
      confidenceScore: Math.round(Number(dbRecord.confidenceScore) * 100),
      category: (stored?.category as AnalysisResult['category']) ?? 'unknown',
      summary: (stored?.summary as string) ?? '',
      qualityGate: {
        l1Syntax: { passed: dbRecord.qgL1Pass, errors: [] },
        l2Semantic: { passed: dbRecord.qgL2Pass, inconsistencies: [] },
        l3Factual: { passed: dbRecord.qgL3Pass, mismatches: [] },
        overallPassed:
          dbRecord.qgL1Pass && dbRecord.qgL2Pass && dbRecord.qgL3Pass,
        retryCount: 0,
      },
      generatedAt: dbRecord.createdAt.toISOString(),
      modelUsed: (stored?.modelUsed as string) ?? 'unknown',
      aiGenerated: true,
      verificationStatus:
        (stored?.verificationStatus as AnalysisResult['verificationStatus']) ??
        (dbRecord.qgL1Pass && dbRecord.qgL2Pass && dbRecord.qgL3Pass
          ? 'verified'
          : 'failed'),
    };
  }
}
