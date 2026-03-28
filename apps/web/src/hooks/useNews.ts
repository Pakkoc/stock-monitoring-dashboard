'use client';

/**
 * TanStack Query hook for news articles.
 *
 * Fetches news filtered by stock symbol or all watchlist stocks.
 * staleTime: 60s — invalidated by WebSocket news:update events.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { NewsWithStocks } from '@stock-dashboard/shared';

interface NewsResponse {
  articles: NewsWithStocks[];
  total: number;
}

export function useNews(symbol?: string | null, limit: number = 20) {
  const endpoint = symbol
    ? `/stocks/${symbol}/news?limit=${limit}`
    : `/news?limit=${limit}`;

  const queryKey = symbol
    ? queryKeys.stocks.news(symbol)
    : ['news', 'all', { limit }];

  return useQuery({
    queryKey,
    queryFn: () => apiGet<NewsResponse>(endpoint),
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
  });
}
