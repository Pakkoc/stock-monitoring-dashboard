'use client';

/**
 * Admin page — system administration dashboard.
 *
 * Features:
 * - System status dashboard (DB, Redis, KIS connection health)
 * - User management table
 * - Settings form (API keys, thresholds)
 * - Data collection monitoring
 */
import { useState, useCallback } from 'react';
import {
  Database,
  Server,
  Wifi,
  Users,
  Settings,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Shield,
  Clock,
  BarChart3,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User, Role } from '@stock-dashboard/shared';

// ---- Types ----

interface SystemHealth {
  database: ServiceStatus;
  redis: ServiceStatus;
  kis: ServiceStatus;
  websocket: ServiceStatus;
  uptime: number;
  memoryUsageMb: number;
  cpuUsagePercent: number;
}

interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  lastChecked: string;
  details?: string;
}

interface AdminUser extends User {
  lastLoginAt: string | null;
  isOnline: boolean;
}

interface DataCollectionStatus {
  stockPrices: CollectorStatus;
  news: CollectorStatus;
  dart: CollectorStatus;
  marketIndices: CollectorStatus;
}

interface CollectorStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  recordsCollected: number;
  errorCount: number;
  nextRunAt: string | null;
}

interface AdminSettings {
  kisAppKey: string;
  kisAppSecret: string;
  surgeThresholdDefault: number;
  newsCollectionInterval: number;
  priceCollectionInterval: number;
  aiAnalysisEnabled: boolean;
  maxConcurrentAnalyses: number;
}

type AdminTab = 'status' | 'users' | 'settings' | 'collection';

// ---- Query Keys ----

const adminQueryKeys = {
  health: ['admin', 'health'] as const,
  users: ['admin', 'users'] as const,
  settings: ['admin', 'settings'] as const,
  collection: ['admin', 'collection'] as const,
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('status');

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: '시스템 상태', icon: <Activity size={16} /> },
    { id: 'users', label: '사용자 관리', icon: <Users size={16} /> },
    { id: 'settings', label: '설정', icon: <Settings size={16} /> },
    { id: 'collection', label: '데이터 수집', icon: <Database size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                관리자 패널
              </h1>
              <p className="text-sm text-muted-foreground">
                시스템 상태, API 키 관리, 사용자 관리
              </p>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="mb-6 flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'status' && <SystemStatusTab />}
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'collection' && <DataCollectionTab />}
      </div>
    </div>
  );
}

// ==== System Status Tab ====

function SystemStatusTab() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: adminQueryKeys.health,
    queryFn: () => apiGet<SystemHealth>('/admin/health'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <AdminTabSkeleton />;
  }

  const health = data;

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
          새로고침
        </button>
      </div>

      {/* Service Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ServiceCard
          name="데이터베이스"
          icon={<Database size={20} />}
          status={health?.database}
        />
        <ServiceCard
          name="Redis"
          icon={<Server size={20} />}
          status={health?.redis}
        />
        <ServiceCard
          name="KIS API"
          icon={<BarChart3 size={20} />}
          status={health?.kis}
        />
        <ServiceCard
          name="WebSocket"
          icon={<Wifi size={20} />}
          status={health?.websocket}
        />
      </div>

      {/* System Metrics */}
      {health && (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="서버 업타임"
            value={formatUptime(health.uptime)}
            icon={<Clock size={16} />}
          />
          <MetricCard
            label="메모리 사용량"
            value={`${health.memoryUsageMb.toFixed(0)} MB`}
            icon={<Server size={16} />}
          />
          <MetricCard
            label="CPU 사용률"
            value={`${health.cpuUsagePercent.toFixed(1)}%`}
            icon={<Activity size={16} />}
          />
        </div>
      )}
    </div>
  );
}

