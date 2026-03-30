'use client';

/**
 * TanStack Query hook for market indices (KOSPI, KOSDAQ).
 *
 * staleTime: 5s — real-time updates via WebSocket supplement this.
 *
 * Backend returns: { data: MarketIndex[] }
 * We normalize into { indices: MarketIndex[] } for the widget.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { MarketIndex } from '@stock-dashboard/shared';

interface MarketIndicesResult {
  indices: MarketIndex[];
}

export function useMarketIndices() {
  return useQuery({
    queryKey: queryKeys.marketIndices.all,
    queryFn: async (): Promise<MarketIndicesResult> => {
      // Backend returns { data: MarketIndex[] }
      const raw = await apiGet<{ data: MarketIndex[] }>('/stocks/market/indices');
      return {
        indices: raw.data ?? [],
      };
    },
    staleTime: 5_000,
    gcTime: 5 * 60 * 1000,
  });
}
