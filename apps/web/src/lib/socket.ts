/**
 * Socket.IO client singleton — production-ready connection manager.
 *
 * Features:
 * - Singleton pattern with lazy initialization
 * - Auto-reconnection with exponential backoff (1s to 30s, with jitter)
 * - Connection state management (connecting, connected, disconnected, error)
 * - Authentication: send session token on connection
 * - Room subscription management: join/leave stock symbol rooms
 * - Max subscriptions tracking (matches backend KIS_MAX_SUBSCRIPTIONS = 41)
 * - Event type safety using shared constants from packages/shared
 * - Heartbeat monitoring
 */
import { io, Socket } from 'socket.io-client';

import {
  SOCKET_EVENTS,
  KIS_MAX_SUBSCRIPTIONS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@stock-dashboard/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Connection state listeners */
type ConnectionListener = (status: ConnectionStatus) => void;
type HeartbeatListener = (timestamp: number) => void;

class SocketManager {
  private socket: TypedSocket | null = null;
  private subscribedSymbols = new Set<string>();
  private connectionListeners = new Set<ConnectionListener>();
  private heartbeatListeners = new Set<HeartbeatListener>();
  private connectionStatus: ConnectionStatus = 'disconnected';
  private lastHeartbeat: number | null = null;
  private heartbeatCheckInterval: ReturnType<typeof setInterval> | null = null;

  /** Maximum concurrent symbol subscriptions (matches backend KIS limit) */
  readonly maxSubscriptions = KIS_MAX_SUBSCRIPTIONS;

  /**
   * Get or create the Socket.IO client singleton.
   * Call this only on the client side (not during SSR).
   */
  connect(): TypedSocket {
    if (this.socket) return this.socket;

    this.setStatus('connecting');

    this.socket = io(WS_URL, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      autoConnect: true,

      // Exponential backoff reconnection
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,

      timeout: 10_000,

      // Authentication: send session token
      auth: (cb) => {
        const token = this.getSessionToken();
        cb({ token });
      },
    }) as TypedSocket;

    this.setupEventHandlers(this.socket);
    this.startHeartbeatMonitor();

    return this.socket;
  }

  /**
   * Get the socket instance if it exists (does not create).
   */
  getSocket(): TypedSocket | null {
    return this.socket;
  }

  /**
   * Get the socket instance, creating if needed.
   */
  getOrCreateSocket(): TypedSocket {
    return this.socket ?? this.connect();
  }

  /**
   * Disconnect the socket (e.g., on logout).
   */
  disconnect(): void {
    this.stopHeartbeatMonitor();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.subscribedSymbols.clear();
    this.setStatus('disconnected');
    this.lastHeartbeat = null;
  }

  /**
   * Subscribe to real-time updates for given symbols.
   * Respects the max subscription limit.
   */
  subscribe(symbols: string[]): { subscribed: string[]; rejected: string[] } {
    const subscribed: string[] = [];
    const rejected: string[] = [];

    for (const symbol of symbols) {
      if (this.subscribedSymbols.has(symbol)) {
        subscribed.push(symbol);
        continue;
      }

      if (this.subscribedSymbols.size >= this.maxSubscriptions) {
        rejected.push(symbol);
        continue;
      }

      this.subscribedSymbols.add(symbol);
      subscribed.push(symbol);
    }

    if (subscribed.length > 0 && this.socket?.connected) {
      const newSymbols = subscribed.filter(
        (s) => !symbols.includes(s) || !this.subscribedSymbols.has(s)
      );
      // Emit subscription for all requested (server deduplicates)
      this.socket.emit(SOCKET_EVENTS.SUBSCRIBE_STOCK as 'subscribe:stock', {
        symbols: subscribed,
      });
    }

    return { subscribed, rejected };
  }

  /**
   * Unsubscribe from real-time updates for given symbols.
   */
  unsubscribe(symbols: string[]): void {
    const toRemove = symbols.filter((s) => this.subscribedSymbols.has(s));

    for (const symbol of toRemove) {
      this.subscribedSymbols.delete(symbol);
    }

    if (toRemove.length > 0 && this.socket?.connected) {
      this.socket.emit(SOCKET_EVENTS.UNSUBSCRIBE_STOCK as 'unsubscribe:stock', {
        symbols: toRemove,
      });
    }
  }

  /**
   * Get currently subscribed symbols.
   */
  getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  /**
   * Get current subscription count.
   */
  getSubscriptionCount(): number {
    return this.subscribedSymbols.size;
  }

  /**
   * Get current connection status.
   */
  getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get last heartbeat timestamp.
   */
  getLastHeartbeat(): number | null {
    return this.lastHeartbeat;
  }

  /**
   * Register a connection status listener.
   */
  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  /**
   * Register a heartbeat listener.
   */
  onHeartbeat(listener: HeartbeatListener): () => void {
    this.heartbeatListeners.add(listener);
    return () => {
      this.heartbeatListeners.delete(listener);
    };
  }

  // ---- Private methods ----

  private setStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    for (const listener of this.connectionListeners) {
      listener(status);
    }
  }

  private setupEventHandlers(socket: TypedSocket): void {
    socket.on('connect', () => {
      this.setStatus('connected');

      // Re-subscribe all previously subscribed symbols after reconnect
      if (this.subscribedSymbols.size > 0) {
        socket.emit(SOCKET_EVENTS.SUBSCRIBE_STOCK as 'subscribe:stock', {
          symbols: Array.from(this.subscribedSymbols),
        });
      }
    });

    socket.on('disconnect', (reason) => {
      this.setStatus('disconnected');
      // If server intentionally disconnected, try reconnecting
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    socket.on('connect_error', () => {
      this.setStatus('error');
    });

    socket.io.on('reconnect_attempt', (attemptNumber) => {
      this.setStatus('connecting');
      if (process.env.NODE_ENV === 'development') {
        console.info(`[Socket] Reconnect attempt #${attemptNumber}`);
      }
    });

    socket.io.on('reconnect', () => {
      this.setStatus('connected');
    });
  }

  private startHeartbeatMonitor(): void {
    this.stopHeartbeatMonitor();

    // Check heartbeat every 30 seconds
    this.heartbeatCheckInterval = setInterval(() => {
      if (
        this.lastHeartbeat &&
        Date.now() - this.lastHeartbeat > 60_000 &&
        this.connectionStatus === 'connected'
      ) {
        // No heartbeat for 60s while "connected" — force reconnect
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Socket] Heartbeat timeout, forcing reconnect');
        }
        this.socket?.disconnect();
        this.socket?.connect();
      }
    }, 30_000);
  }

  private stopHeartbeatMonitor(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
  }

  private getSessionToken(): string | null {
    if (typeof document === 'undefined') return null;
    // Try cookie first (Better Auth session)
    const cookieMatch = document.cookie.match(
      /better-auth\.session_token=([^;]+)/,
    );
    if (cookieMatch) return cookieMatch[1];

    // Fallback to localStorage token
    try {
      const stored = localStorage.getItem('auth-token');
      return stored;
    } catch {
      return null;
    }
  }

  /**
   * Update heartbeat timestamp (called by SocketProvider on heartbeat event).
   */
  recordHeartbeat(): void {
    this.lastHeartbeat = Date.now();
    for (const listener of this.heartbeatListeners) {
      listener(this.lastHeartbeat);
    }
  }
}

/** Global singleton instance */
export const socketManager = new SocketManager();

/**
 * Get or create the Socket.IO client singleton.
 * @deprecated Use socketManager.getOrCreateSocket() directly.
 */
export function getSocket(): TypedSocket {
  return socketManager.getOrCreateSocket();
}

/**
 * Disconnect the socket (e.g., on logout).
 * @deprecated Use socketManager.disconnect() directly.
 */
export function disconnectSocket(): void {
  socketManager.disconnect();
}
