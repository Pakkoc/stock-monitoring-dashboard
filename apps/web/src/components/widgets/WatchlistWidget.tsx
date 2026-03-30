'use client';

/**
 * WatchlistWidget — Table of user's watchlist stocks with real-time prices.
 *
 * Features:
 * - Sortable columns (price, change%, volume)
 * - Real-time price updates via Zustand realtime store
 * - Click row to select stock (sets activeSymbol)
 * - Korean stock coloring (red=up, blue=down)
 */
import { useState, useMemo, useCallback } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetWrapper } from './WidgetWrapper';
import { StockPrice } from '@/components/ui/StockPrice';
import { ChangeRate } from '@/components/ui/ChangeRate';
import { VolumeDisplay } from '@/components/ui/NumberFormat';
import { useWatchlists } from '@/hooks/useWatchlist';
import { useDashboardStore } from '@/stores/dashboard';
import { useRealtimeStore } from '@/stores/realtime';

type SortField = 'name' | 'price' | 'changeRate' | 'volume';
type SortOrder = 'asc' | 'desc';

interface WatchlistWidgetProps {
  watchlistId?: string;
}

export function WatchlistWidget({ watchlistId }: WatchlistWidgetProps) {
  const { data, isLoading, error } = useWatchlists();
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const prices = useRealtimeStore((s) => s.prices);

  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortOrder('desc');
      }
    },
    [sortField],
  );

  const watchlist = useMemo(() => {
    if (!data?.watchlists?.length) return null;
    if (watchlistId) {
      return data.watchlists.find((w) => w.id === watchlistId) ?? data.watchlists[0];
    }
    return data.watchlists[0];
  }, [data, watchlistId]);

  const sortedStocks = useMemo(() => {
    if (!watchlist?.stocks) return [];

    return [...watchlist.stocks].sort((a, b) => {
      const priceA = prices[a.symbol];
      const priceB = prices[b.symbol];
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'ko');
          break;
        case 'price':
          comparison =
            (priceA?.currentPrice ?? a.currentPrice) -
            (priceB?.currentPrice ?? b.currentPrice);
          break;
        case 'changeRate':
          comparison =
            (priceA?.changeRate ?? a.changeRate) -
            (priceB?.changeRate ?? b.changeRate);
          break;
        case 'volume':
          comparison =
            (priceA?.volume ?? a.volume) -
            (priceB?.volume ?? b.volume);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [watchlist, sortField, sortOrder, prices]);

  return (
    <WidgetWrapper widgetId="watchlist" title="관심종목">
      {isLoading && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          로딩 중...
        </div>
      )}

      {error && (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          <span>
            {(error as { statusCode?: number }).statusCode === 401
              ? '로그인이 필요합니다'
              : '관심종목을 불러올 수 없습니다'}
          </span>
        </div>
      )}

      {!isLoading && !error && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <SortableHeader
                  label="종목명"
                  field="name"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="현재가"
                  field="price"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="등락률"
                  field="changeRate"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="거래량"
                  field="volume"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {sortedStocks.map((stock) => {
                const livePrice = prices[stock.symbol];
                const currentPrice = livePrice?.currentPrice ?? stock.currentPrice;
                const changeRate = livePrice?.changeRate ?? stock.changeRate;
                const volume = livePrice?.volume ?? stock.volume;
                const previousClose = livePrice?.previousClose;

                return (
                  <tr
                    key={stock.symbol}
                    onClick={() => setActiveSymbol(stock.symbol)}
                    className={cn(
                      'cursor-pointer border-b transition-colors hover:bg-accent/50',
                      activeSymbol === stock.symbol && 'bg-accent',
                    )}
                  >
                    <td className="py-2 pr-2">
                      <div className="font-medium">{stock.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {stock.symbol}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <StockPrice
                        price={currentPrice}
                        previousClose={previousClose}
                        size="sm"
                        animated
                      />
                    </td>
                    <td className="py-2 text-right">
                      <ChangeRate rate={changeRate} size="sm" />
                    </td>
                    <td className="py-2 text-right">
                      <VolumeDisplay value={volume} abbreviated />
                    </td>
                  </tr>
                );
              })}

              {sortedStocks.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    관심종목이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </WidgetWrapper>
  );
}

// --- Sortable Header ---

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentField: SortField;
  currentOrder: SortOrder;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}

function SortableHeader({
  label,
  field,
  currentField,
  currentOrder: _currentOrder,
  onSort,
  align = 'left',
}: SortableHeaderProps) {
  const isActive = currentField === field;

  return (
    <th
      className={cn(
        'cursor-pointer select-none py-2 font-medium',
        align === 'right' && 'text-right',
      )}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          size={10}
          className={cn(
            'transition-opacity',
            isActive ? 'opacity-100' : 'opacity-30',
          )}
        />
      </span>
    </th>
  );
}
