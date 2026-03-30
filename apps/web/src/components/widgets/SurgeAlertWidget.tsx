'use client';

/**
 * SurgeAlertWidget — Real-time list of stocks that surged above threshold.
 *
 * Features:
 * - Real-time alerts from WebSocket via realtime store
 * - Red highlight animation for new alerts
 * - Shows stock name, change %, time detected
 * - Inline surge cause summary (rule-based, no AI)
 * - Confidence badge and news link when available
 * - Theme tag when theme co-movement detected
 * - Click to select stock
 */
import { useMemo } from 'react';
import { AlertTriangle, Zap, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetWrapper } from './WidgetWrapper';
import { ChangeRate } from '@/components/ui/ChangeRate';
import { StockPrice } from '@/components/ui/StockPrice';
import { useSurgeAlerts } from '@/hooks/useSurgeAlerts';
import { useSurgeCauses } from '@/hooks/useSurgeCauses';
import { useRealtimeStore } from '@/stores/realtime';
import { useDashboardStore } from '@/stores/dashboard';
import type { StockSurgePayload, SurgeCauseResult } from '@stock-dashboard/shared';

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

/** Confidence badge color */
function getConfidenceBadge(confidence: SurgeCauseResult['confidence']): {
  label: string;
  className: string;
} {
  switch (confidence) {
    case 'high':
      return { label: '높음', className: 'bg-green-500/20 text-green-400' };
    case 'medium':
      return { label: '보통', className: 'bg-yellow-500/20 text-yellow-400' };
    case 'low':
      return { label: '낮음', className: 'bg-red-500/20 text-red-400' };
    default:
      return { label: '', className: '' };
  }
}

export function SurgeAlertWidget({ maxAlerts = 20 }: SurgeAlertWidgetProps) {
  const { data: restAlerts, isLoading, error } = useSurgeAlerts();
  const { data: causesData } = useSurgeCauses();
  const realtimeAlerts = useRealtimeStore((s) => s.surgeAlerts);
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);

  // Build a Map from symbol → cause for O(1) lookup
  const causesBySymbol = useMemo(() => {
    const map = new Map<string, SurgeCauseResult>();
    if (causesData?.data) {
      for (const cause of causesData.data) {
        // Keep the most recent cause per symbol
        if (!map.has(cause.symbol)) {
          map.set(cause.symbol, cause);
        }
      }
    }
    return map;
  }, [causesData]);

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
          <span className="text-sm">
            {error ? '데이터 없음' : '급등 알림이 없습니다'}
          </span>
        </div>
      )}

      <div className="space-y-1">
        {alerts.map((alert, index) => (
          <SurgeAlertItem
            key={`${alert.symbol}-${new Date(alert.timestamp).getTime()}`}
            alert={alert}
            cause={causesBySymbol.get(alert.symbol) ?? null}
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
  cause: SurgeCauseResult | null;
  isNew: boolean;
  onClick: () => void;
}

function SurgeAlertItem({ alert, cause, isNew, onClick }: SurgeAlertItemProps) {
  const confidenceBadge = cause ? getConfidenceBadge(cause.confidence) : null;

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

        {/* Surge Cause Summary (rule-based analysis) */}
        {cause && (
          <div className="mt-1 space-y-0.5">
            <div className="flex items-start gap-1.5">
              <span className="text-xs leading-relaxed text-foreground/80">
                {cause.cause}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Confidence badge */}
              {confidenceBadge && (
                <span
                  className={cn(
                    'rounded px-1 py-0.5 text-[10px] font-medium',
                    confidenceBadge.className,
                  )}
                >
                  {confidenceBadge.label}
                </span>
              )}
              {/* Theme tag */}
              {cause.themeName && (
                <span className="rounded bg-blue-500/20 px-1 py-0.5 text-[10px] text-blue-400">
                  {cause.themeName}
                </span>
              )}
              {/* News link */}
              {cause.newsUrl && (
                <a
                  href={cause.newsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-300 hover:underline"
                >
                  <ExternalLink size={9} />
                  <span>뉴스</span>
                </a>
              )}
            </div>
          </div>
        )}

        <StockPrice
          price={alert.currentPrice}
          size="sm"
          showCurrency
        />
      </div>
    </button>
  );
}
