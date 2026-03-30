'use client';

/**
 * Socket.IO connection provider.
 *
 * Manages the WebSocket lifecycle:
 * - Connects on mount using the SocketManager singleton
 * - Updates realtime store with connection status
 * - Listens for price, surge, news, index, AI, and market status events
 * - Handles heartbeat monitoring
 * - Disconnects on unmount
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { socketManager, type ConnectionStatus } from '@/lib/socket';
import { useRealtimeStore } from '@/stores/realtime';
import { useAuthStore } from '@/stores/auth';
import {
  SOCKET_EVENTS,
  type StockPricePayload,
  type StockSurgePayload,
  type IndexUpdatePayload,
  type MarketStatusPayload,
} from '@stock-dashboard/shared';

interface SocketContextValue {
  socket: Socket | null;
  status: ConnectionStatus;
  subscribe: (symbols: string[]) => { subscribed: string[]; rejected: string[] };
  unsubscribe: (symbols: string[]) => void;
  subscriptionCount: number;
  maxSubscriptions: number;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  status: 'disconnected',
  subscribe: () => ({ subscribed: [], rejected: [] }),
  unsubscribe: () => {},
  subscriptionCount: 0,
  maxSubscriptions: 41,
});

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const socketRef = useRef<Socket | null>(null);

  const updatePrice = useRealtimeStore((s) => s.updatePrice);
  const addSurgeAlert = useRealtimeStore((s) => s.addSurgeAlert);
  const updateIndices = useRealtimeStore((s) => s.updateIndices);
  const setMarketOpen = useRealtimeStore((s) => s.setMarketOpen);
  const connectionStatus = useRealtimeStore((s) => s.connectionStatus);
  const setConnectionStatus = useRealtimeStore((s) => s.setConnectionStatus);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    // Only connect when authenticated
    if (!isAuthenticated) return;

    // Connect socket
    const socket = socketManager.connect();
    socketRef.current = socket;

    // Sync connection status to Zustand store
    const unsubStatus = socketManager.onConnectionChange((status) => {
      setConnectionStatus(status);
    });

    // Set initial status
    setConnectionStatus(socketManager.getStatus());

    // Real-time price updates
    socket.on(
      SOCKET_EVENTS.STOCK_PRICE as 'stock:price',
      (payload: StockPricePayload) => {
        updatePrice(payload.symbol, payload.price);
      },
    );

    // Surge alerts
    socket.on(
      SOCKET_EVENTS.STOCK_SURGE as 'stock:surge',
      (payload: StockSurgePayload) => {
        addSurgeAlert(payload);
      },
    );

    // Market index updates
    socket.on(
      SOCKET_EVENTS.INDEX_UPDATE as 'index:update',
      (payload: IndexUpdatePayload) => {
        updateIndices(payload.indices);
      },
    );

    // Market status updates
    socket.on(
      SOCKET_EVENTS.MARKET_STATUS as 'market:status',
      (payload: MarketStatusPayload) => {
        setMarketOpen(payload.isOpen);
      },
    );

    // Heartbeat
    socket.on('heartbeat' as never, () => {
      socketManager.recordHeartbeat();
    });

    return () => {
      unsubStatus();
      socketManager.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, updatePrice, addSurgeAlert, updateIndices, setMarketOpen, setConnectionStatus]);

  const contextValue: SocketContextValue = {
    socket: socketRef.current,
    status: connectionStatus,
    subscribe: (symbols: string[]) => socketManager.subscribe(symbols),
    unsubscribe: (symbols: string[]) => socketManager.unsubscribe(symbols),
    subscriptionCount: socketManager.getSubscriptionCount(),
    maxSubscriptions: socketManager.maxSubscriptions,
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
}
