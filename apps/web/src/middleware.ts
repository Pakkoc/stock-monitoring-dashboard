/**
 * Next.js middleware — route protection and auth redirects.
 *
 * - Unauthenticated users are redirected to /login
 * - Authenticated users on /login or /signup are redirected to /dashboard
 * - Static assets and API routes are passed through
 * - Admin role validation is handled in (admin)/layout.tsx server component
 */
import { NextRequest, NextResponse } from 'next/server';

/** Paths accessible without authentication */
const PUBLIC_PATHS = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Check for session token (Better Auth cookie or fallback)
  const sessionToken =
    request.cookies.get('better-auth.session_token')?.value ??
    request.cookies.get('auth-token')?.value;

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Unauthenticated users on protected pages -> redirect to /login
  if (!isPublicPath && !sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users on auth pages -> redirect to /dashboard
  if (isPublicPath && sessionToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
