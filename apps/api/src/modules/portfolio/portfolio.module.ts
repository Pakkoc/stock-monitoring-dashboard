import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { WatchlistService } from './watchlist.service';
import { AlertService } from './alert.service';
import { AuthModule } from '../auth/auth.module';

/**
 * PortfolioModule — Watchlists, alerts, and surge detection.
 *
 * Responsibilities:
 * - Watchlist CRUD (per-user, with stock items)
 * - Alert configuration and management (4 condition types)
 * - Alert triggering via EventEmitter when price thresholds are met
 * - Ownership enforcement (users can only access their own data)
 *
 * Dependencies: AuthModule (AuthGuard for endpoint protection)
 * Note: EventEmitterModule is provided globally by SharedModule.
 * Exports: WatchlistService, AlertService for cross-module consumption.
 */
@Module({
  imports: [AuthModule],
  controllers: [PortfolioController],
  providers: [WatchlistService, AlertService],
  exports: [WatchlistService, AlertService],
})
export class PortfolioModule {}
