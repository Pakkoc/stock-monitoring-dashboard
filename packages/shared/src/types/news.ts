/**
 * News domain types — shared between frontend and backend
 */

/** News source type */
export type NewsSource =
  | 'NAVER'
  | 'RSS_YONHAP'
  | 'RSS_EDAILY'
  | 'RSS_MAEKYUNG'
  | 'RSS_HANKYUNG'
  | 'RSS_SEDAILY'
  | 'RSS_NEWSIS'
  | 'RSS_INFOSTOCK'
  | 'RSS_ETODAY'
  | 'RSS_MONEYTODAY'
  | 'DART';

/** News article */
export interface News {
  id: string;
  title: string;
  url: string;
  source: NewsSource;
  summary: string | null;
  content: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  collectedAt: Date;
  createdAt: Date;
}

/** News-Stock relationship with relevance score */
export interface NewsStock {
  id: string;
  newsId: string;
  stockSymbol: string;
  relevanceScore: number;
  createdAt: Date;
}

/** News article with associated stock symbols */
export interface NewsWithStocks extends News {
  stocks: Array<{
    symbol: string;
    name: string;
    relevanceScore: number;
  }>;
}

/** DART disclosure */
export interface DartDisclosure {
  id: string;
  corpCode: string;
  corpName: string;
  reportName: string;
  receiptNumber: string;
  filingDate: string;
  reportUrl: string;
}
