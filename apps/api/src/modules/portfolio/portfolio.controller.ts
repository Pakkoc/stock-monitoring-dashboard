import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { AlertService } from './alert.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateWatchlistDtoSchema,
  UpdateWatchlistDtoSchema,
  AddWatchlistItemDtoSchema,
  type CreateWatchlistDto,
  type UpdateWatchlistDto,
  type AddWatchlistItemDto,
} from './dto/create-watchlist.dto';
import {
  CreateAlertDtoSchema,
  UpdateAlertDtoSchema,
  ListAlertsDtoSchema,
  type CreateAlertDto,
  type UpdateAlertDto,
  type ListAlertsDto,
} from './dto/create-alert.dto';

/**
 * PortfolioController — Watchlist and alert management.
 *
 * All endpoints require authentication.
 *
 * Watchlist endpoints:
 *   GET    /api/watchlists
 *   POST   /api/watchlists
 *   PUT    /api/watchlists/:id
 *   DELETE /api/watchlists/:id
 *   GET    /api/watchlists/:id/items
 *   POST   /api/watchlists/:id/items
 *   DELETE /api/watchlists/:id/items/:stockId
 *
 * Alert endpoints:
 *   GET    /api/alerts
 *   POST   /api/alerts
 *   PUT    /api/alerts/:id
 *   DELETE /api/alerts/:id
 */
@Controller()
@UseGuards(AuthGuard)
export class PortfolioController {
  constructor(
    private readonly watchlistService: WatchlistService,
    private readonly alertService: AlertService,
  ) {}

  // ─── Watchlist Endpoints ───────────────────────────────────────

  @Get('watchlists')
  async getWatchlists(@CurrentUser() user: AuthenticatedUser) {
    return this.watchlistService.findAllByUser(user.id);
  }

  @Post('watchlists')
  @HttpCode(HttpStatus.CREATED)
  async createWatchlist(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateWatchlistDtoSchema)) dto: CreateWatchlistDto,
  ) {
    return this.watchlistService.create(user.id, dto);
  }

  @Put('watchlists/:id')
  async updateWatchlist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateWatchlistDtoSchema)) dto: UpdateWatchlistDto,
  ) {
    return this.watchlistService.update(user.id, id, dto);
  }

  @Delete('watchlists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWatchlist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.watchlistService.remove(user.id, id);
  }

  @Get('watchlists/:id/items')
  async getWatchlistItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.watchlistService.getItems(user.id, id);
  }

  @Post('watchlists/:id/items')
  @HttpCode(HttpStatus.CREATED)
  async addWatchlistItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(AddWatchlistItemDtoSchema)) dto: AddWatchlistItemDto,
  ) {
    return this.watchlistService.addItem(user.id, id, dto);
  }

  @Delete('watchlists/:id/items/:stockId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWatchlistItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('stockId', ParseIntPipe) stockId: number,
  ) {
    await this.watchlistService.removeItem(user.id, id, stockId);
  }

  // ─── Alert Endpoints ──────────────────────────────────────────

  @Get('alerts')
  async getAlerts(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListAlertsDtoSchema)) query: ListAlertsDto,
  ) {
    return this.alertService.findAllByUser(user.id, query);
  }

  @Post('alerts')
  @HttpCode(HttpStatus.CREATED)
  async createAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateAlertDtoSchema)) dto: CreateAlertDto,
  ) {
    return this.alertService.create(user.id, dto);
  }

  @Put('alerts/:id')
  async updateAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateAlertDtoSchema)) dto: UpdateAlertDto,
  ) {
    return this.alertService.update(user.id, id, dto);
  }

  @Delete('alerts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.alertService.remove(user.id, id);
  }
}
