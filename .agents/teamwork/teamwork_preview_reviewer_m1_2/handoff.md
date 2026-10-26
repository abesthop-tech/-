# Handoff Report: Milestone 1 (M1) Adversarial & Quality Review

**Reviewer**: `teamwork_preview_reviewer_m1_2`  
**Roles**: Reviewer, Adversarial Critic  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_reviewer_m1_2`  
**Project Root**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`  
**Date**: 2026-10-26T04:00:00Z  
**Parent Orchestrator ID**: `35a3dc7b-a199-49dc-b838-a1010ac73ac1`  
**Milestone**: M1 - Core Foundation & Database  
**Review Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

### 1.1 Integrity Violation Audit Results
Direct examination for integrity violations:
- **Hardcoded test expectations in source logic**: **NONE**. The database tables, queries, JSON serializers, and middleware comparison functions do not contain hardcoded fake return values.
- **Dummy or facade implementations**: **NONE**. LibSQL client and Drizzle schema interact with real SQLite database file `local.db` using real DDL, WAL pragma, and transactional statements.
- **Shortcuts bypassing the task**: **NONE**. All M1 deliverables specified in `PROJECT.md` are present.
- **Fabricated verification outputs**: **NONE**. `npm run build` and `npm test` were executed directly and their console outputs verified independently.

### 1.2 Seed Data Verification Results
Direct inspection of `src/db/seed.ts` and runtime SQLite database queries via Drizzle ORM:
- **17 Pantry Staples**: Confirmed exact match with R4 requirements:
  `玉ねぎ`, `にんにく`, `しょうが`, `長ねぎ`, `卵`, `醤油`, `みりん`, `酒`, `砂糖`, `味噌`, `酢`, `サラダ油`, `ごま油`, `オイスターソース`, `片栗粉`, `だしの素`, `鶏ガラスープの素`.
- **13 Classic Japanese Dishes**: Confirmed 13 dishes with full structured ingredients (`amount`, `isStaple`, `category`), instructions, source references, and cook counts:
  - 5 Mains: 豚バラと大根のこっくり照り煮 (pork), 豚の生姜焼き (pork), 鮭とキャベツのちゃんちゃん焼き (fish), 鶏肉と長ねぎの照り焼き (chicken), 牛丼（お祖父様特製） (beef).
  - 4 Sides: 小松菜と油揚げのさっと煮びたし (veggie), トマトとツナのポン酢和え (wishlist), きゅうりとわかめの酢の物 (ai_provisional), ほうれん草の胡麻和え (veggie).
  - 4 Soups: 豆腐とわかめの味噌汁 (egg_tofu), かきたま中華スープ (egg_tofu), 具だくさん豚汁 (pork), なめこと豆腐の赤だし味噌汁 (egg_tofu).
- **14-Day Consecutive Meal History**: Confirmed 14 consecutive calendar days ending on `2026-10-26` (Today) matching `ui_mock.html`. Today's menu contains 3 slots, parallel timeline steps, and shopping state.

### 1.3 Build and Smoke Test Execution
- **Next.js Production Build**:
  - Command: `npm run build`
  - Exit code: `0` (Zero TypeScript or Next.js build errors).
- **Baseline Smoke Tests**:
  - Command: `npx vitest run tests/unit/foundation.test.ts tests/unit/db.test.ts`
  - Exit code: `0` (23 passed, 0 failed).
- **Reviewer Adversarial Suite**:
  - Command: `npx vitest run tests/unit/adversarial_m1.test.ts`
  - Exit code: `0` (13 passed, 0 failed).

### 1.4 Adversarial Flaws Observed in Full Test Run
When executing full test command `npm test`, 10 test failures were triggered across adversarial suites:
```
FAIL tests/unit/adversarial-auth.test.ts (7 failures)
FAIL tests/unit/adversarial_db_stress.test.ts (2 failures)
FAIL tests/unit/adversarial_m1.test.ts (resolved)
```

Direct inspection of failing code revealed the following concrete vulnerabilities:

#### Finding 1: [Critical / Security] API Authentication Bypass via Static File Extension Regex
- **Location**: `src/middleware.ts:39-45`
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
- **Vulnerability**: This static file rule executes BEFORE checking whether `pathname` starts with `/api/`. Any unauthenticated request to an API endpoint with a matching file extension (e.g. `GET /api/menu.js`, `GET /api/recipes/secret.png`, `GET /api/data.txt`) returns `NextResponse.next()`, completely bypassing passcode protection on API routes.

#### Finding 2: [Major / Security] Prefix Match Over-Inclusion on `/api/auth`
- **Location**: `src/middleware.ts:48-50`
- **Verbatim Code**:
  ```typescript
  // 3. Skip auth verification route (so login modal can POST credentials)
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  ```
- **Vulnerability**: `pathname.startsWith('/api/auth')` without a trailing slash matches any route starting with `/api/auth`, such as `/api/authors`, `/api/authentication`, or `/api/authority`, leaving any future endpoint with that prefix exposed without passcode protection.

#### Finding 3: [Major / Reliability & DoS] Unhandled Type Errors Crashing `/api/auth/verify` with HTTP 500
- **Location**: `src/middleware.ts:22` and `src/app/api/auth/verify/route.ts:6-17`
- **Verbatim Code**:
  ```typescript
  // src/middleware.ts:
  export function verifyPasscode(provided: string | undefined | null, expected: string | undefined | null): boolean {
    ...
    return provided.trim() === expected.trim();
  }
  ```
  ```typescript
  // src/app/api/auth/verify/route.ts:
  const body = await request.json().catch(() => ({}));
  const provided = body.passcode;
  if (!verifyPasscode(provided, expected)) { ... }
  ```
