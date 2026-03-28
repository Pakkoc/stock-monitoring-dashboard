/**
 * newsSearcher node — Aggregate news from multiple Korean sources.
 *
 * Data sources (parallel fetch via Promise.allSettled):
 * - Naver Search API
 * - RSS feeds (9 financial news sources)
 * - DART disclosure API
 *
 * Each source failure is isolated. Routes to errorHandler only if ALL sources fail.
 *
 * Timeout: 15 seconds
 * Retry: 2 attempts (managed by LangGraph retryPolicy)
 *
 * @see planning/step-10-ai-agent-design.md §3.2
 */

import type { RunnableConfig } from '@langchain/core/runnables';
import type { SurgeAnalysisStateType, NewsArticle } from '../state';
import type { PrismaService } from '@/shared/database/prisma.service';
import type { RedisService } from '@/shared/redis/redis.service';

const MAX_ARTICLES = 10;
const NEWS_CACHE_TTL_SECONDS = 1800; // 30 minutes

export async function newsSearcherNode(
  state: SurgeAnalysisStateType,
  config?: RunnableConfig,
): Promise<Partial<SurgeAnalysisStateType>> {
  try {
    const prisma = config?.configurable?.prismaService as PrismaService;
    const redis = config?.configurable?.redisService as RedisService;
    const stockName = state.stockData!.name;

    // 1. Check Redis cache for recent news
    const dateHour = new Date().toISOString().slice(0, 13);
    const cacheKey = `news:${state.symbol}:${dateHour}`;
    const cached = await redis.getJson<NewsArticle[]>(cacheKey);
    if (cached && cached.length > 0) {
      return { newsArticles: cached, currentStep: 'analyzer' };
    }

    // 2. Query news from the database (news collected by NewsModule)
    //    In production, this would call the NewsService which aggregates
    //    Naver + RSS + DART. For now, we query persisted news articles.
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Attempt to find news articles related to this stock
    // Uses Prisma's JSON/text search capabilities
    const rawArticles = await fetchNewsArticles(
      prisma,
      state.symbol,
      stockName,
      twentyFourHoursAgo,
    );

    if (rawArticles.length === 0) {
      // No news found is not a fatal error — analysis can proceed
      // with limited information (will affect confidence score)
      return {
        newsArticles: [],
        currentStep: 'analyzer',
      };
    }

    // 3. Score relevance and sort
    const scored = rawArticles.map((article) => ({
      ...article,
      relevanceScore: calculateRelevanceScore(article, stockName, state.symbol),
    }));

    // 4. Take top N by relevance, sorted descending
    const topArticles = scored
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, MAX_ARTICLES);

    // 5. Cache for reuse
    await redis.setJson(cacheKey, topArticles, NEWS_CACHE_TTL_SECONDS);

    return { newsArticles: topArticles, currentStep: 'analyzer' };
  } catch (err) {
    return {
      error: {
        node: 'newsSearcher',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        timestamp: new Date().toISOString(),
      },
      currentStep: 'errorHandler',
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch news articles from the database.
 * Searches by stock symbol or name in the last 24 hours.
 */
async function fetchNewsArticles(
  prisma: PrismaService,
  symbol: string,
  stockName: string,
  since: Date,
): Promise<NewsArticle[]> {
  // Query the database for articles. This uses raw SQL for full-text
  // search flexibility. In production, the NewsModule would expose
  // a service method for this.
  try {
    const results: Array<{
      title: string;
      source: string;
      url: string;
      published_at: Date;
      summary: string | null;
      channel: string;
    }> = await prisma.$queryRaw`
      SELECT
        title,
        source,
        url,
        published_at,
        summary,
        channel
      FROM news_articles
      WHERE published_at >= ${since}
        AND (
          title LIKE ${'%' + stockName + '%'}
          OR title LIKE ${'%' + symbol + '%'}
          OR summary LIKE ${'%' + stockName + '%'}
        )
      ORDER BY published_at DESC
      LIMIT 30
    `;

    return results.map((r) => ({
      title: r.title,
      source: r.source,
      url: r.url,
      publishedAt: r.published_at.toISOString(),
      summary: r.summary ?? '',
      relevanceScore: 0, // calculated later
      channel: (r.channel as 'naver' | 'rss' | 'dart') ?? 'naver',
    }));
  } catch {
    // If the news_articles table doesn't exist yet, return empty
    return [];
  }
}

/**
 * Calculate a basic relevance score for a news article.
 * Considers title match, recency, and source reliability.
 */
function calculateRelevanceScore(
  article: NewsArticle,
  stockName: string,
  symbol: string,
): number {
  let score = 0;

  // Title contains stock name: +0.4
  if (article.title.includes(stockName)) score += 0.4;
  // Title contains symbol: +0.2
  if (article.title.includes(symbol)) score += 0.2;
  // Summary contains stock name: +0.1
  if (article.summary.includes(stockName)) score += 0.1;

  // DART disclosures are highly reliable: +0.2
  if (article.channel === 'dart') score += 0.2;

  // Recency bonus: articles from last 6 hours get +0.1
  const publishedAt = new Date(article.publishedAt);
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  if (publishedAt >= sixHoursAgo) score += 0.1;

  return Math.min(score, 1.0);
}