function ServiceCard({
  name,
  icon,
  status,
}: {
  name: string;
  icon: React.ReactNode;
  status?: ServiceStatus;
}) {
  const statusConfig = {
    healthy: {
      color: 'text-green-500',
      bg: 'bg-green-100 dark:bg-green-900/30',
      label: '정상',
      Icon: CheckCircle2,
    },
    degraded: {
      color: 'text-yellow-500',
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      label: '저하',
      Icon: AlertCircle,
    },
    down: {
      color: 'text-red-500',
      bg: 'bg-red-100 dark:bg-red-900/30',
      label: '중단',
      Icon: XCircle,
    },
  };

  const config = status
    ? statusConfig[status.status]
    : statusConfig.down;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-sm font-medium">{name}</span>
        </div>
        <span
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold',
            config.bg,
            config.color,
          )}
        >
          <config.Icon size={12} />
          {config.label}
        </span>
      </div>
      {status && (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div>응답 시간: {status.latencyMs}ms</div>
          <div>
            마지막 확인:{' '}
            {new Date(status.lastChecked).toLocaleTimeString('ko-KR')}
          </div>
          {status.details && <div>{status.details}</div>}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

// ==== User Management Tab ====

function UserManagementTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: adminQueryKeys.users,
    queryFn: () => apiGet<{ users: AdminUser[] }>('/admin/users'),
    staleTime: 30_000,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      apiPut(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users });
    },
  });

  if (isLoading) {
    return <AdminTabSkeleton />;
  }

  const users = data?.users ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          사용자 목록 ({users.length}명)
        </h2>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                이름
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                이메일
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                역할
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                상태
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                급등 임계값
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                마지막 로그인
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                가입일
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                작업
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b transition-colors hover:bg-muted/30"
              >
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-xs font-semibold',
                      user.role === 'ADMIN'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {user.role === 'ADMIN' ? '관리자' : '사용자'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      user.isOnline
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        user.isOnline ? 'bg-green-500' : 'bg-gray-400',
                      )}
                    />
                    {user.isOnline ? '온라인' : '오프라인'}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {user.surgeThreshold}%
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(e) =>
                      updateRoleMutation.mutate({
                        userId: user.id,
                        role: e.target.value as Role,
                      })
                    }
                    className="rounded-md border bg-background px-2 py-1 text-xs outline-none ring-ring focus:ring-1"
                    disabled={updateRoleMutation.isPending}
                  >
                    <option value="USER">사용자</option>
                    <option value="ADMIN">관리자</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          등록된 사용자가 없습니다.
        </div>
      )}
    </div>
  );
}

// ==== Settings Tab ====

function SettingsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: adminQueryKeys.settings,
    queryFn: () => apiGet<AdminSettings>('/admin/settings'),
    staleTime: 60_000,
  });

  const [formData, setFormData] = useState<Partial<AdminSettings>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync form data when query loads
  const settings = data;
  const currentValues = { ...settings, ...formData };

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<AdminSettings>) =>
      apiPut('/admin/settings', updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.settings });
      setFormData({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const handleSave = useCallback(() => {
    if (Object.keys(formData).length > 0) {
      saveMutation.mutate(formData);
    }
  }, [formData, saveMutation]);

  const updateField = useCallback(
    <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  if (isLoading) {
    return <AdminTabSkeleton />;
  }

  const hasChanges = Object.keys(formData).length > 0;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Save success message */}
      {saveSuccess && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 size={14} className="mr-1 inline" />
          설정이 저장되었습니다.
        </div>
      )}

      {/* KIS API Keys */}
      <SettingsSection title="KIS API 설정" description="한국투자증권 Open API 인증 정보">
        <SettingsField label="App Key">
          <input
            type="password"
            value={currentValues.kisAppKey ?? ''}
            onChange={(e) => updateField('kisAppKey', e.target.value)}
            placeholder="KIS App Key"
            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
          />
        </SettingsField>
        <SettingsField label="App Secret">
          <input
            type="password"
            value={currentValues.kisAppSecret ?? ''}
            onChange={(e) => updateField('kisAppSecret', e.target.value)}
            placeholder="KIS App Secret"
            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
          />
        </SettingsField>
      </SettingsSection>

      {/* Thresholds */}
      <SettingsSection title="임계값 설정" description="알림 및 데이터 수집 기준값">
        <SettingsField label="기본 급등 임계값 (%)">
          <input
            type="number"
            min={1}
            max={30}
            step={0.5}
            value={currentValues.surgeThresholdDefault ?? 5}
            onChange={(e) =>
              updateField('surgeThresholdDefault', parseFloat(e.target.value))
            }
            className="flex h-9 w-32 rounded-md border bg-background px-3 text-sm tabular-nums outline-none ring-ring focus:ring-2"
          />
        </SettingsField>
      </SettingsSection>

      {/* Collection Intervals */}
      <SettingsSection
        title="데이터 수집 주기"
        description="각 데이터 소스의 수집 주기 (초)"
      >
        <SettingsField label="뉴스 수집 주기 (초)">
          <input
            type="number"
            min={30}
            max={3600}
            value={currentValues.newsCollectionInterval ?? 300}
            onChange={(e) =>
              updateField('newsCollectionInterval', parseInt(e.target.value))
            }
            className="flex h-9 w-32 rounded-md border bg-background px-3 text-sm tabular-nums outline-none ring-ring focus:ring-2"
          />
        </SettingsField>
        <SettingsField label="가격 수집 주기 (초)">
          <input
            type="number"
            min={1}
            max={60}
            value={currentValues.priceCollectionInterval ?? 5}
            onChange={(e) =>
              updateField('priceCollectionInterval', parseInt(e.target.value))
            }
            className="flex h-9 w-32 rounded-md border bg-background px-3 text-sm tabular-nums outline-none ring-ring focus:ring-2"
          />
        </SettingsField>
      </SettingsSection>

      {/* AI Settings */}
      <SettingsSection title="AI 분석 설정" description="AI 분석 파이프라인 설정">
        <SettingsField label="AI 분석 활성화">
          <button
            onClick={() =>
              updateField('aiAnalysisEnabled', !currentValues.aiAnalysisEnabled)
            }
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              currentValues.aiAnalysisEnabled
                ? 'bg-primary'
                : 'bg-muted-foreground/30',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                currentValues.aiAnalysisEnabled
                  ? 'translate-x-6'
                  : 'translate-x-1',
              )}
            />
          </button>
        </SettingsField>
        <SettingsField label="최대 동시 분석 수">
          <input
            type="number"
            min={1}
            max={10}
            value={currentValues.maxConcurrentAnalyses ?? 3}
            onChange={(e) =>
              updateField('maxConcurrentAnalyses', parseInt(e.target.value))
            }
            className="flex h-9 w-32 rounded-md border bg-background px-3 text-sm tabular-nums outline-none ring-ring focus:ring-2"
          />
        </SettingsField>
      </SettingsSection>

      {/* Save button */}
      <div className="flex items-center gap-3 border-t pt-6">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          설정 저장
        </button>
        {hasChanges && (
          <button
            onClick={() => setFormData({})}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            변경 취소
          </button>
        )}
      </div>

      {/* Save error */}
      {saveMutation.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          설정 저장 중 오류가 발생했습니다.
        </div>
      )}
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function SettingsField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-foreground">{label}</label>
      {children}
    </div>
  );
}

