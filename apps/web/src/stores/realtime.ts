/**
 * Real-time data store — manages WebSocket-driven state updates.
 *
 * Stores the latest price data, surge alerts, market indices,
 * and connection status received via Socket.IO.
 */
import { create } from 'zustand';

import type {
  RealTimePrice,
  MarketIndex,
  StockSurgePayload,
} from '@stock-dashboard/shared';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface RealtimeState {
  /** Latest price data keyed by stock symbol */
  prices: Record<string, RealTimePrice>;
  /** Latest market index data */
  indices: MarketIndex[];
  /** Recent surge alerts (most recent first) */
  surgeAlerts: StockSurgePayload[];
  /** Whether the market is currently open */
  isMarketOpen: boolean;
  /** WebSocket connection status */
  connectionStatus: ConnectionStatus;
  /** Symbols currently subscribed to real-time updates */
  subscribedSymbols: string[];
  /** Last heartbeat timestamp (ms since epoch) */
  lastHeartbeat: number | null;

  // Price actions
  updatePrice: (symbol: string, price: RealTimePrice) => void;
  batchUpdatePrices: (updates: Array<{ symbol: string; price: RealTimePrice }>) => void;

  // Index actions
  updateIndices: (indices: MarketIndex[]) => void;

  // Surge alert actions
  addSurgeAlert: (alert: StockSurgePayload) => void;

  // Market status
  setMarketOpen: (isOpen: boolean) => void;

  // Connection
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Subscriptions
  addSubscription: (symbol: string) => void;
  removeSubscription: (symbol: string) => void;

  // Heartbeat
  setLastHeartbeat: (timestamp: number) => void;
}

const MAX_SURGE_ALERTS = 50;

export const useRealtimeStore = create<RealtimeState>()((set) => ({
  prices: {},
  indices: [],
  surgeAlerts: [],
  isMarketOpen: false,
  connectionStatus: 'disconnected',
  subscribedSymbols: [],
  lastHeartbeat: null,

  updatePrice: (symbol, price) =>
    set((state) => ({
      prices: { ...state.prices, [symbol]: price },
    })),

  batchUpdatePrices: (updates) =>
    set((state) => {
      const next = { ...state.prices };
      for (const { symbol, price } of updates) {
        next[symbol] = price;
      }
      return { prices: next };
    }),

  updateIndices: (indices) => set({ indices }),

  addSurgeAlert: (alert) =>
    set((state) => ({
      surgeAlerts: [alert, ...state.surgeAlerts].slice(0, MAX_SURGE_ALERTS),
    })),

  setMarketOpen: (isOpen) => set({ isMarketOpen: isOpen }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  addSubscription: (symbol) =>
    set((state) => {
      if (state.subscribedSymbols.includes(symbol)) return state;
      return { subscribedSymbols: [...state.subscribedSymbols, symbol] };
    }),

  removeSubscription: (symbol) =>
    set((state) => ({
      subscribedSymbols: state.subscribedSymbols.filter((s) => s !== symbol),
    })),

  setLastHeartbeat: (timestamp) => set({ lastHeartbeat: timestamp }),
}));
