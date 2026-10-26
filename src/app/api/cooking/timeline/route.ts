// ============================================================================
// Kazoku-Kondate Parallel Cooking Timeline API Handler:
// src/app/api/cooking/timeline/route.ts
// Milestone M3 - API Routes & Persistence Layer
// Methods: POST, GET
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseInitialized } from '@/db';
import { dishes, dailyMenus, parseDish, parseDailyMenu, ParsedDish } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  scheduleParallelCookingTimeline,
  DishScheduleInput,
  ParallelTimelineResult,
} from '@/lib/timeline-scheduler';
import { isGeminiConfigured, generateCookingTimelineWithGemini } from '@/lib/gemini';

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
 * Normalizes an arbitrary dish object (ParsedDish, MealSlot, or raw dict)
 * into DishScheduleInput structure.
 */
function normalizeDishScheduleInput(dish: any): DishScheduleInput {
  if (!dish || typeof dish !== 'object') {
    return { name: '料理', role: 'main', steps: [], ingredients: [] };
  }

  const name = String(dish.name || dish.dishName || '料理').trim();
  const role = String(dish.role || dish.category || 'main').toLowerCase();
  const steps: string[] = Array.isArray(dish.steps) ? dish.steps.map(String) : [];

  let ingredients: Array<{ name: string; amount?: string; isStaple?: boolean }> = [];

  if (Array.isArray(dish.ingredients)) {
    ingredients = dish.ingredients
      .map((item: any) => {
        if (typeof item === 'string') {
          const parts = item.trim().split(/\s+/);
          return {
            name: parts[0] || '',
            amount: parts.slice(1).join(' ') || undefined,
            isStaple: false,
          };
        }
        if (item && typeof item === 'object') {
          return {
            name: String(item.name || '').trim(),
            amount: item.amount ? String(item.amount) : undefined,
            isStaple: Boolean(item.isStaple),
          };
        }
        return null;
      })
      .filter((i: any): i is { name: string; amount?: string; isStaple?: boolean } => Boolean(i && i.name.length > 0));
  }

  return { name, role, steps, ingredients };
}

// ----------------------------------------------------------------------------
// POST: Generate parallel cooking timeline from dishIds or dish objects
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

    // 1. Validate Servings
    const svResult = parseAndValidateServings(body.servings, 3);
    if (!svResult.valid) {
      return NextResponse.json(
        { error: '人数は1〜8の整数で指定してください' },
        { status: 400 }
      );
    }
    const servings = svResult.value;

    let scheduleInputs: DishScheduleInput[] = [];

    // 2. Resolve via dishIds
    if (Array.isArray(body.dishIds) && body.dishIds.length > 0) {
      const cleanIds = body.dishIds
        .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id: string) => id.trim());

      if (cleanIds.length === 0) {
        return NextResponse.json(
          { error: '有効な dishIds を指定してください' },
          { status: 400 }
        );
      }

      const rows = await db
        .select()
        .from(dishes)
        .where(inArray(dishes.id, cleanIds));

      if (rows.length === 0) {
        return NextResponse.json(
          { error: '指定された dishIds に合致する料理が見つかりませんでした' },
          { status: 404 }
        );
      }

      const parsedDishes = rows.map(parseDish);
      const dishMap = new Map(parsedDishes.map((d) => [d.id, d]));

      // Preserve caller order
      scheduleInputs = cleanIds
        .map((id: string) => dishMap.get(id))
        .filter((d: ParsedDish | undefined): d is ParsedDish => Boolean(d))
        .map((d: ParsedDish) => ({
          name: d.name,
          role: d.category,
          steps: d.steps,
          ingredients: d.ingredients,
        }));
    }
    // 3. Resolve via direct dishes array
    else if (Array.isArray(body.dishes) && body.dishes.length > 0) {
      scheduleInputs = body.dishes
        .map(normalizeDishScheduleInput)
        .filter((d: DishScheduleInput) => d.name.length > 0);

      if (scheduleInputs.length === 0) {
        return NextResponse.json(
          { error: '有効な料理情報が指定されていません' },
          { status: 400 }
        );
      }
    }
    // 4. Missing inputs
    else {
      return NextResponse.json(
        { error: 'dishIds または dishes を指定してください' },
        { status: 400 }
      );
    }

    // 5. Schedule Timeline
    let timeline: ParallelTimelineResult;
    if (body.useAi && isGeminiConfigured()) {
      timeline = await generateCookingTimelineWithGemini(scheduleInputs, servings);
    } else {
      timeline = scheduleParallelCookingTimeline(scheduleInputs, servings);
    }

    return NextResponse.json({
      success: true,
      estimatedMinutes: timeline.estimatedMinutes,
      steps: timeline.steps,
      servings,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '調理工程タイムラインの生成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// GET: Query cooking timeline for a planned date or dishIds query
// ----------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const dishIdsParam = searchParams.get('dishIds');
    const servingsParam = searchParams.get('servings');

    const svResult = parseAndValidateServings(servingsParam, 3);
    if (!svResult.valid) {
      return NextResponse.json(
        { error: '人数は1〜8の整数で指定してください' },
        { status: 400 }
      );
    }
    const servings = svResult.value;

    // A. Query saved timeline by date
    if (date) {
      const rows = await db
        .select()
        .from(dailyMenus)
        .where(eq(dailyMenus.date, date));

      if (rows.length > 0) {
        const menu = parseDailyMenu(rows[0]);
        if (menu.parallelSteps && menu.parallelSteps.length > 0) {
          const totalMinutes = menu.parallelSteps.reduce(
            (acc, s) => acc + (s.timerMinutes || 0),
            0
          );
          return NextResponse.json({
            success: true,
            date,
            estimatedMinutes: totalMinutes > 0 ? totalMinutes : 23,
            steps: menu.parallelSteps,
            servings: menu.servings,
          });
        }
      }
    }

    // B. Query timeline by dishIds
    if (dishIdsParam) {
      const dishIds = dishIdsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (dishIds.length > 0) {
        const rows = await db
          .select()
          .from(dishes)
          .where(inArray(dishes.id, dishIds));

        if (rows.length > 0) {
          const scheduleInputs: DishScheduleInput[] = rows.map(parseDish).map((d) => ({
            name: d.name,
            role: d.category,
            steps: d.steps,
            ingredients: d.ingredients,
          }));

          const timeline = scheduleParallelCookingTimeline(scheduleInputs, servings);
          return NextResponse.json({
            success: true,
            estimatedMinutes: timeline.estimatedMinutes,
            steps: timeline.steps,
            servings,
          });
        }
      }
    }

    return NextResponse.json(
      { error: 'date または dishIds パラメータを指定してください' },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '調理工程の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
