/**
 * AI Agent domain types — shared between frontend and backend
 */

/** Analysis type */
export type AnalysisType = 'SURGE' | 'DAILY_SUMMARY' | 'THEME_REPORT';

/** Quality gate pass/fail per level */
export interface QualityGateResult {
  l1Pass: boolean; // Syntax validation (Zod schema)
  l2Pass: boolean; // Semantic cross-reference
  l3Pass: boolean; // Factual KIS API check
  l1Details: string | null;
  l2Details: string | null;
  l3Details: string | null;
}

/** Surge cause category */
export type SurgeCategory =
  | 'EARNINGS'
  | 'INDUSTRY_NEWS'
  | 'MARKET_SENTIMENT'
  | 'REGULATORY'
  | 'TECHNICAL'
  | 'UNKNOWN';

/** AI analysis result */
export interface AiAnalysis {
  id: string;
  stockSymbol: string;
  analysisType: AnalysisType;
  result: SurgeAnalysisResult;
  confidenceScore: number;
  qualityGate: QualityGateResult;
  sourcesJson: AnalysisSource[];
  retryCount: number;
  processingTimeMs: number;
  modelUsed: string;
  createdAt: Date;
}

/** Structured surge analysis result from LLM */
export interface SurgeAnalysisResult {
  summary: string;
  category: SurgeCategory;
  keyFactors: string[];
  relatedNews: Array<{
    title: string;
    url: string;
    relevance: string;
  }>;
  priceContext: {
    currentPrice: number;
    changeRate: number;
    volumeRatio: number; // vs 20-day average
  };
  outlook: string;
  riskFactors: string[];
  verificationStatus: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';
}

/** Source used during analysis */
export interface AnalysisSource {
  type: 'KIS_API' | 'NAVER_NEWS' | 'RSS' | 'DART' | 'CACHED';
  url: string | null;
  title: string | null;
  fetchedAt: Date;
}

/** Rule-based surge cause analysis result (no AI, cost 0) */
export interface SurgeCauseResult {
  symbol: string;
  changeRate: number;
  cause: string;
  category: 'news' | 'theme' | 'technical' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  newsTitle: string | null;
  newsUrl: string | null;
  themeName: string | null;
  analyzedAt: string;
}
