'use client';

/**
 * CandlestickChartWidget — TradingView Lightweight Charts candlestick + volume.
 *
 * Features:
 * - OHLCV candlestick chart with volume histogram
 * - Timeframe toggle (1m, 5m, 15m, 1h, 1d)
 * - Real-time bar updates via WebSocket price data
 * - Korean coloring (red candle = up, blue candle = down)
 * - Crosshair with OHLCV tooltip
 *
 * Note: Canvas-based rendering requires browser APIs — loaded client-side only.
 */
import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
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
import { WidgetWrapper } from './WidgetWrapper';
import { useStockPrices } from '@/hooks/useStockPrices';
import { useDashboardStore } from '@/stores/dashboard';
import { useRealtimeStore } from '@/stores/realtime';
import { cn } from '@/lib/utils';

type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d';

interface CandlestickChartWidgetProps {
  symbol?: string;
  initialTimeframe?: Timeframe;
  showVolume?: boolean;
}

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1m': '1분',
  '5m': '5분',
  '15m': '15분',
  '1h': '1시간',
  '1d': '일봉',
};

const STOCK_UP_COLOR = '#EF4444';
const STOCK_DOWN_COLOR = '#3B82F6';

export function CandlestickChartWidget({
  symbol: symbolProp,
  initialTimeframe = '1d',
  showVolume = true,
}: CandlestickChartWidgetProps) {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const symbol = symbolProp ?? activeSymbol;
  const livePrice = useRealtimeStore((s) => (symbol ? s.prices[symbol] : undefined));

  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const { data, isLoading } = useStockPrices(symbol, timeframe);

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
        vertLines: { color: 'rgba(156, 163, 175, 0.1)' },
        horzLines: { color: 'rgba(156, 163, 175, 0.1)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(156, 163, 175, 0.2)',
      },
      timeScale: {
        borderColor: 'rgba(156, 163, 175, 0.2)',
        timeVisible: timeframe !== '1d',
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

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    if (showVolume) {
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      volumeSeriesRef.current = volumeSeries;
    }

    // Responsive resize
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
  }, [showVolume, timeframe]);

  // Update data when prices load
  useEffect(() => {
    if (!data?.prices || !candleSeriesRef.current) return;

    const candleData: CandlestickData[] = data.prices.map((p) => ({
      time: (new Date(p.timestamp).getTime() / 1000) as Time,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));

    candleSeriesRef.current.setData(candleData);

    if (volumeSeriesRef.current) {
      const volumeData: HistogramData[] = data.prices.map((p) => ({
        time: (new Date(p.timestamp).getTime() / 1000) as Time,
        value: p.volume,
        color:
          p.close >= p.open
            ? 'rgba(239, 68, 68, 0.4)'
            : 'rgba(59, 130, 246, 0.4)',
      }));

      volumeSeriesRef.current.setData(volumeData);
    }

    chartRef.current?.timeScale().fitContent();
  }, [data]);

  // Real-time updates
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
            ? 'rgba(239, 68, 68, 0.4)'
            : 'rgba(59, 130, 246, 0.4)',
      });
    }
  }, [livePrice]);

  const timeframeActions = useMemo(
    () => (
      <div className="flex items-center gap-0.5">
        {(Object.entries(TIMEFRAME_LABELS) as [Timeframe, string][]).map(
          ([tf, label]) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                'rounded px-1.5 py-0.5 text-xs font-medium transition-colors',
                tf === timeframe
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {label}
            </button>
          ),
        )}
      </div>
    ),
    [timeframe],
  );

  return (
    <WidgetWrapper
      widgetId="candlestick"
      title={symbol ? `차트 - ${symbol}` : '캔들스틱 차트'}
      headerActions={timeframeActions}
    >
      {!symbol && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          종목을 선택하세요
        </div>
      )}

      {symbol && isLoading && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          차트 로딩 중...
        </div>
      )}

      {symbol && (
        <div
          ref={chartContainerRef}
          className={cn('h-full w-full', isLoading && 'invisible')}
        />
      )}
    </WidgetWrapper>
  );
}
