# Adversarial Challenge Report: Passcode Middleware, Cookie Security & Auth API (M1)

**Agent**: `teamwork_preview_challenger_m1_2`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_challenger_m1_2`  
**Project Root**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`  
**Date**: 2026-10-26T04:02:00Z  
**Parent Conversation ID**: `35a3dc7b-a199-49dc-b838-a1010ac73ac1`  
**Milestone**: M1 - Core Foundation & Database  
**Focus**: Passcode Middleware, Cookie Security, and Auth API Routes  
**Verdict**: **REQUEST_CHANGES** (7 empirical test failures uncovering 6 distinct security and crash vulnerabilities)

---

## 1. Observation

### 1.1 Empirical Test Execution Output
An adversarial test suite with 50 stress scenarios was developed and executed via Vitest at `tests/unit/adversarial-auth.test.ts`.

- Command: `npx vitest run tests/unit/adversarial-auth.test.ts`
- Exit Code: `1`
- Verbatim Result:
```
 RUN  v2.1.9 C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate

 ❯ tests/unit/adversarial-auth.test.ts (50 tests | 7 failed) 47ms
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

 Test Files  1 failed (1)
      Tests  7 failed | 43 passed (50)
```

### 1.2 Direct Code Observations

#### Observation 1: Static File Regex Matches API Routes (`src/middleware.ts:39-45`)
```typescript
39:   // 2. Skip public static files, Next.js assets, and manifest
40:   if (
41:     pathname.startsWith('/_next') ||
42:     pathname.startsWith('/favicon.ico') ||
43:     pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|css|js|txt)$/)
44:   ) {
45:     return NextResponse.next();
46:   }
```
The static file match executes **before** API authentication. Any unauthenticated request to an API endpoint ending in a matching extension (e.g. `/api/menu.js`, `/api/recipes/secret.png`, `/api/ics-import.txt`) returns `NextResponse.next()` (HTTP 200) instead of HTTP 401 Unauthorized.

#### Observation 2: Missing Trailing Slash on `/api` Bypass (`src/middleware.ts:98-106`)
```typescript
98:   if (pathname.startsWith('/api/')) {
99:     return NextResponse.json(
100:       {
101:         error: 'Unauthorized',
102:         message: '家族の合言葉が必要です。設定画面から合言葉を入力してください。',
103:       },
104:       { status: 401 }
105:     );
106:   }
```
If an unauthenticated request is sent to `http://localhost:3000/api` (without trailing slash), `pathname` is `"/api"`. `"/api".startsWith('/api/')` evaluates to `false`. The request falls through to line 109 `return NextResponse.next();`, returning HTTP 200.

#### Observation 3: Case Sensitivity Bypass on `/API/menu` (`src/middleware.ts:98`)
`pathname.startsWith('/api/')` performs a case-sensitive check. A request to `/API/menu` or `/Api/menu` evaluates to `false`, bypassing the 401 check and returning HTTP 200. On case-insensitive file systems or standard proxy routing, this bypasses protection.

#### Observation 4: Overly Permissive Auth Prefix Match (`src/middleware.ts:48-50`)
```typescript
48:   // 3. Skip auth verification route (so login modal can POST credentials)
49:   if (pathname.startsWith('/api/auth')) {
50:     return NextResponse.next();
51:   }
```
`pathname.startsWith('/api/auth')` matches ANY route prefixed with `/api/auth` (e.g. `/api/authors`, `/api/authenticate`, `/api/auth-tokens`). It is not strictly limited to `/api/auth/verify`.

#### Observation 5: Type Coercion Crash / DoS in `verifyPasscode` (`src/middleware.ts:12-23`)
```typescript
12: export function verifyPasscode(
13:   provided: string | undefined | null,
14:   expected: string | undefined | null
15: ): boolean {
16:   if (!expected || expected.trim() === '') {
17:     return true; // Passcode protection disabled
18:   }
19:   if (!provided) {
20:     return false;
21:   }
22:   return provided.trim() === expected.trim();
23: }
```
When `body.passcode` in `POST /api/auth/verify` is a non-string (e.g. number `123456`, boolean `true`, object `{}`, or array `[]`), `!provided` is `false`. Calling `provided.trim()` throws `TypeError: provided.trim is not a function`. The route handler catches this and returns HTTP 500 (`{ error: 'provided.trim is not a function' }`) instead of rejecting with HTTP 401 Unauthorized or HTTP 400 Bad Request.

#### Observation 6: Crash on Literal `"null"` JSON Body (`src/app/api/auth/verify/route.ts:6-7`)
```typescript
6:     const body = await request.json().catch(() => ({}));
7:     const provided = body.passcode;
```
When the HTTP request body contains raw JSON `"null"`, `JSON.parse("null")` evaluates to `null`. Line 7 then evaluates `null.passcode`, throwing `TypeError: Cannot read properties of null (reading 'passcode')`. The route handler catches this and returns HTTP 500 instead of HTTP 401.

---

## 2. Logic Chain

