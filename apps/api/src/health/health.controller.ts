import { Controller, Get } from '@nestjs/common';

import { PrismaService } from '../shared/database/prisma.service';
import { RedisService } from '../shared/redis/redis.service';

/**
 * Health check endpoints for Docker health checks and load balancer probes.
 *
 * GET /api/health — Liveness probe (is the process running?)
 * GET /api/ready  — Readiness probe (are dependencies connected?)
 */
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, string> = {};

    // Check PostgreSQL connection
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    // Check Redis connection
    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');

    return {
      status: allOk ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
