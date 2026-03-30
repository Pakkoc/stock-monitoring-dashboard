'use client';

/**
 * Login page — email + password form with validation.
 *
 * Features:
 * - Zod validation for email format and password
 * - Submit to POST /api/auth/login
 * - Store session token via auth store
 * - Redirect to /dashboard on success
 * - Error display for invalid credentials
 * - Link to signup page
 */
import { useState, useCallback, Suspense, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { BarChart3, Eye, EyeOff, Loader2 } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import type { SessionUser } from '@stock-dashboard/shared';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, '이메일을 입력하세요')
    .email('올바른 이메일 형식이 아닙니다'),
  password: z
    .string()
    .min(1, '비밀번호를 입력하세요')
    .min(4, '비밀번호는 최소 4자 이상이어야 합니다'),
});

interface LoginResponse {
  data: SessionUser;
  token: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" /></div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setErrors({});
      setServerError(null);

      // Validate with Zod
      const result = loginSchema.safeParse({ email, password });
      if (!result.success) {
        const fieldErrors: FieldErrors = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0] as keyof FieldErrors;
          if (!fieldErrors[field]) {
            fieldErrors[field] = issue.message;
          }
        }
        setErrors(fieldErrors);
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await apiPost<LoginResponse>('/auth/login', {
          email: result.data.email,
          password: result.data.password,
        });

        login(response.data, response.token);
        router.push(callbackUrl);
      } catch (err: unknown) {
        const apiErr = err as { message?: string; statusCode?: number };
        if (apiErr.statusCode === 401) {
          setServerError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else {
          setServerError(
            apiErr.message || '로그인 중 오류가 발생했습니다. 다시 시도해주세요.',
          );
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, login, router, callbackUrl],
  );

  return (
    <div className="w-full max-w-md space-y-8">
      {/* Card */}
      <div className="rounded-xl border bg-card p-8 shadow-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 size={24} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Stock Monitoring Dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            계정에 로그인하세요
          </p>
        </div>

        {/* Server Error */}
        {serverError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {serverError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-sm font-medium text-foreground"
            >
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              disabled={isSubmitting}
              className={cn(
                'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring transition-colors placeholder:text-muted-foreground focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                errors.email && 'border-destructive ring-destructive',
              )}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-foreground"
            >
              비밀번호
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
                disabled={isSubmitting}
                className={cn(
                  'flex h-10 w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm outline-none ring-ring transition-colors placeholder:text-muted-foreground focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                  errors.password && 'border-destructive ring-destructive',
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                로그인 중...
              </>
            ) : (
              '로그인'
            )}
          </button>
        </form>

        {/* Signup link */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          계정이 없으신가요?{' '}
          <Link
            href="/signup"
            className="font-medium text-primary hover:text-primary/80 hover:underline"
          >
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}
