/**
 * Unit tests for NumberFormat utilities and components.
 *
 * Tests:
 * - formatKRW() — currency formatting with/without abbreviation
 * - abbreviateKorean() — 만/억/조 unit abbreviations
 * - formatVolume() — volume display
 * - formatPercent() — percentage with sign
 * - CurrencyDisplay component rendering
 * - VolumeDisplay component rendering
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  formatKRW,
  abbreviateKorean,
  formatVolume,
  formatPercent,
  CurrencyDisplay,
  VolumeDisplay,
} from './NumberFormat';

describe('NumberFormat Utilities', () => {
  // ─── formatKRW ────────────────────────────────────────────────

  describe('formatKRW', () => {
    it('should format number with ₩ and comma separators', () => {
      expect(formatKRW(72000)).toBe('₩72,000');
    });

    it('should format large numbers correctly', () => {
      expect(formatKRW(1234567890)).toBe('₩1,234,567,890');
    });

    it('should format zero', () => {
      expect(formatKRW(0)).toBe('₩0');
    });

    it('should format with Korean abbreviation when abbreviated=true', () => {
      expect(formatKRW(150000000, true)).toBe('₩1.5억');
    });

    it('should handle small numbers without abbreviation', () => {
      expect(formatKRW(5000, true)).toBe('₩0.5만');
    });
  });

  // ─── abbreviateKorean ─────────────────────────────────────────

  describe('abbreviateKorean', () => {
    it('should abbreviate 조 (trillion)', () => {
      expect(abbreviateKorean(1_500_000_000_000)).toBe('1.5조');
    });

    it('should abbreviate 억 (hundred million)', () => {
      expect(abbreviateKorean(250_000_000)).toBe('2.5억');
    });

    it('should abbreviate 만 (ten thousand)', () => {
      expect(abbreviateKorean(50_000)).toBe('5.0만');
    });

    it('should not abbreviate numbers below 만', () => {
      expect(abbreviateKorean(9999)).toBe('9,999');
    });

    it('should handle negative values with sign', () => {
      expect(abbreviateKorean(-250_000_000)).toBe('-2.5억');
    });

    it('should handle zero', () => {
      expect(abbreviateKorean(0)).toBe('0');
    });

    it('should handle exact boundaries', () => {
      expect(abbreviateKorean(10_000)).toBe('1.0만');
      expect(abbreviateKorean(100_000_000)).toBe('1.0억');
      expect(abbreviateKorean(1_000_000_000_000)).toBe('1.0조');
    });

    it('should format large 조 values', () => {
      expect(abbreviateKorean(45_000_000_000_000)).toBe('45.0조');
    });
  });

  // ─── formatVolume ─────────────────────────────────────────────

  describe('formatVolume', () => {
    it('should return abbreviated volume by default', () => {
      // abbreviated=false by default in utility, test explicit
      expect(formatVolume(15000000, true)).toBe('1500.0만');
    });

    it('should return full comma-separated volume when not abbreviated', () => {
      expect(formatVolume(15000000, false)).toBe('15,000,000');
    });

    it('should handle zero volume', () => {
      expect(formatVolume(0, false)).toBe('0');
    });
  });

  // ─── formatPercent ────────────────────────────────────────────

  describe('formatPercent', () => {
    it('should format positive percentage with + sign', () => {
      expect(formatPercent(3.45)).toBe('+3.45%');
    });

    it('should format negative percentage with - sign', () => {
      expect(formatPercent(-2.10)).toBe('-2.10%');
    });

    it('should format zero without + sign', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });

    it('should respect custom decimal places', () => {
      expect(formatPercent(3.456, 1)).toBe('+3.5%');
      expect(formatPercent(3.456, 3)).toBe('+3.456%');
    });

    it('should handle very small percentages', () => {
      expect(formatPercent(0.01)).toBe('+0.01%');
    });
  });
});

// ─── React Components ───────────────────────────────────────────

describe('NumberFormat Components', () => {
  describe('CurrencyDisplay', () => {
    it('should render formatted currency', () => {
      const { container } = render(<CurrencyDisplay value={72000} />);
      expect(container.textContent).toBe('₩72,000');
    });

    it('should render abbreviated currency', () => {
      const { container } = render(
        <CurrencyDisplay value={150_000_000} abbreviated />,
      );
      expect(container.textContent).toBe('₩1.5억');
    });

    it('should apply custom className', () => {
      const { container } = render(
        <CurrencyDisplay value={72000} className="text-lg" />,
      );
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-lg');
    });

    it('should always include tabular-nums class', () => {
      const { container } = render(<CurrencyDisplay value={72000} />);
      const span = container.querySelector('span');
      expect(span?.className).toContain('tabular-nums');
    });
  });

  describe('VolumeDisplay', () => {
    it('should render abbreviated volume by default', () => {
      const { container } = render(<VolumeDisplay value={15_000_000} />);
      expect(container.textContent).toBe('1500.0만');
    });

    it('should render full volume when abbreviated is false', () => {
      const { container } = render(
        <VolumeDisplay value={15_000_000} abbreviated={false} />,
      );
      expect(container.textContent).toBe('15,000,000');
    });

    it('should apply muted-foreground text style', () => {
      const { container } = render(<VolumeDisplay value={1000} />);
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-muted-foreground');
    });
  });
});
