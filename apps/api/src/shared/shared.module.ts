import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';

/**
 * SharedModule — Global infrastructure module.
 *
 * Provides database (Prisma), cache (Redis), event emitter,
 * scheduling, and logging services to all domain modules.
 *
 * Dependency Rule: SharedModule MUST NOT import any domain module.
 */
@Global()
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  exports: [DatabaseModule, RedisModule],
})
export class SharedModule {}
