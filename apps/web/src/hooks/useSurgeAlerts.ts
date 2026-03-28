'use client';

/**
 * TanStack Query hook for surge alerts.
 *
 * Fetches recent surge alerts from REST API on initial load.
 * Real-time alerts are pushed via WebSocket and stored in the realtime store.
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
    queryFn: () => apiGet<SurgeAlertsResponse>('/alerts/surge'),
    staleTime: 10_000,
    gcTime: 5 * 60 * 1000,
  });
}
