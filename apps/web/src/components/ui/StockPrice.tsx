'use client';

/**
 * Stock price display with Korean coloring convention.
 *
 * Korean stock market uses opposite colors from US:
 * - Red (#EF4444) = price up (상승)
 * - Blue (#3B82F6) = price down (하락)
 * - Gray (#6B7280) = flat (보합)
 */
import { cn } from '@/lib/utils';

interface StockPriceProps {
  price: number;
  previousClose?: number;
  size?: 'sm' | 'md' | 'lg';
  showCurrency?: boolean;
  animated?: boolean;
  className?: string;
}

function getDirection(
  price: number,
  previousClose?: number,
): 'up' | 'down' | 'flat' {
  if (!previousClose || price === previousClose) return 'flat';
  return price > previousClose ? 'up' : 'down';
}

const sizeClasses = {
  sm: 'text-price-sm',
  md: 'text-price-md',
  lg: 'text-price-lg',
} as const;

const colorClasses = {
  up: 'text-stock-up',
  down: 'text-stock-down',
  flat: 'text-stock-flat',
} as const;

const animationClasses = {
  up: 'animate-price-flash-up',
  down: 'animate-price-flash-down',
  flat: '',
} as const;

export function StockPrice({
  price,
  previousClose,
  size = 'md',
  showCurrency = true,
  animated = false,
  className,
}: StockPriceProps) {
  const direction = getDirection(price, previousClose);

  const formatted = new Intl.NumberFormat('ko-KR').format(price);

  return (
    <span
      className={cn(
        'tabular-nums font-semibold',
        sizeClasses[size],
        colorClasses[direction],
        animated && animationClasses[direction],
        className,
      )}
    >
      {showCurrency && '₩'}
      {formatted}
    </span>
  );
}
