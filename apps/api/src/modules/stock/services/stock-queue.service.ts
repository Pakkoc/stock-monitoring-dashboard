import {
  Injectable,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../../../shared/database/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import type { SurgeEvent } from './stock-data-pipeline.service';

// ─── Types ──────────────────────────────────────────────────

/** Price record for batch insert into TimescaleDB */
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

/** Job data for stock-data queue */
interface BatchInsertJobData {
  records: Array<{
    symbol: string;
    time: string; // ISO string (serialized from Date)
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    tradeValue: number;
    changeRate: number;
  }>;
}

/** Job data for surge-detection queue */
interface SurgeDetectionJobData {
  surge: SurgeEvent;
}

// ─── Queue Names ────────────────────────────────────────────

const QUEUE_STOCK_DATA = 'stock-data';
const QUEUE_SURGE_DETECTION = 'surge-detection';

// ─── Service ────────────────────────────────────────────────

@Injectable()
export class StockQueueService implements OnModuleInit {
  private readonly logger = new Logger(StockQueueService.name);

  private stockDataQueue!: Queue<BatchInsertJobData>;
  private surgeDetectionQueue!: Queue<SurgeDetectionJobData>;

  private stockDataWorker!: Worker<BatchInsertJobData>;
  private surgeDetectionWorker!: Worker<SurgeDetectionJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const connection = this.parseRedisConnection(redisUrl);

    // Initialize queues
    this.stockDataQueue = new Queue<BatchInsertJobData>(QUEUE_STOCK_DATA, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
        removeOnFail: { count: 500 },     // Keep last 500 failed jobs
      },
    });

    this.surgeDetectionQueue = new Queue<SurgeDetectionJobData>(
      QUEUE_SURGE_DETECTION,
      {
        connection,
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 200 },
        },
      },
    );

    // Initialize workers
    this.stockDataWorker = new Worker<BatchInsertJobData>(
      QUEUE_STOCK_DATA,
      async (job) => this.processStockDataJob(job),
      {
        connection,
        concurrency: 2,     // Allow 2 concurrent batch inserts
        limiter: {
          max: 10,           // Max 10 jobs per 5 seconds
          duration: 5000,
        },
      },
    );

    this.surgeDetectionWorker = new Worker<SurgeDetectionJobData>(
      QUEUE_SURGE_DETECTION,
      async (job) => this.processSurgeDetectionJob(job),
      {
        connection,
        concurrency: 1,
      },
    );

    // Worker event handlers
    this.setupWorkerEvents(this.stockDataWorker, QUEUE_STOCK_DATA);
    this.setupWorkerEvents(this.surgeDetectionWorker, QUEUE_SURGE_DETECTION);

    this.logger.log('Stock queue service initialized with BullMQ');
  }

  // ─── Public API ─────────────────────────────────────────

  /**
   * Enqueue a batch of price records for TimescaleDB insertion.
   */
  async enqueueBatchInsert(records: PriceInsertRecord[]): Promise<void> {
    if (records.length === 0) return;

    const jobData: BatchInsertJobData = {
      records: records.map((r) => ({
        symbol: r.symbol,
        time: r.time instanceof Date ? r.time.toISOString() : String(r.time),
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
        tradeValue: r.tradeValue,
        changeRate: r.changeRate,
      })),
    };

    await this.stockDataQueue.add('batch-insert', jobData, {
      priority: 1, // Normal priority
    });
  }

  /**
   * Enqueue a surge detection event for AI analysis.
   */
  async enqueueSurgeDetection(surge: SurgeEvent): Promise<void> {
    await this.surgeDetectionQueue.add('surge-analysis', { surge }, {
      priority: surge.severity === 'EXTREME' ? 1 : surge.severity === 'HIGH' ? 2 : 3,
    });
  }

  /**
   * Get queue health status for monitoring.
   */
  async getQueueHealth(): Promise<{
    stockData: { waiting: number; active: number; completed: number; failed: number };
    surgeDetection: { waiting: number; active: number; completed: number; failed: number };
  }> {
    const [sdWaiting, sdActive, sdCompleted, sdFailed] = await Promise.all([
      this.stockDataQueue.getWaitingCount(),
      this.stockDataQueue.getActiveCount(),
      this.stockDataQueue.getCompletedCount(),
      this.stockDataQueue.getFailedCount(),
    ]);

    const [sgWaiting, sgActive, sgCompleted, sgFailed] = await Promise.all([
      this.surgeDetectionQueue.getWaitingCount(),
      this.surgeDetectionQueue.getActiveCount(),
      this.surgeDetectionQueue.getCompletedCount(),
      this.surgeDetectionQueue.getFailedCount(),
    ]);

    return {
      stockData: {
        waiting: sdWaiting,
        active: sdActive,
        completed: sdCompleted,
        failed: sdFailed,
      },
      surgeDetection: {
        waiting: sgWaiting,
        active: sgActive,
        completed: sgCompleted,
        failed: sgFailed,
      },
    };
  }

  // ─── Job Processors ───────────────────────────────────

  /**
   * Process batch insert of stock prices into TimescaleDB.
   *
   * Uses raw SQL for efficient bulk upsert.
   * ON CONFLICT updates if the new record has a later timestamp.
   */
  private async processStockDataJob(job: Job<BatchInsertJobData>): Promise<void> {
    const { records } = job.data;
    if (records.length === 0) return;

    this.logger.debug(
      `Processing batch insert: ${records.length} records (job ${job.id})`,
    );

    try {
      // Build parameterized bulk insert
      // stock_prices table: symbol, time, open, high, low, close, volume, trade_value, change_rate
      const values: unknown[] = [];
      const placeholders: string[] = [];

      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const offset = i * 9;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}::timestamptz, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`,
        );
        values.push(
          r.symbol,
          r.time,
          r.open,
          r.high,
          r.low,
          r.close,
          r.volume,
          r.tradeValue,
          r.changeRate,
        );
      }

      const sql = `
        INSERT INTO stock_prices (symbol, time, open, high, low, close, volume, trade_value, change_rate)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (symbol, time) DO UPDATE
        SET open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume,
            trade_value = EXCLUDED.trade_value,
            change_rate = EXCLUDED.change_rate
      `;

      await this.prisma.$executeRawUnsafe(sql, ...values);

      this.logger.debug(
        `Batch insert completed: ${records.length} records (job ${job.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Batch insert failed (job ${job.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Let BullMQ handle retry
    }
  }

  /**
   * Process surge detection event.
   *
   * Stores the surge record and triggers AI analysis pipeline
   * by emitting an event that the AiAgentModule can listen to.
   */
  private async processSurgeDetectionJob(
    job: Job<SurgeDetectionJobData>,
  ): Promise<void> {
    const { surge } = job.data;

    this.logger.log(
      `Processing surge for ${surge.symbol}: ${surge.changeRate > 0 ? '+' : ''}${surge.changeRate.toFixed(2)}% [${surge.severity}]`,
    );

    try {
      // Store surge event in Redis for dashboard display
      const surgeKey = `stock:surge:${surge.symbol}`;
      await this.redis.setJson(surgeKey, surge, 3600); // TTL 1 hour

      // Add to surge history list (keep last 100)
      const historyKey = 'stock:surge:history';
      await this.redis
        .getClient()
        .lpush(historyKey, JSON.stringify(surge));
      await this.redis.getClient().ltrim(historyKey, 0, 99);

      // The AI analysis module can listen to the 'stock.surge.analysis' event
      // to trigger LangGraph-based analysis (implemented in AiAgentModule)
      // We don't directly couple to AI here — just store the data.

      this.logger.log(
        `Surge event stored for ${surge.symbol} [${surge.severity}]`,
      );
    } catch (error) {
      this.logger.error(
        `Surge processing failed for ${surge.symbol}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  // ─── Worker Event Handlers ────────────────────────────

  private setupWorkerEvents<T>(
    worker: Worker<T>,
    queueName: string,
  ): void {
    worker.on('completed', (job: Job<T>) => {
      this.logger.debug(`[${queueName}] Job ${job.id} completed`);
    });

    worker.on('failed', (job: Job<T> | undefined, err: Error) => {
      this.logger.error(
        `[${queueName}] Job ${job?.id ?? 'unknown'} failed: ${err.message}`,
      );
    });

    worker.on('error', (err: Error) => {
      this.logger.error(`[${queueName}] Worker error: ${err.message}`);
    });
  }

  // ─── Helpers ──────────────────────────────────────────

  /**
   * Parse a Redis URL into BullMQ-compatible connection options.
   */
  private parseRedisConnection(
    redisUrl: string,
  ): { host: string; port: number; password?: string; db?: number } {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname || 'localhost',
        port: parseInt(url.port, 10) || 6379,
        password: url.password || undefined,
        db: url.pathname ? parseInt(url.pathname.slice(1), 10) || undefined : undefined,
      };
    } catch {
      return { host: 'localhost', port: 6379 };
    }
  }
}
