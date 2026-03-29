import { Injectable, Logger } from '@nestjs/common';

/** Parsed RSS feed item */
export interface RssFeedItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: Date;
  source: string;
}

/** RSS feed source configuration */
interface RssFeedSource {
  name: string;
  url: string;
  sourceTag: string;
}

/**
 * RssFeedService — Parse RSS feeds from Korean financial news sources.
 *
 * Primary news source (Naver API 대체). API 키 불필요, 무료, 호출 제한 없음.
 * 검증된 RSS 피드 URL 기반 (2026-03-29 확인).
 */
@Injectable()
export class RssFeedService {
  private readonly logger = new Logger(RssFeedService.name);

  /** Configured Korean financial news RSS feeds (verified 2026-03-29) */
  private readonly feeds: RssFeedSource[] = [
    // 한국경제 (주식 + 경제)
    { name: '한국경제 주식', url: 'http://rss.hankyung.com/stock.xml', sourceTag: 'RSS_HANKYUNG_STOCK' },
    { name: '한국경제 경제', url: 'http://rss.hankyung.com/economy.xml', sourceTag: 'RSS_HANKYUNG_ECON' },
    // 매일경제 (증권 + 헤드라인 + 경제)
    { name: '매일경제 증권', url: 'http://file.mk.co.kr/news/rss/rss_50200011.xml', sourceTag: 'RSS_MK_STOCK' },
    { name: '매일경제 헤드라인', url: 'http://file.mk.co.kr/news/rss/rss_30000001.xml', sourceTag: 'RSS_MK_HEAD' },
    { name: '매일경제 경제', url: 'http://file.mk.co.kr/news/rss/rss_30100041.xml', sourceTag: 'RSS_MK_ECON' },
    // 파이낸셜뉴스 (주식 + 금융)
    { name: '파이낸셜뉴스 주식', url: 'http://www.fnnews.com/rss/fn_realnews_stock.xml', sourceTag: 'RSS_FN_STOCK' },
    { name: '파이낸셜뉴스 금융', url: 'http://www.fnnews.com/rss/fn_realnews_finance.xml', sourceTag: 'RSS_FN_FINANCE' },
    // 헤럴드경제 (증권)
    { name: '헤럴드경제 증권', url: 'http://biz.heraldm.com/rss/010106000000.xml', sourceTag: 'RSS_HERALD_STOCK' },
    // 연합뉴스 경제
    { name: '연합뉴스 경제', url: 'https://www.yna.co.kr/rss/economy.xml', sourceTag: 'RSS_YONHAP' },
    // 머니투데이 주식
    { name: '머니투데이 주식', url: 'https://rss.mt.co.kr/mt_stock.xml', sourceTag: 'RSS_MONEYTODAY' },
    // 이투데이 경제
    { name: '이투데이 경제', url: 'https://www.etoday.co.kr/rss/economy.xml', sourceTag: 'RSS_ETODAY' },
  ];

  /**
   * Fetch and parse all configured RSS feeds concurrently.
   * Errors on individual feeds are caught and logged; other feeds continue.
   */
  async fetchFeeds(): Promise<RssFeedItem[]> {
    const results = await Promise.allSettled(
      this.feeds.map((feed) => this.fetchSingleFeed(feed)),
    );

    const allItems: RssFeedItem[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    }

    this.logger.log(`RSS feeds fetched: ${allItems.length} total items from ${this.feeds.length} sources`);
    return allItems;
  }

  /**
   * Fetch and parse a single RSS feed.
   * Uses a simple XML parser that extracts <item> elements.
   */
  private async fetchSingleFeed(feed: RssFeedSource): Promise<RssFeedItem[]> {
    try {
      const response = await fetch(feed.url, {
        headers: { 'User-Agent': 'StockDashboard/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`RSS fetch failed for ${feed.name}: ${response.status}`);
        return [];
      }

      const xml = await response.text();
      return this.parseRssXml(xml, feed.sourceTag);
    } catch (error) {
      this.logger.warn(
        `RSS fetch error for ${feed.name}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      return [];
    }
  }

  /**
   * Simple RSS XML parser.
   * Extracts <item> elements and their <title>, <link>, <description>, <pubDate> children.
   *
   * NOTE: For production, consider using a proper XML parser (fast-xml-parser).
   * This implementation uses regex-based extraction for simplicity.
   */
  private parseRssXml(xml: string, sourceTag: string): RssFeedItem[] {
    const items: RssFeedItem[] = [];
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g);

    if (!itemMatches) return items;

    for (const itemXml of itemMatches) {
      const title = this.extractXmlTag(itemXml, 'title');
      const link = this.extractXmlTag(itemXml, 'link');
      const description = this.extractXmlTag(itemXml, 'description');
      const pubDate = this.extractXmlTag(itemXml, 'pubDate');

      if (title && link) {
        items.push({
          title: this.cleanText(title),
          url: link.trim(),
          summary: description ? this.cleanText(description) : '',
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          source: sourceTag,
        });
      }
    }

    return items;
  }

  /** Extract the content of an XML tag */
  private extractXmlTag(xml: string, tag: string): string | null {
    // Handle CDATA sections
    const cdataPattern = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
    const cdataMatch = xml.match(cdataPattern);
    if (cdataMatch) return cdataMatch[1];

    // Handle regular content
    const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const match = xml.match(pattern);
    return match ? match[1] : null;
  }

  /** Clean HTML entities and tags from text */
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
