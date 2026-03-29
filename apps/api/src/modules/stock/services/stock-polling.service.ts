import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KiwoomApiService, type CurrentPriceData } from './kiwoom-api.service';

// ─── Types ──────────────────────────────────────────────────

/** Real-time price data emitted by the polling service.
 *  Matches the shape previously emitted by KIS WebSocket (KisRealtimePrice)
 *  so downstream consumers (pipeline service, etc.) need no changes.
 */
export interface RealtimePrice {
  symbol: string;         // Stock code (6 digits)
  time: string;           // Timestamp (HHMMSS in KST)
  currentPrice: number;   // Current price
  changeSign: number;     // 1=up, 2=down, 3=same, 4=ceiling, 5=floor
  changeAmount: number;   // Change from previous day
  changeRate: number;     // Change rate (%)
  open: number;           // Opening price
  high: number;           // High price
  low: number;            // Low price
  askPrice: number;       // Best ask price (0 — not available via polling)
  bidPrice: number;       // Best bid price (0 — not available via polling)
  executionVolume: number; // Delta volume since last poll
  accumulatedVolume: number; // Accumulated volume
  accumulatedTradeValue: number; // Accumulated trading value
}

// ─── Events ─────────────────────────────────────────────────

/** Event name emitted when a polled price arrives (same event pipeline listens to) */
export const REALTIME_PRICE_EVENT = 'stock.realtime.price';

/** Event name emitted when polling connection state changes */
export const POLLING_CONNECTION_EVENT = 'stock.polling.connection';

// ─── Service ────────────────────────────────────────────────

