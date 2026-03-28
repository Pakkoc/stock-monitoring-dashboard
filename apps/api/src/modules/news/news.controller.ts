import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { NewsService } from './news.service';
import { ListNewsDtoSchema, type ListNewsDto } from './dto/list-news.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * NewsController — News-related REST endpoints.
 *
 * GET /api/news                  — List news with filter/pagination
 * GET /api/stocks/:symbol/news   — News related to a stock
 *
 * Note: The GET /api/stocks/:symbol/news endpoint is registered here
 * under the 'stocks' prefix for RESTful URL structure.
 */
@Controller()
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('news')
  async findAll(
    @Query(new ZodValidationPipe(ListNewsDtoSchema)) query: ListNewsDto,
  ) {
    return this.newsService.findAll(query);
  }

  @Get('stocks/:symbol/news')
  async findByStock(
    @Param('symbol') symbol: string,
    @Query(new ZodValidationPipe(ListNewsDtoSchema)) query: ListNewsDto,
  ) {
    return this.newsService.findByStock(symbol, query);
  }
}
