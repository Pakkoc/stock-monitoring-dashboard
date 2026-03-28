import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AuthModule } from '../auth/auth.module';

/**
 * AdminModule — System administration and monitoring.
 *
 * Responsibilities:
 * - System status dashboard (DB, Redis, KIS connection, data freshness)
 * - User management (admin-only)
 * - System settings (data collection intervals, AI config, retention)
 * - Role-based access control (ADMIN only via AdminGuard)
 *
 * Dependencies: AuthModule (AuthGuard for endpoint protection)
 * Exports: AdminService, AdminGuard for cross-module consumption.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}
