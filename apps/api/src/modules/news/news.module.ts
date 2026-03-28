import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NaverSearchService } from './services/naver-search.service';
import { RssFeedService } from './services/rss-feed.service';
import { DartApiService } from './services/dart-api.service';
import { NewsCollectorService } from './services/news-collector.service';

/**
 * NewsModule — News collection, deduplication, and relevance scoring.
 *
 * Responsibilities:
 * - REST endpoints for news listing and stock-news queries
 * - Naver Search API integration
 * - RSS feed parsing (9 financial news sources)
 * - DART disclosure API integration
 * - Scheduled news collection (every 30 minutes via @Cron)
 * - URL-based deduplication
 * - Keyword-based relevance scoring for stock-news linking
 *
 * Note: ScheduleModule is provided globally by SharedModule.
 * Exports: NewsService for cross-module consumption.
 */
@Module({
  controllers: [NewsController],
  providers: [
    NewsService,
    NaverSearchService,
    RssFeedService,
    DartApiService,
    NewsCollectorService,
  ],
  exports: [NewsService],
})
export class NewsModule {}
