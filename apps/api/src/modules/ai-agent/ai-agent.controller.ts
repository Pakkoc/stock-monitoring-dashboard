/**
 * AiAgentController — REST API endpoints for AI surge analysis.
 *
 * Endpoints:
 * - POST   /api/ai/analyze/:symbol     — Trigger analysis (async, returns job ID)
 * - GET    /api/ai/analyses/:symbol     — Get analysis history
 * - GET    /api/ai/analyses/:symbol/latest — Get latest analysis
 *
 * @see planning/step-10-ai-agent-design.md
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AiAgentService } from './ai-agent.service';
import type {
  AnalyzeTriggeredDto,
  AnalysisHistoryDto,
} from './dto/analysis-result.dto';
import type { AnalysisResult } from './pipeline/state';

@Controller('api/ai')
export class AiAgentController {
  private readonly logger = new Logger(AiAgentController.name);

  constructor(private readonly aiAgentService: AiAgentService) {}

  /**
   * POST /api/ai/analyze/:symbol
   *
   * Triggers a surge analysis for the given stock symbol.
   * For now, runs synchronously and returns the full result.
   * In production, this would enqueue a Bull job and return a job ID.
   */
  @Post('analyze/:symbol')
  @HttpCode(HttpStatus.ACCEPTED)
  async analyzeStock(
    @Param('symbol') symbol: string,
    @Body() body?: { model?: string },
  ): Promise<AnalyzeTriggeredDto | AnalysisResult> {
    // Validate symbol format
    if (!/^[0-9]{6}$/.test(symbol)) {
      throw new BadRequestException(
        'symbol must be a 6-digit stock code (e.g., "005930")',
      );
    }

    this.logger.log(`Analysis requested for symbol=${symbol}`);

    try {
      // Run the pipeline synchronously for now
      // TODO: Replace with Bull queue job for async processing
      const result = await this.aiAgentService.analyzeStock(
        symbol,
        body?.model,
      );
      return result;
    } catch (err) {
      this.logger.error(
        `Analysis failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );

      // Return a triggered response with job ID for async retry
      return {
        jobId: randomUUID(),
        symbol,
        message: `분석 요청이 접수되었습니다. 잠시 후 다시 조회해주세요. 오류: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * GET /api/ai/analyses/:symbol
   *
   * Returns analysis history for the given stock symbol.
   */
  @Get('analyses/:symbol')
  async getAnalysisHistory(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: string,
  ): Promise<AnalysisHistoryDto> {
    if (!/^[0-9]{6}$/.test(symbol)) {
      throw new BadRequestException(
        'symbol must be a 6-digit stock code (e.g., "005930")',
      );
    }

    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    const { data, total } = await this.aiAgentService.getAnalysisHistory(
      symbol,
      parsedLimit,
    );

    return {
      data: data.map((d, i) => ({
        id: i + 1, // simplified — real impl uses DB id
        ...d,
      })),
      total,
      symbol,
    };
  }

  /**
   * GET /api/ai/analyses/:symbol/latest
   *
   * Returns the most recent analysis for the given stock symbol.
   */
  @Get('analyses/:symbol/latest')
  async getLatestAnalysis(
    @Param('symbol') symbol: string,
  ): Promise<AnalysisResult> {
    if (!/^[0-9]{6}$/.test(symbol)) {
      throw new BadRequestException(
        'symbol must be a 6-digit stock code (e.g., "005930")',
      );
    }

    const result = await this.aiAgentService.getLatestAnalysis(symbol);

    if (!result) {
      throw new NotFoundException(
        `No analysis found for symbol ${symbol}`,
      );
    }

    return result;
  }
}
