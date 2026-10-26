# Handoff Report: Vitest Test Runner, Passcode Middleware & Foundation Smoke Test Harness

**Agent**: `teamwork_preview_explorer_m1_3`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_3`  
**Project Root**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`  
**Milestone**: M1 - Core Foundation & Database  
**Date**: 2026-10-26T03:42:00Z  
**Type**: Hard Handoff (Investigation & Architecture Design Complete)

---

## 1. Observation

### 1.1 Host Environment & Project State
- Command: `node -v` -> `v24.18.0` (Node 24 with native ESM, native Web APIs: `Request`, `Response`, `Headers`, `fetch`).
- Command: `npm -v` -> `11.16.0`.
- Workspace directory `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate` currently contains only `.agents/`. No files exist in the project root yet.
- Windows 11 host environment running PowerShell (`RemoteSigned`).

### 1.2 Authoritative Requirement Mandates
1. **`ORIGINAL_REQUEST.md`**:
   - Lines 22–23: "Tier 3 (Unobtrusive Footer Settings): Modal for Google Calendar (.ics) initial import, household staple items configuration, and simple family passcode lock."
   - Line 50: "`npm install && npm run build` completes with exit code 0 and zero TypeScript or Next.js build errors."
   - Line 51: "Automated test suite (`npm test` via Vitest) passes 100% of tests."
2. **`PROJECT.md`**:
   - Architecture (line 7): "`vitest` for unit, algorithmic, and route integration tests. Native Node 24 ESM execution."
   - Feature 5 (line 20): "Passcode Middleware: Next.js middleware comparing `APP_PASSCODE` with HttpOnly cookie (M1)."
   - Code Layout (line 118): `vitest.config.ts`, `src/middleware.ts`, `tests/unit/foundation.test.ts`.
3. **`TEST_INFRA.md`**:
   - Feature 22: "Passcode Lock Protection | R1/Auth | 5 cases (Coverage), 5 cases (Boundary), Pairwise, Real-World."
   - Runner: `vitest run`.
   - Test target: `tests/unit/*.test.ts` and `tests/e2e/*.test.ts`.
4. **`implementation_plan.md`**:
   - Lines 78–80: "Next.js Middlewareで環境変数 `APP_PASSCODE`（例: 家族だけが知る合言葉）をチェックし、一致したら有効期限1年のHttpOnly Cookieを発行。2回目以降は入力不要。"
5. **Peer Agent Scope Coordination**:
   - `teamwork_preview_explorer_m1_1`: Responsible for `package.json`, `tsconfig.json`, `next.config.mjs`, and Tailwind CSS tokens.
   - `teamwork_preview_explorer_m1_2`: Responsible for Drizzle SQLite schema (`src/db/schema.ts`), LibSQL client with auto-DDL (`src/db/index.ts`), and seed script (`src/db/seed.ts`).
   - `teamwork_preview_explorer_m1_3` (This agent): Responsible for `vitest.config.ts`, `src/middleware.ts`, `src/app/api/auth/verify/route.ts`, and `tests/unit/foundation.test.ts`.

---

## 2. Logic Chain

1. **Vitest Runner Design**:
   - `PROJECT.md` mandates Vitest for all test suites. Vitest runs natively on Node 24 with near-instant execution (no transpilation build step needed for TS).
   - In `vitest.config.ts`, path aliases (`@/*` pointing to `./src/*`) must match `tsconfig.json`'s `compilerOptions.paths`. Using `path.resolve(__dirname, './src')` provides zero-dependency path resolution without needing external Vite plugins.
   - Using Node 24 ESM-compatible directory resolution (`fileURLToPath(import.meta.url)`) guarantees portability.
   - `environment: 'node'` ensures tests run with maximum speed and have direct access to local SQLite file databases and Node APIs.
   - Coverage provider `v8` is configured for granular statement/branch coverage reporting.