@Injectable()
export class StockPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockPollingService.name);

  // Subscription tracking: symbol set
  private readonly subscriptions = new Set<string>();
  private readonly maxSubscriptions: number;

  // Polling state
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private isDestroying = false;
  private readonly pollIntervalMs: number;

  // Cache previous prices for change detection
  private readonly previousPrices = new Map<string, number>();
  private readonly previousVolumes = new Map<string, number>();

  // Market hours (KST): 09:00 - 15:30
  private static readonly MARKET_OPEN_HOUR = 9;
  private static readonly MARKET_OPEN_MINUTE = 0;
  private static readonly MARKET_CLOSE_HOUR = 15;
  private static readonly MARKET_CLOSE_MINUTE = 30;

  constructor(
    private readonly config: ConfigService,
    private readonly kiwoomApi: KiwoomApiService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.pollIntervalMs = this.config.get<number>('POLLING_INTERVAL_MS', 5_000);
    this.maxSubscriptions = this.config.get<number>('MAX_POLLING_SUBSCRIPTIONS', 50);
  }

  async onModuleInit(): Promise<void> {
    if (!this.kiwoomApi.isConfigured()) {
      this.logger.warn(
        'Kiwoom API not configured. Stock polling will not start.',
      );
      return;
    }

    this.startPolling();
    this.logger.log(
      `Stock polling service initialized (interval=${this.pollIntervalMs}ms, maxSubs=${this.maxSubscriptions})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.isDestroying = true;
    this.stopPolling();
    this.logger.log('Stock polling service destroyed');
  }

  // ─── Public API ─────────────────────────────────────────

  /**
   * Subscribe to price updates for a stock symbol.
   * Returns true if subscribed (or already subscribed), false if at max capacity.
   */
  subscribe(symbol: string): boolean {
    if (this.subscriptions.size >= this.maxSubscriptions && !this.subscriptions.has(symbol)) {
      this.logger.warn(
        `Cannot subscribe to ${symbol}: maximum subscriptions reached (${this.maxSubscriptions})`,
      );
      return false;
    }

    if (this.subscriptions.has(symbol)) {
      this.logger.debug(`Already subscribed to ${symbol}`);
      return true;
    }

    this.subscriptions.add(symbol);

    this.logger.log(
      `Subscribed to ${symbol} (total: ${this.subscriptions.size}/${this.maxSubscriptions})`,
    );
    return true;
  }

  /**
   * Unsubscribe from a stock's price updates.
   */
  unsubscribe(symbol: string): void {
    if (!this.subscriptions.has(symbol)) return;

    this.subscriptions.delete(symbol);
    this.previousPrices.delete(symbol);
    this.previousVolumes.delete(symbol);

    this.logger.log(
      `Unsubscribed from ${symbol} (total: ${this.subscriptions.size}/${this.maxSubscriptions})`,
    );
  }

  /** Get current subscription count */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /** Get all currently subscribed symbols */
  getSubscribedSymbols(): string[] {
    return Array.from(this.subscriptions);
  }

  /** Check if polling is active */
  getConnectionStatus(): boolean {
    return this.isPolling;
  }

  // ─── Polling Engine ───────────────────────────────────────

  private startPolling(): void {
    if (this.pollTimer) return;

    this.isPolling = true;
    this.eventEmitter.emit(POLLING_CONNECTION_EVENT, {
      status: 'connected',
      timestamp: new Date().toISOString(),
    });

    this.pollTimer = setInterval(() => {
      void this.pollAll();
    }, this.pollIntervalMs);

    this.logger.log(`Polling started (every ${this.pollIntervalMs}ms)`);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
    this.eventEmitter.emit(POLLING_CONNECTION_EVENT, {
      status: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Poll all subscribed symbols for current prices.
   * Only runs during market hours. Emits events only for changed prices.
   */
  private async pollAll(): Promise<void> {
    if (this.isDestroying || this.subscriptions.size === 0) return;

    // Gate: only poll during market hours
    if (!this.isMarketOpen()) {
      return;
    }

    const symbols = Array.from(this.subscriptions);

    // Fetch prices in batches to respect rate limits.
    // With 10 req/sec rate limit and 5s interval, we can do up to 50 requests per cycle.
    const results = await Promise.allSettled(
      symbols.map((symbol) => this.fetchAndEmitPrice(symbol)),
    );

    // Log any failures (but don't crash the polling loop)
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      this.logger.warn(
        `Polling cycle: ${failures.length}/${symbols.length} requests failed`,
      );
    }
  }

  /**
   * Fetch price for a single symbol and emit event if changed.
   */
  private async fetchAndEmitPrice(symbol: string): Promise<void> {
    try {
      const priceData: CurrentPriceData = await this.kiwoomApi.getCurrentPrice(symbol);

      // Compare with cached price — only emit if changed
      const prevPrice = this.previousPrices.get(symbol);
      const prevVolume = this.previousVolumes.get(symbol);

      if (
        prevPrice !== undefined &&
        prevPrice === priceData.currentPrice &&
        prevVolume !== undefined &&
        prevVolume === priceData.volume
      ) {
        // No change — skip emission
        return;
      }

      // Calculate execution volume delta
      const executionVolume =
        prevVolume !== undefined ? Math.max(0, priceData.volume - prevVolume) : 0;

      // Update cache
      this.previousPrices.set(symbol, priceData.currentPrice);
      this.previousVolumes.set(symbol, priceData.volume);

      // Build event payload matching the RealtimePrice interface
      const now = new Date();
      const kstHours = (now.getUTCHours() + 9) % 24;
      const timeStr = `${String(kstHours).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;

      const realtimePrice: RealtimePrice = {
        symbol,
        time: timeStr,
        currentPrice: priceData.currentPrice,
        changeSign: priceData.changeSign,
        changeAmount: priceData.changeAmount,
        changeRate: priceData.changeRate,
        open: priceData.open,
        high: priceData.high,
        low: priceData.low,
        askPrice: 0,  // Not available via REST polling
        bidPrice: 0,  // Not available via REST polling
        executionVolume,
        accumulatedVolume: priceData.volume,
        accumulatedTradeValue: priceData.tradeValue,
      };

      // Emit — pipeline service listens for this event
      this.eventEmitter.emit(REALTIME_PRICE_EVENT, realtimePrice);
    } catch (error) {
      this.logger.debug(
        `Failed to poll price for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw so Promise.allSettled records it
    }
  }

  // ─── Market Hours ─────────────────────────────────────────

  /**
   * Check if the Korean stock market is currently open.
   * Trading hours: 09:00 - 15:30 KST (UTC+9), weekdays only.
   */
  private isMarketOpen(): boolean {
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
      StockPollingService.MARKET_OPEN_HOUR * 60 +
      StockPollingService.MARKET_OPEN_MINUTE;
    const closeMinutes =
      StockPollingService.MARKET_CLOSE_HOUR * 60 +
      StockPollingService.MARKET_CLOSE_MINUTE;

    return adjustedMinutes >= openMinutes && adjustedMinutes <= closeMinutes;
  }
}
