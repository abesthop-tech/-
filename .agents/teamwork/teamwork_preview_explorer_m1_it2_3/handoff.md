# Handoff Report: Unified Test Execution Strategy & Regression Shield

## 1. Observation

### Current Test Suite & Build Status
Direct execution of test and build commands yielded the following verbatim results:

1. **Consolidated Test Run (`npm test` / `vitest run`)**:
   - Total files: 5
   - Total tests: 103
   - Passed: 96 tests
   - Failed: 7 tests (all within `tests/unit/adversarial-auth.test.ts`)
   - Duration: 4.55s

2. **Individual Suite Breakdown**:
   - `tests/unit/foundation.test.ts`: **17/17 passed** (100% green)
     - DB connection, DDL, Drizzle CRUD, JSON serialization, verifyPasscode helper, Next.js passcode middleware route protection.
   - `tests/unit/db.test.ts`: **6/6 passed** (100% green)
     - Dishes initialization (13+ dishes), 17 pantry staples, family profile, today 3-slot menu, 14-day history ending today, ensureDatabaseInitialized idempotency.
   - `tests/unit/adversarial_db_stress.test.ts`: **17/17 passed** (100% green)
     - PRAGMA journal_mode=wal, PRAGMA busy_timeout=5000, 100 concurrent async SELECTs, 50 concurrent INSERTs, multi-process concurrency worker (`tests/helpers/concurrency-worker.mjs`).
   - `tests/unit/adversarial_m1.test.ts`: **13/13 passed** (100% green)
     - 20 concurrent ensureDatabaseInitialized calls, 50 rapid concurrent reads, SQL injection/XSS payload rejection, case-insensitive Bearer prefix, empty query param handling.
   - `tests/unit/adversarial-auth.test.ts`: **43/50 passed**, **7 failed** (86% green)
     - Suite 1 (Malformed & Tampered Cookies): 15/15 passed
     - Suite 2 (Query String Bypass Attempts): 6/6 passed
     - Suite 3 (Header Tampering & Authorization): 7/7 passed
     - Suite 4 (Static File Regex Bypass & Route Traversal Probing): 2 passed, 5 failed
     - Suite 5 (Unset & Blank APP_PASSCODE Behavior): 4/4 passed
     - Suite 6 (Auth API `/api/auth/verify` Stress): 9 passed, 2 failed

3. **Verbatim Failures in `tests/unit/adversarial-auth.test.ts`**:
   - **Failure 1 (Line 204)**:
     ```
     FAIL tests/unit/adversarial-auth.test.ts > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does unauthenticated /api (without trailing slash) return 401?
     AssertionError: expected 200 to be 401 // Object.is equality
     - Expected: 401
     + Received: 200
     ```
   - **Failure 2 (Line 211)**:
     ```
     FAIL tests/unit/adversarial-auth.test.ts > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does uppercase /API/menu return 401 or bypass?
     AssertionError: expected 200 to be 401 // Object.is equality
     - Expected: 401
     + Received: 200
     ```
   - **Failure 3 (Line 218)**:
     ```
     FAIL tests/unit/adversarial-auth.test.ts > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does appending .js to API endpoint bypass authentication?
     AssertionError: expected 200 to be 401 // Object.is equality
     - Expected: 401
     + Received: 200
     ```
   - **Failure 4 (Line 225)**:
     ```
     FAIL tests/unit/adversarial-auth.test.ts > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does appending .txt or .png to an API route bypass authentication?
     AssertionError: expected 200 to be 401 // Object.is equality
     - Expected: 401
     + Received: 200
     ```
   - **Failure 5 (Line 233)**:
     ```
     FAIL tests/unit/adversarial-auth.test.ts > 4. Static File Regex Bypass & Route Traversal Probing > PROBE: Does a hypothetical unauthenticated endpoint starting with /api/auth (e.g. /api/authors) bypass authentication?
     AssertionError: expected 200 to be 401 // Object.is equality
     - Expected: 401
     + Received: 200
     ```
   - **Failure 6 (Line 391)**:
     ```
     FAIL tests/unit/adversarial-auth.test.ts > 6. /api/auth/verify Route Handler Adversarial Stress Tests > STRESS: POST with non-string passcode types (number, boolean, null, object, array)
     AssertionError: expected 500 to be 401 // Object.is equality
     - Expected: 401
     + Received: 500
     ```
   - **Failure 7 (Line 404)**:
     ```
     FAIL tests/unit/adversarial-auth.test.ts > 6. /api/auth/verify Route Handler Adversarial Stress Tests > STRESS: POST with raw "null" JSON body
     AssertionError: expected 500 to be 401 // Object.is equality
     - Expected: 401
     + Received: 500
     ```

