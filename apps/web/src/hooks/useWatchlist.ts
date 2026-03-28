'use client';

/**
 * TanStack Query hooks for watchlist CRUD operations.
 *
 * staleTime: 30s — only changes on user action (add/remove).
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
    queryFn: () => apiGet<WatchlistListResponse>('/watchlists'),
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
