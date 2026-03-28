'use client';

/**
 * TanStack Query hook for theme/sector performance data.
 *
 * staleTime: 30s with refetchInterval: 30s — aggregated server-side.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface ThemePerformance {
  themeId: string;
  name: string;
  changePercent: number;
  stockCount: number;
  topStocks: Array<{
    symbol: string;
    name: string;
    changePercent: number;
  }>;
  sparklineData: number[];
  totalTradeValue: number;
}

interface ThemePerformanceResponse {
  themes: ThemePerformance[];
}

export function useThemePerformance(limit: number = 10) {
  return useQuery({
    queryKey: queryKeys.themes.performance(),
    queryFn: () =>
      apiGet<ThemePerformanceResponse>(
        `/themes/performance?limit=${limit}`,
      ),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