4. **Production Build (`npm run build`)**:
   - Exit code: 0
   - Compiled successfully
   - Linting and type checking passed
   - Static pages generated: 5/5
   - Route map: `/` (Static 138 B), `/_not-found` (Static 873 B), `/api/auth/verify` (Dynamic 0 B), `Middleware` (27 kB).

---

## 2. Logic Chain

### Root Cause Analysis of the 7 Failures
1. **Middleware Static File & Route Path Normalization (`src/middleware.ts`)**:
   - *Observation*: In `src/middleware.ts` lines 39-45:
     ```typescript
     if (
       pathname.startsWith('/_next') ||
       pathname.startsWith('/favicon.ico') ||
       pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|css|js|txt)$/)
     ) {
       return NextResponse.next();
     }
     ```
     This check precedes the API route check and does not exclude paths that start with `/api`. Consequently, `/api/menu.js` and `/api/recipes/secret.png` match the static file extension regex and return status 200 instead of 401.
   - *Observation*: In `src/middleware.ts` line 48:
     ```typescript
     if (pathname.startsWith('/api/auth')) {
       return NextResponse.next();
     }
     ```
     The prefix `/api/auth` matches `/api/authors`, causing unauthenticated requests to bypass protection and return 200 instead of 401. The bypass must strictly match `/api/auth/verify` (or `/api/auth/verify/`).
   - *Observation*: In `src/middleware.ts` line 98:
     ```typescript
     if (pathname.startsWith('/api/')) {
       return NextResponse.json({ ... }, { status: 401 });
     }
     return NextResponse.next();
     ```
     Case-sensitive `pathname.startsWith('/api/')` fails to match:
     - Exact `/api` without trailing slash (returns 200).
     - Uppercase `/API/menu` (returns 200).
   - *Remedy Logic*: Define `const normalizedPath = pathname.toLowerCase();` and `const isApi = normalizedPath === '/api' || normalizedPath.startsWith('/api/');`. Guard static file bypass with `!isApi`, restrict auth verification bypass strictly to `normalizedPath === '/api/auth/verify' || normalizedPath.startsWith('/api/auth/verify/')`, and reject any unauthenticated `isApi` request with 401.

2. **Verify Route Handler Payload Parsing & Passcode Validation (`src/app/api/auth/verify/route.ts` & `src/middleware.ts`)**:
   - *Observation*: In `src/app/api/auth/verify/route.ts` line 6:
     ```typescript
     const body = await request.json().catch(() => ({}));
     const provided = body.passcode;
     ```
     When the request body is `"null"`, `request.json()` yields JavaScript primitive `null`. Accessing `body.passcode` throws `TypeError: Cannot read properties of null (reading 'passcode')`, terminating in the `catch` block with status 500.
   - *Observation*: When `body.passcode` is a non-string type (`123456`, `true`, `false`, `['array']`, `{}`), `verifyPasscode(provided, expected)` in `src/middleware.ts` executes `provided.trim()`, throwing `TypeError: provided.trim is not a function`, terminating in status 500.
   - *Remedy Logic*:
     1. In `src/middleware.ts`: Add `if (!provided || typeof provided !== 'string') return false;` to `verifyPasscode`.
     2. In `src/app/api/auth/verify/route.ts`: Normalize `body` via `const body = (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) ? rawBody : {};` and validate `const provided = typeof body.passcode === 'string' ? body.passcode : undefined;`. If unverified, return status 401 cleanly.

---

## 3. Caveats

1. **Database Mutability & Isolation**:
   - Three test suites (`foundation.test.ts`, `db.test.ts`, `adversarial_db_stress.test.ts`) share the single file database `local.db`.
   - `vitest.config.ts` enforces `fileParallelism: false` and `maxConcurrency: 1`. This MUST NOT be changed to concurrent execution, otherwise SQLite write locks and database state cross-contamination will cause intermittent test failures.
2. **Environment Variable Cleanliness**:
   - `process.env.APP_PASSCODE` is dynamically modified in `beforeEach`/`beforeAll` across test files. Each test suite must strictly restore the original environment variable in `afterEach`/`afterAll` to avoid polluting subsequent suites.
