'use client';

/**
 * ThemeSummaryWidget — Cards for each theme showing average change %, top movers.
 *
 * Features:
 * - Theme cards with performance percentage
 * - Top stocks within each theme
 * - Sparkline mini chart
 * - Click to filter stock list by theme
 */
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { WidgetWrapper } from './WidgetWrapper';
import { ChangeRate } from '@/components/ui/ChangeRate';
import { useThemePerformance, type ThemePerformance } from '@/hooks/useThemes';
import { useDashboardStore } from '@/stores/dashboard';

interface ThemeSummaryWidgetProps {
  limit?: number;
}

export function ThemeSummaryWidget({ limit = 10 }: ThemeSummaryWidgetProps) {
  const { data, isLoading } = useThemePerformance(limit);
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);

  const themes = useMemo(() => data?.themes ?? [], [data]);

  return (
    <WidgetWrapper widgetId="themeSummary" title="테마 요약">
      {isLoading && themes.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          테마 로딩 중...
        </div>
      )}

      <div className="space-y-1.5">
        {themes.map((theme) => (
          <ThemeCard
            key={theme.themeId}
            theme={theme}
            isExpanded={expandedTheme === theme.themeId}
            onToggle={() =>
              setExpandedTheme(
                expandedTheme === theme.themeId ? null : theme.themeId,
              )
            }
            onStockClick={setActiveSymbol}
          />
        ))}

        {!isLoading && themes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <TrendingUp size={24} className="mb-2" />
            <span className="text-sm">데이터 없음</span>
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}

// --- ThemeCard ---

interface ThemeCardProps {
  theme: ThemePerformance;
  isExpanded: boolean;
  onToggle: () => void;
  onStockClick: (symbol: string) => void;
}

function ThemeCard({
  theme,
  isExpanded,
  onToggle,
  onStockClick,
}: ThemeCardProps) {
  return (
    <div className="rounded-md border">
      {/* Theme header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-2 text-left hover:bg-accent/50"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{theme.name}</span>
            <span className="text-xs text-muted-foreground">
              {theme.stockCount}종목
            </span>
          </div>
          {/* Sparkline placeholder — rendered as simple bars */}
          <MiniSparkline data={theme.sparklineData} changePercent={theme.changePercent} />
        </div>
        <div className="flex items-center gap-2">
          <ChangeRate rate={theme.changePercent} size="sm" />
          {isExpanded ? (
            <ChevronUp size={14} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={14} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded: top stocks */}
      {isExpanded && theme.topStocks.length > 0 && (
        <div className="border-t px-2 pb-2 pt-1">
          {theme.topStocks.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => onStockClick(stock.symbol)}
              className="flex w-full items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-accent/50"
            >
              <span className="font-medium">{stock.name}</span>
              <ChangeRate rate={stock.changePercent} size="sm" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- MiniSparkline ---

interface MiniSparklineProps {
  data: number[];
  changePercent: number;
}

function MiniSparkline({ data, changePercent }: MiniSparklineProps) {
  if (!data.length) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const color = changePercent >= 0 ? '#EF4444' : '#3B82F6';

  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * 60;
      const y = 16 - ((v - min) / range) * 14;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width="60" height="18" className="mt-0.5">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        points={points}
      />
    </svg>
  );
}
