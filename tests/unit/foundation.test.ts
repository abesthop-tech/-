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
    await db.delete(dailyMenus).where(eq(dailyMenus.date, '2099-01-01')).catch(() => {});
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
      const sampleDate = '2099-01-01';
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
      expect(res.headers.get('content-type') || '').not.toContain('application/json');
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
