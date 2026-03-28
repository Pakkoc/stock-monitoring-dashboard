'use client';

/**
 * TanStack Query hook for stock list.
 *
 * Fetches paginated/filtered stock list from REST API.
 * staleTime: 10s — list data updated by WebSocket events.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet, type ApiResponse } from '@/lib/api';
import { queryKeys, type StockFilters } from '@/lib/query-keys';
import type { StockInfo } from '@stock-dashboard/shared';

interface StockListResponse {
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
    queryFn: () => apiGet<ApiResponse<StockListResponse>>(endpoint),
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
