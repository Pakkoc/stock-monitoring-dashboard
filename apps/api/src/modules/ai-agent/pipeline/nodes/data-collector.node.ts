/**
 * dataCollector node — Fetch current + historical stock data for the target symbol.
 *
 * Data sources:
 * - Redis cache (hit) → return cached StockData
 * - Prisma (miss) → query latest price + 20d avg volume, cache result
 *
 * Timeout: 10 seconds
 * Retry: 3 attempts, exponential backoff (managed by LangGraph retryPolicy)
 *
 * @see planning/step-10-ai-agent-design.md §3.1
 */

import type { RunnableConfig } from '@langchain/core/runnables';
import type { SurgeAnalysisStateType, StockData } from '../state';
import type { PrismaService } from '@/shared/database/prisma.service';
import type { RedisService } from '@/shared/redis/redis.service';

const CACHE_TTL_SECONDS = 5;

export async function dataCollectorNode(
  state: SurgeAnalysisStateType,
  config?: RunnableConfig,
): Promise<Partial<SurgeAnalysisStateType>> {
  try {
    const prisma = config?.configurable?.prismaService as PrismaService;
    const redis = config?.configurable?.redisService as RedisService;

    // 1. Check Redis cache first (TTL 5 seconds for real-time data)
    const cacheKey = `stock:detail:${state.symbol}`;
    const cached = await redis.getJson<StockData>(cacheKey);
    if (cached) {
      return { stockData: cached, currentStep: 'newsSearcher' };
    }

    // 2. Fetch stock master data from Prisma
    const stock = await prisma.stock.findUnique({
      where: { symbol: state.symbol },
    });

    if (!stock) {
      return {
        error: {
          node: 'dataCollector',
          message: `Stock not found: ${state.symbol}`,
          timestamp: new Date().toISOString(),
        },
        currentStep: 'errorHandler',
      };
    }

    // 3. Fetch the latest price record
    const latestPrice = await prisma.stockPrice.findFirst({
      where: { symbol: state.symbol },
      orderBy: { time: 'desc' },
    });

    if (!latestPrice) {
      return {
        error: {
          node: 'dataCollector',
          message: `No price data found for: ${state.symbol}`,
          timestamp: new Date().toISOString(),
        },
        currentStep: 'errorHandler',
      };
    }

    // 4. Calculate 20-day average volume from historical data
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 30); // fetch 30 days to ensure 20 trading days

    const historicalPrices = await prisma.stockPrice.findMany({
      where: {
        symbol: state.symbol,
        time: { gte: twentyDaysAgo },
      },
      orderBy: { time: 'desc' },
      take: 20,
      select: { volume: true },
    });

    const avgVolume20d =
      historicalPrices.length > 0
        ? historicalPrices.reduce(
            (sum, p) => sum + Number(p.volume),
            0,
          ) / historicalPrices.length
        : 0;

    const currentPrice = Number(latestPrice.close);
    const previousClose =
      Number(latestPrice.open) > 0
        ? Number(latestPrice.open)
        : currentPrice;
    const changeAmount = currentPrice - previousClose;
    const changePercent =
      previousClose > 0 ? (changeAmount / previousClose) * 100 : 0;
    const currentVolume = Number(latestPrice.volume);

    // 5. Build StockData object
    const stockData: StockData = {
      symbol: stock.symbol,
      name: stock.name,
      currentPrice,
      changePercent: latestPrice.changeRate
        ? Number(latestPrice.changeRate)
        : changePercent,
      changeAmount,
      volume: currentVolume,
      previousClose,
      avgVolume20d: Math.round(avgVolume20d),
      volumeRatio: avgVolume20d > 0 ? currentVolume / avgVolume20d : 0,
      high52w: currentPrice, // simplified — full impl would query 52w range
      low52w: currentPrice, // simplified
      marketCap: 0, // populated from KIS API in production
      market: (stock.market as 'KOSPI' | 'KOSDAQ') ?? 'KOSPI',
      fetchedAt: new Date().toISOString(),
    };

    // 6. Cache the result
    await redis.setJson(cacheKey, stockData, CACHE_TTL_SECONDS);

    return { stockData, currentStep: 'newsSearcher' };
  } catch (err) {
    return {
      error: {
        node: 'dataCollector',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        timestamp: new Date().toISOString(),
      },
      currentStep: 'errorHandler',
    };
  }
}
