'use client';

/**
 * TopVolumeWidget — Top 10 stocks by trading volume.
 *
 * Features:
 * - Table with rank, name, price, change %, volume
 * - Market filter tabs (All / KOSPI / KOSDAQ)
 * - Click row to set active stock
 * - Polling refresh every 10s
 */
import { useState, useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetWrapper } from './WidgetWrapper';
import { StockPrice } from '@/components/ui/StockPrice';
import { ChangeRate } from '@/components/ui/ChangeRate';
import { VolumeDisplay } from '@/components/ui/NumberFormat';
import { useTopVolumeStocks } from '@/hooks/useStocks';
import { useDashboardStore } from '@/stores/dashboard';
import { useRealtimeStore } from '@/stores/realtime';

type MarketFilter = 'all' | 'kospi' | 'kosdaq';

interface TopVolumeWidgetProps {
  limit?: number;
}

export function TopVolumeWidget({ limit = 10 }: TopVolumeWidgetProps) {
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const prices = useRealtimeStore((s) => s.prices);

  const filterParam =
    marketFilter === 'all' ? undefined : marketFilter;
  const { data, isLoading, error } = useTopVolumeStocks(limit, filterParam as 'kospi' | 'kosdaq' | undefined);

  const stocks = useMemo(() => {
    return data?.stocks ?? [];
  }, [data]);

  const filterTabs = useMemo(
    () => (
      <div className="flex items-center gap-0.5">
        {(['all', 'kospi', 'kosdaq'] as MarketFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => setMarketFilter(filter)}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors',
              filter === marketFilter
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {filter === 'all' ? '전체' : filter}
          </button>
        ))}
      </div>
    ),
    [marketFilter],
  );

  return (
    <WidgetWrapper
      widgetId="topVolume"
      title="거래량 상위"
      headerActions={filterTabs}
    >
      {isLoading && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          로딩 중...
        </div>
      )}

      {error && (
        <div className="flex h-full items-center justify-center text-sm text-destructive">
          데이터를 불러올 수 없습니다
        </div>
      )}

      {!isLoading && !error && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-1.5 text-left font-medium">#</th>
                <th className="py-1.5 text-left font-medium">종목</th>
                <th className="py-1.5 text-right font-medium">현재가</th>
                <th className="py-1.5 text-right font-medium">등락률</th>
                <th className="py-1.5 text-right font-medium">거래량</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock, index) => {
                const livePrice = prices[stock.symbol];
                const currentPrice =
                  livePrice?.currentPrice ?? stock.currentPrice;
                const changeRate =
                  livePrice?.changeRate ?? stock.changeRate;
                const volume = livePrice?.volume ?? stock.volume;

                return (
                  <tr
                    key={stock.symbol}
                    onClick={() => setActiveSymbol(stock.symbol)}
                    className={cn(
                      'cursor-pointer border-b transition-colors hover:bg-accent/50',
                      activeSymbol === stock.symbol && 'bg-accent',
                    )}
                  >
                    <td className="py-1.5">
                      <RankBadge rank={index + 1} />
                    </td>
                    <td className="py-1.5">
                      <div className="font-medium">{stock.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {stock.symbol}
                      </div>
                    </td>
                    <td className="py-1.5 text-right">
                      <StockPrice price={currentPrice} size="sm" />
                    </td>
                    <td className="py-1.5 text-right">
                      <ChangeRate rate={changeRate} size="sm" />
                    </td>
                    <td className="py-1.5 text-right">
                      <VolumeDisplay value={volume} abbreviated />
                    </td>
                  </tr>
                );
              })}

              {stocks.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    <Trophy size={20} className="mx-auto mb-1" />
                    데이터가 없습니다
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

// --- RankBadge ---

interface RankBadgeProps {
  rank: number;
}

function RankBadge({ rank }: RankBadgeProps) {
  const bgColor =
    rank === 1
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
      : rank === 2
        ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
        : rank === 3
          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
          : 'text-muted-foreground';

  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold',
        rank <= 3 && bgColor,
      )}
    >
      {rank}
    </span>
  );
}
