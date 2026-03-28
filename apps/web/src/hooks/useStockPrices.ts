'use client';

/**
 * TanStack Query hook for stock price history (OHLCV).
 *
 * Fetches historical candlestick data for chart rendering.
 * staleTime: 60s — historical data rarely changes; real-time via WebSocket.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { OHLCV } from '@stock-dashboard/shared';

type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d';

interface PriceHistoryResponse {
  prices: OHLCV[];
  symbol: string;
  timeframe: Timeframe;
}

export function useStockPrices(
  symbol: string | null,
  timeframe: Timeframe = '1d',
) {
  return useQuery({
    queryKey: queryKeys.stocks.prices(symbol ?? '', timeframe),
    queryFn: () =>
      apiGet<PriceHistoryResponse>(
        `/stocks/${symbol}/prices?timeframe=${timeframe}`,
      ),
    enabled: !!symbol,
    staleTime: 60_000,
    gcTime: 30 * 60 * 1000,
  });
}
