import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Naver Search API response item */
interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

/** Naver Search API response envelope */
interface NaverSearchResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

/** Parsed news result */
export interface NaverNewsResult {
  title: string;
  url: string;
  summary: string;
  publishedAt: Date;
  source: string;
}

/**
 * NaverSearchService — Client for the Naver Search API (news endpoint).
 *
 * Naver Search API limits:
 * - 25,000 calls/day
 * - 100 items max per request
 * - Requires X-Naver-Client-Id and X-Naver-Client-Secret headers
 *
 * Reference: Step 5 research, step-8 §1.3
 */
@Injectable()
export class NaverSearchService {
  private readonly logger = new Logger(NaverSearchService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl = 'https://openapi.naver.com/v1/search/news.json';

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.get<string>('NAVER_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('NAVER_CLIENT_SECRET', '');
  }

  /**
   * Search news via Naver Search API.
   *
   * @param query - Search query (stock name or keyword)
   * @param display - Number of results (1-100, default 10)
   * @param start - Start position (1-1000, default 1)
   * @param sort - Sort order: 'date' or 'sim' (relevance)
   */
  async searchNews(
    query: string,
    display = 10,
    start = 1,
    sort: 'date' | 'sim' = 'date',
  ): Promise<NaverNewsResult[]> {
    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('Naver API credentials not configured');
      return [];
    }

    try {
      const params = new URLSearchParams({
        query,
        display: String(Math.min(display, 100)),
        start: String(Math.min(start, 1000)),
        sort,
      });

      const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret,
        },
      });

      if (!response.ok) {
        this.logger.error(`Naver API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as NaverSearchResponse;

      return data.items.map((item) => ({
        title: this.stripHtmlTags(item.title),
        url: item.originallink || item.link,
        summary: this.stripHtmlTags(item.description),
        publishedAt: new Date(item.pubDate),
        source: 'NAVER',
      }));
    } catch (error) {
      this.logger.error(
        `Naver news search failed for '${query}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }

  /** Remove HTML tags from Naver API response strings */
  private stripHtmlTags(str: string): string {
    return str.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
  }
}