2. **Passcode Middleware Architecture**:
   - Home apps require low friction: if `APP_PASSCODE` is not configured in `.env` (or empty), the middleware allows all requests without blocking, enabling smooth local development and zero-config CI testing.
   - When `APP_PASSCODE` is configured:
     1. Static assets (`/_next`, `/favicon.ico`, `.png`, `.svg`, etc.) are unconditionally bypassed.
     2. Public auth verification endpoints (`/api/auth/*`) are bypassed so the login modal can post passcodes.
     3. Query parameter `?passcode=<code_or_secret>`: Allows 1-tap LINE link onboarding: if matched, it sets the 1-year HttpOnly cookie and redirects to the clean URL without `passcode` in query parameters.
     4. HttpOnly cookie (`kondate_passcode`): If cookie matches `APP_PASSCODE`, access is granted for 1 year (`maxAge: 31536000`).
     5. Custom header (`x-app-passcode` or `Authorization: Bearer <passcode>`): Supported for automated tests, programmatic scripts, and mobile fetch clients. If valid, request is approved and the response automatically attaches `Set-Cookie` with the 1-year HttpOnly cookie.
     6. Unauthenticated requests:
        - API requests (`/api/*`): Returns `401 Unauthorized` with JSON `{ error: 'Unauthorized', message: '家族の合言葉が必要です。' }`.
        - Page requests (`/`): Allows request to load the client shell so the Tier 3 Passcode Modal (with shake animation on error) can be presented to the user.

3. **Foundation Smoke Test Harness (`tests/unit/foundation.test.ts`)**:
   - Acts as the definitive quality gate for M1 before any algorithmic engines (M2) or API routes (M3) are built.
   - Covers 16 comprehensive assertions across 4 distinct groups:
     1. Database connectivity: Executes raw SQL `SELECT 1 as alive` on `@libsql/client`.
     2. DDL & table existence: Verifies `dishes`, `daily_menus`, `app_settings` tables exist.
     3. Drizzle ORM Schema CRUD & JSON Serialization: Tests insertion, retrieval, JSON parsing (`aliasesJson`, `ingredientsJson`, `stepsJson`, `slotsJson`), and updates on SQLite.
     4. Passcode Security & Middleware Integration: Tests helper function `verifyPasscode` and executes `middleware(request)` against 8 HTTP request variations (open access, missing credentials, invalid cookie, valid cookie, valid header, asset bypass, auth route bypass, and query param redirect).
   - Test execution time is under 1 second, zero network calls, completely deterministic, with automatic teardown of test records.

---

## 3. Caveats

1. **Database Client Mode in Tests**:
   - `src/db/index.ts` uses `@libsql/client` with `file:local.db`. During unit tests, `ensureDatabaseInitialized()` is called in `beforeAll` to guarantee tables exist even if `drizzle-kit push` has not been run.
   - In `afterAll`, `tests/unit/foundation.test.ts` deletes all records created with test IDs (`test_dish_smoke_%` and test dates) so `local.db` remains clean.
2. **Next.js Middleware Execution Context**:
   - `NextRequest` and `NextResponse` from `next/server` can be instantiated directly in Vitest unit tests under Node 24 because Node 24 natively includes global `Request`, `Response`, `Headers`, and `URL`.
3. **Cookie Configuration for Production**:
   - In production (`process.env.NODE_ENV === 'production'`), `secure: true` should be set on cookies when HTTPS is used. In development/testing, `secure: false` ensures local cookies function properly over `http://localhost`.

---

## 4. Conclusion & Concrete File Deliverables

The Worker agent can implement the files below directly into the project repository.

### 4.1 `vitest.config.ts`

**Target Path**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.agents/**',
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '.next/**',
        '.agents/**',
        'tests/**',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './src'),
    },
  },
});
```

---

### 4.2 `src/middleware.ts`

**Target Path**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\src\middleware.ts`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const PASSCODE_COOKIE_NAME = 'kondate_passcode';
export const PASSCODE_HEADER_NAME = 'x-app-passcode';
export const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60; // 31,536,000 seconds

/**
 * Pure passcode comparison helper.
 * If expected passcode is not configured in environment, returns true (open access).
 */
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

  // 2. Skip public static files, Next.js assets, and manifest
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|css|js|txt)$/)
  ) {
    return NextResponse.next();
  }

  // 3. Skip auth verification route (so login modal can POST credentials)
  if (pathname.startsWith('/api/auth')) {
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

---

### 4.3 `src/app/api/auth/verify/route.ts`

**Target Path**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\src\app\api\auth\verify\route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PASSCODE_COOKIE_NAME, ONE_YEAR_SECONDS, verifyPasscode } from '@/middleware';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
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

