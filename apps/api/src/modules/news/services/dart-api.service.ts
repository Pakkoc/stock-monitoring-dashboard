import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** DART API disclosure item */
export interface DartDisclosureItem {
  corpCode: string;
  corpName: string;
  stockCode: string;
  reportName: string;
  receiptNumber: string;
  filingDate: string;
  reportUrl: string;
}

/** DART API list response */
interface DartListResponse {
  status: string;
  message: string;
  page_no: number;
  page_count: number;
  total_count: number;
  total_page: number;
  list: Array<{
    corp_code: string;
    corp_name: string;
    stock_code: string;
    corp_cls: string;
    report_nm: string;
    rcept_no: string;
    flr_nm: string;
    rcept_dt: string;
    rm: string;
  }>;
}

/**
 * DartApiService — Client for the DART (Data Analysis, Retrieval and Transfer) API.
 *
 * DART is Korea's corporate disclosure system operated by the Financial Supervisory Service.
 * Provides access to corporate filings, financial statements, and disclosure documents.
 *
 * API key is required. Obtain from: https://opendart.fss.or.kr/
 */
@Injectable()
export class DartApiService {
  private readonly logger = new Logger(DartApiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://opendart.fss.or.kr/api';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('DART_API_KEY', '');
  }

  /**
   * Search corporate disclosures.
   *
   * @param corpCode - DART corporation unique code (8-digit)
   * @param startDate - Start date for search range (YYYYMMDD)
   * @param endDate - End date (default: today)
   * @param pageNo - Page number (default: 1)
   * @param pageCount - Items per page (default: 10, max 100)
   */
  async searchDisclosures(
    corpCode: string,
    startDate: string,
    endDate?: string,
    pageNo = 1,
    pageCount = 10,
  ): Promise<DartDisclosureItem[]> {
    if (!this.apiKey) {
      this.logger.warn('DART API key not configured');
      return [];
    }

    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const params = new URLSearchParams({
        crtfc_key: this.apiKey,
        corp_code: corpCode,
        bgn_de: startDate,
        end_de: endDate ?? today,
        page_no: String(pageNo),
        page_count: String(Math.min(pageCount, 100)),
      });

      const response = await fetch(
        `${this.baseUrl}/list.json?${params.toString()}`,
        { signal: AbortSignal.timeout(15000) },
      );

      if (!response.ok) {
        this.logger.error(`DART API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as DartListResponse;

      if (data.status !== '000') {
        // '013' = no data found, which is not an error
        if (data.status !== '013') {
          this.logger.warn(`DART API status ${data.status}: ${data.message}`);
        }
        return [];
      }

      return data.list.map((item) => ({
        corpCode: item.corp_code,
        corpName: item.corp_name,
        stockCode: item.stock_code,
        reportName: item.report_nm,
        receiptNumber: item.rcept_no,
        filingDate: item.rcept_dt,
        reportUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
      }));
    } catch (error) {
      this.logger.error(
        `DART API search failed for corp ${corpCode}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      return [];
    }
  }
}