// ==== Data Collection Tab ====

function DataCollectionTab() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: adminQueryKeys.collection,
    queryFn: () => apiGet<DataCollectionStatus>('/admin/collection/status'),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const triggerMutation = useMutation({
    mutationFn: (collector: string) =>
      apiPost(`/admin/collection/${collector}/trigger`),
    onSuccess: () => {
      refetch();
    },
  });

  if (isLoading) {
    return <AdminTabSkeleton />;
  }

  const collectors: {
    key: string;
    label: string;
    icon: React.ReactNode;
    data?: CollectorStatus;
  }[] = [
    {
      key: 'stockPrices',
      label: '주가 데이터',
      icon: <BarChart3 size={16} />,
      data: data?.stockPrices,
    },
    {
      key: 'news',
      label: '뉴스 수집',
      icon: <Activity size={16} />,
      data: data?.news,
    },
    {
      key: 'dart',
      label: 'DART 공시',
      icon: <Database size={16} />,
      data: data?.dart,
    },
    {
      key: 'marketIndices',
      label: '시장 지수',
      icon: <BarChart3 size={16} />,
      data: data?.marketIndices,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
          새로고침
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {collectors.map((collector) => (
          <div key={collector.key} className="rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{collector.icon}</span>
                <h3 className="text-sm font-semibold">{collector.label}</h3>
              </div>
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  collector.data?.isRunning
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    collector.data?.isRunning
                      ? 'animate-pulse bg-green-500'
                      : 'bg-gray-400',
                  )}
                />
                {collector.data?.isRunning ? '실행 중' : '대기 중'}
              </span>
            </div>

            {collector.data && (
              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>수집된 레코드</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {collector.data.recordsCollected.toLocaleString('ko-KR')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>오류 횟수</span>
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      collector.data.errorCount > 0
                        ? 'text-destructive'
                        : 'text-foreground',
                    )}
                  >
                    {collector.data.errorCount}
                  </span>
                </div>
                {collector.data.lastSuccessAt && (
                  <div className="flex justify-between">
                    <span>마지막 성공</span>
                    <span>
                      {new Date(collector.data.lastSuccessAt).toLocaleTimeString(
                        'ko-KR',
                      )}
                    </span>
                  </div>
                )}
                {collector.data.nextRunAt && (
                  <div className="flex justify-between">
                    <span>다음 실행</span>
                    <span>
                      {new Date(collector.data.nextRunAt).toLocaleTimeString(
                        'ko-KR',
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => triggerMutation.mutate(collector.key)}
              disabled={triggerMutation.isPending || collector.data?.isRunning}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {triggerMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              수동 실행
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==== Shared Components ====

function AdminTabSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border bg-card p-6">
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ==== Utilities ====

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}
