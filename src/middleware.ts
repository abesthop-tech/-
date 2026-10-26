import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const PASSCODE_COOKIE_NAME = 'kondate_passcode';
export const PASSCODE_HEADER_NAME = 'x-app-passcode';
export const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60; // 31,536,000 seconds

/**
 * Pure passcode comparison helper.
 * If expected passcode is not configured in environment, returns true (open access).
 * Strictly validates that provided passcode is a string to prevent TypeErrors on arbitrary inputs.
 */
export function verifyPasscode(
  provided: unknown,
  expected: string | undefined | null
): boolean {
  if (!expected || expected.trim() === '') {
    return true; // Passcode protection disabled
  }
  if (typeof provided !== 'string') {
    return false;
  }
  return provided.trim() === expected.trim();
}

/**
 * Next.js Edge / Node Middleware for Family Passcode Protection.
 */
export function middleware(request: NextRequest) {
  const expectedPasscode = process.env.APP_PASSCODE;

  // 1. If no passcode is configured in environment, permit all traffic
  if (!expectedPasscode || expectedPasscode.trim() === '') {
    return NextResponse.next();
  }

  const { pathname, searchParams } = request.nextUrl;
  const normalizedPathname = pathname.toLowerCase();
  const isApiRoute =
    normalizedPathname === '/api' || normalizedPathname.startsWith('/api/');

  // 2. Skip public static files, Next.js assets, and manifest (never applies to API routes)
  if (
    !isApiRoute &&
    (normalizedPathname.startsWith('/_next') ||
      normalizedPathname.startsWith('/favicon.ico') ||
      normalizedPathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|css|js|txt)$/))
  ) {
    return NextResponse.next();
  }

  // 3. Skip auth verification route (so login modal can POST credentials and check auth status)
  if (
    normalizedPathname === '/api/auth/verify' ||
    normalizedPathname.startsWith('/api/auth/verify/')
  ) {
    return NextResponse.next();
  }

  // 4. Check query param: ?passcode=... (convenience 1-tap onboarding from family LINE link)
  const queryPasscode = searchParams.get('passcode');
  if (queryPasscode && verifyPasscode(queryPasscode, expectedPasscode)) {
    const cleanUrl = new URL(request.url);
    cleanUrl.searchParams.delete('passcode');
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set({
      name: PASSCODE_COOKIE_NAME,
      value: expectedPasscode,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ONE_YEAR_SECONDS,
      path: '/',
    });
    return response;
  }

  // 5. Check HttpOnly cookie
  const cookieValue = request.cookies.get(PASSCODE_COOKIE_NAME)?.value;
  if (verifyPasscode(cookieValue, expectedPasscode)) {
    return NextResponse.next();
  }

  // 6. Check custom header (for automated testing, cURL, or mobile clients)
  const headerValue =
    request.headers.get(PASSCODE_HEADER_NAME) ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (verifyPasscode(headerValue, expectedPasscode)) {
    const response = NextResponse.next();
    // Issue 1-year HttpOnly cookie so future browser requests don't require the header
    response.cookies.set({
      name: PASSCODE_COOKIE_NAME,
      value: expectedPasscode,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ONE_YEAR_SECONDS,
      path: '/',
    });
    return response;
  }

  // 7. Request is unauthenticated
  // For API endpoints: return JSON 401 Unauthorized
  if (isApiRoute) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: '家族の合言葉が必要です。設定画面から合言葉を入力してください。',
      },
      { status: 401 }
    );
  }

  // For page requests: allow the main UI shell to render so client-side Tier 3 modal can prompt for passcode
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
