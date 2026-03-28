import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedModule } from './shared/shared.module';
import { HealthController } from './health/health.controller';
import { StockModule } from './modules/stock/stock.module';
import { NewsModule } from './modules/news/news.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    // Configuration — loads .env file
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Shared infrastructure (Prisma, Redis, Bull, Logger, Scheduler)
    SharedModule,

    // Domain modules
    AuthModule,
    StockModule,
    NewsModule,
    AiAgentModule,
    PortfolioModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
