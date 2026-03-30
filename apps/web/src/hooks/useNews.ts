'use client';

/**
 * TanStack Query hook for news articles.
 *
 * Fetches news filtered by stock symbol or all watchlist stocks.
 * staleTime: 60s — invalidated by WebSocket news:update events.
 *
 * Backend returns: { data: NewsArticle[], meta: { page, limit, total, ... } }
 * We normalize into { articles, total } for the widget.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { NewsWithStocks } from '@stock-dashboard/shared';

interface NewsResult {
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
    queryFn: async (): Promise<NewsResult> => {
      // Backend returns { data: [...articles], meta: { total, ... } }
      // Articles may lack the `stocks` relation — default to empty array.
      const raw = await apiGet<{ data: Array<Partial<NewsWithStocks>>; meta?: { total: number } }>(endpoint);
      const articles: NewsWithStocks[] = (raw.data ?? []).map((a) => ({
        ...a,
        stocks: a.stocks ?? [],
      })) as NewsWithStocks[];
      return {
        articles,
        total: raw.meta?.total ?? articles.length,
      };
    },
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
  });
}
