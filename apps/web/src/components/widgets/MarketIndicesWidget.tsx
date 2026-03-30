'use client';

/**
 * MarketIndicesWidget — KOSPI and KOSDAQ index values with mini sparkline.
 *
 * Features:
 * - Real-time index values from WebSocket + REST fallback
 * - Korean coloring (red=up, blue=down)
 * - Mini area/sparkline chart for each index
 * - Minimal display-only widget
 */
import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetWrapper } from './WidgetWrapper';
import { ChangeRate } from '@/components/ui/ChangeRate';
import { useMarketIndices } from '@/hooks/useMarketIndices';
import { useRealtimeStore } from '@/stores/realtime';
import type { MarketIndex } from '@stock-dashboard/shared';

export function MarketIndicesWidget() {
  const { data, isLoading, error } = useMarketIndices();
  const realtimeIndices = useRealtimeStore((s) => s.indices);

  // Prefer realtime data, fall back to REST
  const indices = useMemo(() => {
    if (realtimeIndices.length > 0) return realtimeIndices;
    return data?.indices ?? [];
  }, [data, realtimeIndices]);

  // Detect if all index values are zero (Kiwoom API not yet providing market indices)
  const allZero = useMemo(() => {
    if (indices.length === 0) return false;
    return indices.every((idx) => idx.currentValue === 0);
  }, [indices]);

  return (
    <WidgetWrapper widgetId="marketIndices" title="시장 지수">
      {isLoading && indices.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          지수 로딩 중...
        </div>
      )}

      {error && indices.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-destructive">
          지수 데이터를 불러올 수 없습니다
        </div>
      )}

      <div className="flex flex-col gap-3">
        {allZero ? (
          <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
            <BarChart3 size={20} className="mb-1" />
            <span className="text-xs">지수 조회 준비 중</span>
            <span className="mt-1 text-[10px]">장 마감 또는 API 연동 대기</span>
          </div>
        ) : (
          <>
            {indices.map((index) => (
              <IndexCard key={index.market} index={index} />
            ))}
          </>
        )}

        {!isLoading && !allZero && indices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
            <BarChart3 size={20} className="mb-1" />
            <span className="text-xs">지수 데이터 없음</span>
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}

// --- IndexCard ---

interface IndexCardProps {
  index: MarketIndex;
}

function IndexCard({ index }: IndexCardProps) {
  const isUp = index.changeRate >= 0;
  const formatted = new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(index.currentValue);

  const changeFormatted = new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always',
  }).format(index.changeValue);

  return (
    <div className="rounded-md border p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">
          {index.market}
        </span>
        <ChangeRate rate={index.changeRate} size="sm" />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            'text-lg font-bold tabular-nums',
            isUp ? 'text-stock-up' : index.changeRate < 0 ? 'text-stock-down' : 'text-stock-flat',
          )}
        >
          {formatted}
        </span>
        <span
          className={cn(
            'text-xs tabular-nums',
            isUp ? 'text-stock-up' : index.changeRate < 0 ? 'text-stock-down' : 'text-stock-flat',
          )}
        >
          {changeFormatted}
        </span>
      </div>
    </div>
  );
}
