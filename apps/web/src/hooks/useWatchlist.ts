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
import { useAuthStore } from '@/stores/auth';
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
  const token = useAuthStore((s) => s.token);

  return useQuery({
    queryKey: queryKeys.watchlists.list(),
    queryFn: async (): Promise<WatchlistListResponse> => {
      try {
        return await apiGet<WatchlistListResponse>('/watchlists');
      } catch (error: unknown) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode: number }).statusCode
            : 0;
        // On 401, return empty instead of throwing so the widget
        // shows "관심종목이 없습니다" rather than an error state.
        if (statusCode === 401) {
          return { watchlists: [] };
        }
        throw error;
      }
    },
    // Only fetch when the user has a token
    enabled: !!token,
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
