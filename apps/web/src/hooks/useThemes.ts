'use client';

/**
 * TanStack Query hook for theme/sector performance data.
 *
 * staleTime: 30s with refetchInterval: 30s — aggregated server-side.
 *
 * NOTE: The backend ThemeController does not exist yet. This hook
 * gracefully returns an empty list on 404/error so the widget renders
 * "데이터 없음" instead of an infinite spinner.
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
    queryFn: async (): Promise<ThemePerformanceResponse> => {
      try {
        return await apiGet<ThemePerformanceResponse>(
          `/themes/performance?limit=${limit}`,
        );
      } catch (error: unknown) {
        // Backend endpoint does not exist yet — return empty data
        // so the widget shows "데이터 없음" instead of an error state
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode: number }).statusCode
            : 0;
        if (statusCode === 404) {
          return { themes: [] };
        }
        throw error;
      }
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    // Don't retry on 404 — the endpoint doesn't exist yet
    retry: false,
  });
}
