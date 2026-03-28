import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../shared/redis/redis.service';

// ─── KIS API Response Types ─────────────────────────────────

/** Generic KIS REST response wrapper */
interface KisResponse<T> {
  rt_cd: string;   // "0" = success, "1" = failure
  msg_cd: string;
  msg1: string;
  output: T;
}

/** Generic KIS REST response with output2 array (chart data) */
interface KisResponseWithOutput2<T1, T2> {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output1: T1;
  output2: T2[];
}

/** OAuth2 token response from /oauth2/tokenP */
interface KisTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;                    // 7776000 (90 days)
  access_token_token_expired: string;    // "YYYY-MM-DD HH:MM:SS"
}

/** Current price output fields (TR: FHKST01010100) */
interface KisCurrentPriceOutput {
  stck_prpr: string;         // Current price
  prdy_vrss: string;         // Change from previous day
  prdy_vrss_sign: string;    // 1=up, 2=down, 3=same, 4=ceiling, 5=floor
  prdy_ctrt: string;         // Change rate (%)
  stck_oprc: string;         // Opening price
  stck_hgpr: string;         // High price
  stck_lwpr: string;         // Low price
  acml_vol: string;          // Accumulated volume
  acml_tr_pbmn: string;      // Accumulated trading value
  stck_mxpr: string;         // Upper limit price
  stck_llam: string;         // Lower limit price
  per: string;               // Price-to-Earnings Ratio
  pbr: string;               // Price-to-Book Ratio
  eps: string;               // Earnings Per Share
  bps: string;               // Book Value Per Share
  hts_avls: string;          // Market capitalization (억원)
}

/** Daily chart record from output2 (TR: FHKST03010100) */
interface KisDailyChartRecord {
  stck_bsop_date: string;    // Trading date (yyyyMMdd)
  stck_oprc: string;         // Opening price
  stck_hgpr: string;         // High price
  stck_lwpr: string;         // Low price
  stck_clpr: string;         // Closing price
  acml_vol: string;          // Accumulated volume
  acml_tr_pbmn: string;      // Accumulated trading value
  prdy_vrss: string;         // Change from previous day
  prdy_vrss_sign: string;    // Change direction
  prdy_ctrt: string;         // Change rate (%)
}

/** Daily chart output1 metadata (TR: FHKST03010100) */
interface KisDailyChartOutput1 {
  stck_prpr: string;
  prdy_vrss: string;
  prdy_vrss_sign: string;
  prdy_ctrt: string;
}

/** Volume rank item (TR: FHPST01710000) */
interface KisVolumeRankItem {
  mksc_shrn_iscd: string;    // Stock code
  hts_kor_isnm: string;     // Stock name (Korean)
  data_rank: string;         // Rank
  stck_prpr: string;         // Current price
  prdy_vrss: string;         // Change
  prdy_vrss_sign: string;    // Direction
  prdy_ctrt: string;         // Change rate (%)
  acml_vol: string;          // Accumulated volume
  acml_tr_pbmn: string;      // Accumulated trading value
  stck_hgpr: string;         // High price
  stck_lwpr: string;         // Low price
}

// ─── Domain Output Types ────────────────────────────────────

/** Normalized current price for our domain */
export interface CurrentPriceData {
  symbol: string;
  currentPrice: number;
  changeAmount: number;
  changeRate: number;
  changeSign: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  tradeValue: number;
  upperLimit: number;
  lowerLimit: number;
  per: number;
  pbr: number;
  eps: number;
  bps: number;
  marketCap: number;
}

/** Normalized daily candle record */
export interface DailyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeValue: number;
  changeAmount: number;
  changeRate: number;
}

/** Normalized volume rank item */
export interface VolumeRankItem {
  rank: number;
  symbol: string;
  name: string;
  currentPrice: number;
  changeAmount: number;
  changeSign: number;
  changeRate: number;
  volume: number;
  tradeValue: number;
  high: number;
  low: number;
}

/** Market index data */
export interface MarketIndexData {
  market: 'KOSPI' | 'KOSDAQ';
  currentValue: number;
  changeValue: number;
  changeRate: number;
  updatedAt: string;
}

// ─── Circuit Breaker State ──────────────────────────────────

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;   // errors before tripping (default: 5)
  windowMs: number;           // time window for counting errors (default: 60_000)
  cooldownMs: number;         // cooldown before half-open probe (default: 30_000)
}

