import { Controller, Get, Query } from '@nestjs/common';
import { StockService } from './stock.service';

/**
 * ThemeController — Theme performance REST endpoint.
 *
 * GET /api/themes/performance?limit=10 — Aggregated theme performance with stock prices
 */
@Controller('themes')
export class ThemeController {
  constructor(private readonly stockService: StockService) {}

  @Get('performance')
  async getThemePerformance(@Query('limit') limitParam?: string) {
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 50) : 10;
    return this.stockService.getThemePerformance(limit);
  }
}
