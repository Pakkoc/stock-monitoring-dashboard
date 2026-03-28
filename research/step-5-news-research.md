# Step 5: News Data Sources & Integration Research

> **Agent**: `@news-researcher`
> **Date**: 2026-03-27
> **Status**: Complete
> **Trace**: `[trace:step-5:news-research]`

---

## Table of Contents

1. [Naver Search API](#1-naver-search-api)
2. [RSS Feed Sources](#2-rss-feed-sources)
3. [DART API (전자공시시스템)](#3-dart-api-전자공시시스템)
4. [News-Stock Relevance Scoring](#4-news-stock-relevance-scoring)
5. [News Deduplication](#5-news-deduplication)
6. [News Summarization via LangChain](#6-news-summarization-via-langchain)
7. [Storage Strategy](#7-storage-strategy)
8. [Legal Compliance Checklist](#8-legal-compliance-checklist)
9. [Architecture Recommendations](#9-architecture-recommendations)
10. [Pre-mortem & Risk Analysis](#10-pre-mortem--risk-analysis)

---

## 1. Naver Search API

### 1.1 Overview

Naver Search API is the primary programmatic gateway for retrieving Korean-language news articles. It provides structured access to Naver's news index, which aggregates content from hundreds of Korean media outlets. For a Korean stock monitoring dashboard, this is the highest-volume, most comprehensive single source of stock-related news.

**Base URL**: `https://openapi.naver.com/v1/search/news`
**HTTP Method**: GET
**Response Encoding**: UTF-8
**Response Formats**: JSON, XML (JSON recommended)

### 1.2 Authentication

Authentication uses a Client ID / Client Secret pair obtained through the [Naver Developers](https://developers.naver.com) portal. No OAuth flow is required; credentials are passed as HTTP headers on every request.

| Header | Description |
|--------|-------------|
| `X-Naver-Client-Id` | Application Client ID (issued on registration) |
| `X-Naver-Client-Secret` | Application Client Secret (issued on registration) |

**Registration Process**:
1. Create a Naver Developer account at `https://developers.naver.com`
2. Navigate to "Application Registration" (애플리케이션 등록)
3. Select "Search" (검색) as the API type
4. Register the application name and usage environment (Web/Android/iOS)
5. Client ID and Client Secret are generated immediately

### 1.3 Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | URL-encoded search query (e.g., `삼성전자 주가`) |
| `display` | int | No | 10 | Number of results per request (max: 100) |
| `start` | int | No | 1 | Start position for pagination (max: 1000) |
| `sort` | string | No | `date` | `date` (newest first) or `sim` (relevance) |

**Pagination Constraint**: The `start` parameter caps at 1000, meaning a maximum of 1000 articles can be retrieved per query string. To access broader coverage, use varied query patterns (see Section 1.5).

### 1.4 Response Format

```json
{
  "lastBuildDate": "Mon, 27 Mar 2026 10:00:00 +0900",
  "total": 54231,
  "start": 1,
  "display": 10,
  "items": [
    {
      "title": "<b>삼성전자</b> 주가 3% 급등... 반도체 수출 호조",
      "originallink": "https://www.mk.co.kr/news/stock/2026/0300001",
      "link": "https://n.news.naver.com/article/009/0005300001",
      "description": "<b>삼성전자</b>가 반도체 수출 호조에 힘입어 주가가 3% 이상 급등했다...",
      "pubDate": "Mon, 27 Mar 2026 09:30:00 +0900"
    }
  ]
}
```

**Field Notes**:
- `title` and `description` contain HTML bold tags (`<b>`) around matched keywords. These must be stripped during ingestion.
- `originallink` points to the publisher's domain; `link` points to Naver's cached copy.
- `pubDate` follows RFC 2822 format.
- `total` reflects the approximate total matches; not all are accessible via pagination.

### 1.5 Query Patterns for Stock-Specific News

For a stock monitoring dashboard, query construction is critical for relevance. Recommended patterns:

```typescript
// Query generation strategies for stock news
const queryPatterns = {
  // Pattern 1: Stock name + price keyword
  priceNews: (stockName: string) => `${stockName} 주가`,

  // Pattern 2: Stock name + performance keyword
  performanceNews: (stockName: string) => `${stockName} 실적`,

  // Pattern 3: Stock name + disclosure keyword (for earnings, filings)
  disclosureNews: (stockName: string) => `${stockName} 공시`,

  // Pattern 4: Stock name + sector keyword
  sectorNews: (stockName: string, sector: string) => `${stockName} ${sector}`,

  // Pattern 5: Stock name + analyst keyword
  analystNews: (stockName: string) => `${stockName} 목표가`,

  // Pattern 6: Ticker code (less common in Korean news but useful)
  tickerNews: (ticker: string) => `${ticker} 주식`,
};
```

**Query Scheduling Strategy**:
- Primary stocks (watchlist): query every 5 minutes during market hours (09:00-15:30 KST)
- Secondary stocks (portfolio): query every 15 minutes
- Background scan (market indices): query every 30 minutes

### 1.6 Rate Limits

| Metric | Limit |
|--------|-------|
| Daily API calls | 25,000 per application |
| Results per call | Max 100 (`display=100`) |
| Pagination depth | Max 1000 (`start` parameter ceiling) |
| Concurrent requests | Not officially documented; recommend max 5 concurrent |

**Daily Budget Calculation**:
- 25,000 calls/day with `display=100` = 2,500,000 article metadata/day theoretical maximum
- Practical estimate: monitoring 50 stocks with 5 query patterns each = 250 unique queries
- At 6 queries/hour for 7 market hours = 10,500 calls/day (42% of daily budget)
- Remaining budget: 14,500 calls for off-hours scanning and on-demand queries

### 1.7 Node.js Integration Code

```typescript
// src/modules/news/services/naver-news.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

interface NaverNewsResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

@Injectable()
export class NaverNewsService {
  private readonly logger = new Logger(NaverNewsService.name);
  private readonly baseUrl = 'https://openapi.naver.com/v1/search/news.json';
  private dailyCallCount = 0;
  private readonly DAILY_LIMIT = 25_000;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async searchNews(
    query: string,
    options: { display?: number; start?: number; sort?: 'date' | 'sim' } = {},
  ): Promise<NaverNewsResponse> {
    if (this.dailyCallCount >= this.DAILY_LIMIT) {
      this.logger.warn('Naver API daily limit reached');
      throw new Error('NAVER_API_DAILY_LIMIT_EXCEEDED');
    }

    const params = new URLSearchParams({
      query,
      display: String(options.display ?? 100),
      start: String(options.start ?? 1),
      sort: options.sort ?? 'date',
    });

    const { data } = await firstValueFrom(
      this.httpService.get<NaverNewsResponse>(
        `${this.baseUrl}?${params.toString()}`,
        {
          headers: {
            'X-Naver-Client-Id': this.configService.getOrThrow('NAVER_CLIENT_ID'),
            'X-Naver-Client-Secret': this.configService.getOrThrow('NAVER_CLIENT_SECRET'),
          },
          timeout: 5000,
        },
      ),
    );

    this.dailyCallCount++;
    return data;
  }

  /**
   * Fetch all available pages for a query (up to start=1000 limit).
   * Returns deduplicated results.
   */
  async fetchAllPages(query: string, maxPages = 10): Promise<NaverNewsItem[]> {
    const allItems: NaverNewsItem[] = [];
    const seenUrls = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      const start = page * 100 + 1;
      if (start > 1000) break;

      const response = await this.searchNews(query, { display: 100, start });

      for (const item of response.items) {
        const normalizedUrl = this.normalizeUrl(item.originallink);
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          allItems.push({
            ...item,
            title: this.stripHtml(item.title),
            description: this.stripHtml(item.description),
          });
        }
      }

      if (response.items.length < 100) break; // No more results

      // Rate limiting: 200ms delay between consecutive calls
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return allItems;
  }

  private stripHtml(text: string): string {
    return text.replace(/<\/?b>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete('utm_source');
      parsed.searchParams.delete('utm_medium');
      parsed.searchParams.delete('utm_campaign');
      return parsed.toString().replace(/\/+$/, '');
    } catch {
      return url;
    }
  }

  /** Reset daily counter — should be called by a cron job at midnight KST */
  resetDailyCount(): void {
    this.dailyCallCount = 0;
  }
}
```

---

## 2. RSS Feed Sources

### 2.1 Overview

RSS feeds provide a complementary, push-based news ingestion channel. Unlike the Naver API (which requires active polling with specific queries), RSS feeds deliver a continuous stream of all articles published by a source, enabling broader coverage and lower API dependency. RSS feeds are also free and typically have no rate limits, though they carry fewer metadata fields than API responses.

### 2.2 Korean Financial News RSS Feeds

#### 한국경제 (Hankyung / Korea Economic Daily)

| Category | RSS URL | Update Frequency |
|----------|---------|------------------|
| All News (전체뉴스) | `https://www.hankyung.com/feed/all-news` | ~5 min |
| Securities (증권) | `https://www.hankyung.com/feed/finance` | ~5 min |
| Economy (경제) | `https://www.hankyung.com/feed/economy` | ~10 min |
| IT | `https://www.hankyung.com/feed/it` | ~15 min |
| International (국제) | `https://www.hankyung.com/feed/international` | ~15 min |

**Legacy URLs** (still functional):
- `http://rss.hankyung.com/stock.xml` (stock-specific)
- `http://rss.hankyung.com/economy.xml` (economy-specific)

#### 매일경제 (Maeil Business Newspaper)

| Category | RSS URL | Update Frequency |
|----------|---------|------------------|
| Headlines (주요뉴스) | `http://file.mk.co.kr/news/rss/rss_30000001.xml` | ~5 min |
| Economy (경제) | `http://file.mk.co.kr/news/rss/rss_30100041.xml` | ~10 min |
| Stock (증권) | `http://file.mk.co.kr/news/rss/rss_50200011.xml` | ~5 min |
| Real Estate (부동산) | `http://file.mk.co.kr/news/rss/rss_50300009.xml` | ~15 min |

#### 조선비즈 (Chosun Biz)

| Category | RSS URL | Update Frequency |
|----------|---------|------------------|
| All Articles | `http://biz.chosun.com/site/data/rss/rss.xml` | ~10 min |
| Market (마켓) | `http://biz.chosun.com/site/data/rss/market.xml` | ~10 min |
| Policy & Finance | `http://biz.chosun.com/site/data/rss/policybank.xml` | ~15 min |

#### 이데일리 (eDaily)

| Category | RSS URL | Update Frequency |
|----------|---------|------------------|
| Main Feed | `http://rss.edaily.co.kr/edaily_news.xml` | ~5 min |
| Stock/Securities | `http://rss.edaily.co.kr/edaily_stock.xml` | ~5 min |

#### 파이낸셜뉴스 (Financial News)

| Category | RSS URL | Update Frequency |
|----------|---------|------------------|
| All (Real-time) | `http://www.fnnews.com/rss/fn_realnews_all.xml` | ~3 min |
| Stock | `http://www.fnnews.com/rss/fn_realnews_stock.xml` | ~5 min |
| Finance | `http://www.fnnews.com/rss/fn_realnews_finance.xml` | ~10 min |
| Industry | `http://www.fnnews.com/rss/fn_realnews_industry.xml` | ~10 min |

#### International Sources (Korea Sections)

| Source | RSS URL | Update Frequency |
|--------|---------|------------------|
| Reuters (Asia) | `https://www.reutersagency.com/feed/?taxonomy=best-regions&post_type=best&best-regions=asia` | ~15 min |
| Bloomberg (Asia) | N/A (no public RSS; use Bloomberg Terminal API or scraping) | N/A |
| Investing.com (Korea) | `https://kr.investing.com/rss/news.rss` | ~10 min |

### 2.3 RSS Parsing Implementation

```typescript
// src/modules/news/services/rss-feed.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Parser from 'rss-parser';

interface RssFeedConfig {
  name: string;
  url: string;
  category: 'stock' | 'economy' | 'disclosure' | 'general';
  priority: number; // 1=highest
}

interface ParsedNewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: Date;
  source: string;
  category: string;
}

@Injectable()
export class RssFeedService {
  private readonly logger = new Logger(RssFeedService.name);
  private readonly parser = new Parser({
    timeout: 10000,
    headers: {
      'User-Agent': 'StockDashboard/1.0 (RSS Reader)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
    customFields: {
      item: [['dc:creator', 'creator']],
    },
  });

  private readonly feeds: RssFeedConfig[] = [
    // Stock-focused feeds (highest priority)
    { name: '한국경제 증권', url: 'https://www.hankyung.com/feed/finance', category: 'stock', priority: 1 },
    { name: '매일경제 증권', url: 'http://file.mk.co.kr/news/rss/rss_50200011.xml', category: 'stock', priority: 1 },
    { name: '파이낸셜뉴스 증권', url: 'http://www.fnnews.com/rss/fn_realnews_stock.xml', category: 'stock', priority: 1 },
    { name: '이데일리 증권', url: 'http://rss.edaily.co.kr/edaily_stock.xml', category: 'stock', priority: 1 },

    // Economy feeds (medium priority)
    { name: '한국경제 경제', url: 'https://www.hankyung.com/feed/economy', category: 'economy', priority: 2 },
    { name: '매일경제 경제', url: 'http://file.mk.co.kr/news/rss/rss_30100041.xml', category: 'economy', priority: 2 },
    { name: '조선비즈 마켓', url: 'http://biz.chosun.com/site/data/rss/market.xml', category: 'economy', priority: 2 },

    // General financial news (lower priority)
    { name: '파이낸셜뉴스 전체', url: 'http://www.fnnews.com/rss/fn_realnews_all.xml', category: 'general', priority: 3 },
    { name: '조선비즈 전체', url: 'http://biz.chosun.com/site/data/rss/rss.xml', category: 'general', priority: 3 },
  ];

  /**
   * Parse a single RSS feed and return normalized items.
   */
  async parseFeed(feedConfig: RssFeedConfig): Promise<ParsedNewsItem[]> {
    try {
      const feed = await this.parser.parseURL(feedConfig.url);

      return (feed.items || []).map((item) => ({
        title: item.title?.trim() ?? '',
        link: item.link?.trim() ?? '',
        description: (item.contentSnippet || item.content || '').trim(),
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        source: feedConfig.name,
        category: feedConfig.category,
      }));
    } catch (error) {
      this.logger.error(`Failed to parse RSS feed: ${feedConfig.name}`, error);
      return [];
    }
  }

  /**
   * Fetch all configured RSS feeds in parallel with error isolation.
   */
  async fetchAllFeeds(): Promise<ParsedNewsItem[]> {
    const results = await Promise.allSettled(
      this.feeds.map((feed) => this.parseFeed(feed)),
    );

    const allItems: ParsedNewsItem[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    }

    // Sort by publication date (newest first)
    allItems.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

    return allItems;
  }

  /**
   * Cron job: fetch RSS feeds every 5 minutes during market hours.
   * KST 09:00-16:00 (UTC 00:00-07:00) on weekdays.
   */
  @Cron('*/5 * 0-7 * * 1-5')
  async scheduledFetch(): Promise<void> {
    this.logger.log('Scheduled RSS feed fetch started');
    const items = await this.fetchAllFeeds();
    this.logger.log(`Fetched ${items.length} RSS items from ${this.feeds.length} feeds`);
    // Delegate to news ingestion pipeline (dedup + scoring + storage)
  }
}
```

### 2.4 RSS Feed Reliability Notes

- **Encoding**: All Korean feeds use UTF-8 or EUC-KR. The `rss-parser` library handles both natively.
- **Feed Staleness**: Some feeds may lag by 5-15 minutes behind the publisher's website. For time-critical stock news, Naver API (Section 1) is preferred.
- **Feed Downtime**: Individual RSS feeds occasionally go offline. The `Promise.allSettled` pattern ensures one feed failure does not block others.
- **Content Truncation**: RSS `description` fields often contain only the first 100-200 characters of the article. Full article text requires a separate fetch of `link`.

---

## 3. DART API (전자공시시스템)

### 3.1 Overview

DART (Data Analysis, Retrieval and Transfer System) is the official electronic disclosure system operated by Korea's Financial Supervisory Service (FSS). The Open DART API provides programmatic access to all corporate filings, making it essential for monitoring official company announcements that affect stock prices.

**Base URL**: `https://opendart.fss.or.kr/api/`
**Official Portal**: [https://opendart.fss.or.kr](https://opendart.fss.or.kr)
**Data Formats**: JSON (`.json` suffix) and XML (`.xml` suffix)
**HTTP Method**: GET
**Encoding**: UTF-8

### 3.2 Authentication & API Key

Authentication uses a single API key (`crtfc_key`) passed as a query parameter. There is no OAuth or token rotation required.

**API Key Registration Process**:
1. Visit `https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do`
2. Register with a valid Korean identity (individual or corporate)
3. Agree to the Terms of Service
4. Maximum of 2 API keys per entity
5. The 40-character authentication key is issued upon approval

### 3.3 Key Endpoints

#### 3.3.1 Disclosure Search (공시검색) — Primary Endpoint

**URL**: `https://opendart.fss.or.kr/api/list.json`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crtfc_key` | STRING(40) | Yes | API authentication key |
| `corp_code` | STRING(8) | No | Company unique identifier (8-digit) |
| `bgn_de` | STRING(8) | No | Start date (YYYYMMDD) |
| `end_de` | STRING(8) | No | End date (YYYYMMDD) |
| `last_reprt_at` | STRING(1) | No | Latest report only (`Y`/`N`) |
| `pblntf_ty` | STRING(1) | No | Disclosure type code (see below) |
| `pblntf_detail_ty` | STRING(4) | No | Detailed disclosure type |
| `corp_cls` | STRING(1) | No | Corp classification: `Y`(KOSPI), `K`(KOSDAQ), `N`(KONEX), `E`(etc.) |
| `sort` | STRING(4) | No | Sort field: `date`, `crp`, `rpt` |
| `sort_mth` | STRING(4) | No | Sort order: `asc`, `desc` |
| `page_no` | STRING(5) | No | Page number (default: 1) |
| `page_count` | STRING(3) | No | Results per page (max: 100, default: 10) |

**Disclosure Type Codes** (`pblntf_ty`):

| Code | Description |
|------|-------------|
| `A` | Regular reports (정기공시) — quarterly/annual earnings |
| `B` | Major reports (주요사항보고) — M&A, CEO change |
| `C` | Securities filings (발행공시) — new stock issuance |
| `D` | Disclosure events (지분공시) — major shareholder changes |
| `E` | Merger/split reports |
| `F` | Other major matters |
| `G` | External audit reports |
| `H` | Board of directors decisions |
| `I` | Corrected reports |
| `J` | Other |

**Response Fields**:

```json
{
  "status": "000",
  "message": "정상",
  "page_no": 1,
  "page_count": 10,
  "total_count": 1523,
  "total_page": 153,
  "list": [
    {
      "corp_code": "00126380",
      "corp_name": "삼성전자",
      "stock_code": "005930",
      "corp_cls": "Y",
      "report_nm": "분기보고서 (2026.03)",
      "rcept_no": "20260327000123",
      "flr_nm": "삼성전자",
      "rcept_dt": "20260327",
      "rm": ""
    }
  ]
}
```

**Status Codes**:

| Code | Meaning |
|------|---------|
| `000` | Success |
| `010` | Unregistered key |
| `011` | Expired key |
| `012` | Invalid key |
| `020` | Request limit exceeded |
| `021` | Too many company codes (max 100) |
| `100` | Field not found |
| `800` | IP not registered |
| `900` | Undefined error |

#### 3.3.2 Company Overview (기업개황)

**URL**: `https://opendart.fss.or.kr/api/company.json`

Returns company metadata: name, CEO, stock code, industry code, address, IR URL, etc. Useful for mapping `corp_code` to `stock_code` and enriching stock master data.

#### 3.3.3 Original Document File (공시서류원본파일)

**URL**: `https://opendart.fss.or.kr/api/document.xml`

Returns a ZIP file containing the original disclosure documents (HTML/XML). Useful for deep analysis but heavy on bandwidth.

#### 3.3.4 Unique Code List (고유번호)

**URL**: `https://opendart.fss.or.kr/api/corpCode.xml`

Returns a ZIP file containing an XML list of all registered companies with their `corp_code`, `corp_name`, `stock_code`, and `modify_date`. This should be cached locally and refreshed weekly.

### 3.4 Rate Limits

| Metric | Limit |
|--------|-------|
| Daily API calls | ~10,000 (inferred from error code 020 behavior; exact limit announced on portal) |
| Max results per page | 100 |
| Search period without corp_code | Limited to 3 months |
| Max company codes per request | 100 |
| API keys per entity | Maximum 2 |

**Important**: The exact daily limit is set by the Financial Supervisory Service and may change. Monitor the official portal for announcements.

### 3.5 Node.js Integration Code

```typescript
// src/modules/news/services/dart-disclosure.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface DartDisclosure {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  corp_cls: string;
  report_nm: string;
  rcept_no: string;
  flr_nm: string;
  rcept_dt: string;
  rm: string;
}

interface DartListResponse {
  status: string;
  message: string;
  page_no: number;
  page_count: number;
  total_count: number;
  total_page: number;
  list: DartDisclosure[];
}

@Injectable()
export class DartDisclosureService {
  private readonly logger = new Logger(DartDisclosureService.name);
  private readonly baseUrl = 'https://opendart.fss.or.kr/api';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Search disclosures for a specific company or date range.
   */
  async searchDisclosures(params: {
    corpCode?: string;
    startDate?: string; // YYYYMMDD
    endDate?: string;   // YYYYMMDD
    disclosureType?: string;
    corpClass?: 'Y' | 'K' | 'N' | 'E';
    pageNo?: number;
    pageCount?: number;
  }): Promise<DartListResponse> {
    const queryParams: Record<string, string> = {
      crtfc_key: this.configService.getOrThrow('DART_API_KEY'),
    };

    if (params.corpCode) queryParams.corp_code = params.corpCode;
    if (params.startDate) queryParams.bgn_de = params.startDate;
    if (params.endDate) queryParams.end_de = params.endDate;
    if (params.disclosureType) queryParams.pblntf_ty = params.disclosureType;
    if (params.corpClass) queryParams.corp_cls = params.corpClass;
    if (params.pageNo) queryParams.page_no = String(params.pageNo);
    if (params.pageCount) queryParams.page_count = String(params.pageCount ?? 100);

    queryParams.sort = 'date';
    queryParams.sort_mth = 'desc';

    const url = new URL(`${this.baseUrl}/list.json`);
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }

    const { data } = await firstValueFrom(
      this.httpService.get<DartListResponse>(url.toString(), { timeout: 10000 }),
    );

    if (data.status !== '000') {
      this.logger.error(`DART API error: ${data.status} - ${data.message}`);
      throw new Error(`DART_API_ERROR_${data.status}: ${data.message}`);
    }

    return data;
  }

  /**
   * Fetch today's disclosures for all KOSPI/KOSDAQ companies.
   * Used for real-time disclosure monitoring.
   */
  async fetchTodayDisclosures(): Promise<DartDisclosure[]> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const allDisclosures: DartDisclosure[] = [];
    let pageNo = 1;
    let totalPages = 1;

    do {
      const response = await this.searchDisclosures({
        startDate: today,
        endDate: today,
        pageNo,
        pageCount: 100,
      });

      allDisclosures.push(...response.list);
      totalPages = response.total_page;
      pageNo++;

      // Rate limiting: 500ms between pages
      await new Promise((resolve) => setTimeout(resolve, 500));
    } while (pageNo <= totalPages);

    return allDisclosures;
  }

  /**
   * Map a stock_code (6-digit ticker) to a DART corp_code (8-digit).
   * This mapping should be cached in the database.
   */
  async getCorpCode(stockCode: string): Promise<string | null> {
    // In production, this would query the locally cached corpCode.xml data
    // Updated weekly via a scheduled job
    // For now, delegate to company overview endpoint
    return null; // Implement with local cache lookup
  }
}
```

### 3.6 Real-time Disclosure Monitoring Strategy

DART does not provide WebSocket or push notifications. Real-time monitoring requires polling:

1. **Polling Interval**: Every 2 minutes during market hours (09:00-18:00 KST, filings continue after market close)
2. **Query Strategy**: Fetch today's disclosures sorted by date descending, compare `rcept_no` against last-seen value
3. **Alert Triggers**: New disclosures matching watchlist `corp_code` values trigger immediate notification
4. **Priority Classification**:
   - Type `A` (earnings) + Type `B` (major matters): HIGH priority
   - Type `C`/`D` (issuance/shareholding): MEDIUM priority
   - All others: LOW priority

---

## 4. News-Stock Relevance Scoring

### 4.1 Overview

Not all news articles are equally relevant to a specific stock. A relevance scoring system maps each article to zero or more stocks with a normalized score in [0, 1], enabling the dashboard to surface the most pertinent news for each security.

### 4.2 Multi-Layer Scoring Architecture

The recommended approach combines rule-based keyword matching (fast, deterministic) with optional NLP-based semantic scoring (accurate, resource-intensive).

#### Layer 1: Keyword Matching (Score Weight: 0.6)

```typescript
// src/modules/news/services/relevance-scorer.service.ts

interface StockMeta {
  stockCode: string;    // e.g., "005930"
  name: string;         // e.g., "삼성전자"
  shortName?: string;   // e.g., "삼전"
  englishName?: string; // e.g., "Samsung Electronics"
  sector: string;       // e.g., "반도체"
  aliases: string[];    // e.g., ["삼성전자주식회사", "Samsung"]
}

function keywordRelevanceScore(
  article: { title: string; description: string },
  stock: StockMeta,
): number {
  const titleLower = article.title.toLowerCase();
  const descLower = article.description.toLowerCase();

  let score = 0;

  // Exact name match in title: +0.4
  if (article.title.includes(stock.name)) {
    score += 0.4;
  }

  // Exact name match in description: +0.2
  if (article.description.includes(stock.name)) {
    score += 0.2;
  }

  // Stock code match (e.g., "005930"): +0.3 (strong signal)
  if (article.title.includes(stock.stockCode) || article.description.includes(stock.stockCode)) {
    score += 0.3;
  }

  // Short name or alias match in title: +0.2
  const allNames = [stock.shortName, stock.englishName, ...stock.aliases].filter(Boolean);
  for (const alias of allNames) {
    if (alias && titleLower.includes(alias.toLowerCase())) {
      score += 0.2;
      break; // Only count once
    }
  }

  // Sector keyword match: +0.1
  if (article.title.includes(stock.sector) || article.description.includes(stock.sector)) {
    score += 0.1;
  }

  return Math.min(score, 1.0); // Cap at 1.0
}
```

#### Layer 2: NLP-Based Semantic Scoring (Score Weight: 0.4)

For higher accuracy, especially for articles that mention a company indirectly (e.g., "반도체 업종 전반 하락" affecting 삼성전자 without naming it), an LLM-based relevance scorer can be employed:

```typescript
// src/modules/news/services/nlp-relevance.service.ts
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';

const RELEVANCE_PROMPT = PromptTemplate.fromTemplate(`
You are a Korean stock market analyst. Given a news article and a stock, rate the relevance on a scale of 0.0 to 1.0.

Stock: {stockName} ({stockCode}) - Sector: {sector}
Article Title: {title}
Article Description: {description}

Rating criteria:
- 1.0: Article directly discusses this specific company's stock price, earnings, or corporate actions
- 0.7-0.9: Article mentions this company as a major subject
- 0.4-0.6: Article discusses the sector or competitors that could indirectly affect this stock
- 0.1-0.3: Article has tangential relevance (macroeconomic, regulatory)
- 0.0: No relevance to this stock

Respond with ONLY a number between 0.0 and 1.0.
`);

async function nlpRelevanceScore(
  article: { title: string; description: string },
  stock: StockMeta,
  llm: ChatOpenAI,
): Promise<number> {
  const prompt = await RELEVANCE_PROMPT.format({
    stockName: stock.name,
    stockCode: stock.stockCode,
    sector: stock.sector,
    title: article.title,
    description: article.description,
  });

  const response = await llm.invoke(prompt);
  const score = parseFloat(response.content as string);

  return isNaN(score) ? 0 : Math.max(0, Math.min(1, score));
}
```

#### Combined Score

```typescript
function combinedRelevanceScore(
  keywordScore: number,
  nlpScore: number | null,
): number {
  if (nlpScore === null) {
    // NLP unavailable or skipped for efficiency — use keyword only
    return keywordScore;
  }
  // Weighted combination
  return keywordScore * 0.6 + nlpScore * 0.4;
}
```

### 4.3 Performance Optimization

- **Keyword scoring** runs on every article (sub-millisecond per article, no external calls)
- **NLP scoring** is expensive (~200ms per article + token cost). Apply only when:
  - Keyword score is in the ambiguous range [0.2, 0.7]
  - Article is from a high-priority source
  - Stock is on the user's active watchlist
- **Batch processing**: Group multiple articles for a single stock into one LLM call with structured output to reduce overhead

---

## 5. News Deduplication

### 5.1 The Deduplication Problem

Multiple sources often report the same story. A single Samsung Electronics earnings report may appear as:
- Naver API result from 매일경제
- RSS item from 한국경제
- RSS item from 파이낸셜뉴스
- DART filing notification

Without deduplication, the dashboard would show the same information 3-4 times, degrading user experience and inflating storage.

### 5.2 Three-Layer Deduplication Strategy

#### Layer 1: URL Normalization (Exact Dedup)

```typescript
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'fbclid', 'gclid', 'ref', 'source',
    ];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }

    // Normalize protocol
    parsed.protocol = 'https:';

    // Remove trailing slashes
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');

    // Sort remaining params for consistency
    parsed.searchParams.sort();

    // Remove www prefix
    parsed.hostname = parsed.hostname.replace(/^www\./, '');

    return parsed.toString();
  } catch {
    return url.toLowerCase().trim();
  }
}
```

**Effectiveness**: Catches ~60% of duplicates (same article from Naver link vs original link).

#### Layer 2: Title Similarity (Fuzzy Dedup)

Different outlets often rewrite headlines for the same press release. Jaccard similarity on character n-grams catches these:

```typescript
function generateNgrams(text: string, n: number = 2): Set<string> {
  const cleaned = text
    .replace(/[^\w가-힣]/g, '') // Keep only Korean and alphanumeric
    .toLowerCase();

  const ngrams = new Set<string>();
  for (let i = 0; i <= cleaned.length - n; i++) {
    ngrams.add(cleaned.slice(i, i + n));
  }
  return ngrams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function areDuplicates(
  titleA: string,
  titleB: string,
  threshold: number = 0.6,
): boolean {
  const ngramsA = generateNgrams(titleA, 2);
  const ngramsB = generateNgrams(titleB, 2);
  return jaccardSimilarity(ngramsA, ngramsB) >= threshold;
}
```

**Threshold tuning**:
- 0.6: Aggressive dedup (may merge related but distinct stories)
- 0.7: Balanced (recommended for production)
- 0.8: Conservative (only catches near-identical titles)

**Effectiveness**: Catches ~25% additional duplicates beyond URL normalization.

#### Layer 3: Cross-Source Time-Window Clustering

Articles about the same event tend to cluster within a short time window. For articles with similar titles (Jaccard > 0.5) published within 2 hours of each other, group them as a single "story cluster" and display only the highest-priority source.

```typescript
interface NewsCluster {
  primaryArticle: NewsArticle;    // Highest-priority source
  relatedArticles: NewsArticle[]; // Other articles in the cluster
  representativeTitle: string;
  earliestPubDate: Date;
}

function clusterArticles(
  articles: NewsArticle[],
  timeWindowMs: number = 2 * 60 * 60 * 1000, // 2 hours
  similarityThreshold: number = 0.5,
): NewsCluster[] {
  // Sort by date
  const sorted = [...articles].sort(
    (a, b) => a.pubDate.getTime() - b.pubDate.getTime(),
  );

  const clusters: NewsCluster[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (assigned.has(i)) continue;

    const cluster: NewsArticle[] = [sorted[i]];
    assigned.add(i);

    for (let j = i + 1; j < sorted.length; j++) {
      if (assigned.has(j)) continue;

      const timeDiff = Math.abs(
        sorted[j].pubDate.getTime() - sorted[i].pubDate.getTime(),
      );
      if (timeDiff > timeWindowMs) continue;

      if (areDuplicates(sorted[i].title, sorted[j].title, similarityThreshold)) {
        cluster.push(sorted[j]);
        assigned.add(j);
      }
    }

    // Select primary article (highest priority source)
    cluster.sort((a, b) => a.sourcePriority - b.sourcePriority);

    clusters.push({
      primaryArticle: cluster[0],
      relatedArticles: cluster.slice(1),
      representativeTitle: cluster[0].title,
      earliestPubDate: cluster[0].pubDate,
    });
  }

  return clusters;
}
```

### 5.3 Expected Dedup Performance

| Layer | Duplicates Caught | Cumulative Reduction |
|-------|-------------------|---------------------|
| URL Normalization | ~60% | 60% |
| Title Similarity | ~25% of remaining | 70% |
| Time-Window Clustering | ~10% of remaining | 73% |

For a typical inflow of 500 articles/hour across all sources, expect ~135 unique story clusters after deduplication.

---

## 6. News Summarization via LangChain

### 6.1 Overview

Raw news articles are too verbose for a dashboard widget. Each article should be condensed to a 1-2 sentence summary (max 200 tokens) that captures the key financial impact. LangChain.js provides the framework for prompt-based summarization with token control.

### 6.2 Summarization Approaches

LangChain supports three summarization strategies:

| Approach | Use Case | Pros | Cons |
|----------|----------|------|------|
| **Stuff** | Single short article | Simple, one LLM call | Fails on long articles |
| **Map-Reduce** | Long documents or batches | Scalable, parallelizable | Higher token cost, may lose context |
| **Refine** | Multi-document synthesis | Preserves context iteratively | Slow (sequential), expensive |

**Recommendation for news summarization**: Use **Stuff** for individual article summaries (news articles are typically under 2000 tokens), and **Map-Reduce** for generating "story cluster" summaries from multiple related articles.

### 6.3 Korean Financial News Summarization Prompt

```typescript
// src/modules/ai/prompts/news-summarizer.prompt.ts
import { ChatPromptTemplate } from '@langchain/core/prompts';

export const NEWS_SUMMARY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a Korean financial news summarizer for a stock monitoring dashboard.

Rules:
1. Summarize in Korean (한국어).
2. Maximum 2 sentences. Focus on: which company, what happened, and the financial impact.
3. Include specific numbers (price changes, percentages, amounts) if available.
4. Use present tense for current events, past tense for completed events.
5. Do NOT include opinions or analyst predictions unless that is the main subject.
6. If the article discusses multiple companies, focus on the one most relevant to the given stock code.

Output format: A single Korean paragraph, no bullet points, no line breaks.`,
  ],
  [
    'human',
    `Stock: {stockName} ({stockCode})
Article Title: {title}
Article Content: {content}

Summarize this article in 1-2 sentences in Korean:`,
  ],
]);

export const BATCH_SUMMARY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a Korean financial news summarizer. You will receive multiple article titles and descriptions for the same stock. Produce a single consolidated summary.

Rules:
1. Summarize in Korean (한국어), maximum 3 sentences.
2. Identify the common theme across articles.
3. Highlight the most impactful news item.
4. Include specific numbers if available.
5. Output a single Korean paragraph.`,
  ],
  [
    'human',
    `Stock: {stockName} ({stockCode})

Articles:
{articleList}

Consolidated summary in Korean:`,
  ],
]);
```

### 6.4 LangChain.js Integration

```typescript
// src/modules/ai/services/news-summarizer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { NEWS_SUMMARY_PROMPT, BATCH_SUMMARY_PROMPT } from '../prompts/news-summarizer.prompt';

@Injectable()
export class NewsSummarizerService {
  private readonly logger = new Logger(NewsSummarizerService.name);
  private readonly llm: ChatOpenAI;
  private readonly parser = new StringOutputParser();

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini', // Cost-efficient for summarization
      temperature: 0.1,          // Low temperature for factual summaries
      maxTokens: 200,            // Hard cap on output length
    });
  }

  /**
   * Summarize a single article for a given stock.
   */
  async summarizeArticle(params: {
    stockName: string;
    stockCode: string;
    title: string;
    content: string;
  }): Promise<string> {
    const chain = NEWS_SUMMARY_PROMPT.pipe(this.llm).pipe(this.parser);

    const summary = await chain.invoke({
      stockName: params.stockName,
      stockCode: params.stockCode,
      title: params.title,
      content: params.content.slice(0, 2000), // Truncate to save tokens
    });

    return summary.trim();
  }

  /**
   * Batch summarize multiple articles for the same stock.
   * More token-efficient than individual summarization.
   */
  async batchSummarize(params: {
    stockName: string;
    stockCode: string;
    articles: Array<{ title: string; description: string }>;
  }): Promise<string> {
    const articleList = params.articles
      .slice(0, 5) // Max 5 articles per batch to control token usage
      .map((a, i) => `${i + 1}. [${a.title}] ${a.description}`)
      .join('\n');

    const chain = BATCH_SUMMARY_PROMPT.pipe(this.llm).pipe(this.parser);

    const summary = await chain.invoke({
      stockName: params.stockName,
      stockCode: params.stockCode,
      articleList,
    });

    return summary.trim();
  }

  /**
   * Process a queue of articles with concurrency control.
   * Prevents LLM rate limit issues.
   */
  async processQueue(
    items: Array<{
      stockName: string;
      stockCode: string;
      title: string;
      content: string;
    }>,
    concurrency: number = 3,
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map((item) => this.summarizeArticle(item)),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const key = `${batch[j].stockCode}-${batch[j].title}`;
        if (result.status === 'fulfilled') {
          results.set(key, result.value);
        } else {
          this.logger.error(`Summarization failed for: ${batch[j].title}`, result.reason);
          results.set(key, batch[j].title); // Fallback to title
        }
      }
    }

    return results;
  }
}
```

### 6.5 Token Cost Estimation

| Model | Input Cost | Output Cost | Avg Article | Monthly Estimate (5000 articles/day) |
|-------|-----------|-------------|-------------|--------------------------------------|
| gpt-4o-mini | $0.15/1M tokens | $0.60/1M tokens | ~800 input + 150 output tokens | ~$90/month |
| gpt-4o | $2.50/1M tokens | $10.00/1M tokens | ~800 input + 150 output tokens | ~$1,125/month |
| Claude 3.5 Haiku | $0.80/1M tokens | $4.00/1M tokens | ~800 input + 150 output tokens | ~$420/month |

**Recommendation**: Use `gpt-4o-mini` for routine summarization. The quality difference is negligible for 1-2 sentence financial summaries, while the cost is 10x lower than `gpt-4o`.

---

## 7. Storage Strategy

### 7.1 Schema Design

```sql
-- News articles table
CREATE TABLE news_articles (
    id              BIGSERIAL PRIMARY KEY,
    external_id     VARCHAR(255) UNIQUE NOT NULL,  -- Hash of normalized URL
    title           TEXT NOT NULL,
    original_url    TEXT NOT NULL,
    naver_url       TEXT,
    description     TEXT,                           -- Raw description/snippet
    summary         TEXT,                           -- LLM-generated summary
    source          VARCHAR(50) NOT NULL,           -- 'naver_api', 'rss_hankyung', etc.
    source_name     VARCHAR(100),                   -- Human-readable source name
    category        VARCHAR(30),                    -- 'stock', 'economy', 'disclosure'
    pub_date        TIMESTAMPTZ NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summarized_at   TIMESTAMPTZ,
    content_hash    VARCHAR(64),                    -- SHA-256 of title+description for dedup

    -- Full-text search vector (Korean-aware)
    search_vector   TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(summary, '')), 'C')
    ) STORED
);

-- News-Stock relevance mapping (many-to-many)
CREATE TABLE news_stock_relevance (
    id              BIGSERIAL PRIMARY KEY,
    article_id      BIGINT NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
    stock_code      VARCHAR(6) NOT NULL,
    keyword_score   DECIMAL(3,2) NOT NULL DEFAULT 0,  -- [0.00, 1.00]
    nlp_score       DECIMAL(3,2),                      -- [0.00, 1.00] (nullable if not computed)
    combined_score  DECIMAL(3,2) NOT NULL DEFAULT 0,   -- Weighted combination
    matched_keywords TEXT[],                             -- Array of matched keywords

    UNIQUE(article_id, stock_code)
);

-- DART disclosures (separate from news for distinct schema)
CREATE TABLE dart_disclosures (
    id              BIGSERIAL PRIMARY KEY,
    rcept_no        VARCHAR(20) UNIQUE NOT NULL,    -- DART receipt number
    corp_code       VARCHAR(8) NOT NULL,
    corp_name       VARCHAR(100) NOT NULL,
    stock_code      VARCHAR(6),
    report_name     TEXT NOT NULL,
    disclosure_type VARCHAR(4),                      -- pblntf_ty code
    filing_date     DATE NOT NULL,
    filer_name      VARCHAR(100),
    remarks         TEXT,
    priority        VARCHAR(10) DEFAULT 'LOW',       -- HIGH, MEDIUM, LOW
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_news_articles_pub_date ON news_articles(pub_date DESC);
CREATE INDEX idx_news_articles_source ON news_articles(source);
CREATE INDEX idx_news_articles_search ON news_articles USING GIN(search_vector);
CREATE INDEX idx_news_articles_content_hash ON news_articles(content_hash);
CREATE INDEX idx_news_stock_relevance_stock ON news_stock_relevance(stock_code, combined_score DESC);
CREATE INDEX idx_news_stock_relevance_article ON news_stock_relevance(article_id);
CREATE INDEX idx_dart_disclosures_stock ON dart_disclosures(stock_code, filing_date DESC);
CREATE INDEX idx_dart_disclosures_date ON dart_disclosures(filing_date DESC);
```

### 7.2 Korean Full-Text Search with pg_cjk_parser

PostgreSQL's default text search parser does not handle Korean (CJK) text properly because it treats CJK characters as single words rather than tokenizing them. The `pg_cjk_parser` extension solves this by splitting Korean text into 2-gram tokens.

**Installation**:
```bash
# Prerequisites
sudo apt-get install -y postgresql-server-dev-17 gcc libicu-dev

# Build and install
cd /path/to/pg_cjk_parser
make clean && make install
```

**Configuration**:
```sql
-- Install extension
CREATE EXTENSION pg_cjk_parser;

-- Create Korean-aware text search configuration
CREATE TEXT SEARCH CONFIGURATION korean_config (
    PARSER = pg_cjk_parser
);

ALTER TEXT SEARCH CONFIGURATION korean_config
    ADD MAPPING FOR cjk WITH simple;

ALTER TEXT SEARCH CONFIGURATION korean_config
    ADD MAPPING FOR asciiword, word, numword, asciihword, hword, numhword,
        hword_asciipart, hword_part, hword_numpart, email, protocol,
        url, host, url_path, file, sfloat, float, int, uint, version,
        tag, entity, blank
    WITH simple;
```

**Updating the schema to use Korean config**:
```sql
-- Replace the GENERATED ALWAYS column with a trigger-based approach
-- since custom configs cannot be used in GENERATED columns

ALTER TABLE news_articles DROP COLUMN search_vector;
ALTER TABLE news_articles ADD COLUMN search_vector TSVECTOR;

CREATE OR REPLACE FUNCTION news_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('korean_config', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('korean_config', coalesce(NEW.description, '')), 'B') ||
        setweight(to_tsvector('korean_config', coalesce(NEW.summary, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER news_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, description, summary
    ON news_articles
    FOR EACH ROW
    EXECUTE FUNCTION news_search_vector_update();
```

**Query example**:
```sql
-- Search for articles mentioning "삼성전자"
SELECT id, title, summary, pub_date,
       ts_rank(search_vector, query) AS rank
FROM news_articles, to_tsquery('korean_config', '삼성 & 전자') AS query
WHERE search_vector @@ query
ORDER BY rank DESC, pub_date DESC
LIMIT 20;
```

**Tokenization behavior**: The input "삼성전자" becomes 2-gram tokens: "삼성", "성전", "전자". A search for "삼성전자" will match documents containing those bigram combinations, providing effective Korean text matching without requiring morphological analysis.

### 7.3 Retention Policy

| Data Category | Full Data Retention | Summary Retention | Rationale |
|---------------|--------------------|--------------------|-----------|
| News articles (full) | 30 days | 1 year | Full text needed only for recent context |
| News summaries | N/A | 1 year | Summaries are lightweight, preserve historical context |
| News-stock relevance | 30 days (with article) | 1 year (with summary) | Scores meaningful only alongside content |
| DART disclosures | 1 year | Indefinite | Regulatory data, may be needed for compliance |
| Dedup index (content_hash) | 7 days | N/A | Only needed for recent dedup window |

**Retention Implementation**:
```sql
-- Automated cleanup: run daily at 02:00 KST
-- Step 1: Archive articles older than 30 days (keep summary)
UPDATE news_articles
SET description = NULL, content_hash = NULL
WHERE pub_date < NOW() - INTERVAL '30 days'
  AND description IS NOT NULL;

-- Step 2: Delete articles older than 1 year
DELETE FROM news_articles
WHERE pub_date < NOW() - INTERVAL '1 year';

-- Step 3: Delete orphaned relevance records
DELETE FROM news_stock_relevance
WHERE article_id NOT IN (SELECT id FROM news_articles);
```

### 7.4 Storage Estimates

| Component | Per Article | Daily (5000 articles) | Monthly |
|-----------|------------|----------------------|---------|
| news_articles row | ~2 KB | ~10 MB | ~300 MB |
| search_vector | ~1 KB | ~5 MB | ~150 MB |
| news_stock_relevance (avg 2 stocks) | ~200 B | ~2 MB | ~60 MB |
| GIN index | ~500 B | ~2.5 MB | ~75 MB |
| **Total** | ~3.7 KB | ~19.5 MB | ~585 MB |

After 30-day full retention + 1-year summary: expect ~2-3 GB steady-state storage for the news subsystem.

---

## 8. Legal Compliance Checklist

### 8.1 Naver Search API

| Requirement | Status | Notes |
|-------------|--------|-------|
| Developer registration | Required | Naver Developer Center account |
| Application registration | Required | Must declare usage purpose |
| Rate limit compliance | Required | 25,000 calls/day; exceeding may result in suspension |
| Attribution display | Required | Must display "Powered by Naver" or similar attribution when showing results sourced from the API |
| Content caching restrictions | Check ToS | Caching duration may be restricted; review current terms |
| Commercial use | Allowed with restrictions | Must comply with AI/Naver API Service Terms v5.0+ |
| Content modification | Limited | HTML stripping is permissible; semantic alteration of content is restricted |
| Redistribution of raw data | Prohibited | Cannot expose raw API responses to third parties |
| User data collection | Prohibited | Cannot collect or store user search queries in connection with Naver API |

**Action items**:
1. Register application at `https://developers.naver.com` before development begins
2. Display attribution in the dashboard's news widget footer
3. Review [AI/Naver API Service Terms and Conditions](https://xv-ncloud.pstatic.net/images/provision/AI%C2%B7NaverAPIServiceTermsandConditions_v.5.0(cln)_1699340212805.pdf) for the latest restrictions

### 8.2 RSS Feeds

| Requirement | Status | Notes |
|-------------|--------|-------|
| Attribution | Required | Display source name and link for each article |
| Republication | Restricted | Cannot republish full article text; snippets/summaries acceptable |
| Commercial use | Varies by source | Most Korean RSS feeds allow commercial read; verify per publisher |
| Frequency limits | Informal | Respect `<ttl>` tag in RSS feed; do not poll more frequently than every 5 minutes |
| robots.txt compliance | Required | Verify RSS endpoints are not blocked by robots.txt |

**Action items**:
1. Display "출처: [Source Name]" with hyperlink for each RSS-sourced article
2. Store only titles, snippets, and LLM-generated summaries (not full article text)
3. Check each publisher's Terms of Service for commercial aggregation clauses

### 8.3 DART API (Open DART)

| Requirement | Status | Notes |
|-------------|--------|-------|
| API key registration | Required | Korean identity (individual/corporate) |
| Terms of Service agreement | Required | [Open DART Terms](https://opendart.fss.or.kr/intro/terms.do) |
| Attribution | Required | Must indicate data sourced from DART/FSS |
| Rate limit compliance | Required | Respect daily call limits; error code 020 = exceeded |
| Data accuracy disclaimer | Required | Must note that DART data is "as filed" and may contain errors |
| Commercial use | Allowed | Open DART data is public information; commercial use permitted with attribution |
| Data redistribution | Allowed with attribution | Public disclosure data can be redistributed if source is cited |
| Storage | Allowed | No restriction on local storage of retrieved disclosure data |

**Action items**:
1. Register for API key at `https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do`
2. Display "출처: 금융감독원 전자공시시스템(DART)" in disclosure sections
3. Include disclaimer: "공시 데이터는 원문 그대로 제공되며, 오류가 포함될 수 있습니다"

### 8.4 LLM Summarization

| Requirement | Status | Notes |
|-------------|--------|-------|
| Input data rights | Verify | Ensure summarizing news content does not violate source copyright |
| Output attribution | Recommended | Mark AI-generated summaries as such |
| Factual accuracy disclaimer | Required | AI summaries may contain inaccuracies |
| OpenAI/Anthropic ToS | Required | Comply with LLM provider terms for commercial use |

**Action items**:
1. Add "AI 요약" label to all LLM-generated summaries
2. Include disclaimer: "AI가 생성한 요약으로, 실제 기사 내용과 차이가 있을 수 있습니다"
3. Do not pass full copyrighted article text to LLM; use description/snippet only

---

## 9. Architecture Recommendations

### 9.1 News Ingestion Pipeline

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Naver API   │  │  RSS Feeds   │  │  DART API    │
│  (polling)   │  │  (polling)   │  │  (polling)   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                  │
       └────────┬────────┘                  │
                ▼                           ▼
        ┌───────────────┐          ┌───────────────┐
        │  Deduplicator │          │  Disclosure   │
        │  (3-layer)    │          │  Processor    │
        └───────┬───────┘          └───────┬───────┘
                │                           │
                ▼                           │
        ┌───────────────┐                  │
        │  Relevance    │                  │
        │  Scorer       │                  │
        └───────┬───────┘                  │
                │                           │
                ▼                           │
        ┌───────────────┐                  │
        │  LLM          │                  │
        │  Summarizer   │                  │
        └───────┬───────┘                  │
                │                           │
                └─────────┬─────────────────┘
                          ▼
                  ┌───────────────┐
                  │  PostgreSQL   │
                  │  (news_articles, │
                  │   dart_disclosures)│
                  └───────┬───────┘
                          ▼
                  ┌───────────────┐
                  │  WebSocket    │
                  │  (real-time   │
                  │   push to UI) │
                  └───────────────┘
```

### 9.2 Scheduling Matrix

| Source | Interval (Market Hours) | Interval (Off Hours) | Method |
|--------|------------------------|---------------------|--------|
| Naver API (watchlist stocks) | 5 min | 30 min | `@nestjs/schedule` Cron |
| Naver API (portfolio stocks) | 15 min | 60 min | `@nestjs/schedule` Cron |
| RSS feeds (stock category) | 5 min | 15 min | `@nestjs/schedule` Cron |
| RSS feeds (economy category) | 10 min | 30 min | `@nestjs/schedule` Cron |
| DART disclosures | 2 min | 10 min | `@nestjs/schedule` Cron |
| Dedup cleanup | Daily 02:00 KST | - | `@nestjs/schedule` Cron |
| Naver API counter reset | Daily 00:00 KST | - | `@nestjs/schedule` Cron |

### 9.3 Module Boundaries

Within the NestJS Modular Monolith:

- **NewsModule**: Owns `news_articles`, `news_stock_relevance`, `dart_disclosures` tables. Exports `NewsService` for other modules to query.
- **AIAgentModule**: Owns the LLM summarization pipeline. NewsModule calls AIAgentModule for summarization.
- **StockModule**: Provides stock metadata (name, code, sector, aliases) consumed by relevance scorer.
- **SharedModule**: Provides HTTP client, config service, and scheduling utilities.

### 9.4 Error Handling & Resilience

| Failure Mode | Mitigation |
|-------------|------------|
| Naver API rate limit exceeded | Circuit breaker; fall back to RSS-only mode |
| Naver API authentication failure | Alert admin; retry with exponential backoff |
| RSS feed timeout | `Promise.allSettled` isolation; skip failed feed |
| DART API unavailable | Queue requests; retry on next polling cycle |
| LLM summarization failure | Fallback to article title as summary |
| Database connection loss | Retry with exponential backoff; buffer in memory (max 1000 articles) |
| Dedup false positive | Manual override via admin API; adjust threshold |

---

## 10. Pre-mortem & Risk Analysis

### 10.1 Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Naver API deprecation or ToS change | Low | High | Abstract behind interface; RSS fallback ready |
| RSS feed URL changes | Medium | Medium | Health-check per feed; alerting on sustained 404/500 |
| DART API daily limit insufficient | Low | Medium | Prioritize watchlist stocks; cache aggressively |
| Korean NLP tokenization errors | Medium | Low | 2-gram approach is robust; supplement with dictionary-based tokenizer if needed |
| LLM hallucination in summaries | Medium | Medium | Always display original title alongside summary; "AI 요약" label |
| Storage growth exceeds projections | Low | Low | Retention policy enforced; monitor with Grafana |
| Duplicate cluster merges unrelated stories | Medium | Medium | Conservative threshold (0.7); admin override capability |
| News lag (5-15 min behind real-time) | High | Low | Expected and acceptable for a monitoring dashboard (not a trading system) |

### 10.2 Open Questions for Step 6 Synthesis

1. **Bloomberg Integration**: Bloomberg does not offer a public RSS feed for Korea. Evaluate whether a Bloomberg Terminal API license is justified for this project's scope.
2. **Full Article Fetching**: Should the system scrape full article content from `originallink` for better summarization, or is the description snippet sufficient? (Copyright and ToS implications.)
3. **Multi-language Support**: Articles from Reuters Asia are in English. Should the summarizer translate to Korean, or display bilingual summaries?
4. **Notification System**: How should high-priority DART disclosures be surfaced? Push notification, in-app alert, or both?

---

## Verification Checklist

- [x] Naver Search API integration code pattern with auth (Section 1.7)
- [x] At least 3 RSS feed sources with URLs and update frequency (Section 2.2: 5 Korean sources + 1 international)
- [x] DART API endpoint and data format documented (Section 3.3)
- [x] News-stock relevance scoring algorithm specified (Section 4.2: 2-layer architecture)
- [x] Legal compliance checklist for all data sources (Section 8)
- [x] News deduplication strategy documented (Section 5.2: 3-layer approach)
- [x] News summarization via LangChain with prompt design (Section 6.3-6.4)
- [x] Storage strategy with retention policy (Section 7.3)
- [x] Korean full-text search approach documented (Section 7.2)

---

## Sources

- [Naver Open API Guide (GitHub)](https://github.com/naver/naver-openapi-guide/blob/master/ko/apilist.md)
- [Naver API Search News Module](https://github.com/Ohmry/naver-api-search-news)
- [Open DART System](https://opendart.fss.or.kr/)
- [Open DART Developer Guide - Disclosure Search](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)
- [Open DART Terms of Service](https://opendart.fss.or.kr/intro/terms.do)
- [Korean News RSS URLs (GitHub Gist)](https://gist.github.com/koorukuroo/330a644fcc3c9ffdc7b6d537efd939c3)
- [Hankyung RSS Feed Page](https://www.hankyung.com/feed)
- [rss-parser npm package](https://www.npmjs.com/package/rss-parser)
- [pg_cjk_parser (GitHub)](https://github.com/huangjimmy/pg_cjk_parser)
- [PostgreSQL Full Text Search Documentation](https://www.postgresql.org/docs/current/textsearch-intro.html)
- [LangChain.js Summarization Tutorial](https://js.langchain.com/docs/tutorials/summarization)
- [LangSmith Hub: Stock News Summarization](https://smith.langchain.com/hub/aexl/stock-news-summarization)
- [Jaccard Similarity for NLP](https://studymachinelearning.com/jaccard-similarity-text-similarity-metric-in-nlp/)
- [Article Deduplication with NLP (Medium)](https://medium.com/trinity-mirror-digital/how-reach-data-team-performs-nlp-and-article-de-duplication-e57e8b6efa3f)
- [News-Stock NLP Framework (Stanford)](https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1254/final-reports/256968470.pdf)
- [AI/Naver API Service Terms and Conditions v5.0](https://xv-ncloud.pstatic.net/images/provision/AI%C2%B7NaverAPIServiceTermsandConditions_v.5.0(cln)_1699340212805.pdf)