// ─── Token Bucket Rate Limiter ──────────────────────────────

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number, // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait until next token is available
    const waitMs = Math.ceil((1 / this.refillRate) * 1000);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    const newTokens = (elapsedMs / 1000) * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

// ─── Service ────────────────────────────────────────────────

@Injectable()
export class KisApiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KisApiService.name);

  // Configuration
  private readonly baseUrl: string;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly isProduction: boolean;

  // Token management
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;

  // Rate limiter: 15 req/sec (safe margin under 20 limit)
  private readonly rateLimiter: TokenBucket;

  // Circuit breaker
  private circuitState: CircuitState = 'CLOSED';
  private readonly circuitConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    windowMs: 60_000,
    cooldownMs: 30_000,
  };
  private recentErrors: number[] = [];
  private circuitOpenedAt: number | null = null;

  private static readonly REDIS_TOKEN_KEY = 'kis:access_token';
  private static readonly REDIS_TOKEN_EXPIRY_KEY = 'kis:token_expires_at';
  private static readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly TOKEN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.isProduction = this.config.get<string>('KIS_ENVIRONMENT', 'simulation') === 'production';
    this.baseUrl = this.isProduction
      ? 'https://openapi.koreainvestment.com:9443'
      : 'https://openapivts.koreainvestment.com:29443';
    this.appKey = this.config.get<string>('KIS_APP_KEY', '');
    this.appSecret = this.config.get<string>('KIS_APP_SECRET', '');

    const maxReqPerSec = this.isProduction ? 15 : 2;
    this.rateLimiter = new TokenBucket(maxReqPerSec, maxReqPerSec);
  }

  async onModuleInit(): Promise<void> {
    if (!this.appKey || !this.appSecret) {
      this.logger.warn(
        'KIS API credentials not configured (KIS_APP_KEY / KIS_APP_SECRET). KIS API calls will fail.',
      );
      return;
    }

    // Try to restore token from Redis
    await this.restoreTokenFromRedis();

    // If no cached token, acquire a new one
    if (!this.accessToken) {
      try {
        await this.authenticate();
      } catch (error) {
        this.logger.error(
          `Initial KIS authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Schedule periodic token refresh (every 6 hours)
    this.tokenRefreshTimer = setInterval(
      () => void this.refreshToken(),
      KisApiService.TOKEN_REFRESH_INTERVAL_MS,
    );

    this.logger.log(
      `KIS API client initialized (env=${this.isProduction ? 'production' : 'simulation'})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
    this.logger.log('KIS API client destroyed');
  }

  // ─── Public API Methods ─────────────────────────────────

  /**
   * Get current price for a stock symbol.
   * TR: FHKST01010100
   */
  async getCurrentPrice(symbol: string): Promise<CurrentPriceData> {
    this.logger.debug(`getCurrentPrice(${symbol})`);

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: symbol,
    });

    const response = await this.request<KisResponse<KisCurrentPriceOutput>>(
      'GET',
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      'FHKST01010100',
      params,
    );

    const o = response.output;
    return {
      symbol,
      currentPrice: this.parseNum(o.stck_prpr),
      changeAmount: this.parseNum(o.prdy_vrss),
      changeRate: this.parseFloat(o.prdy_ctrt),
      changeSign: this.parseNum(o.prdy_vrss_sign),
      open: this.parseNum(o.stck_oprc),
      high: this.parseNum(o.stck_hgpr),
      low: this.parseNum(o.stck_lwpr),
      volume: this.parseNum(o.acml_vol),
      tradeValue: this.parseNum(o.acml_tr_pbmn),
      upperLimit: this.parseNum(o.stck_mxpr),
      lowerLimit: this.parseNum(o.stck_llam),
      per: this.parseFloat(o.per),
      pbr: this.parseFloat(o.pbr),
      eps: this.parseNum(o.eps),
      bps: this.parseNum(o.bps),
      marketCap: this.parseNum(o.hts_avls),
    };
  }

  /**
   * Get daily chart data for a symbol.
   * TR: FHKST03010100
   *
   * @param symbol    Stock code (e.g., "005930")
   * @param startDate Start date in yyyyMMdd format
   * @param endDate   End date in yyyyMMdd format
   * @param period    "D" | "W" | "M" | "Y" (default "D")
   */
  async getDailyChart(
    symbol: string,
    startDate: string,
    endDate: string,
    period: 'D' | 'W' | 'M' | 'Y' = 'D',
  ): Promise<DailyCandle[]> {
    this.logger.debug(`getDailyChart(${symbol}, ${startDate}~${endDate}, ${period})`);

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: symbol,
      FID_INPUT_DATE_1: startDate,
      FID_INPUT_DATE_2: endDate,
      FID_PERIOD_DIV_CODE: period,
      FID_ORG_ADJ_PRC: '0', // adjusted price
    });

    const response = await this.request<
      KisResponseWithOutput2<KisDailyChartOutput1, KisDailyChartRecord>
    >(
      'GET',
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      'FHKST03010100',
      params,
    );

    return response.output2.map((r) => ({
      date: r.stck_bsop_date,
      open: this.parseNum(r.stck_oprc),
      high: this.parseNum(r.stck_hgpr),
      low: this.parseNum(r.stck_lwpr),
      close: this.parseNum(r.stck_clpr),
      volume: this.parseNum(r.acml_vol),
      tradeValue: this.parseNum(r.acml_tr_pbmn),
      changeAmount: this.parseNum(r.prdy_vrss),
      changeRate: this.parseFloat(r.prdy_ctrt),
    }));
  }

  /**
   * Get trading volume ranking.
   * TR: FHPST01710000
   */
  async getVolumeRank(): Promise<VolumeRankItem[]> {
    this.logger.debug('getVolumeRank()');

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_COND_SCR_DIV_CODE: '20101',
      FID_INPUT_ISCD: '0000',           // All stocks
      FID_DIV_CLS_CODE: '0',            // All
      FID_BLNG_CLS_CODE: '0',           // All
      FID_TRGT_CLS_CODE: '111111111',   // All
      FID_TRGT_EXLS_CLS_CODE: '000000', // No exclusions
      FID_INPUT_PRICE_1: '0',
      FID_INPUT_PRICE_2: '0',
      FID_VOL_CNT: '0',
      FID_INPUT_DATE_1: '',
    });

    const response = await this.request<KisResponse<KisVolumeRankItem[]>>(
      'GET',
      '/uapi/domestic-stock/v1/quotations/volume-rank',
      'FHPST01710000',
      params,
    );

    // output is an array for this endpoint
    const items = Array.isArray(response.output) ? response.output : [];
    return items.map((item) => ({
      rank: this.parseNum(item.data_rank),
      symbol: item.mksc_shrn_iscd,
      name: item.hts_kor_isnm,
      currentPrice: this.parseNum(item.stck_prpr),
      changeAmount: this.parseNum(item.prdy_vrss),
      changeSign: this.parseNum(item.prdy_vrss_sign),
      changeRate: this.parseFloat(item.prdy_ctrt),
      volume: this.parseNum(item.acml_vol),
      tradeValue: this.parseNum(item.acml_tr_pbmn),
      high: this.parseNum(item.stck_hgpr),
      low: this.parseNum(item.stck_lwpr),
    }));
  }

  /**
   * Get market index data (KOSPI or KOSDAQ).
   *
   * Uses the same current-price endpoint with index codes:
   *   KOSPI=0001, KOSDAQ=1001
   */
  async getMarketIndex(indexCode: '0001' | '1001'): Promise<MarketIndexData> {
    const marketLabel = indexCode === '0001' ? 'KOSPI' : 'KOSDAQ';
    this.logger.debug(`getMarketIndex(${marketLabel})`);

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'U', // "U" for index
      FID_INPUT_ISCD: indexCode,
    });

    const response = await this.request<KisResponse<KisCurrentPriceOutput>>(
      'GET',
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      'FHKST01010100',
      params,
    );

    const o = response.output;
    return {
      market: marketLabel as 'KOSPI' | 'KOSDAQ',
      currentValue: this.parseFloat(o.stck_prpr),
      changeValue: this.parseFloat(o.prdy_vrss),
      changeRate: this.parseFloat(o.prdy_ctrt),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get WebSocket approval key. Required for KIS WebSocket authentication.
   * This is separate from the REST access token.
   */
  async getApprovalKey(): Promise<string> {
    this.logger.debug('Acquiring WebSocket approval key');

    const response = await fetch(
      `${this.getProductionBaseUrl()}/oauth2/Approval`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: this.appKey,
          secretkey: this.appSecret, // Note: "secretkey", NOT "appsecret"
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Approval key request failed: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as { approval_key: string };
    this.logger.log('WebSocket approval key acquired');
    return result.approval_key;
  }

  /** Check if KIS API credentials are configured */
  isConfigured(): boolean {
    return Boolean(this.appKey && this.appSecret);
  }

  // ─── Authentication ─────────────────────────────────────

  /**
   * Authenticate with KIS API via OAuth2 client_credentials grant.
   * POST /oauth2/tokenP
   */
  private async authenticate(): Promise<void> {
    this.logger.log('Authenticating with KIS API...');

    const response = await fetch(`${this.baseUrl}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: this.appKey,
        appsecret: this.appSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`KIS token request failed: ${response.status} ${response.statusText}`);
    }

    const tokenData = (await response.json()) as KisTokenResponse;
    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = new Date(tokenData.access_token_token_expired);

    // Cache token in Redis
    await this.storeTokenInRedis();

    this.logger.log(
      `KIS authentication successful. Token expires at ${this.tokenExpiresAt.toISOString()}`,
    );
  }

  /** Refresh token proactively (called on 6-hour interval) */
  private async refreshToken(): Promise<void> {
    try {
      if (!this.tokenExpiresAt) {
        await this.authenticate();
        return;
      }

      const bufferMs = KisApiService.TOKEN_REFRESH_BUFFER_MS;
      const remaining = this.tokenExpiresAt.getTime() - Date.now();

      if (remaining < bufferMs) {
        this.logger.log('Token approaching expiry, refreshing...');
        await this.authenticate();
      }
    } catch (error) {
      this.logger.error(
        `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async storeTokenInRedis(): Promise<void> {
    if (!this.accessToken || !this.tokenExpiresAt) return;

    // Store with TTL slightly shorter than actual expiry
    const ttlSeconds = Math.max(
      0,
      Math.floor(
        (this.tokenExpiresAt.getTime() - Date.now() - KisApiService.TOKEN_REFRESH_BUFFER_MS) /
          1000,
      ),
    );

    await this.redis.set(KisApiService.REDIS_TOKEN_KEY, this.accessToken, ttlSeconds);
    await this.redis.set(
      KisApiService.REDIS_TOKEN_EXPIRY_KEY,
      this.tokenExpiresAt.toISOString(),
      ttlSeconds,
    );
  }

  private async restoreTokenFromRedis(): Promise<void> {
    const token = await this.redis.get(KisApiService.REDIS_TOKEN_KEY);
    const expiryStr = await this.redis.get(KisApiService.REDIS_TOKEN_EXPIRY_KEY);

    if (token && expiryStr) {
      const expiry = new Date(expiryStr);
      if (expiry.getTime() - Date.now() > KisApiService.TOKEN_REFRESH_BUFFER_MS) {
        this.accessToken = token;
        this.tokenExpiresAt = expiry;
        this.logger.log('Restored KIS token from Redis cache');
      }
    }
  }

  // ─── HTTP Request Layer ─────────────────────────────────

  /**
   * Core request method with rate limiting, circuit breaker, and retry logic.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    trId: string,
    params?: URLSearchParams,
    body?: Record<string, unknown>,
  ): Promise<T> {
    // Circuit breaker check
    this.checkCircuitBreaker();

    // Ensure we have a valid token
    await this.ensureAuthenticated();

    // Rate limit
    await this.rateLimiter.acquire();

    const url =
      method === 'GET' && params
        ? `${this.baseUrl}${path}?${params.toString()}`
        : `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      authorization: `Bearer ${this.accessToken}`,
      appkey: this.appKey,
      appsecret: this.appSecret,
      tr_id: trId,
      custtype: 'P',
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === 'POST' && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    return this.executeWithRetry<T>(url, fetchOptions, trId);
  }

  /**
   * Execute a fetch with exponential backoff retry on transient errors.
   * Max 3 retries. On EGW00201 (rate limit), waits 1s then retries.
   */
  private async executeWithRetry<T>(
    url: string,
    options: RequestInit,
    trId: string,
    attempt = 0,
  ): Promise<T> {
    const maxRetries = 3;

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as T & { rt_cd?: string; msg_cd?: string; msg1?: string };

      // Check for KIS-level errors
      if (data.rt_cd === '1') {
        const errorCode = data.msg_cd ?? 'UNKNOWN';
        const errorMsg = data.msg1 ?? 'Unknown error';

        // Rate limit error — wait and retry
        if (errorCode === 'EGW00201' && attempt < maxRetries) {
          const delay = attempt === 0 ? 1000 : Math.pow(2, attempt) * 1000;
          this.logger.warn(
            `KIS rate limit hit (${trId}). Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          return this.executeWithRetry<T>(url, options, trId, attempt + 1);
        }

        // Token error — re-authenticate and retry once
        if (
          (errorMsg.includes('token') || errorMsg.includes('TOKEN')) &&
          attempt < 1
        ) {
          this.logger.warn(`KIS token error (${trId}). Re-authenticating...`);
          await this.authenticate();
          // Update auth header
          const headers = options.headers as Record<string, string>;
          headers['authorization'] = `Bearer ${this.accessToken}`;
          return this.executeWithRetry<T>(url, options, trId, attempt + 1);
        }

        this.recordError();
        throw new Error(`KIS API Error [${errorCode}]: ${errorMsg}`);
      }

      // Success — reset circuit breaker errors
      this.onSuccess();
      return data;
    } catch (error) {
      // Network-level retry
      if (attempt < maxRetries && this.isTransientError(error)) {
        const delay = Math.pow(2, attempt) * 1000;
        this.logger.warn(
          `KIS request failed (${trId}). Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry<T>(url, options, trId, attempt + 1);
      }

      this.recordError();
      throw error;
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || !this.tokenExpiresAt) {
      await this.authenticate();
      return;
    }

    // Check if token is about to expire
    if (
      this.tokenExpiresAt.getTime() - Date.now() <
      KisApiService.TOKEN_REFRESH_BUFFER_MS
    ) {
      await this.authenticate();
    }
  }

  // ─── Circuit Breaker ────────────────────────────────────

  private checkCircuitBreaker(): void {
    if (this.circuitState === 'CLOSED') return;

    if (this.circuitState === 'OPEN') {
      const elapsed = Date.now() - (this.circuitOpenedAt ?? 0);
      if (elapsed >= this.circuitConfig.cooldownMs) {
        this.circuitState = 'HALF_OPEN';
        this.logger.log('Circuit breaker transitioning to HALF_OPEN');
        return;
      }
      throw new Error(
        'KIS API circuit breaker is OPEN. Requests are temporarily rejected.',
      );
    }

    // HALF_OPEN — allow request through (probe)
  }

  private recordError(): void {
    const now = Date.now();
    this.recentErrors.push(now);
    // Prune errors outside the window
    this.recentErrors = this.recentErrors.filter(
      (t) => now - t < this.circuitConfig.windowMs,
    );

    if (
      this.recentErrors.length >= this.circuitConfig.failureThreshold &&
      this.circuitState !== 'OPEN'
    ) {
      this.circuitState = 'OPEN';
      this.circuitOpenedAt = now;
      this.logger.error(
        `Circuit breaker OPENED — ${this.recentErrors.length} errors in ${this.circuitConfig.windowMs}ms`,
      );
    }
  }

  private onSuccess(): void {
    if (this.circuitState === 'HALF_OPEN') {
      this.circuitState = 'CLOSED';
      this.recentErrors = [];
      this.circuitOpenedAt = null;
      this.logger.log('Circuit breaker CLOSED — probe request succeeded');
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  /**
   * Always use the production URL for WebSocket approval key,
   * since the WebSocket endpoint is shared.
   */
  private getProductionBaseUrl(): string {
    return 'https://openapi.koreainvestment.com:9443';
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof TypeError && error.message.includes('fetch')) return true;
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('etimedout') ||
        msg.includes('socket hang up') ||
        msg.includes('network')
      );
    }
    return false;
  }

  /** Parse a KIS numeric string to integer (handles empty/undefined) */
  private parseNum(value: string | undefined): number {
    if (!value || value === '') return 0;
    const cleaned = value.replace(/,/g, '');
    const parsed = parseInt(cleaned, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /** Parse a KIS numeric string to float (handles empty/undefined) */
  private parseFloat(value: string | undefined): number {
    if (!value || value === '') return 0;
    const cleaned = value.replace(/,/g, '');
    const parsed = globalThis.parseFloat(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
