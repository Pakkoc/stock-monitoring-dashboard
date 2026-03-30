import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import type { CreateWatchlistDto, UpdateWatchlistDto, AddWatchlistItemDto } from './dto/create-watchlist.dto';

@Injectable()
export class WatchlistService {
  private readonly logger = new Logger(WatchlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get all watchlists for a user, with item counts.
   */
  async findAllByUser(userId: number) {
    const watchlists = await this.prisma.watchlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { items: true } },
      },
    });

    return {
      data: watchlists.map((wl) => ({
        id: wl.id,
        name: wl.name,
        itemCount: wl._count.items,
        createdAt: wl.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Create a new watchlist for a user.
   */
  async create(userId: number, dto: CreateWatchlistDto) {
    const watchlist = await this.prisma.watchlist.create({
      data: {
        userId,
        name: dto.name,
      },
      include: {
        _count: { select: { items: true } },
      },
    });

    this.logger.log(`Watchlist created: "${dto.name}" (id=${watchlist.id}, userId=${userId})`);

    return {
      data: {
        id: watchlist.id,
        name: watchlist.name,
        itemCount: watchlist._count.items,
        createdAt: watchlist.createdAt.toISOString(),
      },
    };
  }

  /**
   * Update a watchlist name.
   */
  async update(userId: number, watchlistId: number, dto: UpdateWatchlistDto) {
    await this.ensureOwnership(userId, watchlistId);

    const watchlist = await this.prisma.watchlist.update({
      where: { id: watchlistId },
      data: { name: dto.name },
      include: {
        _count: { select: { items: true } },
      },
    });

    return {
      data: {
        id: watchlist.id,
        name: watchlist.name,
        itemCount: watchlist._count.items,
        createdAt: watchlist.createdAt.toISOString(),
      },
    };
  }

  /**
   * Delete a watchlist and all its items (cascade handled by DB).
   */
  async remove(userId: number, watchlistId: number) {
    await this.ensureOwnership(userId, watchlistId);

    await this.prisma.watchlist.delete({
      where: { id: watchlistId },
    });

    this.logger.log(`Watchlist deleted: id=${watchlistId} by userId=${userId}`);
  }

  /**
   * Get all items in a watchlist with real-time stock data.
   */
  async getItems(userId: number, watchlistId: number) {
    await this.ensureOwnership(userId, watchlistId);

    const items = await this.prisma.watchlistItem.findMany({
      where: { watchlistId },
      orderBy: { addedAt: 'desc' },
      include: {
        stock: {
          select: {
            id: true,
            symbol: true,
            name: true,
            market: true,
          },
        },
      },
    });

    // Fetch latest prices from Redis cache (populated by polling service)
    return {
      data: await Promise.all(items.map(async (item) => {
        let currentPrice = 0, changeRate = 0, volume = 0, tradeValue = 0;
        try {
          const cached = await this.redis.get(`stock:price:${item.stock.symbol}`);
          if (cached) {
            const p = JSON.parse(cached);
            currentPrice = p.currentPrice || 0;
            changeRate = p.changeRate || 0;
            volume = p.accumulatedVolume || 0;
            tradeValue = p.accumulatedTradeValue || 0;
          }
        } catch { /* ignore */ }
        return {
          id: item.id,
          stockId: item.stock.id,
          symbol: item.stock.symbol,
          name: item.stock.name,
          market: item.stock.market,
          currentPrice,
          changeRate,
          volume,
          tradeValue,
          addedAt: item.addedAt.toISOString(),
        };
      })),
    };
  }

  /**
   * Add a stock to a watchlist.
   */
  async addItem(userId: number, watchlistId: number, dto: AddWatchlistItemDto) {
    await this.ensureOwnership(userId, watchlistId);

    // Verify stock exists
    const stock = await this.prisma.stock.findUnique({
      where: { id: dto.stockId },
    });
    if (!stock) {
      throw new NotFoundException({
        error: 'STOCK_NOT_FOUND',
        message: `Stock with id ${dto.stockId} not found.`,
      });
    }

    // Check for duplicate
    const existing = await this.prisma.watchlistItem.findUnique({
      where: {
        watchlistId_stockId: {
          watchlistId,
          stockId: dto.stockId,
        },
      },
    });

    if (existing) {
      throw new ConflictException({
        error: 'STOCK_ALREADY_IN_WATCHLIST',
        message: `Stock '${stock.symbol}' is already in this watchlist.`,
      });
    }

    const item = await this.prisma.watchlistItem.create({
      data: {
        watchlistId,
        stockId: dto.stockId,
      },
      include: {
        stock: {
          select: { id: true, symbol: true, name: true, market: true },
        },
      },
    });

    return {
      data: {
        id: item.id,
        stockId: item.stock.id,
        symbol: item.stock.symbol,
        name: item.stock.name,
        market: item.stock.market,
        addedAt: item.addedAt.toISOString(),
      },
    };
  }

  /**
   * Remove a stock from a watchlist.
   */
  async removeItem(userId: number, watchlistId: number, stockId: number) {
    await this.ensureOwnership(userId, watchlistId);

    const item = await this.prisma.watchlistItem.findUnique({
      where: {
        watchlistId_stockId: {
          watchlistId,
          stockId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException({
        error: 'ITEM_NOT_FOUND',
        message: 'Stock is not in this watchlist.',
      });
    }

    await this.prisma.watchlistItem.delete({
      where: { id: item.id },
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────

  /**
   * Verify that the authenticated user owns the watchlist.
   */
  private async ensureOwnership(userId: number, watchlistId: number): Promise<void> {
    const watchlist = await this.prisma.watchlist.findUnique({
      where: { id: watchlistId },
      select: { userId: true },
    });

    if (!watchlist) {
      throw new NotFoundException({
        error: 'WATCHLIST_NOT_FOUND',
        message: `Watchlist with id ${watchlistId} not found.`,
      });
    }

    if (watchlist.userId !== userId) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'You do not have permission to access this watchlist.',
      });
    }
  }

  /**
   * Fetch latest price for multiple symbols using DISTINCT ON.
   */
  private async getLatestPricesForSymbols(
    symbols: string[],
  ): Promise<Map<string, { close: number; changeRate: number | null; volume: number; tradeValue: number }>> {
    if (symbols.length === 0) return new Map();

    const results = await this.prisma.$queryRawUnsafe<Array<{
      symbol: string;
      close: number;
      change_rate: number | null;
      volume: bigint;
      trade_value: bigint;
    }>>(
      `
      SELECT DISTINCT ON (symbol)
        symbol, close::float8 AS close, change_rate::float8 AS change_rate,
        volume, trade_value
      FROM stock_prices
      WHERE symbol = ANY($1)
      ORDER BY symbol, time DESC
      `,
      symbols,
    );

    const map = new Map<string, { close: number; changeRate: number | null; volume: number; tradeValue: number }>();
    for (const row of results) {
      map.set(row.symbol, {
        close: Number(row.close),
        changeRate: row.change_rate !== null ? Number(row.change_rate) : null,
        volume: Number(row.volume),
        tradeValue: Number(row.trade_value),
      });
    }
    return map;
  }
}
