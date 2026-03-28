import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { buildPaginationMeta } from '../../common/interfaces/pagination.interface';
import type { ListNewsDto } from './dto/list-news.dto';

/** Shape of a news item with optional relevance score */
interface NewsItemResponse {
  id: number;
  title: string;
  url: string;
  source: string;
  summary: string | null;
  publishedAt: string;
  relevanceScore?: number;
}

/** Input for creating a new news article */
interface CreateNewsInput {
  title: string;
  url: string;
  source: string;
  summary?: string;
  content?: string;
  publishedAt: Date;
  stockIds?: Array<{ stockId: number; relevanceScore?: number }>;
}

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List news articles with optional filtering and pagination.
   */
  async findAll(query: ListNewsDto) {
    const { source, search, page, limit } = query;

    const where: Prisma.NewsWhereInput = {};

    if (source) {
      where.source = source;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } },
      ];
    }

    const [news, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          url: true,
          source: true,
          summary: true,
          publishedAt: true,
        },
      }),
      this.prisma.news.count({ where }),
    ]);

    const data: NewsItemResponse[] = news.map((n) => ({
      id: n.id,
      title: n.title,
      url: n.url,
      source: n.source,
      summary: n.summary,
      publishedAt: n.publishedAt.toISOString(),
    }));

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /**
   * Get news articles related to a specific stock symbol.
   * Joins through the news_stocks pivot table and filters by relevance.
   */
  async findByStock(symbol: string, query: ListNewsDto) {
    const { page, limit, minRelevance } = query;

    // Verify stock exists
    const stock = await this.prisma.stock.findUnique({
      where: { symbol },
      select: { id: true },
    });

    if (!stock) {
      throw new NotFoundException({
        error: 'STOCK_NOT_FOUND',
        message: `Stock with symbol '${symbol}' not found.`,
      });
    }

    const where: Prisma.NewsStockWhereInput = {
      stockId: stock.id,
      relevanceScore: { gte: minRelevance },
    };

    const [newsStocks, total] = await Promise.all([
      this.prisma.newsStock.findMany({
        where,
        orderBy: [
          { news: { publishedAt: 'desc' } },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          news: {
            select: {
              id: true,
              title: true,
              url: true,
              source: true,
              summary: true,
              publishedAt: true,
            },
          },
        },
      }),
      this.prisma.newsStock.count({ where }),
    ]);

    const data: NewsItemResponse[] = newsStocks.map((ns) => ({
      id: ns.news.id,
      title: ns.news.title,
      url: ns.news.url,
      source: ns.news.source,
      summary: ns.news.summary,
      publishedAt: ns.news.publishedAt.toISOString(),
      relevanceScore: Number(ns.relevanceScore),
    }));

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /**
   * Create a news article with deduplication by URL.
   * If the URL already exists, returns the existing record.
   */
  async createNews(input: CreateNewsInput) {
    // Dedup check by URL
    const existing = await this.prisma.news.findUnique({
      where: { url: input.url },
    });

    if (existing) {
      this.logger.debug(`News already exists: ${input.url}`);
      return existing;
    }

    const news = await this.prisma.news.create({
      data: {
        title: input.title,
        url: input.url,
        source: input.source,
        summary: input.summary ?? null,
        content: input.content ?? null,
        publishedAt: input.publishedAt,
        newsStocks: input.stockIds
          ? {
              create: input.stockIds.map((si) => ({
                stockId: si.stockId,
                relevanceScore: si.relevanceScore ?? 0,
              })),
            }
          : undefined,
      },
      include: { newsStocks: true },
    });

    this.logger.log(`News created: ${news.title} (id=${news.id})`);
    return news;
  }

  /**
   * Compute a keyword-based relevance score between a news article and a stock.
   * Searches for the stock's name and symbol in the news title, summary, and content.
   */
  async scoreRelevance(newsId: number, stockId: number): Promise<number> {
    const [news, stock] = await Promise.all([
      this.prisma.news.findUnique({
        where: { id: newsId },
        select: { title: true, summary: true, content: true },
      }),
      this.prisma.stock.findUnique({
        where: { id: stockId },
        select: { symbol: true, name: true },
      }),
    ]);

    if (!news || !stock) return 0;

    const searchText = [news.title, news.summary, news.content]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    let score = 0;

    // Symbol match (weighted higher in title)
    if (news.title.includes(stock.symbol)) score += 0.3;
    else if (searchText.includes(stock.symbol.toLowerCase())) score += 0.15;

    // Name match (weighted higher in title)
    if (news.title.includes(stock.name)) score += 0.4;
    else if (searchText.includes(stock.name.toLowerCase())) score += 0.2;

    // Content length bonus (longer content with matches = more relevant)
    if (score > 0 && news.content && news.content.length > 500) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }
}
