import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { KiwoomApiService } from './services/kiwoom-api.service';
import { buildPaginationMeta } from '../../common/interfaces/pagination.interface';
import type { ListStocksDto } from './dto/list-stocks.dto';
import type { StockPriceQueryDto } from './dto/stock-price-query.dto';

/** Shape of the latest price row joined for stock list */
interface LatestPriceRow {
  close: Prisma.Decimal;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  volume: bigint;
  tradeValue: bigint;
  changeRate: Prisma.Decimal | null;
  time: Date;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kiwoomApi: KiwoomApiService,
  ) {}

  /**
   * List stocks with filtering, sorting, and pagination.
   *
   * For sort fields that depend on price data (tradeValue, changeRate, volume),
   * we use a subquery approach to join latest prices.
   */
  async findAll(query: ListStocksDto) {
    const { market, sector, search, sortBy, sortOrder, page, limit, themeId, watchlistId } = query;

    // Build where clause
    const where: Prisma.StockWhereInput = {
      isActive: true,
    };

    if (market) {
      where.market = market;
    }

    if (sector) {
      where.sector = sector;
    }

    if (search) {
      where.OR = [
        { symbol: { startsWith: search } },
        { name: { contains: search } },
      ];
    }

    if (themeId) {
      where.themeStocks = {
        some: { themeId },
      };
    }

    if (watchlistId) {
      where.watchlistItems = {
        some: { watchlistId },
      };
    }

    // Count total matching stocks
    const total = await this.prisma.stock.count({ where });

    // Build orderBy — for price-based sorting, we use raw SQL for performance.
    // For name/symbol, Prisma's built-in ordering works.
    const prismaOrderBy: Prisma.StockOrderByWithRelationInput = {};
    if (sortBy === 'name' || sortBy === 'symbol') {
      prismaOrderBy[sortBy] = sortOrder;
    }

    // Fetch stocks with the latest price data
    const stocks = await this.prisma.stock.findMany({
      where,
      orderBy: Object.keys(prismaOrderBy).length > 0 ? prismaOrderBy : { id: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        symbol: true,
        name: true,
        market: true,
        sector: true,
        updatedAt: true,
      },
    });

    // Fetch latest price for each stock via a single raw query for efficiency
    const symbols = stocks.map((s) => s.symbol);
    const latestPrices = await this.getLatestPricesForSymbols(symbols);

    // Combine stock data with price data (Redis cache first, then DB fallback)
    const data = await Promise.all(stocks.map(async (stock) => {
      // Try Redis cache first (populated by polling service)
      const cached = await this.redis.get(`stock:price:${stock.symbol}`);
      if (cached) {
        try {
          const p = JSON.parse(cached);
          return {
            id: stock.id,
            symbol: stock.symbol,
            name: stock.name,
            market: stock.market,
            sector: stock.sector,
            currentPrice: p.currentPrice || 0,
            changeRate: p.changeRate || 0,
            changeAmount: p.changeAmount || 0,
            volume: p.accumulatedVolume || 0,
            tradeValue: p.accumulatedTradeValue || 0,
            high: p.high || 0,
            low: p.low || 0,
            open: p.open || 0,
            updatedAt: new Date().toISOString(),
          };
        } catch { /* fall through to DB */ }
      }
      const price = latestPrices.get(stock.symbol);
      return {
        id: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        sector: stock.sector,
        currentPrice: price ? Number(price.close) : 0,
        changeRate: price?.changeRate ? Number(price.changeRate) : 0,
        changeAmount: price ? Number(price.close) - Number(price.open) : 0,
        volume: price ? Number(price.volume) : 0,
        tradeValue: price ? Number(price.tradeValue) : 0,
        high: price ? Number(price.high) : 0,
        low: price ? Number(price.low) : 0,
        open: price ? Number(price.open) : 0,
        updatedAt: price?.time?.toISOString() ?? stock.updatedAt.toISOString(),
      };
    }));

    // Apply price-based sorting in-memory (for fields not in the Stock table)
    if (sortBy === 'tradeValue' || sortBy === 'changeRate' || sortBy === 'volume') {
      data.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /**
   * Get detailed stock information by symbol.
   * Includes latest price, themes, and technical indicators.
   */
  async findBySymbol(symbol: string) {
    const stock = await this.prisma.stock.findUnique({
      where: { symbol },
      include: {
        themeStocks: {
          include: {
            theme: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!stock) {
      throw new NotFoundException({
        error: 'STOCK_NOT_FOUND',
        message: `Stock with symbol '${symbol}' not found.`,
      });
    }

    const latestPrices = await this.getLatestPricesForSymbols([symbol]);
    const price = latestPrices.get(symbol);

    // Fetch technical indicators from the materialized view (if available)
    const technicalIndicators = await this.getTechnicalIndicators(stock.id);

    // Get previous close for the detail view
    const previousClose = await this.getPreviousClose(symbol);

    return {
      data: {
        id: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        sector: stock.sector,
        isActive: stock.isActive,
        listedAt: stock.listedAt?.toISOString() ?? null,
        currentPrice: price ? Number(price.close) : 0,
        changeRate: price?.changeRate ? Number(price.changeRate) : 0,
        changeAmount: price ? Number(price.close) - (previousClose ?? Number(price.open)) : 0,
        volume: price ? Number(price.volume) : 0,
        tradeValue: price ? Number(price.tradeValue) : 0,
        high: price ? Number(price.high) : 0,
        low: price ? Number(price.low) : 0,
        open: price ? Number(price.open) : 0,
        previousClose: previousClose ?? 0,
        themes: stock.themeStocks.map((ts) => ({
          id: ts.theme.id,
          name: ts.theme.name,
        })),
        technicalIndicators,
        updatedAt: price?.time?.toISOString() ?? stock.updatedAt.toISOString(),
      },
    };
  }

  /**
   * Get historical OHLCV data from Kiwoom Securities chart API.
   *
   * Strategy:
   * 1. Check Redis cache first (keyed by symbol + interval)
   * 2. If cache miss, call Kiwoom ka10081 (daily) or ka10080 (minute) chart API
   * 3. Cache the result in Redis for 60 seconds
   * 4. Return data in the format expected by the frontend CandlestickChartWidget
   *
   * Interval mapping to Kiwoom API:
   * - "1m"  → ka10080 tic_scope=1
   * - "5m"  → ka10080 tic_scope=5
   * - "15m" → ka10080 tic_scope=15
   * - "1h"  → ka10080 tic_scope=60
   * - "1d"  → ka10081 (daily chart)
   */
  async getPriceHistory(symbol: string, query: StockPriceQueryDto) {
    const { interval, limit } = query;

    // Verify stock exists
    const stock = await this.prisma.stock.findUnique({ where: { symbol } });
    if (!stock) {
      throw new NotFoundException({
        error: 'STOCK_NOT_FOUND',
        message: `Stock with symbol '${symbol}' not found.`,
      });
    }

    // 1. Check Redis cache
    const cacheKey = `chart:${symbol}:${interval}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        this.logger.debug(`Chart cache hit: ${cacheKey}`);
        return parsed;
      } catch {
        // Corrupted cache — fall through to API
      }
    }

    // 2. Fetch from Kiwoom API
    let candles: import('./services/kiwoom-api.service').DailyCandle[];

    try {
      if (interval === '1d' || interval === '1w' || interval === '1M') {
        candles = await this.kiwoomApi.getDailyChart(symbol);
      } else {
        const minuteScope = this.mapIntervalToMinuteScope(interval);
        candles = await this.kiwoomApi.getMinuteChart(symbol, minuteScope);
      }
    } catch (err) {
      this.logger.warn(
        `Kiwoom chart API failed for ${symbol} (${interval}): ${err instanceof Error ? err.message : String(err)}`,
      );
      // Return empty result on API failure
      return this.buildPriceHistoryResponse(symbol, interval, []);
    }

    // Apply limit (Kiwoom returns most recent first for minute charts)
    if (candles.length > limit) {
      candles = candles.slice(0, limit);
    }

    // Ensure chronological order (oldest first) for chart rendering
    candles.sort((a, b) => a.date.localeCompare(b.date));

    // Build response in the format expected by the frontend
    const response = this.buildPriceHistoryResponse(symbol, interval, candles);

    // 3. Cache for 60 seconds
    await this.redis.set(cacheKey, JSON.stringify(response), 60);

    return response;
  }

  /**
   * Build the price history response in the format the frontend expects.
   *
   * Frontend CandlestickChartWidget reads:
   *   data.prices[].timestamp, .open, .high, .low, .close, .volume
   */
  private buildPriceHistoryResponse(
    symbol: string,
    interval: string,
    candles: import('./services/kiwoom-api.service').DailyCandle[],
  ) {
    return {
      prices: candles.map((c) => {
        // Convert date to ISO timestamp
        // Daily: YYYYMMDD → ISO date string
        // Minute: already ISO-like from getMinuteChart (YYYY-MM-DDTHH:mm:ss)
        let timestamp: string;
        if (/^\d{8}$/.test(c.date)) {
          // YYYYMMDD → YYYY-MM-DDT09:00:00+09:00 (KST market open as default time)
          timestamp = `${c.date.slice(0, 4)}-${c.date.slice(4, 6)}-${c.date.slice(6, 8)}T09:00:00+09:00`;
        } else {
          timestamp = c.date.includes('T') ? c.date : new Date(c.date).toISOString();
        }

        return {
          symbol,
          timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        };
      }),
      symbol,
      timeframe: interval,
    };
  }

  /**
   * Get KOSPI/KOSDAQ market index values.
   * Reads from Redis cache if available, otherwise returns defaults.
   */
  async getMarketIndices() {
    // Try Redis cache first
    const cachedIndices = await this.redis.getJson<MarketIndexData[]>('market:indices');
    if (cachedIndices) {
      return { data: cachedIndices };
    }

    // Fetch from Kiwoom API
    try {
      const [kospi, kosdaq] = await Promise.all([
        this.kiwoomApi.getMarketIndex('001'),
        this.kiwoomApi.getMarketIndex('101'),
      ]);
      const indices = [kospi, kosdaq];
      // Cache for 30 seconds
      await this.redis.setJson('market:indices', indices, 30);
      return { data: indices };
    } catch (err) {
      this.logger.warn(`Failed to fetch market indices: ${err}`);
      return {
        data: [
          { market: 'KOSPI' as const, currentValue: 0, changeValue: 0, changeRate: 0, updatedAt: new Date().toISOString() },
          { market: 'KOSDAQ' as const, currentValue: 0, changeValue: 0, changeRate: 0, updatedAt: new Date().toISOString() },
        ],
      };
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────

  /**
   * Fetch latest price for multiple symbols using a single raw SQL query.
   * Uses DISTINCT ON to get the most recent row per symbol.
   */
  private async getLatestPricesForSymbols(symbols: string[]): Promise<Map<string, LatestPriceRow>> {
    if (symbols.length === 0) return new Map();

    const results = await this.prisma.$queryRawUnsafe<Array<{
      symbol: string;
      close: Prisma.Decimal;
      open: Prisma.Decimal;
      high: Prisma.Decimal;
      low: Prisma.Decimal;
      volume: bigint;
      trade_value: bigint;
      change_rate: Prisma.Decimal | null;
      time: Date;
    }>>(
      `
      SELECT DISTINCT ON (symbol)
        symbol, close, open, high, low, volume, trade_value, change_rate, time
      FROM stock_prices
      WHERE symbol = ANY($1)
      ORDER BY symbol, time DESC
      `,
      symbols,
    );

    const map = new Map<string, LatestPriceRow>();
    for (const row of results) {
      map.set(row.symbol, {
        close: row.close,
        open: row.open,
        high: row.high,
        low: row.low,
        volume: row.volume,
        tradeValue: row.trade_value,
        changeRate: row.change_rate,
        time: row.time,
      });
    }
    return map;
  }

  /**
   * Get the previous trading day's close price for a stock.
   */
  private async getPreviousClose(symbol: string): Promise<number | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ close: number }>>(
      `
      SELECT close::float8 AS close
      FROM daily_ohlcv
      WHERE symbol = $1
      ORDER BY bucket DESC
      LIMIT 1 OFFSET 1
      `,
      symbol,
    );

    return rows.length > 0 ? Number(rows[0].close) : null;
  }

  /**
   * Fetch technical indicators from the unified view.
   * Returns nulls if the view is not yet materialized.
   */
  private async getTechnicalIndicators(stockId: number) {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{
        sma_5: number | null;
        sma_20: number | null;
        sma_60: number | null;
        sma_120: number | null;
        rsi_14: number | null;
        macd: number | null;
        signal_line: number | null;
        histogram: number | null;
        upper_band: number | null;
        middle_band: number | null;
        lower_band: number | null;
      }>>(
        `
        SELECT sma_5, sma_20, sma_60, sma_120,
               rsi_14,
               macd, signal_line, histogram,
               upper_band, middle_band, lower_band
        FROM v_technical_indicators
        WHERE stock_id = $1
        ORDER BY bucket DESC
        LIMIT 1
        `,
        stockId,
      );

      if (rows.length === 0) {
        return this.emptyTechnicalIndicators();
      }

      const row = rows[0];
      return {
        sma5: row.sma_5 !== null ? Number(row.sma_5) : null,
        sma20: row.sma_20 !== null ? Number(row.sma_20) : null,
        sma60: row.sma_60 !== null ? Number(row.sma_60) : null,
        sma120: row.sma_120 !== null ? Number(row.sma_120) : null,
        rsi14: row.rsi_14 !== null ? Number(row.rsi_14) : null,
        macd: row.macd !== null ? Number(row.macd) : null,
        macdSignal: row.signal_line !== null ? Number(row.signal_line) : null,
        macdHistogram: row.histogram !== null ? Number(row.histogram) : null,
        bollingerUpper: row.upper_band !== null ? Number(row.upper_band) : null,
        bollingerMiddle: row.middle_band !== null ? Number(row.middle_band) : null,
        bollingerLower: row.lower_band !== null ? Number(row.lower_band) : null,
      };
    } catch (error) {
      // View may not exist yet if migrations haven't run
      this.logger.warn(
        `Technical indicators view query failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      return this.emptyTechnicalIndicators();
    }
  }

  private emptyTechnicalIndicators() {
    return {
      sma5: null,
      sma20: null,
      sma60: null,
      sma120: null,
      rsi14: null,
      macd: null,
      macdSignal: null,
      macdHistogram: null,
      bollingerUpper: null,
      bollingerMiddle: null,
      bollingerLower: null,
    };
  }

  /**
   * Map frontend interval to Kiwoom ka10080 tic_scope value.
   * Only used for minute-based intervals (not daily).
   */
  private mapIntervalToMinuteScope(interval: string): string {
    const mapping: Record<string, string> = {
      '1m': '1',
      '5m': '5',
      '15m': '15',
      '1h': '60',
    };
    return mapping[interval] ?? '1';
  }
}

interface MarketIndexData {
  market: 'KOSPI' | 'KOSDAQ';
  currentValue: number;
  changeValue: number;
  changeRate: number;
  updatedAt: string;
}
