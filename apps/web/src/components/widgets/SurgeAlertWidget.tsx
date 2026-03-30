'use client';

/**
 * SurgeAlertWidget — Real-time list of stocks that surged above threshold.
 *
 * Features:
 * - Real-time alerts from WebSocket via realtime store
 * - Red highlight animation for new alerts
 * - Shows stock name, change %, time detected
 * - Click to select stock
 */
import { useMemo } from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetWrapper } from './WidgetWrapper';
import { ChangeRate } from '@/components/ui/ChangeRate';
import { StockPrice } from '@/components/ui/StockPrice';
import { useSurgeAlerts } from '@/hooks/useSurgeAlerts';
import { useRealtimeStore } from '@/stores/realtime';
import { useDashboardStore } from '@/stores/dashboard';
import type { StockSurgePayload } from '@stock-dashboard/shared';

interface SurgeAlertWidgetProps {
  maxAlerts?: number;
}

/** Format time for surge alert */
function formatAlertTime(timestamp: Date | string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Get category label in Korean */
function getCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    EARNINGS: '실적',
    INDUSTRY_NEWS: '업종 뉴스',
    MARKET_SENTIMENT: '시장 심리',
    REGULATORY: '규제/정책',
    TECHNICAL: '기술적',
    UNKNOWN: '미분류',
  };
  return map[category] ?? category;
}

export function SurgeAlertWidget({ maxAlerts = 20 }: SurgeAlertWidgetProps) {
  const { data: restAlerts, isLoading } = useSurgeAlerts();
  const realtimeAlerts = useRealtimeStore((s) => s.surgeAlerts);
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);

  // Merge REST and WebSocket alerts, preferring realtime (newer first)
  const alerts = useMemo(() => {
    const restData = restAlerts?.alerts ?? [];
    // Combine: realtime alerts first (newer), then REST alerts
    const seen = new Set<string>();
    const merged: StockSurgePayload[] = [];

    for (const alert of [...realtimeAlerts, ...restData]) {
      const key = `${alert.symbol}-${new Date(alert.timestamp).getTime()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(alert);
      }
    }

    return merged.slice(0, maxAlerts);
  }, [restAlerts, realtimeAlerts, maxAlerts]);

  return (
    <WidgetWrapper widgetId="surgeAlerts" title="급등 알림">
      {isLoading && alerts.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          알림 로딩 중...
        </div>
      )}

      {!isLoading && alerts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Zap size={24} className="mb-2" />
          <span className="text-sm">급등 알림이 없습니다</span>
        </div>
      )}

      <div className="space-y-1">
        {alerts.map((alert, index) => (
          <SurgeAlertItem
            key={`${alert.symbol}-${new Date(alert.timestamp).getTime()}`}
            alert={alert}
            isNew={index < realtimeAlerts.length && index < 3}
            onClick={() => setActiveSymbol(alert.symbol)}
          />
        ))}
      </div>
    </WidgetWrapper>
  );
}

// --- SurgeAlertItem ---

interface SurgeAlertItemProps {
  alert: StockSurgePayload;
  isNew: boolean;
  onClick: () => void;
}

function SurgeAlertItem({ alert, isNew, onClick }: SurgeAlertItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2 rounded-md border p-2 text-left transition-all hover:bg-accent/50',
        isNew && 'animate-price-flash-up border-stock-up/30',
      )}
    >
      <AlertTriangle
        size={14}
        className="mt-0.5 shrink-0 text-stock-up"
      />
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{alert.stockName}</span>
          <ChangeRate rate={alert.changeRate} size="sm" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{alert.symbol}</span>
          <span className="rounded bg-muted px-1 py-0.5 text-[10px]">
            {getCategoryLabel(alert.category)}
          </span>
          <span>{formatAlertTime(alert.timestamp)}</span>
        </div>
        <StockPrice
          price={alert.currentPrice}
          size="sm"
          showCurrency
        />
      </div>
    </button>
  );
}
