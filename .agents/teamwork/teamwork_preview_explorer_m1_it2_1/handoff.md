# Remediation Strategy & Implementation Blueprint: Passcode Middleware & Auth API (M1 Iteration 2)

**Agent**: `teamwork_preview_explorer_m1_it2_1`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_it2_1`  
**Project Root**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`  
**Parent Orchestrator ID**: `35a3dc7b-a199-49dc-b838-a1010ac73ac1`  
**Date**: 2026-10-26T04:06:00Z  
**Milestone**: M1 - Core Foundation & Database (Iteration 2 Retry)  
**Focus**: Complete Fix Strategy for `src/middleware.ts` and `src/app/api/auth/verify/route.ts`  

---

## 1. Observation

### 1.1 Test Suite Failure Reproduction
Executing the full test suite and adversarial auth suite yields 7 failing tests out of 50 in `tests/unit/adversarial-auth.test.ts` (`npx vitest run tests/unit/adversarial-auth.test.ts`):

```text
 ❯ tests/unit/adversarial-auth.test.ts (50 tests | 7 failed) 46ms
   × Adversarial Security Hardening: Middleware & Auth API > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does unauthenticated /api (without trailing slash) return 401? 8ms
     → expected 200 to be 401 // Object.is equality
   × Adversarial Security Hardening: Middleware & Auth API > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does uppercase /API/menu return 401 or bypass? 1ms
     → expected 200 to be 401 // Object.is equality
   × Adversarial Security Hardening: Middleware & Auth API > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does appending .js to API endpoint bypass authentication? 1ms
     → expected 200 to be 401 // Object.is equality
   × Adversarial Security Hardening: Middleware & Auth API > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does appending .txt or .png to an API route bypass authentication? 1ms
     → expected 200 to be 401 // Object.is equality
   × Adversarial Security Hardening: Middleware & Auth API > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does a hypothetical unauthenticated endpoint starting with /api/auth (e.g. /api/authors) bypass authentication? 1ms
     → expected 200 to be 401 // Object.is equality
   × Adversarial Security Hardening: Middleware & Auth API > 6. /api/auth/verify Route Handler Adversarial Stress Tests > STRESS: POST with non-string passcode types (number, boolean, null, object, array) 1ms
     → expected 500 to be 401 // Object.is equality
   × Adversarial Security Hardening: Middleware & Auth API > 6. /api/auth/verify Route Handler Adversarial Stress Tests > STRESS: POST with raw "null" JSON body 1ms
     → expected 500 to be 401 // Object.is equality
```

### 1.2 Direct Source Code Vulnerability Locations

#### Vulnerability 1: Static File Extension Regex Bypasses API Route Authentication
- **File**: `src/middleware.ts:39-45`
- **Verbatim Code**:
  ```typescript
  // 2. Skip public static files, Next.js assets, and manifest
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|css|js|txt)$/)
  ) {
    return NextResponse.next();
  }
  ```
- **Observed Behavior**: Step 2 executes unconditionally prior to checking API authentication. Any unauthenticated API call ending in a static extension (e.g. `GET /api/menu.js` or `GET /api/recipes/secret.png`) matches the regex and returns `NextResponse.next()` (HTTP 200) instead of HTTP 401 Unauthorized.

#### Vulnerability 2: Missing Trailing Slash on Root `/api` Endpoint
- **File**: `src/middleware.ts:98-106`
- **Verbatim Code**:
  ```typescript
  // 7. Request is unauthenticated
  // For API endpoints: return JSON 401 Unauthorized
  if (pathname.startsWith('/api/')) {
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
  ```
- **Observed Behavior**: When a client requests `http://localhost:3000/api` (without a trailing slash), `pathname` is `"/api"`. `"/api".startsWith('/api/')` evaluates to `false`. The unauthenticated request slips past the 401 guard and reaches line 109 `return NextResponse.next()` (HTTP 200).

#### Vulnerability 3: Case Sensitivity Bypass on `/API/...`
- **File**: `src/middleware.ts:98`
- **Verbatim Code**: `if (pathname.startsWith('/api/')) {`
- **Observed Behavior**: `pathname` is evaluated without case normalization. An unauthenticated request to `/API/menu` or `/Api/menu` evaluates `"/API/menu".startsWith('/api/')` as `false`, returning HTTP 200 instead of HTTP 401.

