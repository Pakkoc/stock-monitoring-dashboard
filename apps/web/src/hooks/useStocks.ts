'use client';

/**
 * TanStack Query hook for stock list.
 *
 * Fetches paginated/filtered stock list from REST API.
 * staleTime: 10s — list data updated by WebSocket events.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys, type StockFilters } from '@/lib/query-keys';
import type { StockInfo } from '@stock-dashboard/shared';

/**
 * Backend response shape for /api/stocks:
 *   { data: StockInfo[], meta: { page, limit, total, ... } }
 *
 * We normalize this into a consistent StockListResult.
 */
interface StockListResult {
  stocks: StockInfo[];
  total: number;
  page: number;
  limit: number;
}

export function useStocks(filters: StockFilters = {}) {
  const queryString = new URLSearchParams();
  if (filters.market) queryString.set('market', filters.market);
  if (filters.sector) queryString.set('sector', filters.sector);
  if (filters.sortBy) queryString.set('sortBy', filters.sortBy);
  if (filters.sortOrder) queryString.set('sortOrder', filters.sortOrder);
  if (filters.search) queryString.set('search', filters.search);
  if (filters.page) queryString.set('page', String(filters.page));
  if (filters.limit) queryString.set('limit', String(filters.limit));

  const qs = queryString.toString();
  const endpoint = `/stocks${qs ? `?${qs}` : ''}`;

  return useQuery({
    queryKey: queryKeys.stocks.list(filters),
    queryFn: async (): Promise<StockListResult> => {
      // Backend returns { data: StockInfo[], meta?: { page, limit, total, ... } }
      const raw = await apiGet<{ data: StockInfo[]; meta?: { total: number; page: number; limit: number } }>(endpoint);
      return {
        stocks: raw.data ?? [],
        total: raw.meta?.total ?? (raw.data?.length ?? 0),
        page: raw.meta?.page ?? 1,
        limit: raw.meta?.limit ?? (filters.limit ?? 20),
      };
    },
    staleTime: 10_000,
  });
}

export function useTopVolumeStocks(
  limit: number = 10,
  market?: 'kospi' | 'kosdaq',
) {
  const filters: StockFilters = {
    sortBy: 'volume',
    sortOrder: 'desc',
    limit,
    market,
  };

  return useStocks(filters);
}
