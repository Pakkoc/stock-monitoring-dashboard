import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { ThemeController } from './theme.controller';
import { StockService } from './stock.service';
import { StockGateway } from './stock.gateway';
import { KiwoomApiService } from './services/kiwoom-api.service';
import { StockPollingService } from './services/stock-polling.service';
import { StockDataPipelineService } from './services/stock-data-pipeline.service';
import { StockQueueService } from './services/stock-queue.service';
import { SurgeCauseService } from './services/surge-cause.service';

/**
 * StockModule — Real-time stock price data and market indices.
 *
 * Responsibilities:
 * - REST endpoints for stock listing, detail, and price history
 * - Socket.IO Gateway for real-time price broadcasting
 * - Kiwoom Securities REST API integration
 * - Real-time data pipeline: Polling (5s) → Redis Pub/Sub → Socket.IO + TimescaleDB
 * - Bull queue for async batch inserts and surge detection
 * - TimescaleDB raw SQL for OHLCV aggregation
 * - Market index tracking (KOSPI, KOSDAQ)
 * - Subscription management (configurable, default 50 stocks)
 *
 * Initialization order (via NestJS DI + OnModuleInit):
 *   1. KiwoomApiService — authenticates with Kiwoom REST API, stores token in Redis
 *   2. StockPollingService — polls subscribed stocks every 5 seconds
 *   3. StockQueueService — initializes BullMQ queues and workers
 *   4. StockDataPipelineService — wires event listeners and Redis Pub/Sub
 *
 * Exports: StockService, StockGateway, KiwoomApiService for cross-module consumption.
 */
@Module({
  controllers: [StockController, ThemeController],
  providers: [
    // Core services
    StockService,
    StockGateway,

    // Kiwoom API integration (order matters for DI resolution)
    KiwoomApiService,
    StockPollingService,

    // Async processing (StockQueueService must init before pipeline)
    StockQueueService,

    // Data pipeline (depends on all above)
    StockDataPipelineService,

    // Surge cause analysis (rule-based, no AI)
    SurgeCauseService,
  ],
  exports: [StockService, StockGateway, KiwoomApiService, SurgeCauseService],
})
export class StockModule {}
