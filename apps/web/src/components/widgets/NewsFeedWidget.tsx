'use client';

/**
 * NewsFeedWidget — Scrollable news feed for selected or all stocks.
 *
 * Features:
 * - News articles with title, source, publication time
 * - Click to open article URL in new tab
 * - Source badge coloring
 * - Relative time display
 */
import { useMemo } from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetWrapper } from './WidgetWrapper';
import { useNews } from '@/hooks/useNews';
import { useDashboardStore } from '@/stores/dashboard';
import type { NewsWithStocks } from '@stock-dashboard/shared';

interface NewsFeedWidgetProps {
  symbol?: string | null;
  limit?: number;
}

/** Format relative time in Korean */
function formatRelativeTime(dateStr: string | Date): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

/** Map source to display label */
function getSourceLabel(source: string): string {
  const map: Record<string, string> = {
    NAVER: '네이버',
    DART: 'DART',
    RSS_YONHAP: '연합',
    RSS_EDAILY: '이데일리',
    RSS_MAEKYUNG: '매경',
    RSS_HANKYUNG: '한경',
    RSS_SEDAILY: '서울경제',
    RSS_NEWSIS: '뉴시스',
    RSS_INFOSTOCK: '인포스탁',
    RSS_ETODAY: '이투데이',
    RSS_MONEYTODAY: '머니투데이',
  };
  return map[source] ?? source;
}

export function NewsFeedWidget({
  symbol: symbolProp,
  limit = 20,
}: NewsFeedWidgetProps) {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);
  const effectiveSymbol = symbolProp !== undefined ? symbolProp : activeSymbol;

  const { data, isLoading, error } = useNews(effectiveSymbol, limit);

  const articles = useMemo(() => data?.articles ?? [], [data]);

  return (
    <WidgetWrapper widgetId="newsFeed" title="뉴스 피드">
      {isLoading && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          뉴스 로딩 중...
        </div>
      )}

      {error && (
        <div className="flex h-full items-center justify-center text-sm text-destructive">
          뉴스를 불러올 수 없습니다
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-1">
          {articles.map((article) => (
            <NewsItem
              key={article.id}
              article={article}
              onSymbolClick={setActiveSymbol}
            />
          ))}

          {articles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Newspaper size={24} className="mb-2" />
              <span className="text-sm">뉴스가 없습니다</span>
            </div>
          )}
        </div>
      )}
    </WidgetWrapper>
  );
}

// --- NewsItem ---

interface NewsItemProps {
  article: NewsWithStocks;
  onSymbolClick: (symbol: string) => void;
}

function NewsItem({ article, onSymbolClick }: NewsItemProps) {
  return (
    <div className="group rounded-md border-b pb-2 pt-1 last:border-b-0">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium leading-tight text-foreground group-hover:text-primary">
            {article.title}
          </h4>
          <ExternalLink
            size={12}
            className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
      </a>

      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
          {getSourceLabel(article.source)}
        </span>
        <span>{formatRelativeTime(article.publishedAt)}</span>
      </div>

      {/* Related stock chips */}
      {article.stocks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {article.stocks.slice(0, 3).map((stock) => (
            <button
              key={stock.symbol}
              onClick={(e) => {
                e.preventDefault();
                onSymbolClick(stock.symbol);
              }}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
            >
              {stock.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
