import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/database/prisma.service';
import type { CreateAlertDto, UpdateAlertDto, ListAlertsDto } from './dto/create-alert.dto';

/** Alert condition check result */
interface AlertCheckResult {
  alertId: number;
  userId: number;
  stockSymbol: string;
  stockName: string;
  conditionType: string;
  threshold: number;
  currentValue: number;
  triggered: boolean;
  message: string;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * List alerts for a user with optional filtering.
   */
  async findAllByUser(userId: number, query?: ListAlertsDto) {
    const where: Prisma.AlertWhereInput = { userId };

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.stockId) {
      where.stockId = query.stockId;
    }

    const alerts = await this.prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        stock: {
          select: { id: true, symbol: true, name: true },
        },
      },
    });

    return {
      data: alerts.map((alert) => ({
        id: alert.id,
        stock: {
          id: alert.stock.id,
          symbol: alert.stock.symbol,
          name: alert.stock.name,
        },
        conditionType: alert.conditionType,
        threshold: Number(alert.threshold),
        isActive: alert.isActive,
        lastTriggeredAt: alert.lastTriggeredAt?.toISOString() ?? null,
        createdAt: alert.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Create a new alert for a user.
   */
  async create(userId: number, dto: CreateAlertDto) {
    // Verify stock exists
    const stock = await this.prisma.stock.findUnique({
      where: { id: dto.stockId },
      select: { id: true, symbol: true, name: true },
    });

    if (!stock) {
      throw new NotFoundException({
        error: 'STOCK_NOT_FOUND',
        message: `Stock with id ${dto.stockId} not found.`,
      });
    }

    const alert = await this.prisma.alert.create({
      data: {
        userId,
        stockId: dto.stockId,
        conditionType: dto.conditionType,
        threshold: dto.threshold,
      },
      include: {
        stock: {
          select: { id: true, symbol: true, name: true },
        },
      },
    });

    this.logger.log(
      `Alert created: ${dto.conditionType} ${dto.threshold} for ${stock.symbol} (userId=${userId})`,
    );

    return {
      data: {
        id: alert.id,
        stock: {
          id: alert.stock.id,
          symbol: alert.stock.symbol,
          name: alert.stock.name,
        },
        conditionType: alert.conditionType,
        threshold: Number(alert.threshold),
        isActive: alert.isActive,
        lastTriggeredAt: alert.lastTriggeredAt?.toISOString() ?? null,
        createdAt: alert.createdAt.toISOString(),
      },
    };
  }

  /**
   * Update an alert's threshold or active status.
   */
  async update(userId: number, alertId: number, dto: UpdateAlertDto) {
    await this.ensureOwnership(userId, alertId);

    const updateData: Prisma.AlertUpdateInput = {};
    if (dto.threshold !== undefined) {
      updateData.threshold = dto.threshold;
    }
    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }

    const alert = await this.prisma.alert.update({
      where: { id: alertId },
      data: updateData,
      include: {
        stock: {
          select: { id: true, symbol: true, name: true },
        },
      },
    });

    return {
      data: {
        id: alert.id,
        stock: {
          id: alert.stock.id,
          symbol: alert.stock.symbol,
          name: alert.stock.name,
        },
        conditionType: alert.conditionType,
        threshold: Number(alert.threshold),
        isActive: alert.isActive,
        lastTriggeredAt: alert.lastTriggeredAt?.toISOString() ?? null,
        createdAt: alert.createdAt.toISOString(),
      },
    };
  }

  /**
   * Delete an alert.
   */
  async remove(userId: number, alertId: number) {
    await this.ensureOwnership(userId, alertId);

    await this.prisma.alert.delete({
      where: { id: alertId },
    });

    this.logger.log(`Alert deleted: id=${alertId} by userId=${userId}`);
  }

  /**
   * Check all active alerts for a stock against the current price.
   * Called by the real-time price ingestion pipeline.
   *
   * Returns the list of triggered alerts. Each triggered alert
   * has its lastTriggeredAt updated and emits an event.
   */
  async checkAlerts(stockSymbol: string, currentPrice: number, changeRate: number, volume: number): Promise<AlertCheckResult[]> {
    // Find the stock
    const stock = await this.prisma.stock.findUnique({
      where: { symbol: stockSymbol },
      select: { id: true, symbol: true, name: true },
    });

    if (!stock) return [];

    // Get all active alerts for this stock
    const activeAlerts = await this.prisma.alert.findMany({
      where: {
        stockId: stock.id,
        isActive: true,
      },
      include: {
        user: { select: { id: true } },
      },
    });

    const results: AlertCheckResult[] = [];

    for (const alert of activeAlerts) {
      const threshold = Number(alert.threshold);
      let triggered = false;
      let currentValue = 0;
      let message = '';

      switch (alert.conditionType) {
        case 'PRICE_ABOVE':
          currentValue = currentPrice;
          triggered = currentPrice > threshold;
          message = triggered
            ? `${stock.name} (${stock.symbol}) 가격이 ${threshold.toLocaleString()}원을 초과했습니다 (현재: ${currentPrice.toLocaleString()}원)`
            : '';
          break;

        case 'PRICE_BELOW':
          currentValue = currentPrice;
          triggered = currentPrice < threshold;
          message = triggered
            ? `${stock.name} (${stock.symbol}) 가격이 ${threshold.toLocaleString()}원 미만입니다 (현재: ${currentPrice.toLocaleString()}원)`
            : '';
          break;

        case 'CHANGE_RATE':
          currentValue = Math.abs(changeRate);
          triggered = Math.abs(changeRate) >= threshold;
          message = triggered
            ? `${stock.name} (${stock.symbol}) 등락률이 ${threshold}% 임계값을 초과했습니다 (현재: ${changeRate > 0 ? '+' : ''}${changeRate}%)`
            : '';
          break;

        case 'VOLUME_SURGE':
          // threshold represents volume multiplier vs 20-day average
          // For now, use raw volume comparison as a placeholder
          currentValue = volume;
          triggered = volume > threshold;
          message = triggered
            ? `${stock.name} (${stock.symbol}) 거래량이 급증했습니다 (현재: ${volume.toLocaleString()}주)`
            : '';
          break;
      }

      if (triggered) {
        // Update lastTriggeredAt
        await this.prisma.alert.update({
          where: { id: alert.id },
          data: { lastTriggeredAt: new Date() },
        });

        const result: AlertCheckResult = {
          alertId: alert.id,
          userId: alert.user.id,
          stockSymbol: stock.symbol,
          stockName: stock.name,
          conditionType: alert.conditionType,
          threshold,
          currentValue,
          triggered: true,
          message,
        };

        results.push(result);

        // Emit event for WebSocket notification
        this.eventEmitter.emit('alert.triggered', result);
      }
    }

    if (results.length > 0) {
      this.logger.log(`${results.length} alert(s) triggered for ${stockSymbol}`);
    }

    return results;
  }

  // ─── Private Helpers ─────────────────────────────────────────

  private async ensureOwnership(userId: number, alertId: number): Promise<void> {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      select: { userId: true },
    });

    if (!alert) {
      throw new NotFoundException({
        error: 'ALERT_NOT_FOUND',
        message: `Alert with id ${alertId} not found.`,
      });
    }

    if (alert.userId !== userId) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'You do not have permission to access this alert.',
      });
    }
  }
}
