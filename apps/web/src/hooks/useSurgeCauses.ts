'use client';

/**
 * TanStack Query hook for rule-based surge cause analysis.
 *
 * Fetches surge cause data from GET /api/stocks/surge/causes.
 * Each cause includes a one-line summary, confidence level,
 * optional news link, and optional theme tag.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { SurgeCauseResult } from '@stock-dashboard/shared';

interface SurgeCausesResponse {
  data: SurgeCauseResult[];
}

export function useSurgeCauses() {
  return useQuery({
    queryKey: queryKeys.alerts.surgeCauses(),
    queryFn: async (): Promise<SurgeCausesResponse> => {
      try {
        return await apiGet<SurgeCausesResponse>('/stocks/surge/causes');
      } catch (error: unknown) {
        // Endpoint may not exist yet — return empty data gracefully
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode: number }).statusCode
            : 0;
        if (statusCode === 404) {
          return { data: [] };
        }
        throw error;
      }
    },
    staleTime: 30_000, // 30 seconds — causes are cached server-side for 30 min
    gcTime: 5 * 60 * 1000,
    retry: false,
    refetchInterval: 60_000, // Refetch every 60 seconds for new causes
  });
}
