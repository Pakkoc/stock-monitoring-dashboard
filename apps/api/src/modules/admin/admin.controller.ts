import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from './admin.guard';

/**
 * AdminController — System administration endpoints (ADMIN role only).
 *
 * GET /api/admin/status    — System health and data pipeline status
 * GET /api/admin/users     — List all registered users
 * GET /api/admin/settings  — Get system-wide configuration
 * PUT /api/admin/settings  — Update system-wide configuration
 */
@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('status')
  async getSystemStatus() {
    return this.adminService.getSystemStatus();
  }

  @Get('users')
  async getUsers() {
    return this.adminService.getUsers();
  }

  @Get('settings')
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings')
  async updateSettings(@Body() updates: Record<string, unknown>) {
    return this.adminService.updateSettings(updates);
  }
}