- **Vulnerability**:
  1. If raw JSON body is `"null"`, `body` is `null`, causing `body.passcode` to throw `TypeError: Cannot read properties of null (reading 'passcode')`.
  2. If a client sends a non-string passcode (e.g., `{"passcode": 12345}` or `{"passcode": true}`), `verifyPasscode` calls `provided.trim()`, throwing `TypeError: provided.trim is not a function`.
  Both scenarios cause the endpoint to crash and return HTTP 500 instead of HTTP 400 or HTTP 401.

#### Finding 4: [Minor / Correctness] Falsy Zero Overwrite in Schema Domain Serializers
- **Location**: `src/db/schema.ts:193` & `src/db/schema.ts:217`
- **Verbatim Code**:
  ```typescript
  baseServings: dish.baseServings || 3,
  servings: menu.servings || 3,
  ```
- **Vulnerability**: Using `||` instead of nullish coalescing `??` forces numeric `0` to evaluate as falsy, unintentionally replacing `0` servings with default `3`.

---

## 2. Logic Chain

1. **Integrity Evaluation**:
   - Source code was audited for mock bypasses, dummy stubs, and falsified verification artifacts. None were found. The database schema, LibSQL connection, and seed data are authentic.
2. **Acceptance Criteria Evaluation**:
   - `npm run build` succeeds cleanly with exit code 0.
   - The authoritative 17 pantry staples, 13 Japanese classic dishes, and 14 consecutive daily menus are correctly populated and queried.
   - Concurrency tests demonstrate that SQLite busy timeout (5000ms) and WAL mode successfully handle 50 concurrent queries without locking.
3. **Security & Adversarial Evaluation**:
   - The middleware and auth routes contain security bypasses (Findings 1 and 2) and crash vulnerabilities (Finding 3) that are caught by adversarial test suites.
   - Because of these flaws, running the full project test suite (`npm test`) fails with 10 test failures.
   - A milestone cannot be approved while high-severity security bypasses and test suite failures exist in its core deliverables.
4. **Conclusion Derivation**:
   - Therefore, the appropriate verdict is **REQUEST_CHANGES**, providing the worker with the exact remediation steps to achieve an unassailable approval.

---

## 3. Caveats

1. **Review-Only Constraint**:
   - In strict compliance with the reviewer constraint ("Review-only — do NOT modify implementation code"), no changes were made to `src/middleware.ts`, `src/app/api/auth/verify/route.ts`, or `src/db/schema.ts`.
2. **Production Single-Process Scope**:
   - The singleton pattern in `src/db/index.ts` is safe for single-process Next.js Node server execution. Multi-container or serverless deployments against a local file SQLite database are out of scope (Turso cloud URL is supported via `TURSO_AUTH_TOKEN` when configured).

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES**

Milestone 1 has established an excellent foundational architecture with high-quality schema design and authentic seed data. However, approval is blocked until the following four changes are implemented and verified:

### Required Action Items for Worker:

1. **Fix Static File Bypass in Middleware (`src/middleware.ts`)**:
   Ensure file extension regex bypass is applied only to non-API paths, or ensure API requests are checked before static file rules:
   ```typescript
   // Only skip static extensions if NOT an API request
   if (!pathname.startsWith('/api') && pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|css|js|txt)$/)) {
     return NextResponse.next();
   }
   ```
2. **Tighten `/api/auth` Bypass in Middleware (`src/middleware.ts`)**:
   Change prefix check to exact route check:
   ```typescript
   if (pathname === '/api/auth/verify' || pathname.startsWith('/api/auth/')) {
     return NextResponse.next();
   }
   ```
3. **Handle Malformed Payloads & Type Safety in `verifyPasscode` and `/api/auth/verify`**:
   In `src/middleware.ts`:
   ```typescript
   export function verifyPasscode(
     provided: unknown,
     expected: string | undefined | null
   ): boolean {
     if (!expected || expected.trim() === '') return true;
     if (typeof provided !== 'string') return false;
     return provided.trim() === expected.trim();
   }
   ```
   In `src/app/api/auth/verify/route.ts`:
   ```typescript
   const rawBody = await request.json().catch(() => ({}));
   const body = rawBody && typeof rawBody === 'object' ? rawBody : {};
   const provided = body.passcode;
   ```
4. **Use Nullish Coalescing in `src/db/schema.ts`**:
   Replace `|| 3` with `?? 3` in `dishToInsert` and `dailyMenuToInsert`:
   ```typescript
   baseServings: dish.baseServings ?? 3,
   servings: menu.servings ?? 3,
   ```

---

## 5. Verification Method

To independently verify after fixes are applied:

1. **Run Full Test Suite**:
   ```powershell
   npm test
   ```
   *Expected Result*: All unit and adversarial test suites pass with 0 failures and exit code 0.

2. **Run Production Build**:
   ```powershell
   npm run build
   ```
   *Expected Result*: Compiles successfully with exit code 0.

3. **Verify API Passcode Protection**:
   ```powershell
   # Unauthenticated API request with .js suffix must return 401
   curl -I http://localhost:3000/api/menu.js
   # HTTP/1.1 401 Unauthorized
   ```
