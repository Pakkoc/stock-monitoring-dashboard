/**
 * Canonical Socket.IO event names — Single Source of Truth
 *
 * Both frontend and backend MUST import event names from here.
 * Do NOT hardcode event name strings anywhere else.
 */

// ─── Client → Server ────────────────────────────────────────
export const SOCKET_EVENTS = {
  /** Client subscribes to stock price updates (array of symbols) */
  SUBSCRIBE_STOCK: 'subscribe:stock',
  /** Client unsubscribes from stock price updates */
  UNSUBSCRIBE_STOCK: 'unsubscribe:stock',

  // ─── Server → Client ──────────────────────────────────────
  /** Real-time price tick for a subscribed stock */
  STOCK_PRICE: 'stock:price',
  /** Surge alert: stock exceeded threshold */
  STOCK_SURGE: 'stock:surge',
  /** New articles collected for subscribed stocks */
  NEWS_UPDATE: 'news:update',
  /** KOSPI/KOSDAQ index update */
  INDEX_UPDATE: 'index:update',
  /** AI analysis pipeline completed */
  AI_ANALYSIS_COMPLETE: 'ai:analysis:complete',
  /** User-configured alert triggered */
  ALERT_TRIGGERED: 'alert:triggered',
  /** Market open/close status change */
  MARKET_STATUS: 'market:status',
} as const;

/** WebSocket namespace */
export const WS_NAMESPACE = '/ws';

/** Type-safe event name union */
export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
