'use client';

/**
 * TanStack Query hook for stock detail.
 *
 * Fetches detailed stock information by symbol.
 * staleTime: 30s — detail page, less volatile metadata.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Stock } from '@stock-dashboard/shared';

interface StockDetailResponse {
  stock: Stock;
}

export function useStockDetail(symbol: string | null) {
  return useQuery({
    queryKey: queryKeys.stocks.detail(symbol ?? ''),
    queryFn: () => apiGet<StockDetailResponse>(`/stocks/${symbol}`),
    enabled: !!symbol,
    staleTime: 30_000,
    gcTime: 10 * 60 * 1000,
  });
}
