import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';
import { KisApiService } from './kis-api.service';

// ─── Types ──────────────────────────────────────────────────

/** Parsed real-time execution data from KIS WebSocket (H0STCNT0) */
export interface KisRealtimePrice {
  symbol: string;         // Stock code (6 digits)
  time: string;           // Execution time (HHMMSS)
  currentPrice: number;   // Current price
  changeSign: number;     // 1=up, 2=down, 3=same, 4=ceiling, 5=floor
  changeAmount: number;   // Change from previous day
  changeRate: number;     // Change rate (%)
  open: number;           // Opening price
  high: number;           // High price
  low: number;            // Low price
  askPrice: number;       // Best ask price
  bidPrice: number;       // Best bid price
  executionVolume: number; // This execution's volume
  accumulatedVolume: number; // Accumulated volume
  accumulatedTradeValue: number; // Accumulated trading value
}

/** KIS WebSocket subscription message format */
interface KisWsSubscriptionMessage {
  header: {
    approval_key: string;
    custtype: string;
    tr_type: '1' | '2'; // 1=subscribe, 2=unsubscribe
    'content-type': 'utf-8';
  };
  body: {
    input: {
      tr_id: string;
      tr_key: string;
    };
  };
}

/** JSON response from WebSocket (confirmations, errors, PINGPONG) */
interface KisWsJsonResponse {
  header?: {
    tr_id?: string;
    tr_key?: string;
    encrypt?: string;
  };
  body?: {
    rt_cd?: string;
    msg_cd?: string;
    msg1?: string;
    output?: {
      iv?: string;
      key?: string;
    };
  };
}

// ─── Events ─────────────────────────────────────────────────

/** Event name emitted when a real-time price arrives */
export const KIS_REALTIME_PRICE_EVENT = 'kis.realtime.price';

/** Event name emitted when WebSocket connection state changes */
export const KIS_WS_CONNECTION_EVENT = 'kis.ws.connection';

// ─── Service ────────────────────────────────────────────────

