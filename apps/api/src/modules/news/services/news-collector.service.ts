import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/database/prisma.service';
import { NaverSearchService } from './naver-search.service';
import { RssFeedService } from './rss-feed.service';
import { DartApiService } from './dart-api.service';
import { NewsService } from '../news.service';

/**
 * NewsCollectorService — Orchestrates news collection from all sources.
 *
 * Runs on a cron schedule (every 30 minutes during market hours).
 * Collects from:
 *   1. Naver Search API (stock-specific news queries)
 *   2. RSS feeds (9 Korean financial news sources)
 *   3. DART disclosures (for watched stocks)
 *
 * Deduplication is handled by NewsService.createNews() (URL-based).
 */
@Injectable()
export class NewsCollectorService {
  private readonly logger = new Logger(NewsCollectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly naverSearch: NaverSearchService,
    private readonly rssFeed: RssFeedService,
    private readonly dartApi: DartApiService,
    private readonly newsService: NewsService,
  ) {}

  /**
   * Collect news from all sources.
   * Runs every 30 minutes. During non-market hours, it's a no-op check
   * but still collects to catch after-hours news.
   */
  @Cron('0 */30 * * * *')
  async collectAll(): Promise<{
    naverCount: number;
    rssCount: number;
    dartCount: number;
    totalNew: number;
  }> {
    this.logger.log('Starting news collection cycle');

    const results = await Promise.allSettled([
      this.collectFromNaver(),
      this.collectFromRss(),
      this.collectFromDart(),
    ]);

    const naverCount = results[0].status === 'fulfilled' ? results[0].value : 0;
    const rssCount = results[1].status === 'fulfilled' ? results[1].value : 0;
    const dartCount = results[2].status === 'fulfilled' ? results[2].value : 0;
    const totalNew = naverCount + rssCount + dartCount;

    this.logger.log(
      `News collection complete: Naver=${naverCount}, RSS=${rssCount}, DART=${dartCount}, total new=${totalNew}`,
    );

    return { naverCount, rssCount, dartCount, totalNew };
  }

  /**
   * Collect news from Naver Search API for active stocks in watchlists.
   * OPTIONAL: Only runs if NAVER_CLIENT_ID is configured in .env.
   * MVP에서는 RSS 피드만으로 충분하므로 Naver API 없이도 동작합니다.
   */
  private async collectFromNaver(): Promise<number> {
    const naverClientId = process.env.NAVER_CLIENT_ID;
    if (!naverClientId) {
      this.logger.debug('Naver API not configured, skipping (RSS feeds are primary source)');
      return 0;
    }

    let newCount = 0;

    try {
      const watchedStocks = await this.prisma.stock.findMany({
        where: {
          isActive: true,
          watchlistItems: { some: {} },
        },
        select: { id: true, symbol: true, name: true },
        take: 50,
      });

      for (const stock of watchedStocks) {
        const results = await this.naverSearch.searchNews(stock.name, 5, 1, 'date');

        for (const result of results) {
          const existing = await this.prisma.news.findUnique({
            where: { url: result.url },
          });

          if (!existing) {
            const relevanceScore = this.calculateRelevance(result.title, result.summary, stock.name, stock.symbol);

            await this.newsService.createNews({
              title: result.title,
              url: result.url,
              source: 'NAVER',
              summary: result.summary,
              publishedAt: result.publishedAt,
              stockIds: [{ stockId: stock.id, relevanceScore }],
            });
            newCount++;
          }
        }

        await this.sleep(200);
      }
    } catch (error) {
      this.logger.error(
        `Naver collection failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }

    return newCount;
  }

  /**
   * Collect news from all configured RSS feeds.
   */
  private async collectFromRss(): Promise<number> {
    let newCount = 0;

    try {
      const feedItems = await this.rssFeed.fetchFeeds();

      for (const item of feedItems) {
        const existing = await this.prisma.news.findUnique({
          where: { url: item.url },
        });

        if (!existing) {
          await this.newsService.createNews({
            title: item.title,
            url: item.url,
            source: item.source,
            summary: item.summary,
            publishedAt: item.publishedAt,
          });
          newCount++;
        }
      }
    } catch (error) {
      this.logger.error(
        `RSS collection failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }

    return newCount;
  }

  /**
   * Collect DART disclosures for active stocks.
   */
  private async collectFromDart(): Promise<number> {
    let newCount = 0;

    try {
      // Get stocks that have DART corp codes (would need a mapping table in production)
      // For now, we skip DART collection if no API key is configured.
      const dartApiKey = process.env.DART_API_KEY;
      if (!dartApiKey) {
        this.logger.debug('DART API key not configured, skipping');
        return 0;
      }

      // In production, iterate over stocks with known corp codes
      // and collect recent disclosures.
      this.logger.debug('DART collection would run here with configured corp codes');
    } catch (error) {
      this.logger.error(
        `DART collection failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }

    return newCount;
  }

  /**
   * Simple keyword-based relevance scoring.
   */
  private calculateRelevance(
    title: string,
    summary: string,
    stockName: string,
    stockSymbol: string,
  ): number {
    const text = `${title} ${summary}`.toLowerCase();
    let score = 0;

    if (title.includes(stockName)) score += 0.4;
    else if (text.includes(stockName.toLowerCase())) score += 0.2;

    if (title.includes(stockSymbol)) score += 0.3;
    else if (text.includes(stockSymbol.toLowerCase())) score += 0.15;

    if (score > 0 && text.length > 200) score += 0.1;

    return Math.min(score, 1.0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
