'use client';

/**
 * AiAnalysisWidget — Display AI analysis results for the selected stock.
 *
 * Features:
 * - "AI 생성" badge always visible
 * - Confidence meter (0-100)
 * - Cause summary
 * - Evidence list (collapsible)
 * - Category tag
 * - Quality gate badges (L1/L2/L3)
 */
import { useState, useMemo } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetWrapper } from './WidgetWrapper';
import { useAiAnalysis, useTriggerAnalysis } from '@/hooks/useAiAnalysis';
import { useDashboardStore } from '@/stores/dashboard';
import type { AiAnalysis, SurgeCategory } from '@stock-dashboard/shared';

interface AiAnalysisWidgetProps {
  symbol?: string;
}

function getCategoryLabel(category: SurgeCategory): string {
  const map: Record<SurgeCategory, string> = {
    EARNINGS: '실적',
    INDUSTRY_NEWS: '업종 뉴스',
    MARKET_SENTIMENT: '시장 심리',
    REGULATORY: '규제/정책',
    TECHNICAL: '기술적',
    UNKNOWN: '미분류',
  };
  return map[category] ?? category;
}

function getVerificationColor(
  status: string,
): string {
  switch (status) {
    case 'VERIFIED':
      return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    case 'PARTIALLY_VERIFIED':
      return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
    default:
      return 'text-red-600 bg-red-50 dark:bg-red-900/20';
  }
}

export function AiAnalysisWidget({ symbol: symbolProp }: AiAnalysisWidgetProps) {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const symbol = symbolProp ?? activeSymbol;

  const { data, isLoading, error } = useAiAnalysis(symbol);
  const triggerMutation = useTriggerAnalysis();

  const latestAnalysis = useMemo(() => {
    if (!data?.analyses?.length) return null;
    return data.analyses[0];
  }, [data]);

  return (
    <WidgetWrapper
      widgetId="aiAnalysis"
      title="AI 분석"
      headerActions={
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
          AI 생성
        </span>
      }
    >
      {!symbol && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          종목을 선택하면 AI 분석이 표시됩니다
        </div>
      )}

      {symbol && isLoading && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          <Loader2 size={16} className="mr-2 animate-spin" />
          분석 로딩 중...
        </div>
      )}

      {symbol && error && (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <span className="text-sm text-destructive">
            분석 데이터를 불러올 수 없습니다
          </span>
          <button
            onClick={() => triggerMutation.mutate(symbol)}
            disabled={triggerMutation.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {triggerMutation.isPending ? '분석 중...' : '새 분석 요청'}
          </button>
        </div>
      )}

      {symbol && !isLoading && !error && !latestAnalysis && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <Brain size={32} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            아직 분석 결과가 없습니다
          </p>
          <button
            onClick={() => triggerMutation.mutate(symbol)}
            disabled={triggerMutation.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {triggerMutation.isPending ? (
              <span className="flex items-center gap-1">
                <Loader2 size={14} className="animate-spin" />
                분석 중...
              </span>
            ) : (
              'AI 분석 요청'
            )}
          </button>
        </div>
      )}

      {latestAnalysis && (
        <AnalysisContent
          analysis={latestAnalysis}
          onRetrigger={() => symbol && triggerMutation.mutate(symbol)}
          isRetriggering={triggerMutation.isPending}
        />
      )}
    </WidgetWrapper>
  );
}

// --- AnalysisContent ---

interface AnalysisContentProps {
  analysis: AiAnalysis;
  onRetrigger: () => void;
  isRetriggering: boolean;
}

function AnalysisContent({
  analysis,
  onRetrigger,
  isRetriggering,
}: AnalysisContentProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const result = analysis.result;
  const confidencePercent = Math.round(analysis.confidenceScore * 100);

  return (
    <div className="space-y-3">
      {/* Category & Confidence */}
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
          {getCategoryLabel(result.category)}
        </span>
        <ConfidenceMeter value={confidencePercent} />
      </div>

      {/* Verification status */}
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
          getVerificationColor(result.verificationStatus),
        )}
      >
        {result.verificationStatus === 'VERIFIED' ? (
          <ShieldCheck size={12} />
        ) : result.verificationStatus === 'PARTIALLY_VERIFIED' ? (
          <Shield size={12} />
        ) : (
          <ShieldAlert size={12} />
        )}
        {result.verificationStatus === 'VERIFIED'
          ? '검증 완료'
          : result.verificationStatus === 'PARTIALLY_VERIFIED'
            ? '부분 검증'
            : '미검증'}
      </div>

      {/* Summary */}
      <div>
        <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
          요약
        </h4>
        <p className="text-sm leading-relaxed">{result.summary}</p>
      </div>

      {/* Key factors */}
      {result.keyFactors.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
            주요 요인
          </h4>
          <ul className="space-y-0.5 text-sm">
            {result.keyFactors.map((factor, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                {factor}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quality gates */}
      <div className="flex gap-2">
        <QualityBadge label="L1" pass={analysis.qualityGate.l1Pass} />
        <QualityBadge label="L2" pass={analysis.qualityGate.l2Pass} />
        <QualityBadge label="L3" pass={analysis.qualityGate.l3Pass} />
      </div>

      {/* Evidence / Related news (collapsible) */}
      {result.relatedNews.length > 0 && (
        <div>
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            관련 뉴스 ({result.relatedNews.length})
            {showEvidence ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>

          {showEvidence && (
            <div className="mt-1 space-y-1">
              {result.relatedNews.map((news, i) => (
                <a
                  key={i}
                  href={news.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink size={10} />
                  {news.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Outlook */}
      {result.outlook && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
            전망
          </h4>
          <p className="text-sm leading-relaxed">{result.outlook}</p>
        </div>
      )}

      {/* Risk factors */}
      {result.riskFactors.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
            리스크 요인
          </h4>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {result.riskFactors.map((risk, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-destructive" />
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Re-analyze button */}
      <div className="pt-1">
        <button
          onClick={onRetrigger}
          disabled={isRetriggering}
          className="w-full rounded-md border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {isRetriggering ? '재분석 중...' : '다시 분석'}
        </button>
      </div>

      {/* Metadata */}
      <div className="text-[10px] text-muted-foreground">
        {new Date(analysis.createdAt).toLocaleString('ko-KR')} | 모델:{' '}
        {analysis.modelUsed} | {analysis.processingTimeMs}ms
      </div>
    </div>
  );
}

// --- ConfidenceMeter ---

interface ConfidenceMeterProps {
  value: number;
}

function ConfidenceMeter({ value }: ConfidenceMeterProps) {
  const getColor = (v: number): string => {
    if (v >= 80) return 'text-green-600';
    if (v >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            value >= 80
              ? 'bg-green-500'
              : value >= 60
                ? 'bg-yellow-500'
                : 'bg-red-500',
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={cn('text-xs font-bold tabular-nums', getColor(value))}>
        {value}%
      </span>
    </div>
  );
}

// --- QualityBadge ---

interface QualityBadgeProps {
  label: string;
  pass: boolean;
}

function QualityBadge({ label, pass }: QualityBadgeProps) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-bold',
        pass
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      )}
    >
      {label} {pass ? 'PASS' : 'FAIL'}
    </span>
  );
}
