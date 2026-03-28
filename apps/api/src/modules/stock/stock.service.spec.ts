/**
 * Unit tests for StockService.
 *
 * Tests:
 * - findAll() — list stocks with pagination, filtering, and price data
 * - findBySymbol() — stock detail lookup including NotFoundException
 * - getMarketIndices() — Redis cache hit/miss paths
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { StockService } from './stock.service';
import {
  createMockPrismaService,
  createMockRedisService,
} from '../../../test/setup';

describe('StockService', () => {
  let service: StockService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    redis = createMockRedisService();

    // Construct service with mocked dependencies
    service = new StockService(prisma as any, redis as any);
  });

  // ─── findAll ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated stock list with default parameters', async () => {
      const mockStocks = [
        {
          id: 1,
          symbol: '005930',
          name: '삼성전자',
          market: 'KOSPI',
          sector: '전기전자',
          updatedAt: new Date('2026-03-27'),
        },
        {
          id: 2,
          symbol: '000660',
          name: 'SK하이닉스',
          market: 'KOSPI',
          sector: '전기전자',
          updatedAt: new Date('2026-03-27'),
        },
      ];

      prisma.stock.count.mockResolvedValue(2);
      prisma.stock.findMany.mockResolvedValue(mockStocks);

      // Mock raw query for latest prices
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          symbol: '005930',
          close: 72000,
          open: 71000,
          high: 73000,
          low: 70500,
          volume: BigInt(15000000),
          trade_value: BigInt(1080000000000),
          change_rate: 1.41,
          time: new Date('2026-03-27T09:30:00'),
        },
        {
          symbol: '000660',
          close: 185000,
          open: 183000,
          high: 186000,
          low: 182000,
          volume: BigInt(5000000),
          trade_value: BigInt(925000000000),
          change_rate: 1.09,
          time: new Date('2026-03-27T09:30:00'),
        },
      ]);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      } as any);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].symbol).toBe('005930');
      expect(result.data[0].name).toBe('삼성전자');
      expect(result.data[0].currentPrice).toBe(72000);
      expect(result.meta).toBeDefined();
      expect(result.meta.total).toBe(2);
    });

    it('should apply market filter when provided', async () => {
      prisma.stock.count.mockResolvedValue(0);
      prisma.stock.findMany.mockResolvedValue([]);
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.findAll({
        page: 1,
        limit: 20,
        market: 'KOSDAQ',
        sortBy: 'name',
        sortOrder: 'asc',
      } as any);

      const countCall = prisma.stock.count.mock.calls[0][0];
      expect(countCall.where.market).toBe('KOSDAQ');
    });

    it('should apply search filter across symbol and name', async () => {
      prisma.stock.count.mockResolvedValue(0);
      prisma.stock.findMany.mockResolvedValue([]);
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.findAll({
        page: 1,
        limit: 20,
        search: '삼성',
        sortBy: 'name',
        sortOrder: 'asc',
      } as any);

      const countCall = prisma.stock.count.mock.calls[0][0];
      expect(countCall.where.OR).toBeDefined();
      expect(countCall.where.OR).toHaveLength(2);
    });

    it('should return zero prices when no price data available', async () => {
      const mockStocks = [
        {
          id: 1,
          symbol: '999999',
          name: '테스트종목',
          market: 'KOSPI',
          sector: null,
          updatedAt: new Date(),
        },
      ];

      prisma.stock.count.mockResolvedValue(1);
      prisma.stock.findMany.mockResolvedValue(mockStocks);
      prisma.$queryRawUnsafe.mockResolvedValue([]); // No price data

      const result = await service.findAll({
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      } as any);

      expect(result.data[0].currentPrice).toBe(0);
      expect(result.data[0].volume).toBe(0);
      expect(result.data[0].changeRate).toBe(0);
    });
  });

  // ─── findBySymbol ──────────────────────────────────────────────

  describe('findBySymbol', () => {
    it('should return stock detail with latest price', async () => {
      const mockStock = {
        id: 1,
        symbol: '005930',
        name: '삼성전자',
        market: 'KOSPI',
        sector: '전기전자',
        isActive: true,
        listedAt: new Date('1975-06-11'),
        updatedAt: new Date(),
        themeStocks: [
          { theme: { id: 1, name: '반도체' } },
        ],
      };

      prisma.stock.findUnique.mockResolvedValue(mockStock);

      // Mock latest price query
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          {
            symbol: '005930',
            close: 72000,
            open: 71000,
            high: 73000,
            low: 70500,
            volume: BigInt(15000000),
            trade_value: BigInt(1080000000000),
            change_rate: 1.41,
            time: new Date(),
          },
        ])
        // Mock technical indicators (empty)
        .mockResolvedValueOnce([])
        // Mock previous close
        .mockResolvedValueOnce([{ close: 71000 }]);

      const result = await service.findBySymbol('005930');

      expect(result.data.symbol).toBe('005930');
      expect(result.data.name).toBe('삼성전자');
      expect(result.data.currentPrice).toBe(72000);
      expect(result.data.themes).toHaveLength(1);
      expect(result.data.themes[0].name).toBe('반도체');
      expect(result.data.previousClose).toBe(71000);
    });

    it('should throw NotFoundException for unknown symbol', async () => {
      prisma.stock.findUnique.mockResolvedValue(null);

      await expect(service.findBySymbol('UNKNOWN')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include technical indicators when available', async () => {
      const mockStock = {
        id: 1,
        symbol: '005930',
        name: '삼성전자',
        market: 'KOSPI',
        sector: '전기전자',
        isActive: true,
        listedAt: null,
        updatedAt: new Date(),
        themeStocks: [],
      };

      prisma.stock.findUnique.mockResolvedValue(mockStock);

      prisma.$queryRawUnsafe
        // Latest price
        .mockResolvedValueOnce([
          {
            symbol: '005930',
            close: 72000,
            open: 71000,
            high: 73000,
            low: 70500,
            volume: BigInt(15000000),
            trade_value: BigInt(1080000000000),
            change_rate: 1.41,
            time: new Date(),
          },
        ])
        // Technical indicators
        .mockResolvedValueOnce([
          {
            sma_5: 71800,
            sma_20: 70500,
            sma_60: 68000,
            sma_120: 65000,
            rsi_14: 62.5,
            macd: 450,
            signal_line: 380,
            histogram: 70,
            upper_band: 74000,
            middle_band: 70500,
            lower_band: 67000,
          },
        ])
        // Previous close
        .mockResolvedValueOnce([{ close: 71000 }]);

      const result = await service.findBySymbol('005930');

      expect(result.data.technicalIndicators.sma5).toBe(71800);
      expect(result.data.technicalIndicators.rsi14).toBe(62.5);
      expect(result.data.technicalIndicators.macd).toBe(450);
      expect(result.data.technicalIndicators.bollingerUpper).toBe(74000);
    });
  });

  // ─── getMarketIndices ──────────────────────────────────────────

  describe('getMarketIndices', () => {
    it('should return cached data when Redis has indices', async () => {
      const cachedIndices = [
        { market: 'KOSPI', currentValue: 2650.32, changeValue: 15.5, changeRate: 0.59, updatedAt: '2026-03-27T09:30:00Z' },
        { market: 'KOSDAQ', currentValue: 850.12, changeValue: -3.2, changeRate: -0.38, updatedAt: '2026-03-27T09:30:00Z' },
      ];

      redis.getJson.mockResolvedValue(cachedIndices);

      const result = await service.getMarketIndices();

      expect(result.data).toEqual(cachedIndices);
      expect(redis.getJson).toHaveBeenCalledWith('market:indices');
    });

    it('should return default zero values when cache is empty', async () => {
      redis.getJson.mockResolvedValue(null);

      const result = await service.getMarketIndices();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].market).toBe('KOSPI');
      expect(result.data[0].currentValue).toBe(0);
      expect(result.data[1].market).toBe('KOSDAQ');
      expect(result.data[1].currentValue).toBe(0);
    });
  });
});
