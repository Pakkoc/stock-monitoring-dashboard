'use client';

/**
 * Stock Detail Page — full-screen stock analysis view.
 *
 * Features:
 * - Large TradingView chart with multiple timeframes (1D, 1W, 1M, 3M, 1Y)
 * - Real-time price header (symbol, name, price, change, volume)
 * - News tab: related news articles
 * - AI Analysis tab: latest AI analysis + trigger button
 * - Technical indicators overlay (MA, RSI from backend)
 * - Responsive layout with sidebar and header
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import {
  ArrowLeft,
  Brain,
  Newspaper,
  Loader2,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { StockPrice } from '@/components/ui/StockPrice';
import { ChangeRateBadge } from '@/components/ui/ChangeRate';
import { formatKRW, formatVolume } from '@/components/ui/NumberFormat';
import { useStockDetail } from '@/hooks/useStockDetail';
import { useStockPrices } from '@/hooks/useStockPrices';
import { useNews } from '@/hooks/useNews';
import { useAiAnalysis, useTriggerAnalysis } from '@/hooks/useAiAnalysis';
import { useRealtimeStore } from '@/stores/realtime';
import { useDashboardStore } from '@/stores/dashboard';
import { useSocket } from '@/components/providers/SocketProvider';
import { cn } from '@/lib/utils';

type DetailTimeframe = '1d' | '1w' | '1m_chart' | '3m' | '1y';
type ChartDataTimeframe = '1m' | '5m' | '15m' | '1h' | '1d';
type ActiveTab = 'news' | 'analysis';

const DETAIL_TIMEFRAME_MAP: Record<DetailTimeframe, { apiTimeframe: ChartDataTimeframe; label: string }> = {
  '1d': { apiTimeframe: '5m', label: '1일' },
  '1w': { apiTimeframe: '15m', label: '1주' },
  '1m_chart': { apiTimeframe: '1h', label: '1개월' },
  '3m': { apiTimeframe: '1d', label: '3개월' },
  '1y': { apiTimeframe: '1d', label: '1년' },
};

const STOCK_UP_COLOR = '#EF4444';
const STOCK_DOWN_COLOR = '#3B82F6';

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = typeof params.symbol === 'string' ? decodeURIComponent(params.symbol) : '';

  const { subscribe, unsubscribe } = useSocket();
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);

  // Set active symbol in dashboard store
  useEffect(() => {
    if (symbol) {
      setActiveSymbol(symbol);
    }
  }, [symbol, setActiveSymbol]);

  // Subscribe to real-time updates for this stock
  useEffect(() => {
    if (!symbol) return;
    subscribe([symbol]);
    return () => {
      unsubscribe([symbol]);
    };
  }, [symbol, subscribe, unsubscribe]);

  // Data fetching
  const { data: stockData, isLoading: stockLoading } = useStockDetail(symbol);
  const livePrice = useRealtimeStore((s) => (symbol ? s.prices[symbol] : undefined));

  const [chartTimeframe, setChartTimeframe] = useState<DetailTimeframe>('3m');
  const [activeTab, setActiveTab] = useState<ActiveTab>('news');

  const apiTimeframe = DETAIL_TIMEFRAME_MAP[chartTimeframe].apiTimeframe;
  const { data: priceData, isLoading: pricesLoading } = useStockPrices(symbol, apiTimeframe);

  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Create chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(156, 163, 175, 0.08)' },
        horzLines: { color: 'rgba(156, 163, 175, 0.08)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(156, 163, 175, 0.15)',
      },
      timeScale: {
        borderColor: 'rgba(156, 163, 175, 0.15)',
        timeVisible: chartTimeframe !== '1y' && chartTimeframe !== '3m',
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: STOCK_UP_COLOR,
      downColor: STOCK_DOWN_COLOR,
      borderDownColor: STOCK_DOWN_COLOR,
      borderUpColor: STOCK_UP_COLOR,
      wickDownColor: STOCK_DOWN_COLOR,
      wickUpColor: STOCK_UP_COLOR,
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [chartTimeframe]);

  // Update chart data
  useEffect(() => {
    if (!priceData?.prices || !candleSeriesRef.current) return;

    const candleData: CandlestickData[] = priceData.prices.map((p) => ({
      time: (new Date(p.timestamp).getTime() / 1000) as Time,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));

    candleSeriesRef.current.setData(candleData);

    if (volumeSeriesRef.current) {
      const volumeData: HistogramData[] = priceData.prices.map((p) => ({
        time: (new Date(p.timestamp).getTime() / 1000) as Time,
        value: p.volume,
        color:
          p.close >= p.open
            ? 'rgba(239, 68, 68, 0.3)'
            : 'rgba(59, 130, 246, 0.3)',
      }));
      volumeSeriesRef.current.setData(volumeData);
    }

    chartRef.current?.timeScale().fitContent();
  }, [priceData]);

  // Real-time chart update
  useEffect(() => {
    if (!livePrice || !candleSeriesRef.current) return;

    const time = (new Date(livePrice.timestamp).getTime() / 1000) as Time;

    candleSeriesRef.current.update({
      time,
      open: livePrice.open,
      high: livePrice.high,
      low: livePrice.low,
      close: livePrice.currentPrice,
    });

    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.update({
        time,
        value: livePrice.volume,
        color:
          livePrice.currentPrice >= livePrice.open
            ? 'rgba(239, 68, 68, 0.3)'
            : 'rgba(59, 130, 246, 0.3)',
      });
    }
  }, [livePrice]);

  // Derive display values
  const currentPrice = livePrice?.currentPrice ?? 0;
  const changeRate = livePrice?.changeRate ?? 0;
  const changePrice = livePrice?.changePrice ?? 0;
  const volume = livePrice?.volume ?? 0;
  const previousClose = livePrice?.previousClose ?? 0;
  const high = livePrice?.high ?? 0;
  const low = livePrice?.low ?? 0;
  const stockName = stockData?.stock?.name ?? symbol;
  const market = stockData?.stock?.market ?? '';

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-auto bg-background">
          {/* Back navigation + Stock header */}
          <div className="border-b bg-card px-6 py-4">
            {/* Back button */}
            <button
              onClick={() => router.back()}
              className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={14} />
              돌아가기
            </button>

            {/* Price header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-foreground">
                    {stockName}
                  </h1>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {symbol}
                  </span>
                  {market && (
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {market}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-baseline gap-3">
                  {currentPrice > 0 ? (
                    <>
                      <StockPrice
                        price={currentPrice}
                        previousClose={previousClose}
                        size="lg"
                      />
                      <ChangeRateBadge rate={changeRate} size="md" />
                      <span className={cn(
                        'text-sm font-medium',
                        changePrice > 0 ? 'text-stock-up' : changePrice < 0 ? 'text-stock-down' : 'text-stock-flat',
                      )}>
                        {changePrice > 0 ? '+' : ''}{formatKRW(changePrice)}
                      </span>
                    </>
                  ) : stockLoading ? (
                    <div className="h-8 w-48 animate-pulse rounded bg-muted" />
                  ) : (
                    <span className="text-lg text-muted-foreground">
                      가격 정보 없음
                    </span>
                  )}
                </div>
              </div>

              {/* Mini stats */}
              <div className="flex gap-6 text-sm">
                <div>
                  <div className="text-muted-foreground">거래량</div>
                  <div className="font-semibold tabular-nums">
                    {volume > 0 ? formatVolume(volume) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">고가</div>
                  <div className="font-semibold tabular-nums text-stock-up">
                    {high > 0 ? formatKRW(high) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">저가</div>
                  <div className="font-semibold tabular-nums text-stock-down">
                    {low > 0 ? formatKRW(low) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">전일 종가</div>
                  <div className="font-semibold tabular-nums">
                    {previousClose > 0 ? formatKRW(previousClose) : '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chart section */}
          <div className="border-b bg-card px-6 py-4">
            {/* Timeframe selector */}
            <div className="mb-4 flex items-center gap-1">
              {(Object.entries(DETAIL_TIMEFRAME_MAP) as [DetailTimeframe, { label: string }][]).map(
                ([tf, { label }]) => (
                  <button
                    key={tf}
                    onClick={() => setChartTimeframe(tf)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      tf === chartTimeframe
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>

            {/* Chart container */}
            <div className="relative h-[400px] w-full lg:h-[500px]">
              {pricesLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80">
                  <Loader2 size={24} className="animate-spin text-primary" />
                </div>
              )}
              <div ref={chartContainerRef} className="h-full w-full" />
            </div>
          </div>

          {/* Tabs: News | AI Analysis */}
          <div className="px-6 py-4">
            {/* Tab buttons */}
            <div className="mb-4 flex gap-1 border-b">
              <button
                onClick={() => setActiveTab('news')}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  activeTab === 'news'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Newspaper size={16} />
                관련 뉴스
              </button>
              <button
                onClick={() => setActiveTab('analysis')}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  activeTab === 'analysis'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Brain size={16} />
                AI 분석
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'news' ? (
              <NewsTabContent symbol={symbol} />
            ) : (
              <AiAnalysisTabContent symbol={symbol} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ---- News Tab ----

function NewsTabContent({ symbol }: { symbol: string }) {
  const { data, isLoading } = useNews(symbol, 30);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border bg-card p-4">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  const articles = data?.articles ?? [];

  if (articles.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <Newspaper size={32} className="mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          관련 뉴스가 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <a
          key={article.id}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary">
                {article.title}
              </h3>
              {article.summary && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {article.summary}
                </p>
              )}
              <div className="mt-2 flex items-center gap-3">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {article.source}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={10} />
                  {new Date(article.publishedAt).toLocaleDateString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {article.stocks?.length > 0 && (
                  <div className="flex gap-1">
                    {article.stocks.slice(0, 3).map((s) => (
                      <span
                        key={s.symbol}
                        className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <ExternalLink
              size={14}
              className="mt-1 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
        </a>
      ))}
    </div>
  );
}

// ---- AI Analysis Tab ----

function AiAnalysisTabContent({ symbol }: { symbol: string }) {
  const { data, isLoading } = useAiAnalysis(symbol);
  const triggerMutation = useTriggerAnalysis();

  const handleTriggerAnalysis = useCallback(() => {
    triggerMutation.mutate(symbol);
  }, [triggerMutation, symbol]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border bg-card p-6">
            <div className="h-5 w-1/3 rounded bg-muted" />
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-5/6 rounded bg-muted" />
              <div className="h-3 w-4/6 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const analyses = data?.analyses ?? [];

  return (
    <div className="space-y-4">
      {/* Trigger button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          AI가 급등 원인을 분석하고 관련 뉴스를 종합합니다.
        </p>
        <button
          onClick={handleTriggerAnalysis}
          disabled={triggerMutation.isPending}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triggerMutation.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              분석 중...
            </>
          ) : (
            <>
              <Brain size={14} />
              AI 분석 실행
            </>
          )}
        </button>
      </div>

      {/* Error state */}
      {triggerMutation.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          분석 실행 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </div>
      )}

      {/* Analysis results */}
      {analyses.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <Brain size={32} className="mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            분석 결과가 없습니다. AI 분석을 실행해보세요.
          </p>
        </div>
      ) : (
        analyses.map((analysis) => (
          <div
            key={analysis.id}
            className="rounded-lg border bg-card p-6"
          >
            {/* Header */}
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    AI 분석
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {analysis.analysisType}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {analysis.modelUsed}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(analysis.createdAt).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              {/* Confidence Score */}
              <div className="text-right">
                <div className="text-xs text-muted-foreground">신뢰도</div>
                <div
                  className={cn(
                    'text-lg font-bold tabular-nums',
                    analysis.confidenceScore >= 0.8
                      ? 'text-green-500'
                      : analysis.confidenceScore >= 0.5
                        ? 'text-yellow-500'
                        : 'text-red-500',
                  )}
                >
                  {(analysis.confidenceScore * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Quality Gates */}
            <div className="mb-4 flex gap-2">
              <QualityBadge label="L1 구문" pass={analysis.qualityGate.l1Pass} />
              <QualityBadge label="L2 의미" pass={analysis.qualityGate.l2Pass} />
              <QualityBadge label="L3 사실" pass={analysis.qualityGate.l3Pass} />
            </div>

            {/* Summary */}
            <div className="mb-4">
              <h4 className="mb-1 text-sm font-semibold text-foreground">
                요약
              </h4>
              <p className="text-sm leading-relaxed text-foreground/90">
                {analysis.result.summary}
              </p>
            </div>

            {/* Category & Key Factors */}
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 text-sm font-semibold text-foreground">
                  분류
                </h4>
                <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {analysis.result.category}
                </span>
              </div>
              <div>
                <h4 className="mb-1 text-sm font-semibold text-foreground">
                  핵심 요인
                </h4>
                <ul className="space-y-0.5">
                  {analysis.result.keyFactors.map((factor, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                      <span className="mt-0.5 text-primary">-</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Outlook */}
            {analysis.result.outlook && (
              <div className="mb-4">
                <h4 className="mb-1 text-sm font-semibold text-foreground">
                  전망
                </h4>
                <p className="text-sm text-foreground/80">
                  {analysis.result.outlook}
                </p>
              </div>
            )}

            {/* Risk Factors */}
            {analysis.result.riskFactors.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-1 text-sm font-semibold text-foreground">
                  위험 요인
                </h4>
                <ul className="space-y-0.5">
                  {analysis.result.riskFactors.map((risk, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                      <AlertCircle size={10} className="mt-0.5 shrink-0 text-destructive" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Related News */}
            {analysis.result.relatedNews.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-semibold text-foreground">
                  관련 뉴스
                </h4>
                <div className="space-y-1">
                  {analysis.result.relatedNews.map((news, i) => (
                    <a
                      key={i}
                      href={news.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-primary hover:underline"
                    >
                      <ExternalLink size={10} className="shrink-0" />
                      {news.title}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Processing info */}
            <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
              <span>처리 시간: {(analysis.processingTimeMs / 1000).toFixed(1)}초</span>
              <span>재시도: {analysis.retryCount}회</span>
              <span>
                검증: {analysis.result.verificationStatus === 'VERIFIED'
                  ? '검증 완료'
                  : analysis.result.verificationStatus === 'PARTIALLY_VERIFIED'
                    ? '부분 검증'
                    : '미검증'}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---- Quality Badge ----

function QualityBadge({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        pass
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      )}
    >
      {pass ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {label}
    </span>
  );
}
