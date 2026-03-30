import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';

// ─── Types ──────────────────────────────────────────────────

interface RelatedNews {
  title: string;
  source: string;
  url: string;
  publishedAt: Date;
}

interface ThemeCoMovement {
  themeName: string;
  surgingCount: number;
  totalCount: number;
}

export interface SurgeCauseResult {
  symbol: string;
  changeRate: number;
  cause: string;
  category: 'news' | 'theme' | 'technical' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  newsTitle: string | null;
  newsUrl: string | null;
  themeName: string | null;
  analyzedAt: string;
}

// ─── Service ────────────────────────────────────────────────

/**
 * SurgeCauseService — Rule-based surge cause analysis (NO AI, cost 0).
 *
 * When a stock surges (5%+), determines WHY by:
 * 1. Matching recent news to the stock (keyword + news_stocks table)
 * 2. Checking if the stock's theme is surging (theme co-movement)
 * 3. Returning a one-line cause summary for inline display
 *
 * Results are cached in Redis for 30 minutes per symbol.
 */
@Injectable()
export class SurgeCauseService {
  private readonly logger = new Logger(SurgeCauseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Analyze surge cause for a stock. Returns a one-line cause summary.
   * Called when surge is detected in the data pipeline.
   */
  async analyzeSurgeCause(
    symbol: string,
    changeRate: number,
  ): Promise<SurgeCauseResult> {
    try {
      // 1. Check Redis cache first
      const cached = await this.redis.get(`surge:cause:${symbol}`);
      if (cached) {
        try {
          return JSON.parse(cached) as SurgeCauseResult;
        } catch {
          // Corrupted cache — fall through to analysis
        }
      }

      // 2. Find related news (last 24 hours)
      const relatedNews = await this.findRelatedNews(symbol);

      // 3. Check theme co-movement
      const themeInfo = await this.checkThemeCoMovement(symbol);

      // 4. Classify cause category
      const result = this.classifyCause(symbol, changeRate, relatedNews, themeInfo);

      // 5. Cache for 30 minutes
      await this.redis.set(
        `surge:cause:${symbol}`,
        JSON.stringify(result),
        1800,
      );

      this.logger.log(
        `Surge cause analyzed: ${symbol} → ${result.category} (${result.confidence}): ${result.cause}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to analyze surge cause for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return a safe fallback
      return {
        symbol,
        changeRate,
        cause: '원인 분석 중...',
        category: 'unknown',
        confidence: 'low',
        newsTitle: null,
        newsUrl: null,
        themeName: null,
        analyzedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Get all cached surge causes. Used by the REST endpoint.
   * Scans Redis for `surge:cause:*` keys and returns them.
   */
  async getAllSurgeCauses(): Promise<SurgeCauseResult[]> {
    try {
      const client = this.redis.getClient();
      const keys = await client.keys('surge:cause:*');

      if (keys.length === 0) return [];

      const values = await client.mget(...keys);
      const results: SurgeCauseResult[] = [];

      for (const value of values) {
        if (value) {
          try {
            results.push(JSON.parse(value) as SurgeCauseResult);
          } catch {
            // Skip corrupted entries
          }
        }
      }

      // Sort by analyzedAt descending (most recent first)
      results.sort(
        (a, b) =>
          new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
      );

      return results;
    } catch (error) {
      this.logger.error(
        `Failed to fetch all surge causes: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  // ─── Private: News Matching ──────────────────────────────

  /**
   * Find related news for a stock symbol.
   * Strategy:
   *   1. Look up news_stocks table for pre-linked news
   *   2. If none found, fallback to keyword search on news titles (last 24h)
   */
  private async findRelatedNews(symbol: string): Promise<RelatedNews[]> {
    const stock = await this.prisma.stock.findUnique({
      where: { symbol },
      select: { id: true, name: true },
    });

    if (!stock) return [];

    // Try news_stocks table first (pre-linked by collector)
    const newsStocks = await this.prisma.newsStock.findMany({
      where: { stockId: stock.id },
      include: {
        news: {
          select: {
            id: true,
            title: true,
            source: true,
            url: true,
            publishedAt: true,
          },
        },
      },
      orderBy: { news: { publishedAt: 'desc' } },
      take: 5,
    });

    // Filter to last 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const linkedNews = newsStocks
      .filter((ns) => ns.news.publishedAt >= cutoff)
      .map((ns) => ({
        title: ns.news.title,
        source: ns.news.source,
        url: ns.news.url,
        publishedAt: ns.news.publishedAt,
      }));

    if (linkedNews.length > 0) return linkedNews;

    // Fallback: keyword search on recent news titles
    const recentNews = await this.prisma.news.findMany({
      where: {
        title: { contains: stock.name },
        publishedAt: { gte: cutoff },
      },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: {
        title: true,
        source: true,
        url: true,
        publishedAt: true,
      },
    });

    return recentNews.map((n) => ({
      title: n.title,
      source: n.source,
      url: n.url,
      publishedAt: n.publishedAt,
    }));
  }

  // ─── Private: Theme Co-Movement ──────────────────────────

  /**
   * Check if the stock's theme peers are also surging.
   * Returns the first theme where 50%+ of members are surging (3%+).
   */
  private async checkThemeCoMovement(
    symbol: string,
  ): Promise<ThemeCoMovement | null> {
    const themeStocks = await this.prisma.themeStock.findMany({
      where: { stock: { symbol } },
      include: { theme: { select: { id: true, name: true } } },
    });

    if (themeStocks.length === 0) return null;

    for (const ts of themeStocks) {
      const themeMembers = await this.prisma.themeStock.findMany({
        where: { themeId: ts.theme.id },
        include: { stock: { select: { symbol: true } } },
      });

      let surgingCount = 0;
      let totalChecked = 0;

      for (const member of themeMembers) {
        // Skip the stock itself
        if (member.stock.symbol === symbol) continue;

        const cached = await this.redis.get(
          `stock:price:${member.stock.symbol}`,
        );
        if (cached) {
          try {
            const price = JSON.parse(cached);
            totalChecked++;
            if (Math.abs(price.changeRate) >= 3) surgingCount++;
          } catch {
            // Skip corrupted cache entries
          }
        }
      }

      // Require at least 2 other stocks checked, and 50%+ surging
      if (totalChecked >= 2 && surgingCount / totalChecked >= 0.5) {
        return {
          themeName: ts.theme.name,
          surgingCount,
          totalCount: totalChecked,
        };
      }
    }

    return null;
  }

  // ─── Private: Cause Classification ───────────────────────

  /**
   * Classify surge cause based on news content and theme co-movement.
   * Priority: News > Theme > Unknown (technical/supply-demand guess)
   */
  private classifyCause(
    symbol: string,
    changeRate: number,
    news: RelatedNews[],
    themeInfo: ThemeCoMovement | null,
  ): SurgeCauseResult {
    let cause = '원인 분석 중...';
    let category: SurgeCauseResult['category'] = 'unknown';
    let confidence: SurgeCauseResult['confidence'] = 'low';
    let newsTitle: string | null = null;
    let newsUrl: string | null = null;
    let themeName: string | null = null;

    // ── Check news first ──
    if (news.length > 0) {
      const topNews = news[0]!;
      const title = topNews.title;

      // Classify by keywords in the news title
      if (/실적|매출|영업이익|순이익|분기|흑자|적자/.test(title)) {
        cause = `실적: ${this.truncateTitle(title)}`;
      } else if (/인수|합병|MOU|계약|수주|납품/.test(title)) {
        cause = `계약/수주: ${this.truncateTitle(title)}`;
      } else if (/정부|정책|규제|보조금|법안|지원/.test(title)) {
        cause = `정책: ${this.truncateTitle(title)}`;
      } else if (/신약|임상|FDA|승인|특허/.test(title)) {
        cause = `바이오: ${this.truncateTitle(title)}`;
      } else if (/배당|자사주|무상/.test(title)) {
        cause = `주주환원: ${this.truncateTitle(title)}`;
      } else {
        cause = `뉴스: ${this.truncateTitle(title)}`;
      }

      category = 'news';
      confidence = news.length >= 2 ? 'high' : 'medium';
      newsTitle = topNews.title;
      newsUrl = topNews.url;
    }

    // ── Check theme co-movement ──
    if (themeInfo) {
      if (category === 'unknown') {
        cause = `${themeInfo.themeName} 테마 ${themeInfo.surgingCount}종목 동반 상승`;
        category = 'theme';
        confidence = 'medium';
      } else {
        // Both news and theme — append theme info for higher confidence
        cause += ` (${themeInfo.themeName} 테마 동반)`;
        confidence = 'high';
      }
      themeName = themeInfo.themeName;
    }

    // ── Fallback: unknown ──
    if (category === 'unknown') {
      cause = '수급/기술적 요인 (추정)';
      confidence = 'low';
    }

    return {
      symbol,
      changeRate,
      cause,
      category,
      confidence,
      newsTitle,
      newsUrl,
      themeName,
      analyzedAt: new Date().toISOString(),
    };
  }

  /** Truncate a news title to ~40 chars for inline display */
  private truncateTitle(title: string): string {
    if (title.length <= 40) return title;
    return title.slice(0, 40) + '...';
  }
}
