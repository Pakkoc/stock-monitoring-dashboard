'use client';

/**
 * Hook for subscribing to real-time stock price updates.
 *
 * Automatically subscribes when symbols change and unsubscribes on unmount.
 * Respects the maximum subscription limit from SocketManager.
 */
import { useEffect, useRef, useMemo } from 'react';
import { useSocket } from '@/components/providers/SocketProvider';
import { useRealtimeStore } from '@/stores/realtime';

interface SubscriptionResult {
  /** Currently subscribed symbols */
  subscribedSymbols: string[];
  /** Symbols that were rejected due to limit */
  rejectedSymbols: string[];
  /** Current subscription count */
  subscriptionCount: number;
  /** Maximum allowed subscriptions */
  maxSubscriptions: number;
}

export function useStockSubscription(symbols: string[]): SubscriptionResult {
  const { subscribe, unsubscribe, subscriptionCount, maxSubscriptions } =
    useSocket();
  const addSubscription = useRealtimeStore((s) => s.addSubscription);
  const removeSubscription = useRealtimeStore((s) => s.removeSubscription);

  const rejectedRef = useRef<string[]>([]);

  // Stable symbol key for dependency comparison
  const symbolKey = useMemo(() => [...symbols].sort().join(','), [symbols]);

  useEffect(() => {
    if (symbols.length === 0) return;

    const result = subscribe(symbols);
    rejectedRef.current = result.rejected;

    // Sync to realtime store
    for (const sym of result.subscribed) {
      addSubscription(sym);
    }

    return () => {
      unsubscribe(symbols);
      for (const sym of symbols) {
        removeSubscription(sym);
      }
      rejectedRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolKey]);

  return {
    subscribedSymbols: symbols.filter(
      (s) => !rejectedRef.current.includes(s),
    ),
    rejectedSymbols: rejectedRef.current,
    subscriptionCount,
    maxSubscriptions,
  };
}