1. **Static File Bypass (CRITICAL)**:
   - Observation 1 demonstrates that `pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|css|js|txt)$/)` executes unconditionally before any API check.
   - When a caller requests an API route with a `.js` suffix (`/api/menu.js`) or dynamic route parameter ending in `.png` (`/api/recipes/secret.png`), the regex returns a truthy match.
   - The middleware returns `NextResponse.next()` (HTTP 200).
   - Therefore, API endpoints are vulnerable to trivial unauthenticated bypass simply by appending static asset extensions.

2. **Root API Route Bypass (HIGH)**:
   - Observation 2 demonstrates that line 98 requires `pathname.startsWith('/api/')`.
   - The path `"/api"` does not contain a trailing slash.
   - Therefore, unauthenticated requests to `/api` fall through to line 109 (`NextResponse.next()`), failing the requirement that unauthenticated API requests strictly return 401.

3. **Case Sensitivity Bypass (HIGH)**:
   - Observation 3 shows `pathname` is evaluated without case normalization.
   - `"/API/menu".startsWith('/api/')` is false.
   - Therefore, requests with uppercase `/API/` bypass the 401 guard.

4. **Prefix Hijack on Auth Routes (MEDIUM)**:
   - Observation 4 shows `/api/auth` prefix matching without boundary delimiter.
   - Any future or third-party route such as `/api/authors` or `/api/authenticate` is automatically made public and unprotected by this middleware check.

5. **Server 500 Crashes on Non-String Inputs (MEDIUM)**:
   - Observations 5 & 6 show `verifyPasscode` assumes `provided` is always a string, and `POST` assumes parsed JSON is an object.
   - Sending `{ "passcode": 1234 }` or literal `"null"` triggers uncaught TypeErrors within `route.ts`.
   - The server responds with HTTP 500 Internal Server Error, violating robust API error handling principles.

---

## 3. Caveats

1. **Brute-Force Rate Limiting**:
   - `src/middleware.ts` does not implement IP-based or sliding-window rate limiting on failed passcode attempts. This is acceptable for Milestone 1's "simple family passcode lock" scope, but should be noted for future hardening.
2. **Plaintext Passcode in Cookie**:
   - The HttpOnly cookie `kondate_passcode` stores the plaintext passcode string. Because `httpOnly: true` and `sameSite: lax` are set, this complies with M1's `PROJECT.md` specification ("Next.js middleware comparing APP_PASSCODE with HttpOnly cookie"), but hashing with SHA-256 would offer defense-in-depth.

---

## 4. Conclusion & Verdict

**Verdict**: **REQUEST_CHANGES**

Milestone 1's middleware and auth verification endpoint successfully passed 43 adversarial tests (handling malformed cookies, query parameters, valid header variations, and unset environment states), but failed 7 critical tests representing 6 vulnerabilities.

### Required Remediations

#### Remediation 1: Harden `verifyPasscode` in `src/middleware.ts`
Change `provided: unknown` and guard with `typeof provided !== 'string'`:
```typescript
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
```

#### Remediation 2: Harden Path Matching in `src/middleware.ts`
1. Normalize path: `const normalizedPathname = pathname.toLowerCase();`
2. Define API route boundary: `const isApiRoute = normalizedPathname === '/api' || normalizedPathname.startsWith('/api/');`
3. Restrict auth bypass strictly to `/api/auth/verify`:
   `if (normalizedPathname === '/api/auth/verify' || normalizedPathname.startsWith('/api/auth/verify/')) return NextResponse.next();`
4. Guard static file bypass with `!isApiRoute`:
   ```typescript
   if (
     !isApiRoute &&
     (normalizedPathname.startsWith('/_next') ||
       normalizedPathname.startsWith('/favicon.ico') ||
       normalizedPathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|css|js|txt)$/))
   ) {
     return NextResponse.next();
   }
   ```
5. Enforce 401 on `isApiRoute`:
   ```typescript
   if (isApiRoute) {
     return NextResponse.json(
       {
         error: 'Unauthorized',
         message: '家族の合言葉が必要です。設定画面から合言葉を入力してください。',
       },
       { status: 401 }
     );
   }
   ```

#### Remediation 3: Harden `POST /api/auth/verify` Body Parsing in `src/app/api/auth/verify/route.ts`
Ensure `body` is guaranteed to be a non-null object:
```typescript
const raw = await request.json().catch(() => ({}));
const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
const provided = body.passcode;
```

---

## 5. Verification Method

1. **Execute Adversarial Test Suite**:
   ```powershell
   npx vitest run tests/unit/adversarial-auth.test.ts
   ```
   - Current State: 7 failed, 43 passed.
   - Target State after Worker Fix: 50 passed (100%), 0 failed.

2. **Execute Full Test Suite**:
   ```powershell
   npm test
   ```
   - All unit test files must pass with exit code `0`.

3. **Verify Production Build**:
   ```powershell
   npm run build
   ```
   - Must build with zero TypeScript or Next.js compilation errors.
