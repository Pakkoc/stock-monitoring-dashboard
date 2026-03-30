'use client';

/**
 * TanStack Query hook for market indices (KOSPI, KOSDAQ).
 *
 * staleTime: 5s — real-time updates via WebSocket supplement this.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { MarketIndex } from '@stock-dashboard/shared';

interface MarketIndicesResponse {
  indices: MarketIndex[];
}

export function useMarketIndices() {
  return useQuery({
    queryKey: queryKeys.marketIndices.all,
    queryFn: () => apiGet<MarketIndicesResponse>('/stocks/market/indices'),
    staleTime: 5_000,
    gcTime: 5 * 60 * 1000,
  });
}
