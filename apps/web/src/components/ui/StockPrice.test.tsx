/**
 * Unit tests for StockPrice component.
 *
 * Tests the Korean stock coloring convention:
 * - Red (text-stock-up) when price > previousClose
 * - Blue (text-stock-down) when price < previousClose
 * - Gray (text-stock-flat) when price === previousClose or no previousClose
 * - Currency symbol display
 * - Size variants
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockPrice } from './StockPrice';

describe('StockPrice', () => {
  // ─── Color Convention (Korean Market) ──────────────────────────

  describe('Korean color convention', () => {
    it('should apply UP color (red) when price > previousClose', () => {
      const { container } = render(
        <StockPrice price={72000} previousClose={71000} />,
      );
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-stock-up');
    });

    it('should apply DOWN color (blue) when price < previousClose', () => {
      const { container } = render(
        <StockPrice price={69000} previousClose={71000} />,
      );
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-stock-down');
    });

    it('should apply FLAT color (gray) when price === previousClose', () => {
      const { container } = render(
        <StockPrice price={71000} previousClose={71000} />,
      );
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-stock-flat');
    });

    it('should apply FLAT color when previousClose is not provided', () => {
      const { container } = render(<StockPrice price={71000} />);
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-stock-flat');
    });

    it('should apply FLAT color when previousClose is 0', () => {
      const { container } = render(
        <StockPrice price={71000} previousClose={0} />,
      );
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-stock-flat');
    });
  });

  // ─── Number Formatting ────────────────────────────────────────

  describe('number formatting', () => {
    it('should display price with Korean number formatting', () => {
      render(<StockPrice price={72000} />);
      // Korean locale formats 72000 as "72,000"
      expect(screen.getByText(/72,000/)).toBeDefined();
    });

    it('should display the won (₩) currency symbol by default', () => {
      render(<StockPrice price={72000} />);
      expect(screen.getByText(/₩/)).toBeDefined();
    });

    it('should hide currency symbol when showCurrency is false', () => {
      const { container } = render(
        <StockPrice price={72000} showCurrency={false} />,
      );
      const text = container.textContent ?? '';
      expect(text).not.toContain('₩');
      expect(text).toContain('72,000');
    });

    it('should format large numbers correctly', () => {
      render(<StockPrice price={1234567} />);
      expect(screen.getByText(/1,234,567/)).toBeDefined();
    });
  });

  // ─── Size Variants ────────────────────────────────────────────

  describe('size variants', () => {
    it('should apply sm size class', () => {
      const { container } = render(<StockPrice price={72000} size="sm" />);
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-price-sm');
    });

    it('should apply md size class by default', () => {
      const { container } = render(<StockPrice price={72000} />);
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-price-md');
    });

    it('should apply lg size class', () => {
      const { container } = render(<StockPrice price={72000} size="lg" />);
      const span = container.querySelector('span');
      expect(span?.className).toContain('text-price-lg');
    });
  });

  // ─── Animation ────────────────────────────────────────────────

  describe('animation', () => {
    it('should apply flash-up animation when animated and price up', () => {
      const { container } = render(
        <StockPrice price={72000} previousClose={71000} animated />,
      );
      const span = container.querySelector('span');
      expect(span?.className).toContain('animate-price-flash-up');
    });

    it('should apply flash-down animation when animated and price down', () => {
      const { container } = render(
        <StockPrice price={69000} previousClose={71000} animated />,
      );
      const span = container.querySelector('span');
      expect(span?.className).toContain('animate-price-flash-down');
    });

    it('should not apply animation when animated is false', () => {
      const { container } = render(
        <StockPrice price={72000} previousClose={71000} animated={false} />,
      );
      const span = container.querySelector('span');
      expect(span?.className).not.toContain('animate-price-flash');
    });
  });

  // ─── Custom className ─────────────────────────────────────────

  describe('custom className', () => {
    it('should merge custom className', () => {
      const { container } = render(
        <StockPrice price={72000} className="custom-class" />,
      );
      const span = container.querySelector('span');
      expect(span?.className).toContain('custom-class');
    });
  });
});