@Injectable()
export class KisWebsocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KisWebsocketService.name);

  // WebSocket state
  private ws: WebSocket | null = null;
  private approvalKey: string | null = null;
  private isConnected = false;
  private isDestroying = false;

  // Subscription tracking: trKey (symbol) -> trId
  private readonly subscriptions = new Map<string, string>();
  private static readonly MAX_SUBSCRIPTIONS = 41;

  // Reconnection with exponential backoff
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly INITIAL_RECONNECT_MS = 1000;
  private static readonly MAX_RECONNECT_MS = 30_000;

  // PINGPONG heartbeat
  private lastPingPong: number = Date.now();
  private heartbeatChecker: ReturnType<typeof setInterval> | null = null;
  private static readonly HEARTBEAT_CHECK_INTERVAL_MS = 60_000;
  private static readonly HEARTBEAT_TIMEOUT_MS = 120_000;

  // WebSocket URL
  private readonly wsUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly kisApi: KisApiService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const isProduction =
      this.config.get<string>('KIS_ENVIRONMENT', 'simulation') === 'production';
    this.wsUrl = isProduction
      ? 'ws://ops.koreainvestment.com:21000'
      : 'ws://ops.koreainvestment.com:31000';
  }

  async onModuleInit(): Promise<void> {
    if (!this.kisApi.isConfigured()) {
      this.logger.warn(
        'KIS API not configured. WebSocket connection will not be established.',
      );
      return;
    }

    try {
      await this.connect();
    } catch (error) {
      this.logger.error(
        `Initial WebSocket connection failed: ${error instanceof Error ? error.message : String(error)}. Will retry.`,
      );
      this.scheduleReconnect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isDestroying = true;
    this.clearTimers();
    this.disconnect();
    this.logger.log('KIS WebSocket service destroyed');
  }

  // ─── Public API ─────────────────────────────────────────

  /**
   * Subscribe to real-time execution data for a stock.
   * TR_ID: H0STCNT0 (체결가)
   */
  subscribe(symbol: string): boolean {
    if (this.subscriptions.size >= KisWebsocketService.MAX_SUBSCRIPTIONS) {
      this.logger.warn(
        `Cannot subscribe to ${symbol}: maximum subscriptions reached (${KisWebsocketService.MAX_SUBSCRIPTIONS})`,
      );
      return false;
    }

    if (this.subscriptions.has(symbol)) {
      this.logger.debug(`Already subscribed to ${symbol}`);
      return true;
    }

    const trId = 'H0STCNT0';
    this.subscriptions.set(symbol, trId);

    if (this.isConnected && this.ws) {
      this.sendSubscription(trId, symbol, '1');
    }

    this.logger.log(
      `Subscribed to ${symbol} (total: ${this.subscriptions.size}/${KisWebsocketService.MAX_SUBSCRIPTIONS})`,
    );
    return true;
  }

  /**
   * Unsubscribe from a stock's real-time data.
   */
  unsubscribe(symbol: string): void {
    const trId = this.subscriptions.get(symbol);
    if (!trId) return;

    this.subscriptions.delete(symbol);

    if (this.isConnected && this.ws) {
      this.sendSubscription(trId, symbol, '2');
    }

    this.logger.log(
      `Unsubscribed from ${symbol} (total: ${this.subscriptions.size}/${KisWebsocketService.MAX_SUBSCRIPTIONS})`,
    );
  }

  /** Get current subscription count */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /** Get all currently subscribed symbols */
  getSubscribedSymbols(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /** Check if WebSocket is connected */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // ─── Connection Management ──────────────────────────────

  private async connect(): Promise<void> {
    this.logger.log(`Connecting to KIS WebSocket at ${this.wsUrl}...`);

    // Step 1: Acquire approval key
    this.approvalKey = await this.kisApi.getApprovalKey();

    // Step 2: Create WebSocket connection
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      const connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
          this.ws?.terminate();
          reject(new Error('WebSocket connection timeout (10s)'));
        }
      }, 10_000);

      this.ws.on('open', () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastPingPong = Date.now();

        this.logger.log('KIS WebSocket connected');
        this.eventEmitter.emit(KIS_WS_CONNECTION_EVENT, {
          status: 'connected',
          timestamp: new Date().toISOString(),
        });

        // Re-subscribe to all active subscriptions
        this.resubscribeAll();

        // Start heartbeat checker
        this.startHeartbeatChecker();

        resolve();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          this.handleMessage(data.toString());
        } catch (error) {
          this.logger.error(
            `Error handling WebSocket message: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const wasConnected = this.isConnected;
        this.isConnected = false;

        this.logger.warn(
          `KIS WebSocket closed (code=${code}, reason=${reason.toString()})`,
        );

        this.eventEmitter.emit(KIS_WS_CONNECTION_EVENT, {
          status: 'disconnected',
          code,
          reason: reason.toString(),
          timestamp: new Date().toISOString(),
        });

        if (wasConnected && !this.isDestroying) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: Error) => {
        this.logger.error(`KIS WebSocket error: ${error.message}`);
        // 'close' event will follow, which triggers reconnect
      });
    });
  }

  private disconnect(): void {
    if (this.ws) {
      this.isConnected = false;
      try {
        this.ws.close(1000, 'Service shutting down');
      } catch {
        this.ws.terminate();
      }
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroying || this.reconnectTimer) return;

    const delay = Math.min(
      KisWebsocketService.INITIAL_RECONNECT_MS *
        Math.pow(2, this.reconnectAttempts),
      KisWebsocketService.MAX_RECONNECT_MS,
    );

    this.reconnectAttempts++;

    this.logger.log(
      `Scheduling WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch((error) => {
        this.logger.error(
          `Reconnect failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.scheduleReconnect();
      });
    }, delay);
  }

  private resubscribeAll(): void {
    for (const [symbol, trId] of this.subscriptions) {
      this.sendSubscription(trId, symbol, '1');
    }

    if (this.subscriptions.size > 0) {
      this.logger.log(
        `Re-subscribed to ${this.subscriptions.size} symbol(s)`,
      );
    }
  }

  // ─── Message Handling ───────────────────────────────────

  private handleMessage(data: string): void {
    // JSON messages: subscription confirmations, errors, PINGPONG
    if (data.startsWith('{')) {
      this.handleJsonMessage(data);
      return;
    }

    // Pipe-delimited real-time data: "0|H0STCNT0|001|field1^field2^..."
    this.handlePipeDelimitedMessage(data);
  }

  private handleJsonMessage(data: string): void {
    const json = JSON.parse(data) as KisWsJsonResponse;
    const trId = json.header?.tr_id;

    // PINGPONG heartbeat — echo back
    if (trId === 'PINGPONG') {
      this.lastPingPong = Date.now();
      this.ws?.send(data);
      this.logger.debug('PINGPONG echoed');
      return;
    }

    // Subscription confirmation
    const rtCd = json.body?.rt_cd;
    const msgCode = json.body?.msg_cd ?? '';
    const msg = json.body?.msg1 ?? '';

    if (rtCd === '0') {
      this.logger.debug(`KIS WS: ${msg} [${msgCode}] for ${json.header?.tr_key ?? 'unknown'}`);
    } else {
      this.logger.error(`KIS WS error: ${msg} [${msgCode}] for ${json.header?.tr_key ?? 'unknown'}`);
    }
  }

  private handlePipeDelimitedMessage(data: string): void {
    // Format: "encrypted|tr_id|data_count|payload"
    const pipeIndex1 = data.indexOf('|');
    const pipeIndex2 = data.indexOf('|', pipeIndex1 + 1);
    const pipeIndex3 = data.indexOf('|', pipeIndex2 + 1);

    if (pipeIndex3 === -1) {
      this.logger.warn('Invalid pipe-delimited message format');
      return;
    }

    const encrypted = data.substring(0, pipeIndex1);
    const trId = data.substring(pipeIndex1 + 1, pipeIndex2);
    const dataCountStr = data.substring(pipeIndex2 + 1, pipeIndex3);
    const payload = data.substring(pipeIndex3 + 1);

    // Only handle unencrypted execution data (H0STCNT0) for now
    if (encrypted === '1') {
      this.logger.debug('Ignoring encrypted WebSocket message');
      return;
    }

    if (trId === 'H0STCNT0') {
      const dataCount = parseInt(dataCountStr, 10) || 1;
      this.parseExecutionData(payload, dataCount);
    }
  }

  /**
   * Parse H0STCNT0 pipe-delimited execution data.
   *
   * Field index mapping (caret-separated):
   *   0: Stock code (mksc_shrn_iscd)
   *   1: Execution time (stck_cntg_hour, HHMMSS)
   *   2: Current price (stck_prpr)
   *   3: Change direction (prdy_vrss_sign)
   *   4: Change amount (prdy_vrss)
   *   5: Change rate % (prdy_ctrt)
   *   6: Weighted avg price (wghn_avrg_stck_prc)
   *   7: Opening price (stck_oprc)
   *   8: High price (stck_hgpr)
   *   9: Low price (stck_lwpr)
   *  10: Best ask price (askp1)
   *  11: Best bid price (bidp1)
   *  12: Execution volume (cntg_vol)
   *  13: Accumulated volume (acml_vol)
   *  14: Accumulated trading value (acml_tr_pbmn)
   */
  private parseExecutionData(payload: string, dataCount: number): void {
    // When dataCount > 1, records are concatenated with ^ delimiter
    // Each record has a fixed field count; we parse the known fields
    const fields = payload.split('^');

    // We process only the first record for simplicity;
    // Multi-record case is rare for domestic stocks
    const fieldsPerRecord = Math.max(1, Math.floor(fields.length / dataCount));

    for (let i = 0; i < dataCount; i++) {
      const offset = i * fieldsPerRecord;
      if (offset + 14 >= fields.length) break;

      const price: KisRealtimePrice = {
        symbol: fields[offset + 0],
        time: fields[offset + 1],
        currentPrice: this.parseNum(fields[offset + 2]),
        changeSign: this.parseNum(fields[offset + 3]),
        changeAmount: this.parseNum(fields[offset + 4]),
        changeRate: this.parseFloatSafe(fields[offset + 5]),
        open: this.parseNum(fields[offset + 7]),
        high: this.parseNum(fields[offset + 8]),
        low: this.parseNum(fields[offset + 9]),
        askPrice: this.parseNum(fields[offset + 10]),
        bidPrice: this.parseNum(fields[offset + 11]),
        executionVolume: this.parseNum(fields[offset + 12]),
        accumulatedVolume: this.parseNum(fields[offset + 13]),
        accumulatedTradeValue: this.parseNum(fields[offset + 14]),
      };

      // Emit parsed price event
      this.eventEmitter.emit(KIS_REALTIME_PRICE_EVENT, price);
    }
  }

  // ─── Subscription Wire Protocol ─────────────────────────

  private sendSubscription(
    trId: string,
    trKey: string,
    trType: '1' | '2',
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.approvalKey) {
      this.logger.warn(
        `Cannot send subscription (ws=${this.ws ? 'exists' : 'null'}, state=${this.ws?.readyState}, approvalKey=${this.approvalKey ? 'set' : 'null'})`,
      );
      return;
    }

    const message: KisWsSubscriptionMessage = {
      header: {
        approval_key: this.approvalKey,
        custtype: 'P',
        tr_type: trType,
        'content-type': 'utf-8',
      },
      body: {
        input: {
          tr_id: trId,
          tr_key: trKey,
        },
      },
    };

    this.ws.send(JSON.stringify(message));
    this.logger.debug(
      `Sent ${trType === '1' ? 'subscribe' : 'unsubscribe'} for ${trKey} (${trId})`,
    );
  }

  // ─── Heartbeat ──────────────────────────────────────────

  private startHeartbeatChecker(): void {
    this.stopHeartbeatChecker();

    this.heartbeatChecker = setInterval(() => {
      const elapsed = Date.now() - this.lastPingPong;
      if (elapsed > KisWebsocketService.HEARTBEAT_TIMEOUT_MS) {
        this.logger.warn(
          `No PINGPONG received in ${elapsed}ms. Reconnecting...`,
        );
        this.disconnect();
        this.scheduleReconnect();
      }
    }, KisWebsocketService.HEARTBEAT_CHECK_INTERVAL_MS);
  }

  private stopHeartbeatChecker(): void {
    if (this.heartbeatChecker) {
      clearInterval(this.heartbeatChecker);
      this.heartbeatChecker = null;
    }
  }

  // ─── Cleanup ────────────────────────────────────────────

  private clearTimers(): void {
    this.stopHeartbeatChecker();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  private parseNum(value: string | undefined): number {
    if (!value || value === '') return 0;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private parseFloatSafe(value: string | undefined): number {
    if (!value || value === '') return 0;
    const parsed = globalThis.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
