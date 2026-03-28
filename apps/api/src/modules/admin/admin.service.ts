import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

/** System status response shape matching step-8 §5.8 */
interface SystemStatus {
  system: {
    uptime: number;
    version: string;
    nodeVersion: string;
    memoryUsageMb: number;
    cpuUsagePct: number;
  };
  database: {
    connected: boolean;
    totalStocks: number;
    totalPriceRows: number;
    oldestPriceData: string | null;
  };
  dataCollection: {
    kisWebsocket: {
      connected: boolean;
      subscribedStocks: number;
      lastMessageAt: string | null;
    };
    newsIngestion: {
      totalNewsToday: number;
    };
    aiAnalysis: {
      analysesToday: number;
      avgConfidenceScore: number;
    };
  };
  redis: {
    connected: boolean;
    memoryUsageMb: number;
  };
}

/** System settings stored in Redis */
interface SystemSettings {
  dataCollection: {
    priceUpdateIntervalMs: number;
    newsQueryIntervalMin: number;
    rssRefreshIntervalMin: number;
  };
  aiAnalysis: {
    provider: string;
    model: string;
    maxConcurrentAnalyses: number;
    dailyAnalysisLimit: number;
  };
  retention: {
    rawPriceDays: number;
    compressionAfterDays: number;
    newsRetentionDays: number;
  };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get comprehensive system status including DB, Redis, and data pipeline health.
   */
  async getSystemStatus(): Promise<{ data: SystemStatus }> {
    // Check database
    let dbConnected = false;
    let totalStocks = 0;
    let totalPriceRows = 0;
    let oldestPriceData: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbConnected = true;

      totalStocks = await this.prisma.stock.count({ where: { isActive: true } });

      // Get total price rows (approximate for large tables)
      const priceCountResult = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*) FROM stock_prices`,
      );
      totalPriceRows = priceCountResult.length > 0 ? Number(priceCountResult[0].count) : 0;

      // Get oldest price data
      const oldestResult = await this.prisma.$queryRawUnsafe<Array<{ time: Date }>>(
        `SELECT time FROM stock_prices ORDER BY time ASC LIMIT 1`,
      );
      oldestPriceData = oldestResult.length > 0 ? oldestResult[0].time.toISOString() : null;
    } catch (error) {
      this.logger.error(
        `Database status check failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }

    // Check Redis
    let redisConnected = false;
    let redisMemoryMb = 0;

    try {
      const pong = await this.redis.ping();
      redisConnected = pong === 'PONG';

      const infoStr = await this.redis.getClient().info('memory');
      const memMatch = infoStr.match(/used_memory:(\d+)/);
      if (memMatch) {
        redisMemoryMb = Math.round(Number(memMatch[1]) / (1024 * 1024));
      }
    } catch {
      this.logger.warn('Redis status check failed');
    }

    // Get KIS WebSocket status from Redis (set by the data ingestion service)
    const kisStatus = await this.redis.getJson<{
      connected: boolean;
      subscribedStocks: number;
      lastMessageAt: string | null;
    }>('kis:status');

    // Count news ingested today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const totalNewsToday = await this.prisma.news.count({
      where: { createdAt: { gte: todayStart } },
    });

    // AI analysis stats today
    const aiAnalysesToday = await this.prisma.aiAnalysis.count({
      where: { createdAt: { gte: todayStart } },
    });

    let avgConfidence = 0;
    try {
      const avgResult = await this.prisma.aiAnalysis.aggregate({
        _avg: { confidenceScore: true },
        where: { createdAt: { gte: todayStart } },
      });
      avgConfidence = avgResult._avg.confidenceScore
        ? Number(avgResult._avg.confidenceScore)
        : 0;
    } catch {
      // Table may be empty
    }

    // System info
    const memUsage = process.memoryUsage();

    return {
      data: {
        system: {
          uptime: Math.floor(process.uptime()),
          version: '1.0.0',
          nodeVersion: process.version,
          memoryUsageMb: Math.round(memUsage.heapUsed / (1024 * 1024)),
          cpuUsagePct: 0, // Would need OS-level monitoring
        },
        database: {
          connected: dbConnected,
          totalStocks,
          totalPriceRows,
          oldestPriceData,
        },
        dataCollection: {
          kisWebsocket: kisStatus ?? {
            connected: false,
            subscribedStocks: 0,
            lastMessageAt: null,
          },
          newsIngestion: {
            totalNewsToday,
          },
          aiAnalysis: {
            analysesToday: aiAnalysesToday,
            avgConfidenceScore: Math.round(avgConfidence * 1000) / 1000,
          },
        },
        redis: {
          connected: redisConnected,
          memoryUsageMb: redisMemoryMb,
        },
      },
    };
  }

  /**
   * List all registered users with watchlist/alert counts.
   */
  async getUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            watchlists: true,
            alerts: true,
          },
        },
      },
    });

    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        watchlistCount: u._count.watchlists,
        alertCount: u._count.alerts,
        createdAt: u.createdAt.toISOString(),
      })),
      meta: {
        total: users.length,
      },
    };
  }

  /**
   * Get system-wide settings from Redis.
   */
  async getSettings(): Promise<{ data: SystemSettings }> {
    const settings = await this.redis.getJson<SystemSettings>('system:settings');

    // Return stored settings or defaults
    return {
      data: settings ?? {
        dataCollection: {
          priceUpdateIntervalMs: 1000,
          newsQueryIntervalMin: 5,
          rssRefreshIntervalMin: 5,
        },
        aiAnalysis: {
          provider: 'claude',
          model: 'claude-sonnet-4-20250514',
          maxConcurrentAnalyses: 3,
          dailyAnalysisLimit: 100,
        },
        retention: {
          rawPriceDays: 365,
          compressionAfterDays: 7,
          newsRetentionDays: 730,
        },
      },
    };
  }

  /**
   * Update system-wide settings (partial update).
   * Merges provided fields with existing settings.
   */
  async updateSettings(updates: Partial<SystemSettings>): Promise<{ data: SystemSettings }> {
    const current = (await this.getSettings()).data;

    const merged: SystemSettings = {
      dataCollection: {
        ...current.dataCollection,
        ...updates.dataCollection,
      },
      aiAnalysis: {
        ...current.aiAnalysis,
        ...updates.aiAnalysis,
      },
      retention: {
        ...current.retention,
        ...updates.retention,
      },
    };

    await this.redis.setJson('system:settings', merged);

    this.logger.log('System settings updated');

    return { data: merged };
  }
}
