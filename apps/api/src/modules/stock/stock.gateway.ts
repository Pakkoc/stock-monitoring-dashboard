import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS, WS_NAMESPACE } from '@stock-dashboard/shared';

/** Payload for subscribe/unsubscribe events */
interface SymbolsPayload {
  symbols: string[];
}

/** Payload for real-time price broadcast */
interface PriceData {
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
}

/**
 * StockGateway — Socket.IO gateway for real-time stock price updates.
 *
 * Clients subscribe to specific symbols. The gateway manages room-based
 * routing: each stock symbol is a Socket.IO room. When new price data
 * arrives (from KIS WebSocket ingestion), broadcastPrice() emits
 * to all clients in that symbol's room.
 *
 * Max subscriptions per client: 41 (matching KIS API limit).
 */
@WebSocketGateway({
  namespace: WS_NAMESPACE,
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class StockGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(StockGateway.name);

  /** Track subscriptions per client for limit enforcement */
  private readonly clientSubscriptions = new Map<string, Set<string>>();

  private static readonly MAX_SUBSCRIPTIONS = 41;

  handleConnection(client: Socket) {
    this.clientSubscriptions.set(client.id, new Set());
    this.logger.log(`Client connected: ${client.id}`);

    client.emit('connected', {
      subscribedStocks: [],
      serverTime: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    this.clientSubscriptions.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Handle client subscription to stock price updates.
   * Joins the client to a Socket.IO room named after each symbol.
   */
  @SubscribeMessage(SOCKET_EVENTS.SUBSCRIBE_STOCK)
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SymbolsPayload,
  ) {
    const subs = this.clientSubscriptions.get(client.id) ?? new Set();

    const addedSymbols: string[] = [];
    for (const symbol of payload.symbols) {
      if (subs.size >= StockGateway.MAX_SUBSCRIPTIONS) {
        this.logger.warn(
          `Client ${client.id} reached max subscriptions (${StockGateway.MAX_SUBSCRIPTIONS})`,
        );
        break;
      }
      if (!subs.has(symbol)) {
        subs.add(symbol);
        void client.join(`stock:${symbol}`);
        addedSymbols.push(symbol);
      }
    }

    this.clientSubscriptions.set(client.id, subs);

    client.emit('subscribed', {
      symbols: addedSymbols,
      totalSubscriptions: subs.size,
      maxSubscriptions: StockGateway.MAX_SUBSCRIPTIONS,
    });

    this.logger.debug(
      `Client ${client.id} subscribed to ${addedSymbols.length} symbols (total: ${subs.size})`,
    );
  }

  /**
   * Handle client unsubscription from stock price updates.
   */
  @SubscribeMessage(SOCKET_EVENTS.UNSUBSCRIBE_STOCK)
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SymbolsPayload,
  ) {
    const subs = this.clientSubscriptions.get(client.id) ?? new Set();

    for (const symbol of payload.symbols) {
      subs.delete(symbol);
      void client.leave(`stock:${symbol}`);
    }

    this.clientSubscriptions.set(client.id, subs);

    client.emit('unsubscribed', {
      symbols: payload.symbols,
      totalSubscriptions: subs.size,
    });
  }

  /**
   * Broadcast a price update to all clients subscribed to a symbol.
   * Called by the KIS data ingestion pipeline when new prices arrive.
   */
  broadcastPrice(symbol: string, priceData: PriceData): void {
    this.server.to(`stock:${symbol}`).emit(SOCKET_EVENTS.STOCK_PRICE, priceData);
  }

  /**
   * Broadcast a surge alert to all connected clients.
   */
  broadcastSurge(surgeData: Record<string, unknown>): void {
    this.server.emit(SOCKET_EVENTS.STOCK_SURGE, surgeData);
  }

  /**
   * Broadcast an alert trigger to a specific user's socket(s).
   */
  broadcastAlertTriggered(userId: number, alertData: Record<string, unknown>): void {
    // In production, map userId -> socket IDs via a Redis-backed registry.
    // For now, emit to all and let clients filter by their userId.
    this.server.emit(SOCKET_EVENTS.ALERT_TRIGGERED, alertData);
  }
}
