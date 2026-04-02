'use client';

/**
 * TanStack Query hooks for watchlist CRUD operations.
 *
 * staleTime: 30s — only changes on user action (add/remove).
 * The query is disabled when the user is not authenticated to avoid 401 errors.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { StockInfo } from '@stock-dashboard/shared';

interface WatchlistResponse {
  id: string;
  name: string;
  stocks: WatchlistStock[];
}

interface WatchlistStock extends StockInfo {
  addedAt: string;
}

interface WatchlistListResponse {
  watchlists: WatchlistResponse[];
}

export function useWatchlists() {
  return useQuery({
    queryKey: queryKeys.watchlists.list(),
    queryFn: async (): Promise<WatchlistListResponse> => {
      try {
        // 1. Get watchlist list
        const listRes = await apiGet<{ data: { id: number; name: string; itemCount: number }[] }>('/watchlists');
        const lists = listRes?.data ?? [];

        if (lists.length === 0) return { watchlists: [] };

        // 2. Get items for the first watchlist
        const firstId = lists[0]!.id;
        const itemsRes = await apiGet<{ data: { id: number; stockId: number; symbol: string; name: string; market: string; currentPrice: number; changeRate: number; volume: number; addedAt: string }[] }>(
          `/watchlists/${firstId}/items`,
        );
        const items = itemsRes?.data ?? [];

        return {
          watchlists: [{
            id: String(firstId),
            name: lists[0]!.name,
            stocks: items.map((item) => ({
              id: item.stockId,
              symbol: item.symbol,
              name: item.name,
              market: item.market as 'KOSPI' | 'KOSDAQ',
              sector: null,
              currentPrice: item.currentPrice,
              changeRate: item.changeRate,
              volume: item.volume,
              addedAt: item.addedAt,
            })),
          }],
        };
      } catch (error: unknown) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode: number }).statusCode
            : 0;
        if (statusCode === 401) {
          return { watchlists: [] };
        }
        throw error;
      }
    },
    staleTime: 30_000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useWatchlistDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.watchlists.detail(id),
    queryFn: () => apiGet<WatchlistResponse>(`/watchlists/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      watchlistId,
      symbol,
    }: {
      watchlistId: string;
      symbol: string;
    }) => apiPost(`/watchlists/${watchlistId}/stocks`, { symbol }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlists.all });
    },
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      watchlistId,
      symbol,
    }: {
      watchlistId: string;
      symbol: string;
    }) => apiDelete(`/watchlists/${watchlistId}/stocks/${symbol}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlists.all });
    },
  });
}
