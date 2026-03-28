'use client';

/**
 * TanStack Query hooks for AI analysis results.
 *
 * staleTime: 300s — AI results are expensive; cache aggressively.
 * Supports both fetching existing analyses and triggering new ones.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { AiAnalysis } from '@stock-dashboard/shared';

interface AiAnalysisResponse {
  analyses: AiAnalysis[];
}

interface TriggerAnalysisResponse {
  analysis: AiAnalysis;
  isNew: boolean;
}

export function useAiAnalysis(symbol: string | null) {
  return useQuery({
    queryKey: queryKeys.aiAnalysis.byStock(symbol ?? ''),
    queryFn: () =>
      apiGet<AiAnalysisResponse>(`/ai/analysis/${symbol}`),
    enabled: !!symbol,
    staleTime: 300_000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useTriggerAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (symbol: string) =>
      apiPost<TriggerAnalysisResponse>(`/ai/analyze/${symbol}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.aiAnalysis.byStock(data.analysis.stockSymbol),
      });
    },
  });
}
