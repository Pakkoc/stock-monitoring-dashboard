/**
 * WebSocket event payload types — shared between frontend and backend
 * Canonical event names defined in constants/socket-events.ts
 */

import type { RealTimePrice, MarketIndex } from './stock';
import type { NewsWithStocks } from './news';
import type { AiAnalysis, SurgeCategory } from './ai';

/** Client-to-server events */
export interface ClientToServerEvents {
  'subscribe:stock': (payload: { symbols: string[] }) => void;
  'unsubscribe:stock': (payload: { symbols: string[] }) => void;
}

/** Server-to-client events */
export interface ServerToClientEvents {
  'stock:price': (payload: StockPricePayload) => void;
  'stock:surge': (payload: StockSurgePayload) => void;
  'news:update': (payload: NewsUpdatePayload) => void;
  'index:update': (payload: IndexUpdatePayload) => void;
  'ai:analysis:complete': (payload: AiAnalysisCompletePayload) => void;
  'alert:triggered': (payload: AlertTriggeredPayload) => void;
  'market:status': (payload: MarketStatusPayload) => void;
}

/** stock:price event payload */
export interface StockPricePayload {
  symbol: string;
  price: RealTimePrice;
}

/** stock:surge event payload */
export interface StockSurgePayload {
  symbol: string;
  stockName: string;
  changeRate: number;
  currentPrice: number;
  category: SurgeCategory;
  timestamp: Date;
}

/** news:update event payload */
export interface NewsUpdatePayload {
  articles: NewsWithStocks[];
}

/** index:update event payload */
export interface IndexUpdatePayload {
  indices: MarketIndex[];
}

/** ai:analysis:complete event payload */
export interface AiAnalysisCompletePayload {
  analysis: AiAnalysis;
}

/** alert:triggered event payload */
export interface AlertTriggeredPayload {
  alertId: string;
  userId: string;
  symbol: string;
  stockName: string;
  conditionType: string;
  currentValue: number;
  threshold: number;
  message: string;
  triggeredAt: Date;
}

/** market:status event payload */
export interface MarketStatusPayload {
  isOpen: boolean;
  message: string;
  nextEvent: string; // e.g., "Market closes at 15:30 KST"
}