#### Vulnerability 4: Overly Broad Prefix Matching on `/api/auth`
- **File**: `src/middleware.ts:48-50`
- **Verbatim Code**:
  ```typescript
  // 3. Skip auth verification route (so login modal can POST credentials)
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  ```
- **Observed Behavior**: `pathname.startsWith('/api/auth')` without a path boundary matches any endpoint starting with that string prefix (such as `/api/authors`, `/api/authenticate`, or `/api/auth-tokens`), incorrectly treating them as public and bypassing authentication entirely.

#### Vulnerability 5: Type Coercion Crash / DoS in `verifyPasscode`
- **File**: `src/middleware.ts:12-23`
- **Verbatim Code**:
  ```typescript
  export function verifyPasscode(
    provided: string | undefined | null,
    expected: string | undefined | null
  ): boolean {
    if (!expected || expected.trim() === '') {
      return true; // Passcode protection disabled
    }
    if (!provided) {
      return false;
    }
    return provided.trim() === expected.trim();
  }
  ```
- **Observed Behavior**: When `body.passcode` is sent as a non-string type (number `123456`, boolean `true`, object `{}`, or array `[]`), `!provided` evaluates to `false`. Calling `provided.trim()` triggers `TypeError: provided.trim is not a function`. When called within `POST /api/auth/verify`, this unhandled exception is caught by the route handler's outer `catch (err: any)` and returned as HTTP 500 Internal Server Error (`{ error: 'provided.trim is not a function' }`) instead of rejecting with HTTP 401 Unauthorized.

#### Vulnerability 6: Crash on Literal `"null"` JSON Body in `/api/auth/verify`
- **File**: `src/app/api/auth/verify/route.ts:5-7`
- **Verbatim Code**:
  ```typescript
  export async function POST(request: NextRequest) {
    try {
      const body = await request.json().catch(() => ({}));
      const provided = body.passcode;
  ```
- **Observed Behavior**: When an HTTP request body contains raw JSON `"null"`, `JSON.parse("null")` succeeds and returns literal `null`. The `.catch(() => ({}))` handler is bypassed. Evaluating `body.passcode` then attempts `null.passcode`, throwing `TypeError: Cannot read properties of null (reading 'passcode')`. The route handler catches this and returns HTTP 500 instead of HTTP 401.

---

## 2. Logic Chain

1. **Static File Bypass (Vulnerability 1)**:
   - Observation 1.2.1 shows that `pathname.match(/\.(png|...|js|txt)$/)` runs before the API authentication block and without path scoping.
   - Any API request with an extension (`/api/menu.js`) matches the static file regex and returns `NextResponse.next()`.
   - By creating a boundary flag `isApiRoute = normalizedPathname === '/api' || normalizedPathname.startsWith('/api/')` and conditioning the static file check on `!isApiRoute`, API requests can never be hijacked by static file regexes.

2. **Root `/api` and Case Sensitivity Bypasses (Vulnerabilities 2 & 3)**:
   - Observations 1.2.2 and 1.2.3 demonstrate that `pathname.startsWith('/api/')` fails on `/api` (missing slash) and `/API/menu` (case discrepancy).
   - Normalizing `const normalizedPathname = pathname.toLowerCase()` and defining `isApiRoute = normalizedPathname === '/api' || normalizedPathname.startsWith('/api/')` addresses both flaws in a single, robust definition.
   - In Step 7, checking `if (isApiRoute)` ensures all forms (`/api`, `/api/`, `/api/menu`, `/API/menu`, `/api/../api/menu`) are strictly rejected with HTTP 401 unless authenticated.

3. **Restricting Auth Route Bypass (Vulnerability 4)**:
   - Observation 1.2.4 shows `/api/auth` matches `/api/authors`.
   - The only route that must be accessible unauthenticated for credential exchange is `/api/auth/verify`.
   - Restricting the bypass check to `normalizedPathname === '/api/auth/verify' || normalizedPathname.startsWith('/api/auth/verify/')` ensures that `/api/authors` falls through to `if (isApiRoute)` and returns HTTP 401.

