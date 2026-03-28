import {
  Controller,
  Get,
  Param,
  Query,
  UsePipes,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { ListStocksDtoSchema, type ListStocksDto } from './dto/list-stocks.dto';
import { StockPriceQueryDtoSchema, type StockPriceQueryDto } from './dto/stock-price-query.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * StockController — Stock data REST endpoints.
 *
 * GET /api/stocks                   — List stocks with filter/sort/pagination
 * GET /api/stocks/:symbol           — Stock detail with latest price
 * GET /api/stocks/:symbol/prices    — Historical OHLCV (TimescaleDB)
 * GET /api/stocks/market/indices    — KOSPI/KOSDAQ index values
 */
@Controller('stocks')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(ListStocksDtoSchema))
  async findAll(@Query() query: ListStocksDto) {
    return this.stockService.findAll(query);
  }

  @Get('market/indices')
  async getMarketIndices() {
    return this.stockService.getMarketIndices();
  }

  @Get(':symbol')
  async findBySymbol(@Param('symbol') symbol: string) {
    return this.stockService.findBySymbol(symbol);
  }

  @Get(':symbol/prices')
  async getPriceHistory(
    @Param('symbol') symbol: string,
    @Query(new ZodValidationPipe(StockPriceQueryDtoSchema)) query: StockPriceQueryDto,
  ) {
    return this.stockService.getPriceHistory(symbol, query);
  }
}
