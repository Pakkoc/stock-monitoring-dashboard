'use client';

/**
 * Signup page — registration form with Zod validation.
 *
 * Features:
 * - Name, email, password, confirm password form
 * - Zod validation (email format, password complexity)
 * - Submit to POST /api/auth/signup
 * - Redirect to /login on success with success message
 * - Error display
 * - Link to login page
 */
import { useState, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { BarChart3, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

const signupSchema = z
  .object({
    name: z
      .string()
      .min(1, '이름을 입력하세요')
      .min(2, '이름은 최소 2자 이상이어야 합니다')
      .max(50, '이름은 50자 이하여야 합니다'),
    email: z
      .string()
      .min(1, '이메일을 입력하세요')
      .email('올바른 이메일 형식이 아닙니다'),
    password: z
      .string()
      .min(1, '비밀번호를 입력하세요')
      .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
      .regex(
        /^(?=.*[a-zA-Z])(?=.*\d)/,
        '비밀번호는 영문자와 숫자를 모두 포함해야 합니다',
      ),
    confirmPassword: z.string().min(1, '비밀번호 확인을 입력하세요'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '비밀번호가 일치하지 않습니다',
    path: ['confirmPassword'],
  });

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setErrors({});
      setServerError(null);

      // Validate with Zod
      const result = signupSchema.safeParse({
        name,
        email,
        password,
        confirmPassword,
      });
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
        await apiPost('/auth/signup', {
          name: result.data.name,
          email: result.data.email,
          password: result.data.password,
        });

        setIsSuccess(true);

        // Redirect to login after brief success message
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } catch (err: unknown) {
        const apiErr = err as { message?: string; statusCode?: number };
        if (apiErr.statusCode === 409) {
          setServerError('이미 등록된 이메일입니다.');
        } else {
          setServerError(
            apiErr.message ||
              '회원가입 중 오류가 발생했습니다. 다시 시도해주세요.',
          );
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, email, password, confirmPassword, router],
  );

  // Success state
  if (isSuccess) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-card p-8 shadow-lg">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <CheckCircle2 size={24} className="text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground">
              회원가입 완료
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              계정이 생성되었습니다. 로그인 페이지로 이동합니다...
            </p>
          </div>
        </div>
      </div>
    );
  }

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
            회원가입
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            새 계정을 만들어 시작하세요
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
          {/* Name */}
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="text-sm font-medium text-foreground"
            >
              이름
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              autoComplete="name"
              disabled={isSubmitting}
              className={cn(
                'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring transition-colors placeholder:text-muted-foreground focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                errors.name && 'border-destructive ring-destructive',
              )}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

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
                placeholder="영문자와 숫자 포함 8자 이상"
                autoComplete="new-password"
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

          {/* Confirm Password */}
          <div className="space-y-2">
            <label
              htmlFor="confirmPassword"
              className="text-sm font-medium text-foreground"
            >
              비밀번호 확인
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호를 다시 입력하세요"
                autoComplete="new-password"
                disabled={isSubmitting}
                className={cn(
                  'flex h-10 w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm outline-none ring-ring transition-colors placeholder:text-muted-foreground focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                  errors.confirmPassword &&
                    'border-destructive ring-destructive',
                )}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff size={16} />
                ) : (
                  <Eye size={16} />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {errors.confirmPassword}
              </p>
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
                가입 처리 중...
              </>
            ) : (
              '회원가입'
            )}
          </button>
        </form>

        {/* Login link */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{' '}
          <Link
            href="/login"
            className="font-medium text-primary hover:text-primary/80 hover:underline"
          >
            로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