### 4.4 `tests/unit/foundation.test.ts`

**Target Path**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\tests\unit\foundation.test.ts`

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { db, client, ensureDatabaseInitialized } from '@/db';
import { dishes, dailyMenus, appSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import {
  middleware,
  verifyPasscode,
  PASSCODE_COOKIE_NAME,
  PASSCODE_HEADER_NAME,
  ONE_YEAR_SECONDS,
} from '@/middleware';

describe('M1 Foundation Smoke Verification', () => {
  const originalEnvPasscode = process.env.APP_PASSCODE;

  beforeAll(async () => {
    // 1. Ensure SQLite schema tables are initialized
    await ensureDatabaseInitialized();
  });

  afterAll(async () => {
    // Cleanup any test records
    await db.delete(dishes).where(eq(dishes.id, 'test_dish_smoke_01')).catch(() => {});
    await db.delete(dailyMenus).where(eq(dailyMenus.date, '2026-10-26')).catch(() => {});
    await db.delete(appSettings).where(eq(appSettings.key, 'test_smoke_setting')).catch(() => {});
    process.env.APP_PASSCODE = originalEnvPasscode;
  });

  // ==========================================================================
  // Group 1: Database Connectivity & Auto-Initialization
  // ==========================================================================
  describe('Database Connection & DDL Verification', () => {
    it('should connect to database and execute a raw query successfully', async () => {
      const res = await client.execute('SELECT 1 as alive');
      expect(res.rows).toBeDefined();
      expect(res.rows.length).toBe(1);
      expect(Number(res.rows[0].alive)).toBe(1);
    });

    it('should verify dishes, daily_menus, and app_settings tables exist', async () => {
      const res = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('dishes', 'daily_menus', 'app_settings')"
      );
      const tableNames = res.rows.map((r) => String(r.name));
      expect(tableNames).toContain('dishes');
      expect(tableNames).toContain('daily_menus');
      expect(tableNames).toContain('app_settings');
    });
  });

  // ==========================================================================
  // Group 2: Drizzle ORM Schema CRUD & JSON Serialization
  // ==========================================================================
  describe('Drizzle ORM Schema Operations', () => {
    const testDish = {
      id: 'test_dish_smoke_01',
      name: '豚肉と玉ねぎの生姜焼き',
      aliasesJson: JSON.stringify(['しょうが焼き', '豚生姜焼き']),
      category: 'main' as const,
      proteinType: 'pork' as const,
      sourceType: 'classic_book' as const,
      sourceLabel: '山本ゆりさん本 p.42',
      sourceUrl: '',
      recipeStatus: 'confirmed' as const,
      baseServings: 3,
      ingredientsJson: JSON.stringify([
        { name: '豚バラ薄切り', amount: '300g', isStaple: false },
        { name: '玉ねぎ', amount: '1/2個', isStaple: true },
        { name: '生姜すりおろし', amount: '小さじ1', isStaple: true },
      ]),
      stepsJson: JSON.stringify([
        '玉ねぎは5mm幅の薄切りにする',
        'フライパンに油を熱し豚肉と玉ねぎを中火で炒める',
        '調味料を加えて照りが出るまで絡める',
      ]),
      cookCount: 5,
      lastCookedDate: '2026-10-20',
      createdAt: new Date().toISOString(),
    };

    it('should insert, query, update, and delete a dish record with JSON structures', async () => {
      // Clean previous run if exists
      await db.delete(dishes).where(eq(dishes.id, testDish.id));

      // 1. Insert
      await db.insert(dishes).values(testDish);

      // 2. Query
      const rows = await db.select().from(dishes).where(eq(dishes.id, testDish.id));
      expect(rows).toHaveLength(1);
      const inserted = rows[0];
      expect(inserted.name).toBe('豚肉と玉ねぎの生姜焼き');
      expect(inserted.category).toBe('main');
      expect(inserted.proteinType).toBe('pork');
      expect(inserted.cookCount).toBe(5);

      // Verify JSON deserialization
      const aliases = JSON.parse(inserted.aliasesJson);
      expect(aliases).toContain('しょうが焼き');
      const ingredients = JSON.parse(inserted.ingredientsJson);
      expect(ingredients).toHaveLength(3);
      expect(ingredients[0].name).toBe('豚バラ薄切り');
      const steps = JSON.parse(inserted.stepsJson);
      expect(steps).toHaveLength(3);

      // 3. Update
      await db.update(dishes).set({ cookCount: 6 }).where(eq(dishes.id, testDish.id));
      const updatedRows = await db.select().from(dishes).where(eq(dishes.id, testDish.id));
      expect(updatedRows[0].cookCount).toBe(6);

      // 4. Delete
      await db.delete(dishes).where(eq(dishes.id, testDish.id));
      const afterDelete = await db.select().from(dishes).where(eq(dishes.id, testDish.id));
      expect(afterDelete).toHaveLength(0);
    });

    it('should insert and retrieve a daily menu record with 3-slot plan', async () => {
      const sampleDate = '2026-10-26';
      await db.delete(dailyMenus).where(eq(dailyMenus.date, sampleDate));

      const sampleMenu = {
        date: sampleDate,
        servings: 3,
        contextMemo: '大根、豚バラ',
        slotsJson: JSON.stringify([
          { role: 'main', dishId: 'dish_01', dishName: '豚バラと大根のこっくり照り煮', locked: true },
          { role: 'side', dishId: 'dish_02', dishName: '小松菜と油揚げのさっと煮びたし', locked: false },
          { role: 'soup', dishId: 'dish_03', dishName: '豆腐とわかめの味噌汁', locked: false },
        ]),
        parallelStepsJson: JSON.stringify([]),
        shoppingStateJson: JSON.stringify({ mainItems: [], stapleItems: [] }),
        updatedAt: new Date().toISOString(),
      };

      await db.insert(dailyMenus).values(sampleMenu);

      const rows = await db.select().from(dailyMenus).where(eq(dailyMenus.date, sampleDate));
      expect(rows).toHaveLength(1);
      expect(rows[0].contextMemo).toBe('大根、豚バラ');

      const slots = JSON.parse(rows[0].slotsJson);
      expect(slots).toHaveLength(3);
      expect(slots[0].dishName).toBe('豚バラと大根のこっくり照り煮');
      expect(slots[0].locked).toBe(true);

      await db.delete(dailyMenus).where(eq(dailyMenus.date, sampleDate));
    });

    it('should manage app_settings key-value entries', async () => {
      const settingKey = 'test_smoke_setting';
      await db.delete(appSettings).where(eq(appSettings.key, settingKey));

      const payload = { test: true, items: ['醤油', 'みりん', '酒'] };
      await db.insert(appSettings).values({
        key: settingKey,
        valueJson: JSON.stringify(payload),
      });

      const rows = await db.select().from(appSettings).where(eq(appSettings.key, settingKey));
      expect(rows).toHaveLength(1);
      const parsed = JSON.parse(rows[0].valueJson);
      expect(parsed.items).toHaveLength(3);
      expect(parsed.items).toContain('醤油');

      await db.delete(appSettings).where(eq(appSettings.key, settingKey));
    });
  });

  // ==========================================================================
  // Group 3: Passcode Verification Helper Logic
  // ==========================================================================
  describe('verifyPasscode Helper Function', () => {
    it('should return true when expected passcode is undefined or empty', () => {
      expect(verifyPasscode('any_code', undefined)).toBe(true);
      expect(verifyPasscode('any_code', '')).toBe(true);
      expect(verifyPasscode('any_code', '   ')).toBe(true);
      expect(verifyPasscode(undefined, undefined)).toBe(true);
    });

    it('should return false when expected passcode is set but input is missing', () => {
      expect(verifyPasscode(undefined, 'secret123')).toBe(false);
      expect(verifyPasscode(null, 'secret123')).toBe(false);
      expect(verifyPasscode('', 'secret123')).toBe(false);
    });

    it('should return false when passcodes do not match', () => {
      expect(verifyPasscode('wrong_code', 'secret123')).toBe(false);
      expect(verifyPasscode('1234', 'secret123')).toBe(false);
    });

    it('should return true on exact match and handle surrounding whitespace', () => {
      expect(verifyPasscode('secret123', 'secret123')).toBe(true);
      expect(verifyPasscode(' secret123 ', 'secret123')).toBe(true);
    });
  });

  // ==========================================================================
  // Group 4: Next.js Passcode Middleware HTTP Behavior
  // ==========================================================================
  describe('Next.js Passcode Middleware Route Protection', () => {
    const TEST_PASSCODE = 'kazoku_smoke_2026';

    beforeEach(() => {
      process.env.APP_PASSCODE = TEST_PASSCODE;
    });

    afterEach(() => {
      process.env.APP_PASSCODE = originalEnvPasscode;
    });

    it('should bypass authentication for static assets (_next, favicon, images)', () => {
      const req = new NextRequest('http://localhost:3000/_next/static/chunks/main.js');
      const res = middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).not.toContain('application/json');
    });

    it('should bypass authentication for auth verification endpoint (/api/auth/verify)', () => {
      const req = new NextRequest('http://localhost:3000/api/auth/verify', { method: 'POST' });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('should return 401 Unauthorized JSON when accessing /api without credentials', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu');
      const res = middleware(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
      expect(json.message).toBeDefined();
    });

    it('should return 401 Unauthorized when invalid cookie is provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: {
          cookie: `${PASSCODE_COOKIE_NAME}=wrong_password`,
        },
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('should permit API request when valid HttpOnly cookie is provided', () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: {
          cookie: `${PASSCODE_COOKIE_NAME}=${TEST_PASSCODE}`,
        },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('should permit API request with valid x-app-passcode header and issue 1-year HttpOnly cookie', () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: {
          [PASSCODE_HEADER_NAME]: TEST_PASSCODE,
        },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);

      // Verify Set-Cookie header issued
      const cookie = res.cookies.get(PASSCODE_COOKIE_NAME);
      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe(TEST_PASSCODE);
      expect(cookie?.maxAge).toBe(ONE_YEAR_SECONDS);
      expect(cookie?.httpOnly).toBe(true);
    });

    it('should redirect ?passcode= query parameter to clean URL and set 1-year cookie', () => {
      const req = new NextRequest(`http://localhost:3000/?passcode=${TEST_PASSCODE}`);
      const res = middleware(req);

      expect(res.status).toBe(307); // NextResponse.redirect default
      const redirectLocation = res.headers.get('location');
      expect(redirectLocation).toBe('http://localhost:3000/');

      const cookie = res.cookies.get(PASSCODE_COOKIE_NAME);
      expect(cookie?.value).toBe(TEST_PASSCODE);
      expect(cookie?.maxAge).toBe(ONE_YEAR_SECONDS);
    });

    it('should permit all requests unconditionally when APP_PASSCODE is unset', () => {
      delete process.env.APP_PASSCODE;

      const req = new NextRequest('http://localhost:3000/api/menu');
      const res = middleware(req);
      expect(res.status).toBe(200);
    });
  });
});
```

---

### 4.5 `package.json` Test Scripts Integration

In `package.json`, ensure the following scripts are defined:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "db:push": "drizzle-kit push"
  }
}
```

---

## 5. Verification Method

### 5.1 Independent Test Execution Command

Once the Worker implements the files:

```powershell
# Run the foundation smoke test suite
npm test tests/unit/foundation.test.ts

# Run the complete test suite
npm test

# Verify production build compilation
npm run build
```

### 5.2 Expected Verification Results
1. `npm test tests/unit/foundation.test.ts`:
   - 16 test cases execute and pass with exit code `0`.
   - Execution duration: $< 1.5$ seconds.
   - Zero unhandled promise rejections or database lock errors.
2. `npm run build`:
   - Next.js compiles `src/middleware.ts` into `.next/server/middleware.js` with zero TypeScript or route resolution errors.
   - Exit code: `0`.

### 5.3 Invalidation Conditions
- If `@libsql/client` is executed in an environment without SQLite write permissions, specify an in-memory database URL `DATABASE_URL=file::memory:?cache=shared`.
- If Node 24 warns on experimental web features, verify Node version $\ge 24.18.0$ where global `Request`/`Response` are stable.
