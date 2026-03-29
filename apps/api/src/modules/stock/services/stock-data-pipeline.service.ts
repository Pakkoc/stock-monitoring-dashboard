import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/database/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { StockGateway } from '../stock.gateway';
import {
  REALTIME_PRICE_EVENT,
  type RealtimePrice,
} from './stock-polling.service';
import { StockQueueService } from './stock-queue.service';

// ─── Types ──────────────────────────────────────────────────

/** Price record buffered for batch insert into TimescaleDB */
interface PriceInsertRecord {
  symbol: string;
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeValue: number;
  changeRate: number;
}

/** Surge detection event payload */
export interface SurgeEvent {
  symbol: string;
  currentPrice: number;
  changeRate: number;
  changeAmount: number;
  volume: number;
  detectedAt: string;
  severity: 'MODERATE' | 'HIGH' | 'EXTREME';
}

// ─── Redis Pub/Sub Channel ──────────────────────────────────

const REDIS_PRICE_CHANNEL = 'stock:price:realtime';
const REDIS_SURGE_CHANNEL = 'stock:surge:alert';

// ─── Service ────────────────────────────────────────────────

@Injectable()
export class StockDataPipelineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockDataPipelineService.name);

  // Batch insert buffer
  private priceBuffer: PriceInsertRecord[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly FLUSH_INTERVAL_MS = 5_000; // 5 seconds
  private static readonly MAX_BUFFER_SIZE = 500;

  // Surge detection threshold
  private readonly surgeThresholdModerate: number;
  private readonly surgeThresholdHigh: number;
  private readonly surgeThresholdExtreme: number;

  // Market hours (KST): 09:00 - 15:30
  private static readonly MARKET_OPEN_HOUR = 9;
  private static readonly MARKET_OPEN_MINUTE = 0;
  private static readonly MARKET_CLOSE_HOUR = 15;
  private static readonly MARKET_CLOSE_MINUTE = 30;

  // Redis subscriber for Pub/Sub
  private redisSubscriber: ReturnType<RedisService['getClient']> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: StockGateway,
    private readonly queueService: StockQueueService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.surgeThresholdModerate = this.config.get<number>(
      'SURGE_THRESHOLD_MODERATE',
      5,
    );
    this.surgeThresholdHigh = this.config.get<number>(
      'SURGE_THRESHOLD_HIGH',
      10,
    );
    this.surgeThresholdExtreme = this.config.get<number>(
      'SURGE_THRESHOLD_EXTREME',
      15,
    );
  }

  async onModuleInit(): Promise<void> {
    // Start periodic flush timer for batch inserts
    this.flushTimer = setInterval(
      () => void this.flushPriceBuffer(),
      StockDataPipelineService.FLUSH_INTERVAL_MS,
    );

    // Set up Redis Pub/Sub subscriber
    await this.setupRedisPubSub();

    this.logger.log('Stock data pipeline initialized');
  }

  async onModuleDestroy(): Promise<void> {
    // Flush remaining buffer
    await this.flushPriceBuffer();

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Clean up Redis subscriber
    if (this.redisSubscriber) {
      await this.redisSubscriber.unsubscribe(REDIS_PRICE_CHANNEL, REDIS_SURGE_CHANNEL);
      this.redisSubscriber.disconnect();
      this.redisSubscriber = null;
    }

    this.logger.log('Stock data pipeline destroyed');
  }

  // ─── Event Handler: Polling Service → Pipeline ─────────

  /**
   * Handle real-time price events from polling service.
   * This is the entry point of the pipeline.
   */
  @OnEvent(REALTIME_PRICE_EVENT)
  async handleRealtimePrice(price: RealtimePrice): Promise<void> {
    // Gate: only process during market hours
    if (!this.isMarketOpen()) {
      return;
    }

    // Step 1: Publish to Redis Pub/Sub for cross-instance distribution
    await this.publishToRedis(price);

    // Step 2: Buffer for TimescaleDB batch insert
    this.bufferPriceRecord(price);

    // Step 3: Surge detection
    this.detectSurge(price);
  }

  // ─── Redis Pub/Sub ────────────────────────────────────

  private async publishToRedis(price: RealtimePrice): Promise<void> {
    try {
      const payload = JSON.stringify({
        symbol: price.symbol,
        time: this.formatTimeToISO(price.time),
        currentPrice: price.currentPrice,
        changeRate: price.changeRate,
        changeAmount: price.changeAmount,
        open: price.open,
        high: price.high,
        low: price.low,
        volume: price.accumulatedVolume,
        tradeValue: price.accumulatedTradeValue,
      });

      await this.redis.getClient().publish(REDIS_PRICE_CHANNEL, payload);
    } catch (error) {
      this.logger.error(
        `Failed to publish price to Redis: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Set up Redis Pub/Sub subscriber.
   * In a multi-instance deployment, this ensures all API instances
   * receive price updates and can broadcast via their own Socket.IO gateway.
   */
  private async setupRedisPubSub(): Promise<void> {
    try {
      // Create a dedicated subscriber connection (ioredis requires separate client for subscribe)
      this.redisSubscriber = this.redis.getClient().duplicate();

      await this.redisSubscriber.subscribe(
        REDIS_PRICE_CHANNEL,
        REDIS_SURGE_CHANNEL,
      );

      this.redisSubscriber.on('message', (channel: string, message: string) => {
        try {
          if (channel === REDIS_PRICE_CHANNEL) {
            this.handleRedisPriceMessage(message);
          } else if (channel === REDIS_SURGE_CHANNEL) {
            this.handleRedisSurgeMessage(message);
          }
        } catch (error) {
          this.logger.error(
            `Error handling Redis message on ${channel}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });

      this.logger.log('Redis Pub/Sub subscriber active');
    } catch (error) {
      this.logger.error(
        `Failed to setup Redis Pub/Sub: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handle price update from Redis Pub/Sub → broadcast via Socket.IO.
   */
  private handleRedisPriceMessage(message: string): void {
    const data = JSON.parse(message) as {
      symbol: string;
      time: string;
      currentPrice: number;
      changeRate: number;
      changeAmount: number;
      open: number;
      high: number;
      low: number;
      volume: number;
      tradeValue: number;
    };

    // Broadcast to subscribed Socket.IO clients
    this.gateway.broadcastPrice(data.symbol, {
      symbol: data.symbol,
      time: data.time,
      currentPrice: data.currentPrice,
      changeRate: data.changeRate,
      changeAmount: data.changeAmount,
      open: data.open,
      high: data.high,
      low: data.low,
      volume: data.volume,
      tradeValue: data.tradeValue,
    });

    // Update Redis cache for latest price (used by REST endpoints)
    void this.cacheLatestPrice(data);
  }

  /**
   * Handle surge alert from Redis Pub/Sub → broadcast via Socket.IO.
   */
  private handleRedisSurgeMessage(message: string): void {
    const surgeData = JSON.parse(message) as SurgeEvent;
    this.gateway.broadcastSurge(surgeData as unknown as Record<string, unknown>);
  }

  // ─── TimescaleDB Batch Insert ─────────────────────────

  /**
   * Buffer a price record for batch insert into TimescaleDB.
   */
  private bufferPriceRecord(price: RealtimePrice): void {
    this.priceBuffer.push({
      symbol: price.symbol,
      time: this.parseTimeToDate(price.time),
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.currentPrice,
      volume: price.accumulatedVolume,
      tradeValue: price.accumulatedTradeValue,
      changeRate: price.changeRate,
    });

    // Flush if buffer is full
    if (this.priceBuffer.length >= StockDataPipelineService.MAX_BUFFER_SIZE) {
      void this.flushPriceBuffer();
    }
  }

  /**
   * Flush buffered price records to TimescaleDB via Bull queue.
   * This aggregates prices per symbol to avoid duplicate inserts.
   */
  private async flushPriceBuffer(): Promise<void> {
    if (this.priceBuffer.length === 0) return;

    // Take the current buffer and reset
    const records = [...this.priceBuffer];
    this.priceBuffer = [];

    // Aggregate by symbol — keep only the latest record per symbol
    // (within a 5-second window, we only need the most recent tick)
    const latestBySymbol = new Map<string, PriceInsertRecord>();
    for (const record of records) {
      const existing = latestBySymbol.get(record.symbol);
      if (!existing || record.time > existing.time) {
        latestBySymbol.set(record.symbol, record);
      }
    }

    const aggregated = Array.from(latestBySymbol.values());

    try {
      // Enqueue for async batch insert via Bull
      await this.queueService.enqueueBatchInsert(aggregated);
      this.logger.debug(
        `Flushed ${aggregated.length} price records to queue (from ${records.length} raw ticks)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue price batch: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Put records back in buffer for next attempt
      this.priceBuffer.push(...aggregated);
    }
  }

  // ─── Surge Detection ──────────────────────────────────

  /**
   * Detect price surges and emit alerts.
   *
   * Checks if absolute changeRate exceeds configurable thresholds.
   * Surges are classified by severity: MODERATE (5%), HIGH (10%), EXTREME (15%).
   */
  private detectSurge(price: RealtimePrice): void {
    const absRate = Math.abs(price.changeRate);

    if (absRate < this.surgeThresholdModerate) return;

    let severity: SurgeEvent['severity'];
    if (absRate >= this.surgeThresholdExtreme) {
      severity = 'EXTREME';
    } else if (absRate >= this.surgeThresholdHigh) {
      severity = 'HIGH';
    } else {
      severity = 'MODERATE';
    }

    const surgeEvent: SurgeEvent = {
      symbol: price.symbol,
      currentPrice: price.currentPrice,
      changeRate: price.changeRate,
      changeAmount: price.changeAmount,
      volume: price.accumulatedVolume,
      detectedAt: new Date().toISOString(),
      severity,
    };

    this.logger.log(
      `Surge detected: ${price.symbol} ${price.changeRate > 0 ? '+' : ''}${price.changeRate.toFixed(2)}% [${severity}]`,
    );

    // Publish surge to Redis for cross-instance broadcast
    void this.redis
      .getClient()
      .publish(REDIS_SURGE_CHANNEL, JSON.stringify(surgeEvent));

    // Enqueue for AI analysis
    void this.queueService.enqueueSurgeDetection(surgeEvent);

    // Emit local event for other modules
    this.eventEmitter.emit('stock.surge', surgeEvent);
  }

  // ─── Latest Price Cache ───────────────────────────────

  /**
   * Cache the latest price in Redis for REST endpoint fallback.
   * Key format: stock:price:{symbol}
   * TTL: 60 seconds (will be refreshed by next tick)
   */
  private async cacheLatestPrice(data: {
    symbol: string;
    currentPrice: number;
    changeRate: number;
    changeAmount: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    tradeValue: number;
  }): Promise<void> {
    try {
      await this.redis.setJson(`stock:price:${data.symbol}`, data, 60);
    } catch (error) {
      this.logger.debug(
        `Failed to cache latest price for ${data.symbol}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ─── Market Hours ─────────────────────────────────────

  /**
   * Check if the Korean stock market is currently open.
   * Trading hours: 09:00 - 15:30 KST (UTC+9), weekdays only.
   */
  isMarketOpen(): boolean {
    const now = new Date();

    // Convert to KST
    const kstOffset = 9 * 60; // UTC+9
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const kstMinutes = utcMinutes + kstOffset;

    // Adjust for day overflow
    const adjustedMinutes = kstMinutes >= 1440 ? kstMinutes - 1440 : kstMinutes;

    // Get KST day of week (adjust if KST is next day)
    let kstDay = now.getUTCDay();
    if (kstMinutes >= 1440) {
      kstDay = (kstDay + 1) % 7;
    }

    // Weekend check (0=Sunday, 6=Saturday)
    if (kstDay === 0 || kstDay === 6) return false;

    // Market hours: 09:00 (540 min) to 15:30 (930 min)
    const openMinutes =
      StockDataPipelineService.MARKET_OPEN_HOUR * 60 +
      StockDataPipelineService.MARKET_OPEN_MINUTE;
    const closeMinutes =
      StockDataPipelineService.MARKET_CLOSE_HOUR * 60 +
      StockDataPipelineService.MARKET_CLOSE_MINUTE;

    return adjustedMinutes >= openMinutes && adjustedMinutes <= closeMinutes;
  }

  // ─── Helpers ──────────────────────────────────────────

  /**
   * Convert HHMMSS time string to Date object (today, KST).
   */
  private parseTimeToDate(timeStr: string): Date {
    const hh = parseInt(timeStr.substring(0, 2), 10) || 0;
    const mm = parseInt(timeStr.substring(2, 4), 10) || 0;
    const ss = parseInt(timeStr.substring(4, 6), 10) || 0;

    const now = new Date();
    // Create a date in KST by computing UTC equivalent
    const kstDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        hh - 9, // Convert KST to UTC
        mm,
        ss,
      ),
    );

    return kstDate;
  }

  /**
   * Convert HHMMSS time string to ISO string (today, KST).
   */
  private formatTimeToISO(timeStr: string): string {
    return this.parseTimeToDate(timeStr).toISOString();
  }
}
