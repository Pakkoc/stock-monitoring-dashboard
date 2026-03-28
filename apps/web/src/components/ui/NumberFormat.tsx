'use client';

/**
 * Korean number formatting utilities and components.
 *
 * Supports:
 * - Currency display with ₩ symbol
 * - Abbreviated numbers (만, 억, 조)
 * - Volume formatting
 * - Percentage formatting
 */
import { cn } from '@/lib/utils';

/** Format number with Korean won currency */
export function formatKRW(value: number, abbreviated = false): string {
  if (abbreviated) {
    return `₩${abbreviateKorean(value)}`;
  }
  return `₩${new Intl.NumberFormat('ko-KR').format(value)}`;
}

/** Format number with Korean unit abbreviations */
export function abbreviateKorean(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000_000).toFixed(1)}조`;
  }
  if (absValue >= 100_000_000) {
    return `${sign}${(absValue / 100_000_000).toFixed(1)}억`;
  }
  if (absValue >= 10_000) {
    return `${sign}${(absValue / 10_000).toFixed(1)}만`;
  }
  return `${sign}${new Intl.NumberFormat('ko-KR').format(absValue)}`;
}

/** Format volume with commas */
export function formatVolume(volume: number, abbreviated = false): string {
  if (abbreviated) {
    return abbreviateKorean(volume);
  }
  return new Intl.NumberFormat('ko-KR').format(volume);
}

/** Format percentage */
export function formatPercent(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

// --- React Components ---

interface CurrencyDisplayProps {
  value: number;
  abbreviated?: boolean;
  className?: string;
}

export function CurrencyDisplay({
  value,
  abbreviated = false,
  className,
}: CurrencyDisplayProps) {
  return (
    <span className={cn('tabular-nums', className)}>
      {formatKRW(value, abbreviated)}
    </span>
  );
}

interface VolumeDisplayProps {
  value: number;
  abbreviated?: boolean;
  className?: string;
}

export function VolumeDisplay({
  value,
  abbreviated = true,
  className,
}: VolumeDisplayProps) {
  return (
    <span className={cn('tabular-nums text-muted-foreground', className)}>
      {formatVolume(value, abbreviated)}
    </span>
  );
}
