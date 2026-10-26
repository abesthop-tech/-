// ============================================================================
// Kazoku-Kondate Daily Menu API Handler: src/app/api/menu/route.ts
// Milestone M3 - API Routes & Persistence Layer
// Methods: GET, POST, PATCH, DELETE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseInitialized } from '@/db';
import {
  dishes,
  dailyMenus,
  appSettings,
  parseDish,
  parseDailyMenu,
  dailyMenuToInsert,
  safeJsonParse,
  MealSlot,
  ParsedDish,
  ParsedDailyMenu,
  ShoppingState,
} from '@/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import {
  proposeDailyMenu,
  shuffleSlotCandidate,
  dishToMealSlot,
  SlotRole,
} from '@/lib/menu-planner';
import {
  consolidateAndPartitionShoppingList,
  DishWithIngredients,
} from '@/lib/shopping-aggregator';
import {
  scheduleParallelCookingTimeline,
  DishScheduleInput,
} from '@/lib/timeline-scheduler';
import { DEFAULT_STAPLE_ITEMS } from '@/db/seed';

// ----------------------------------------------------------------------------
// Validation & Utility Helpers
// ----------------------------------------------------------------------------

/**
 * Validates date string in strict YYYY-MM-DD format with calendar bounds.
 */
function isValidDateString(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return (
    dateObj.getUTCFullYear() === y &&
    dateObj.getUTCMonth() === m - 1 &&
    dateObj.getUTCDate() === d
  );
}

/**
 * Resolves today's date in JST (Asia/Tokyo) as YYYY-MM-DD.
 */
function getTodayJstDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

/**
 * Validates servings input within [1..8] range.
 */
function parseAndValidateServings(
  val: unknown,
  fallback: number = 3
): { value: number; valid: boolean } {
  if (val === undefined || val === null || val === '') {
    return { value: fallback, valid: true };
  }
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 8) {
    return { value: fallback, valid: false };
  }
  return { value: num, valid: true };
}

/**
 * Normalizes locked slots from object `{ main: true }` or array representation.
 */
function normalizeLockedSlots(
  input: unknown,
  existingSlots?: MealSlot[]
): Array<{ role: SlotRole; dishId?: string; lockReason?: string }> {
  const result: Array<{ role: SlotRole; dishId?: string; lockReason?: string }> = [];
  if (!input) return result;

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string' && (item === 'main' || item === 'side' || item === 'soup')) {
        const exist = existingSlots?.find((s) => s.role === item);
        result.push({
          role: item,
          dishId: exist?.dishId,
          lockReason: exist?.lockReason || '固定中',
        });
      } else if (item && typeof item === 'object' && item.role) {
        const role = item.role as SlotRole;
        if (role === 'main' || role === 'side' || role === 'soup') {
          const exist = existingSlots?.find((s) => s.role === role);
          result.push({
            role,
            dishId: item.dishId || exist?.dishId,
            lockReason: item.lockReason || exist?.lockReason || '固定中',
          });
        }
      }
    }
    return result;
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    for (const role of ['main', 'side', 'soup'] as const) {
      if (Boolean(obj[role])) {
        const exist = existingSlots?.find((s) => s.role === role);
        result.push({
          role,
          dishId: exist?.dishId,
          lockReason: exist?.lockReason || '固定中',
        });
      }
    }
  }

  return result;
}

/**
 * Fetches pantry staples from app_settings with fallback to DEFAULT_STAPLE_ITEMS.
 */
async function getStapleList(): Promise<string[]> {
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'staple_items'));
    if (rows.length > 0) {
      return safeJsonParse<string[]>(rows[0].valueJson, DEFAULT_STAPLE_ITEMS);
    }
  } catch {
    // fallback
  }
  return DEFAULT_STAPLE_ITEMS;
}