4. **Type Coercion and JSON Null Safety (Vulnerabilities 5 & 6)**:
   - Observations 1.2.5 and 1.2.6 demonstrate that arbitrary JSON payloads (`123456`, `true`, `null`, `{}`) cause runtime TypeErrors that trigger HTTP 500.
   - In `src/middleware.ts`, typing `provided: unknown` and enforcing `if (typeof provided !== 'string') return false;` guarantees that `.trim()` is only called on valid string primitives.
   - In `src/app/api/auth/verify/route.ts`, defensively extracting `const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody : {};` guarantees that `body` is never `null` or a non-object.
   - Consequently, non-string passcodes or malformed bodies cleanly fail `verifyPasscode(provided, expected)` and return HTTP 401 (`{ error: '合言葉が正しくありません' }`), completely eliminating all 500 crash conditions.

---

## 3. Caveats

1. **`src/db/schema.ts` Falsy Zero Overwrite Note**:
   - Reviewer 2 noted that lines 193 and 217 in `src/db/schema.ts` use `|| 3` instead of `?? 3`. However, test `adversarial_db_stress.test.ts:396` currently explicitly asserts `expect(converted.baseServings).toBe(3);` to document that behavior. Changing `schema.ts` without coordinating test assertion updates would break `adversarial_db_stress.test.ts`. This remediation plan strictly targets `src/middleware.ts` and `src/app/api/auth/verify/route.ts` as requested by the orchestrator.
2. **Brute-Force Rate Limiting**:
   - Neither Next.js middleware nor `/api/auth/verify` implements IP-level rate limiting or exponential backoff on failed passcode attempts. This is acceptable within Milestone 1's "simple family passcode lock" design boundary, but could be enhanced in future milestones if exposed to public networks.

---

## 4. Conclusion & Complete Replacement Code

All 6 security vulnerabilities can be completely eliminated with zero regression to existing functionality by replacing `src/middleware.ts` and `src/app/api/auth/verify/route.ts` with the exact drop-in implementations below.

### 4.1 Complete Replacement Code for `src/middleware.ts`

```typescript
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
```

### 4.2 Complete Replacement Code for `src/app/api/auth/verify/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PASSCODE_COOKIE_NAME, ONE_YEAR_SECONDS, verifyPasscode } from '@/middleware';

export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      rawBody = null;
    }

    const body =
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : {};
    const provided = body.passcode;
    const expected = process.env.APP_PASSCODE;

    if (!expected || expected.trim() === '') {
      return NextResponse.json({
        success: true,
        message: '合言葉は設定されていません（オープンアクセス）',
      });
    }

    if (!verifyPasscode(provided, expected)) {
      return NextResponse.json(
        { error: '合言葉が正しくありません' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: '合言葉を確認しました',
    });

    response.cookies.set({
      name: PASSCODE_COOKIE_NAME,
      value: expected,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ONE_YEAR_SECONDS,
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '認証エラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const expected = process.env.APP_PASSCODE;
  if (!expected || expected.trim() === '') {
    return NextResponse.json({
      authenticated: true,
      passcodeRequired: false,
    });
  }

  const cookie = request.cookies.get(PASSCODE_COOKIE_NAME)?.value;
  const authenticated = verifyPasscode(cookie, expected);

  return NextResponse.json({
    authenticated,
    passcodeRequired: true,
  });
}

export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    message: 'ログアウトしました',
  });

  response.cookies.set({
    name: PASSCODE_COOKIE_NAME,
    value: '',
    httpOnly: true,
    maxAge: 0,
    path: '/',
  });

  return response;
}
```

---

## 5. Verification Method

Once the worker agent replaces `src/middleware.ts` and `src/app/api/auth/verify/route.ts` with the code above:

1. **Verify Adversarial Auth Test Suite (100% Pass Expected)**:
   ```powershell
   npx vitest run tests/unit/adversarial-auth.test.ts
   ```
   - Target result: 50 passed | 0 failed (100% pass rate).
   - Invalidation condition: Any failure on trailing slash `/api`, uppercase `/API/menu`, static bypass `.js`/`.png`, prefix bypass `/api/authors`, or non-string/null JSON bodies.

2. **Verify Full Project Test Suite**:
   ```powershell
   npm test
   ```
   - Target result: 5 test files passed, 103 passed tests, exit code 0.

3. **Verify Production Build**:
   ```powershell
   npm run build
   ```
   - Target result: Compiles cleanly with exit code 0 and zero TypeScript or Next.js build errors.
