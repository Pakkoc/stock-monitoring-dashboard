'use client';

/**
 * TanStack Query hook for surge alerts.
 *
 * Fetches recent surge alerts from REST API on initial load.
 * Real-time alerts are pushed via WebSocket and stored in the realtime store.
 *
 * NOTE: The backend surge alert endpoint does not exist yet. This hook
 * gracefully returns an empty list on 404/error so the widget renders
 * "급등 알림이 없습니다" instead of an infinite spinner.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { StockSurgePayload } from '@stock-dashboard/shared';

interface SurgeAlertsResponse {
  alerts: StockSurgePayload[];
}

export function useSurgeAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts.surge(),
    queryFn: async (): Promise<SurgeAlertsResponse> => {
      try {
        return await apiGet<SurgeAlertsResponse>('/alerts/surge');
      } catch (error: unknown) {
        // Backend endpoint does not exist yet — return empty data
        // so the widget shows "급등 알림이 없습니다" instead of an error state
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode: number }).statusCode
            : 0;
        if (statusCode === 404) {
          return { alerts: [] };
        }
        throw error;
      }
    },
    staleTime: 10_000,
    gcTime: 5 * 60 * 1000,
  });
}
