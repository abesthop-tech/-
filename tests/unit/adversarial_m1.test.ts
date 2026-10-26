import { describe, it, expect, beforeAll } from 'vitest';
import { db, client, ensureDatabaseInitialized } from '@/db';
import { dishes, dailyMenus, appSettings, parseDish, parseDailyMenu } from '@/db/schema';
import { verifyPasscode, middleware, PASSCODE_COOKIE_NAME, PASSCODE_HEADER_NAME } from '@/middleware';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

describe('M1 Adversarial Stress & Integrity Hardening', () => {
  beforeAll(async () => {
    await ensureDatabaseInitialized();
  });

  describe('Database Concurrency & Idempotency Stress', () => {
    it('handles 20 concurrent ensureDatabaseInitialized calls simultaneously without SQLITE_BUSY', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => ensureDatabaseInitialized())
      );
      expect(results).toHaveLength(20);
      const allDishes = await db.select().from(dishes);
      expect(allDishes.length).toBe(13);
    });

    it('handles 50 rapid concurrent read queries without deadlock or pool starvation', async () => {
      const queries = Array.from({ length: 50 }, () =>
        db.select().from(dishes).limit(3)
      );
      const results = await Promise.all(queries);
      expect(results).toHaveLength(50);
      expect(results.every((r) => r.length === 3)).toBe(true);
    });
  });

  describe('Passcode Verification Adversarial Matrix', () => {
    const SECRET = 'family_kondate_2026';

    it('rejects malicious injection attempts, XSS payloads, and malformed inputs', () => {
      const maliciousPayloads = [
        "' OR '1'='1",
        "' OR 1=1 --",
        '<script>alert(1)</script>',
        '${process.env.APP_PASSCODE}',
        '__proto__',
        'constructor',
        '\0admin',
        'family_kondate_2026_suffix',
        'family_kondate_2026\0',
        'FAMILY_KONDATE_2026', // case sensitivity
        'a'.repeat(10000),
      ];

      for (const payload of maliciousPayloads) {
        expect(verifyPasscode(payload, SECRET)).toBe(false);
      }
    });

    it('accepts trimmed match when valid passcode has leading or trailing spaces', () => {
      expect(verifyPasscode('  family_kondate_2026  ', SECRET)).toBe(true);
      expect(verifyPasscode('\tfamily_kondate_2026\t', SECRET)).toBe(true);
    });

    it('handles empty and whitespace-only expected passcode safely (open access)', () => {
      expect(verifyPasscode('any', undefined)).toBe(true);
      expect(verifyPasscode('any', '')).toBe(true);
      expect(verifyPasscode('any', '   ')).toBe(true);
    });
  });

  describe('Middleware Adversarial Route & Header Handling', () => {
    const SECRET = 'passcode_secret_42';

    beforeAll(() => {
      process.env.APP_PASSCODE = SECRET;
    });

    afterAll(() => {
      delete process.env.APP_PASSCODE;
    });

    it('handles case-insensitive Bearer prefix variations in Authorization header', () => {
      const variations = [
        `Bearer ${SECRET}`,
        `bearer ${SECRET}`,
        `BEARER ${SECRET}`,
        `Bearer   ${SECRET}  `,
      ];

      for (const authHeader of variations) {
        const req = new NextRequest('http://localhost:3000/api/menu', {
          headers: { authorization: authHeader },
        });
        const res = middleware(req);
        expect(res.status).toBe(200);
      }
    });

    it('handles empty or blank query param ?passcode= without crashing or redirect looping', () => {
      const req = new NextRequest('http://localhost:3000/api/menu?passcode=');
      const res = middleware(req);
      // Empty passcode should be rejected and return 401 for /api/
      expect(res.status).toBe(401);
    });

    it('handles malformed URL query params without throwing 500', () => {
      const req = new NextRequest('http://localhost:3000/api/menu?passcode=%E0%A4%A');
      const res = middleware(req);
      expect(res.status).toBe(401);
    });
  });

  describe('Domain Entity Serialization & Deserialization Resilience', () => {
    it('gracefully handles empty and fallback JSON in parseDish', () => {
      const fallbackDish = {
        id: 'dish_fallback',
        name: '素うどん',
        aliasesJson: '',
        category: 'main',
        proteinType: null,
        sourceType: 'ai_generated',
        sourceLabel: null,
        sourceUrl: null,
        recipeStatus: 'ai_provisional',
        baseServings: 1,
        ingredientsJson: '',
        stepsJson: '',
        cookCount: 1,
        lastCookedDate: null,
        createdAt: '2026-10-26T00:00:00Z',
      };

      const parsed = parseDish(fallbackDish as any);
      expect(parsed.aliases).toEqual([]);
      expect(parsed.ingredients).toEqual([]);
      expect(parsed.steps).toEqual([]);
    });

    it('gracefully handles empty and fallback JSON in parseDailyMenu', () => {
      const fallbackMenu = {
        date: '2026-10-26',
        servings: 2,
        contextMemo: null,
        slotsJson: '',
        parallelStepsJson: null,
        shoppingStateJson: null,
        updatedAt: '2026-10-26T00:00:00Z',
      };

      const parsed = parseDailyMenu(fallbackMenu as any);
      expect(parsed.slots).toEqual([]);
      expect(parsed.parallelSteps).toBeNull();
      expect(parsed.shoppingState).toBeNull();
    });
  });

  describe('Seed Data Forensic Integrity Audit', () => {
    it('contains exactly 17 authoritative pantry staples matching R4 requirements', async () => {
      const row = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'staple_items'));
      expect(row).toHaveLength(1);
      const staples: string[] = JSON.parse(row[0].valueJson);
      expect(staples).toHaveLength(17);

      const requiredStaples = [
        '玉ねぎ',
        'にんにく',
        'しょうが',
        '長ねぎ',
        '卵',
        '醤油',
        'みりん',
        '酒',
        '砂糖',
        '味噌',
        '酢',
        'サラダ油',
        'ごま油',
        'オイスターソース',
        '片栗粉',
        'だしの素',
        '鶏ガラスープの素',
      ];
      for (const item of requiredStaples) {
        expect(staples).toContain(item);
      }
    });

    it('contains exactly 13 dishes with valid recipes, categorized into main, side, and soup', async () => {
      const allDishes = await db.select().from(dishes);
      expect(allDishes).toHaveLength(13);

      const mains = allDishes.filter((d) => d.category === 'main');
      const sides = allDishes.filter((d) => d.category === 'side');
      const soups = allDishes.filter((d) => d.category === 'soup');

      expect(mains).toHaveLength(5);
      expect(sides).toHaveLength(4);
      expect(soups).toHaveLength(4);

      // Verify all dishes have non-empty ingredients and steps
      for (const dish of allDishes) {
        const ingredients = JSON.parse(dish.ingredientsJson);
        const steps = JSON.parse(dish.stepsJson);
        expect(ingredients.length).toBeGreaterThan(0);
        expect(steps.length).toBeGreaterThan(0);
      }
    });

    it('contains exactly 14 consecutive days of history ending on 2026-10-26 (Today)', async () => {
      const allMenus = await db.select().from(dailyMenus);
      expect(allMenus).toHaveLength(14);

      const dates = allMenus.map((m) => m.date).sort();
      const expectedDates = [
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
        '2026-10-17',
        '2026-10-18',
        '2026-10-19',
        '2026-10-20',
        '2026-10-21',
        '2026-10-22',
        '2026-10-23',
        '2026-10-24',
        '2026-10-25',
        '2026-10-26',
      ];
      expect(dates).toEqual(expectedDates);
    });
  });
});