// ----------------------------------------------------------------------------
// GET: Fetch planned menu or draft proposal for a specific date
// ----------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();

    const searchParams = request.nextUrl.searchParams;
    const rawDate = searchParams.get('date');
    const targetDate = rawDate && rawDate.trim() !== '' ? rawDate.trim() : getTodayJstDate();

    if (!isValidDateString(targetDate)) {
      return NextResponse.json(
        { error: '無効な日付形式です (YYYY-MM-DD 形式で指定してください)' },
        { status: 400 }
      );
    }

    const proposeDraft = searchParams.get('propose') === 'true' || searchParams.get('draft') === 'true';

    // 1. Query daily_menus for date
    const menuRows = await db
      .select()
      .from(dailyMenus)
      .where(eq(dailyMenus.date, targetDate));

    if (menuRows.length > 0) {
      const menu = parseDailyMenu(menuRows[0]);
      const dishIds = menu.slots.map((s) => s.dishId).filter(Boolean);

      let resolvedDishes: {
        main: ParsedDish | null;
        side: ParsedDish | null;
        soup: ParsedDish | null;
      } = { main: null, side: null, soup: null };

      if (dishIds.length > 0) {
        const dishRows = await db
          .select()
          .from(dishes)
          .where(inArray(dishes.id, dishIds));
        const dishMap = new Map(dishRows.map(parseDish).map((d) => [d.id, d]));

        const mainSlot = menu.slots.find((s) => s.role === 'main');
        const sideSlot = menu.slots.find((s) => s.role === 'side');
        const soupSlot = menu.slots.find((s) => s.role === 'soup');

        resolvedDishes = {
          main: mainSlot ? dishMap.get(mainSlot.dishId) || null : null,
          side: sideSlot ? dishMap.get(sideSlot.dishId) || null : null,
          soup: soupSlot ? dishMap.get(soupSlot.dishId) || null : null,
        };
      }

      return NextResponse.json({
        success: true,
        isPlanned: true,
        date: targetDate,
        menu,
        dishes: resolvedDishes,
      });
    }

    // 2. If not found in DB, check if draft proposal requested
    if (proposeDraft) {
      const allDishesRaw = await db.select().from(dishes);
      const allDishes = allDishesRaw.map(parseDish);

      const pastMenusRaw = await db
        .select()
        .from(dailyMenus)
        .orderBy(desc(dailyMenus.date));
      const pastMenus = pastMenusRaw.map(parseDailyMenu);

      const draftSlots = proposeDailyMenu({
        targetDate,
        servings: 3,
        allDishes,
        pastMenus,
      });

      const dishMap = new Map(allDishes.map((d) => [d.id, d]));
      const mainSlot = draftSlots.find((s) => s.role === 'main');
      const sideSlot = draftSlots.find((s) => s.role === 'side');
      const soupSlot = draftSlots.find((s) => s.role === 'soup');

      const draftDishes = {
        main: mainSlot ? dishMap.get(mainSlot.dishId) || null : null,
        side: sideSlot ? dishMap.get(sideSlot.dishId) || null : null,
        soup: soupSlot ? dishMap.get(soupSlot.dishId) || null : null,
      };

      const stapleList = await getStapleList();
      const dishesForShopping: DishWithIngredients[] = [];
      const dishesForTimeline: DishScheduleInput[] = [];

      for (const slot of draftSlots) {
        const dish = dishMap.get(slot.dishId);
        if (dish) {
          dishesForShopping.push({
            role: slot.role,
            name: dish.name,
            baseServings: dish.baseServings,
            ingredients: dish.ingredients,
          });
          dishesForTimeline.push({
            name: dish.name,
            role: slot.role,
            steps: dish.steps,
            ingredients: dish.ingredients,
          });
        }
      }

      const draftShopping = consolidateAndPartitionShoppingList(dishesForShopping, 3, { stapleList });
      const draftTimeline = scheduleParallelCookingTimeline(dishesForTimeline, 3);

      const draftMenu: ParsedDailyMenu = {
        date: targetDate,
        servings: 3,
        contextMemo: null,
        slots: draftSlots,
        parallelSteps: draftTimeline.steps,
        shoppingState: draftShopping,
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        isPlanned: false,
        isDraft: true,
        date: targetDate,
        menu: draftMenu,
        dishes: draftDishes,
      });
    }

    // 3. Default not planned response
    return NextResponse.json({
      success: true,
      isPlanned: false,
      date: targetDate,
      menu: null,
      dishes: null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '献立の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// POST: Propose or update daily menu, persist to DB, and return full state
// ----------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'リクエスト本文が不正なJSONです' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'JSONオブジェクトを指定してください' },
        { status: 400 }
      );
    }

    // 1. Date Validation
    const date = body.date;
    if (!date || typeof date !== 'string' || !isValidDateString(date)) {
      return NextResponse.json(
        { error: '有効な日付形式 (YYYY-MM-DD) を指定してください' },
        { status: 400 }
      );
    }

    // 2. Servings Validation
    const servingsValidation = parseAndValidateServings(body.servings, 3);
    if (!servingsValidation.valid) {
      return NextResponse.json(
        { error: '人数は1〜8の整数で指定してください' },
        { status: 400 }
      );
    }
    const servings = servingsValidation.value;

    const contextMemo =
      typeof body.contextMemo === 'string' && body.contextMemo.trim() !== ''
        ? body.contextMemo.trim()
        : null;

    // 3. Load DB Records
    const allDishesRaw = await db.select().from(dishes);
    const allDishes = allDishesRaw.map(parseDish);
    const dishMap = new Map(allDishes.map((d) => [d.id, d]));

    const pastMenusRaw = await db
      .select()
      .from(dailyMenus)
      .orderBy(desc(dailyMenus.date));
    const pastMenus = pastMenusRaw.map(parseDailyMenu);

    const existingMenu = pastMenus.find((m) => m.date === date);

    // 4. Handle Dish Overrides & Locked Slots
    let currentSlots = existingMenu ? [...existingMenu.slots] : undefined;
    const lockedList = normalizeLockedSlots(body.lockedSlots, currentSlots);

    if (body.dishOverrides && typeof body.dishOverrides === 'object') {
      const overrides = body.dishOverrides as { mainId?: string; sideId?: string; soupId?: string };
      const roleOverridePairs: Array<{ role: SlotRole; id?: string }> = [
        { role: 'main', id: overrides.mainId },
        { role: 'side', id: overrides.sideId },
        { role: 'soup', id: overrides.soupId },
      ];

      for (const pair of roleOverridePairs) {
        if (pair.id) {
          const dish = dishMap.get(pair.id);
          if (!dish) {
            return NextResponse.json(
              { error: `指定された料理IDが見つかりません: ${pair.id}` },
              { status: 400 }
            );
          }
          const overrideSlot = dishToMealSlot(pair.role, dish, true, '指定料理');
          if (!currentSlots) {
            currentSlots = [
              pair.role === 'main' ? overrideSlot : { role: 'main', dishId: '', dishName: '', locked: false, ingredients: [], steps: [] },
              pair.role === 'side' ? overrideSlot : { role: 'side', dishId: '', dishName: '', locked: false, ingredients: [], steps: [] },
              pair.role === 'soup' ? overrideSlot : { role: 'soup', dishId: '', dishName: '', locked: false, ingredients: [], steps: [] },
            ];
          } else {
            const idx = currentSlots.findIndex((s) => s.role === pair.role);
            if (idx >= 0) {
              currentSlots[idx] = overrideSlot;
            } else {
              currentSlots.push(overrideSlot);
            }
          }
          if (!lockedList.some((l) => l.role === pair.role)) {
            lockedList.push({ role: pair.role, dishId: pair.id, lockReason: '指定料理' });
          }
        }
      }
    }

    // 5. Handle Single-Slot Shuffle Request if Specified
    let finalSlots: MealSlot[];
    if (
      body.shuffleRole &&
      (body.shuffleRole === 'main' || body.shuffleRole === 'side' || body.shuffleRole === 'soup') &&
      currentSlots &&
      currentSlots.length > 0
    ) {
      finalSlots = shuffleSlotCandidate(
        body.shuffleRole,
        currentSlots,
        pastMenus,
        allDishes,
        { contextMemo: contextMemo || undefined, targetDate: date }
      );
    } else {
      // Standard 3-slot proposal
      finalSlots = proposeDailyMenu({
        targetDate: date,
        servings,
        contextMemo,
        currentSlots,
        lockedSlots: lockedList,
        pastMenus,
        allDishes,
        forceNewChallenge: Boolean(body.forceNew),
      });
    }

    // 6. Resolve Dishes for Slots
    const mainSlot = finalSlots.find((s) => s.role === 'main');
    const sideSlot = finalSlots.find((s) => s.role === 'side');
    const soupSlot = finalSlots.find((s) => s.role === 'soup');

    const resolvedDishes = {
      main: mainSlot ? dishMap.get(mainSlot.dishId) || null : null,
      side: sideSlot ? dishMap.get(sideSlot.dishId) || null : null,
      soup: soupSlot ? dishMap.get(soupSlot.dishId) || null : null,
    };

    // 7. Consolidate Two-Stage Shopping List
    const stapleList = await getStapleList();
    const dishesForShopping: DishWithIngredients[] = [];
    const dishesForTimeline: DishScheduleInput[] = [];

    for (const slot of finalSlots) {
      const dish = dishMap.get(slot.dishId);
      if (dish) {
        dishesForShopping.push({
          role: slot.role,
          name: dish.name,
          baseServings: dish.baseServings,
          ingredients: dish.ingredients,
        });
        dishesForTimeline.push({
          name: dish.name,
          role: slot.role,
          steps: dish.steps,
          ingredients: dish.ingredients,
        });
      } else {
        dishesForShopping.push({
          role: slot.role,
          name: slot.dishName,
          baseServings: 3,
          ingredients: slot.ingredients.map((ig) => {
            const parts = ig.split(' ');
            return { name: parts[0] || '', amount: parts.slice(1).join(' ') || '', isStaple: false };
          }),
        });
        dishesForTimeline.push({
          name: slot.dishName,
          role: slot.role,
          steps: slot.steps,
        });
      }
    }

    const shoppingState = consolidateAndPartitionShoppingList(
      dishesForShopping,
      servings,
      { stapleList }
    );

    // 8. Schedule Parallel Cooking Timeline
    const timeline = scheduleParallelCookingTimeline(dishesForTimeline, servings);

    // 9. Persist into SQLite via Drizzle Upsert
    const nowIso = new Date().toISOString();
    const menuToSave: ParsedDailyMenu = {
      date,
      servings,
      contextMemo,
      slots: finalSlots,
      parallelSteps: timeline.steps,
      shoppingState,
      updatedAt: nowIso,
    };

    await db
      .insert(dailyMenus)
      .values(dailyMenuToInsert(menuToSave))
      .onConflictDoUpdate({
        target: dailyMenus.date,
        set: {
          servings: menuToSave.servings,
          contextMemo: menuToSave.contextMemo,
          slotsJson: JSON.stringify(menuToSave.slots),
          parallelStepsJson: JSON.stringify(menuToSave.parallelSteps),
          shoppingStateJson: JSON.stringify(menuToSave.shoppingState),
          updatedAt: menuToSave.updatedAt,
        },
      });

    return NextResponse.json({
      success: true,
      isPlanned: true,
      date,
      menu: menuToSave,
      dishes: resolvedDishes,
      shoppingList: shoppingState,
      timeline,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '献立の生成・保存中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// PATCH: Partial update for servings, slot locks, or shopping checklist
// ----------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'リクエスト本文が不正なJSONです' },
        { status: 400 }
      );
    }

    const date = body.date;
    if (!date || typeof date !== 'string' || !isValidDateString(date)) {
      return NextResponse.json(
        { error: '有効な日付形式 (YYYY-MM-DD) を指定してください' },
        { status: 400 }
      );
    }

    const menuRows = await db
      .select()
      .from(dailyMenus)
      .where(eq(dailyMenus.date, date));

    if (menuRows.length === 0) {
      return NextResponse.json(
        { error: `指定された日付 (${date}) の献立は見つかりませんでした` },
        { status: 404 }
      );
    }

    const currentMenu = parseDailyMenu(menuRows[0]);

    if (body.servings !== undefined) {
      const sv = parseAndValidateServings(body.servings);
      if (!sv.valid) {
        return NextResponse.json(
          { error: '人数は1〜8の整数で指定してください' },
          { status: 400 }
        );
      }
      currentMenu.servings = sv.value;
    }

    if (body.slots && Array.isArray(body.slots)) {
      currentMenu.slots = body.slots;
    }

    if (body.shoppingState && typeof body.shoppingState === 'object') {
      currentMenu.shoppingState = body.shoppingState as ShoppingState;
    }

    if (body.contextMemo !== undefined) {
      currentMenu.contextMemo = body.contextMemo ? String(body.contextMemo).trim() : null;
    }

    currentMenu.updatedAt = new Date().toISOString();

    await db
      .update(dailyMenus)
      .set({
        servings: currentMenu.servings,
        contextMemo: currentMenu.contextMemo,
        slotsJson: JSON.stringify(currentMenu.slots),
        parallelStepsJson: currentMenu.parallelSteps ? JSON.stringify(currentMenu.parallelSteps) : null,
        shoppingStateJson: currentMenu.shoppingState ? JSON.stringify(currentMenu.shoppingState) : null,
        updatedAt: currentMenu.updatedAt,
      })
      .where(eq(dailyMenus.date, date));

    return NextResponse.json({
      success: true,
      menu: currentMenu,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '献立の更新中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// DELETE: Remove daily menu entry for a given date
// ----------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');

    if (!date || !isValidDateString(date)) {
      return NextResponse.json(
        { error: '有効な日付形式 (YYYY-MM-DD) を指定してください' },
        { status: 400 }
      );
    }

    await db.delete(dailyMenus).where(eq(dailyMenus.date, date));

    return NextResponse.json({
      success: true,
      message: `${date} の献立をリセットしました`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '献立の削除中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