3. **M1 Boundary**:
   - No E2E or browser UI tests are present in `tests/e2e/` at M1; these are scheduled for M4/M5 according to `PROJECT.md`.

---

## 4. Conclusion

The M1 foundation is highly solid: 96 out of 103 tests pass, baseline unit tests (`foundation.test.ts`, `db.test.ts`) are 100% green, and `next build` builds with 0 errors.

The 7 failing adversarial tests in `adversarial-auth.test.ts` stem entirely from edge-case routing/typing gaps in `src/middleware.ts` and `src/app/api/auth/verify/route.ts`. The required remediation is strictly localized and zero-risk to baseline functionality.

### Proposed Code Changes for the Worker

#### 1. Target: `src/middleware.ts`
```typescript
// Replace lines 12-23 (verifyPasscode):
export function verifyPasscode(
  provided: string | undefined | null,
  expected: string | undefined | null
): boolean {
  if (!expected || expected.trim() === '') {
    return true; // Passcode protection disabled
  }
  if (!provided || typeof provided !== 'string') {
    return false;
  }
  return provided.trim() === expected.trim();
}

// In middleware(request: NextRequest), replace lines 36-50:
  const { pathname, searchParams } = request.nextUrl;
  const normalizedPath = pathname.toLowerCase();
  const isApi = normalizedPath === '/api' || normalizedPath.startsWith('/api/');

  // 2. Skip public static files, Next.js assets, and manifest (ONLY for non-API routes)
  if (!isApi) {
    if (
      normalizedPath.startsWith('/_next') ||
      normalizedPath.startsWith('/favicon.ico') ||
      normalizedPath.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|css|js|txt)$/)
    ) {
      return NextResponse.next();
    }
  }

  // 3. Skip auth verification route (strictly /api/auth/verify)
  if (normalizedPath === '/api/auth/verify' || normalizedPath.startsWith('/api/auth/verify/')) {
    return NextResponse.next();
  }

// In middleware(request: NextRequest), replace lines 98-106:
  // 7. Request is unauthenticated
  // For API endpoints: return JSON 401 Unauthorized
  if (isApi) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: '家族の合言葉が必要です。設定画面から合言葉を入力してください。',
      },
      { status: 401 }
    );
  }
```

#### 2. Target: `src/app/api/auth/verify/route.ts`
```typescript
// In POST(request: NextRequest), replace lines 5-23:
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody : {};
    const provided = typeof body.passcode === 'string' ? body.passcode : undefined;
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
```

---

## 5. Verification Method

To verify the test suite consolidation and regression shield independently, execute the following step-by-step command pipeline in `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`:

### Step-by-Step Command Sequence

1. **Step 1: Baseline Foundation Smoke Test**
   ```powershell
   npx vitest run tests/unit/foundation.test.ts
   ```
   - *Pass Criteria*: 17/17 tests pass. Exit code 0.

2. **Step 2: Database Schema & Seed Verification**
   ```powershell
   npx vitest run tests/unit/db.test.ts
   ```
   - *Pass Criteria*: 6/6 tests pass. Exit code 0.

3. **Step 3: Adversarial Auth & Route Hardening Verification**
   ```powershell
   npx vitest run tests/unit/adversarial-auth.test.ts
   ```
   - *Pass Criteria*: 50/50 tests pass. Exit code 0. Zero failures.

4. **Step 4: Concurrency & SQLite Stress Verification**
   ```powershell
   npx vitest run tests/unit/adversarial_m1.test.ts tests/unit/adversarial_db_stress.test.ts
   ```
   - *Pass Criteria*: 30/30 tests pass. Exit code 0. WAL mode and multi-process worker succeed.

5. **Step 5: Full Consolidated Test Suite Execution (Regression Shield)**
   ```powershell
   npm test
   ```
   - *Pass Criteria*: All 5 test files pass (103/103 tests pass 100%). Exit code 0.

6. **Step 6: Production Build & Typecheck**
   ```powershell
   npm run build
   ```
   - *Pass Criteria*: Next.js build finishes with exit code 0. Zero TypeScript or route errors.

### Invalidation Conditions
- Any failure in `foundation.test.ts` or `db.test.ts` (baseline regression).
- Any failure among the 50 tests in `adversarial-auth.test.ts`.
- Any TypeScript error during `npm run build`.
- Mutation of `vitest.config.ts` enabling parallel execution across files that corrupts SQLite `local.db`.
