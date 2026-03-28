import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockGateway } from './stock.gateway';
import { KisApiService } from './services/kis-api.service';
import { KisWebsocketService } from './services/kis-websocket.service';
import { StockDataPipelineService } from './services/stock-data-pipeline.service';
import { StockQueueService } from './services/stock-queue.service';

/**
 * StockModule — Real-time stock price data and market indices.
 *
 * Responsibilities:
 * - REST endpoints for stock listing, detail, and price history
 * - Socket.IO Gateway for real-time price broadcasting
 * - KIS OpenAPI integration (REST + WebSocket)
 * - Real-time data pipeline: KIS WS → Redis Pub/Sub → Socket.IO + TimescaleDB
 * - Bull queue for async batch inserts and surge detection
 * - TimescaleDB raw SQL for OHLCV aggregation
 * - Market index tracking (KOSPI, KOSDAQ)
 * - Subscription management (41-sub limit per client)
 *
 * Initialization order (via NestJS DI + OnModuleInit):
 *   1. KisApiService — authenticates with KIS REST API, stores token in Redis
 *   2. KisWebsocketService — acquires approval key, connects WebSocket
 *   3. StockQueueService — initializes BullMQ queues and workers
 *   4. StockDataPipelineService — wires event listeners and Redis Pub/Sub
 *
 * Exports: StockService, StockGateway, KisApiService for cross-module consumption.
 */
@Module({
  controllers: [StockController],
  providers: [
    // Core services
    StockService,
    StockGateway,

    // KIS API integration (order matters for DI resolution)
    KisApiService,
    KisWebsocketService,

    // Async processing (StockQueueService must init before pipeline)
    StockQueueService,

    // Data pipeline (depends on all above)
    StockDataPipelineService,
  ],
  exports: [StockService, StockGateway, KisApiService],
})
export class StockModule {}
