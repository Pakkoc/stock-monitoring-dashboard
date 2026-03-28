'use client';

/**
 * Change rate display with arrow icon and Korean stock coloring.
 *
 * Shows percentage change with up/down arrow and red/blue color.
 */
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChangeRateProps {
  rate: number;
  showIcon?: boolean;
  showSign?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getDirection(rate: number): 'up' | 'down' | 'flat' {
  if (rate > 0) return 'up';
  if (rate < 0) return 'down';
  return 'flat';
}

const sizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
} as const;

const iconSizes = {
  sm: 10,
  md: 12,
  lg: 14,
} as const;

const colorClasses = {
  up: 'text-stock-up',
  down: 'text-stock-down',
  flat: 'text-stock-flat',
} as const;

const bgClasses = {
  up: 'bg-stock-up-bg',
  down: 'bg-stock-down-bg',
  flat: 'bg-muted',
} as const;

const icons = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
} as const;

export function ChangeRate({
  rate,
  showIcon = true,
  showSign = true,
  size = 'md',
  className,
}: ChangeRateProps) {
  const direction = getDirection(rate);
  const Icon = icons[direction];
  const formatted = Math.abs(rate).toFixed(2);
  const sign = direction === 'up' ? '+' : direction === 'down' ? '-' : '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 tabular-nums font-medium',
        sizeClasses[size],
        colorClasses[direction],
        className,
      )}
    >
      {showIcon && <Icon size={iconSizes[size]} />}
      {showSign && sign}
      {formatted}%
    </span>
  );
}

/** Badge variant with background */
export function ChangeRateBadge({
  rate,
  size = 'sm',
  className,
}: Omit<ChangeRateProps, 'showIcon' | 'showSign'>) {
  const direction = getDirection(rate);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 tabular-nums font-medium',
        sizeClasses[size],
        colorClasses[direction],
        bgClasses[direction],
        className,
      )}
    >
      <ChangeRate rate={rate} size={size} />
    </span>
  );
}
