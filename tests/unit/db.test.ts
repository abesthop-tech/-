import { describe, it, expect, beforeAll } from 'vitest';
import { db, ensureDatabaseInitialized } from '@/db';
import { dishes, dailyMenus, appSettings, parseDish, parseDailyMenu } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

describe('Database Foundation & Schema Integrity', () => {
  beforeAll(async () => {
    await ensureDatabaseInitialized();
  });

  it('initializes dishes and verifies sample classics', async () => {
    const allDishes = await db.select().from(dishes);
    expect(allDishes.length).toBeGreaterThanOrEqual(13);

    const butabara = await db.select().from(dishes).where(eq(dishes.id, 'dish_butabara_daikon'));
    expect(butabara.length).toBe(1);
    expect(butabara[0].category).toBe('main');
    expect(butabara[0].proteinType).toBe('pork');
    expect(butabara[0].cookCount).toBe(8);

    const parsed = parseDish(butabara[0]);
    expect(parsed.aliases).toContain('豚バラ大根');
    expect(parsed.ingredients.length).toBeGreaterThan(0);
    expect(parsed.steps.length).toBeGreaterThan(0);
  });

  it('initializes 17 default pantry staple items in app_settings', async () => {
    const setting = await db.select().from(appSettings).where(eq(appSettings.key, 'staple_items'));
    expect(setting.length).toBe(1);
    const staples = JSON.parse(setting[0].valueJson);
    expect(staples.length).toBe(17);
    expect(staples).toContain('玉ねぎ');
    expect(staples).toContain('しょうが');
    expect(staples).toContain('にんにく');
    expect(staples).toContain('長ねぎ');
    expect(staples).toContain('卵');
    expect(staples).toContain('醤油');
    expect(staples).toContain('みりん');
    expect(staples).toContain('酒');
    expect(staples).toContain('砂糖');
    expect(staples).toContain('味噌');
    expect(staples).toContain('酢');
    expect(staples).toContain('サラダ油');
    expect(staples).toContain('ごま油');
    expect(staples).toContain('オイスターソース');
    expect(staples).toContain('片栗粉');
    expect(staples).toContain('だしの素');
    expect(staples).toContain('鶏ガラスープの素');
  });

  it('initializes family profile in app_settings', async () => {
    const profileRow = await db.select().from(appSettings).where(eq(appSettings.key, 'family_profile'));
    expect(profileRow.length).toBe(1);
    const profile = JSON.parse(profileRow[0].valueJson);
    expect(profile.defaultServings).toBe(3);
    expect(profile.members.length).toBe(3);
    expect(profile.classicThreshold).toBe(5);
  });

  it('initializes today menu with 3 slots, parallel steps, and shopping state', async () => {
    const today = await db.select().from(dailyMenus).where(eq(dailyMenus.date, '2026-10-26'));
    expect(today.length).toBe(1);

    const parsed = parseDailyMenu(today[0]);
    expect(parsed.servings).toBe(3);
    expect(parsed.contextMemo).toBe('大根、豚バラ');
    expect(parsed.slots.length).toBe(3);

    // Verify main dish slot
    const mainSlot = parsed.slots.find((s) => s.role === 'main');
    expect(mainSlot).toBeDefined();
    expect(mainSlot?.dishName).toBe('豚バラと大根のこっくり照り煮');
    expect(mainSlot?.locked).toBe(true);
    expect(mainSlot?.lockReason).toBe('祖父が担当・固定中');

    // Verify side and soup slots
    const sideSlot = parsed.slots.find((s) => s.role === 'side');
    expect(sideSlot).toBeDefined();
    expect(sideSlot?.dishName).toBe('小松菜と油揚げのさっと煮びたし');

    const soupSlot = parsed.slots.find((s) => s.role === 'soup');
    expect(soupSlot).toBeDefined();
    expect(soupSlot?.dishName).toBe('豆腐とわかめの味噌汁');

    // Verify parallel steps
    expect(parsed.parallelSteps).toBeDefined();
    expect(parsed.parallelSteps?.length).toBe(3);

    // Verify shopping state
    expect(parsed.shoppingState).toBeDefined();
    expect(parsed.shoppingState?.mainItems.length).toBeGreaterThanOrEqual(5);
    expect(parsed.shoppingState?.stapleItems.length).toBeGreaterThanOrEqual(6);
  });

  it('verifies 14-day history exists ending at today (2026-10-26)', async () => {
    const menus = await db.select().from(dailyMenus).orderBy(desc(dailyMenus.date));
    expect(menus.length).toBeGreaterThanOrEqual(14);

    const dates = menus.map((m) => m.date);
    expect(dates).toContain('2026-10-26');
    expect(dates).toContain('2026-10-25');
    expect(dates).toContain('2026-10-24');
    expect(dates).toContain('2026-10-23');
    expect(dates).toContain('2026-10-22');
    expect(dates).toContain('2026-10-21');
    expect(dates).toContain('2026-10-20');
    expect(dates).toContain('2026-10-19');
    expect(dates).toContain('2026-10-18');
    expect(dates).toContain('2026-10-17');
    expect(dates).toContain('2026-10-16');
    expect(dates).toContain('2026-10-15');
    expect(dates).toContain('2026-10-14');
    expect(dates).toContain('2026-10-13');
  });

  it('is idempotent when ensureDatabaseInitialized is called multiple times', async () => {
    await expect(ensureDatabaseInitialized()).resolves.not.toThrow();
    const countAfter = await db.select().from(dishes);
    expect(countAfter.length).toBeGreaterThanOrEqual(13);
  });
});
