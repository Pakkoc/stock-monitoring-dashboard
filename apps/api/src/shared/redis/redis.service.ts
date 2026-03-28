import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisService — wraps ioredis client with NestJS lifecycle hooks.
 *
 * Provides typed get/set/del helpers and Pub/Sub support.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });
  }

  async onModuleInit() {
    this.client.on('connect', () => {
      this.logger.log('Redis connection established');
    });

    this.client.on('error', (err: Error) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }

  /** Get the underlying ioredis client */
  getClient(): Redis {
    return this.client;
  }

  /** Ping Redis to check connectivity */
  async ping(): Promise<string> {
    return this.client.ping();
  }

  /** Get a value by key */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Set a key-value pair with optional TTL in seconds */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /** Delete a key */
  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /** Get and parse JSON value */
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /** Set a JSON value */
  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }
}
