// ============================================================================
// Kazoku-Kondate API: src/app/api/recipes/route.ts
// Handles: GET (list & search dishes with filtering & pagination)
//          POST (create new dish with validation & UUID persistence)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabaseInitialized } from '@/db';
import {
  dishes,
  parseDish,
  type Dish,
  type ParsedDish,
  type DishCategory,
  type ProteinType,
  type SourceType,
  type RecipeStatus,
  type IngredientItem,
} from '@/db/schema';
import { and, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import crypto from 'crypto';

const VALID_CATEGORIES: DishCategory[] = ['main', 'side', 'soup', 'other'];
const VALID_PROTEIN_TYPES: ProteinType[] = ['pork', 'chicken', 'beef', 'fish', 'egg_tofu', 'veggie'];
const VALID_SOURCE_TYPES: SourceType[] = ['classic_book', 'ai_generated', 'trusted_web', 'wishlist'];
const VALID_RECIPE_STATUSES: RecipeStatus[] = ['needs_registration', 'ai_provisional', 'confirmed'];

/**
 * GET /api/recipes
 * Query parameters:
 *  - category: 'main' | 'side' | 'soup' | 'other'
 *  - search: keyword search in name, aliasesJson, ingredientsJson
 *  - sourceType: 'classic_book' | 'ai_generated' | 'trusted_web' | 'wishlist'
 *  - limit: number (default 50, max 100)
 *  - offset: number (default 0)
 * Returns: { success: true, dishes: ParsedDish[], total: number }
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();

    const searchParams = request.nextUrl.searchParams;

    // 1. Validate & Parse Category
    const categoryParam = searchParams.get('category');
    let category: DishCategory | undefined;
    if (categoryParam) {
      if (!VALID_CATEGORIES.includes(categoryParam as DishCategory)) {
        return NextResponse.json(
          { error: '無効なカテゴリーです (main, side, soup, other のいずれかを指定してください)' },
          { status: 400 }
        );
      }
      category = categoryParam as DishCategory;
    }

    // 2. Validate & Parse SourceType
    const sourceTypeParam = searchParams.get('sourceType');
    let sourceType: SourceType | undefined;
    if (sourceTypeParam) {
      if (!VALID_SOURCE_TYPES.includes(sourceTypeParam as SourceType)) {
        return NextResponse.json(
          { error: '無効なレシピソース種別です (classic_book, ai_generated, trusted_web, wishlist のいずれかを指定してください)' },
          { status: 400 }
        );
      }
      sourceType = sourceTypeParam as SourceType;
    }

    // 3. Validate & Parse Search Keyword
    const searchParam = searchParams.get('search');
    const search = searchParam && searchParam.trim() !== '' ? searchParam.trim() : undefined;

    // 4. Validate & Parse Pagination (limit, offset)
    const limitParam = searchParams.get('limit');
    let limit = 50;
    if (limitParam !== null) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return NextResponse.json(
          { error: 'limit は 1 以上の整数で指定してください' },
          { status: 400 }
        );
      }
      limit = Math.min(100, Math.max(1, parsedLimit));
    }

    const offsetParam = searchParams.get('offset');
    let offset = 0;
    if (offsetParam !== null) {
      const parsedOffset = parseInt(offsetParam, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return NextResponse.json(
          { error: 'offset は 0 以上の整数で指定してください' },
          { status: 400 }
        );
      }
      offset = Math.max(0, parsedOffset);
    }

    // 5. Build Drizzle Query Conditions
    const conditions: SQL[] = [];

    if (category) {
      conditions.push(eq(dishes.category, category));
    }

    if (sourceType) {
      conditions.push(eq(dishes.sourceType, sourceType));
    }

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          like(dishes.name, searchPattern),
          like(dishes.aliasesJson, searchPattern),
          like(dishes.ingredientsJson, searchPattern)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 6. Query Total Count for Pagination
    const countQuery = db.select({ count: sql<number>`count(*)` }).from(dishes);
    const totalResult = whereClause ? await countQuery.where(whereClause) : await countQuery;
    const total = Number(totalResult[0]?.count ?? 0);

    // 7. Query Filtered & Paginated Dishes
    const dataQuery = db
      .select()
      .from(dishes)
      .orderBy(desc(dishes.cookCount), desc(dishes.createdAt));

    const rows = whereClause
      ? await dataQuery.where(whereClause).limit(limit).offset(offset)
      : await dataQuery.limit(limit).offset(offset);

    // 8. Format dishes using parseDish (provides both raw column fields and parsed arrays)
    const formattedDishes: ParsedDish[] = rows.map(parseDish);

    return NextResponse.json({
      success: true,
      dishes: formattedDishes,
      total,
    });
  } catch (error: any) {
    console.error('[API /api/recipes GET error]:', error);
    return NextResponse.json(
      { error: error?.message || 'レシピの取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recipes
 * Request body:
 * {
 *   name: string;
 *   category: 'main' | 'side' | 'soup' | 'other';
 *   proteinType?: 'pork' | 'chicken' | 'beef' | 'fish' | 'egg_tofu' | 'veggie';
 *   sourceType?: 'classic_book' | 'ai_generated' | 'trusted_web' | 'wishlist';
 *   sourceLabel?: string;
 *   sourceUrl?: string;
 *   recipeStatus?: 'needs_registration' | 'ai_provisional' | 'confirmed';
 *   baseServings?: number;
 *   ingredients: Array<{ name: string; amount: string; isStaple?: boolean; category?: string }>;
 *   steps: string[];
 *   aliases?: string[];
 * }
 * Returns: { success: true, dish: ParsedDish }
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized();

    // 1. Parse JSON Request Body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'リクエストボディが不正なJSONです' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'リクエストボディはオブジェクトである必要があります' },
        { status: 400 }
      );
    }

    // 2. Validate Required: name
    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json(
        { error: '料理名 (name) は必須です' },
        { status: 400 }
      );
    }
    const name = body.name.trim();

    // 3. Validate Required: category
    if (!body.category || !VALID_CATEGORIES.includes(body.category as DishCategory)) {
      return NextResponse.json(
        { error: '有効なカテゴリー (main, side, soup, other) を指定してください' },
        { status: 400 }
      );
    }
    const category: DishCategory = body.category as DishCategory;

    // 4. Validate Required: ingredients
    if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
      return NextResponse.json(
        { error: '材料 (ingredients) は1件以上の配列で指定してください' },
        { status: 400 }
      );
    }

    const normalizedIngredients: IngredientItem[] = [];
    for (let i = 0; i < body.ingredients.length; i++) {
      const ing = body.ingredients[i];
      if (!ing || typeof ing !== 'object' || !ing.name || typeof ing.name !== 'string' || ing.name.trim() === '') {
        return NextResponse.json(
          { error: `材料[${i}]の名称 (name) が無効または空です` },
          { status: 400 }
        );
      }
      normalizedIngredients.push({
        name: ing.name.trim(),
        amount:
          typeof ing.amount === 'string' && ing.amount.trim() !== ''
            ? ing.amount.trim()
            : ing.amount
              ? String(ing.amount).trim()
              : '適量',
        isStaple: Boolean(ing.isStaple),
        category: typeof ing.category === 'string' ? ing.category : undefined,
      });
    }

    // 5. Validate Required: steps
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return NextResponse.json(
        { error: '作り方手順 (steps) は1件以上の配列で指定してください' },
        { status: 400 }
      );
    }

    const normalizedSteps: string[] = body.steps
      .map((s: any) => (typeof s === 'string' ? s.trim() : s ? String(s).trim() : ''))
      .filter((s: string) => s.length > 0);

    if (normalizedSteps.length === 0) {
      return NextResponse.json(
        { error: '作り方手順 (steps) に有効な文字列が含まれていません' },
        { status: 400 }
      );
    }

    // 6. Validate Optional Fields
    let proteinType: ProteinType | null = null;
    if (body.proteinType && VALID_PROTEIN_TYPES.includes(body.proteinType as ProteinType)) {
      proteinType = body.proteinType as ProteinType;
    }

    let sourceType: SourceType = 'classic_book';
    if (body.sourceType && VALID_SOURCE_TYPES.includes(body.sourceType as SourceType)) {
      sourceType = body.sourceType as SourceType;
    }

    let recipeStatus: RecipeStatus = 'confirmed';
    if (body.recipeStatus && VALID_RECIPE_STATUSES.includes(body.recipeStatus as RecipeStatus)) {
      recipeStatus = body.recipeStatus as RecipeStatus;
    }

    let baseServings = 3;
    if (body.baseServings !== undefined && body.baseServings !== null) {
      const parsedServings = Number(body.baseServings);
      if (!isNaN(parsedServings) && parsedServings >= 1 && parsedServings <= 8) {
        baseServings = Math.round(parsedServings);
      }
    }

    const aliases: string[] = Array.isArray(body.aliases)
      ? body.aliases
          .map((a: any) => (typeof a === 'string' ? a.trim() : ''))
          .filter((a: string) => a.length > 0)
      : [];

    const sourceLabel: string | null =
      typeof body.sourceLabel === 'string' && body.sourceLabel.trim() !== ''
        ? body.sourceLabel.trim()
        : null;

    const sourceUrl: string | null =
      typeof body.sourceUrl === 'string' && body.sourceUrl.trim() !== ''
        ? body.sourceUrl.trim()
        : null;

    // 7. Auto-generate UUID and CreatedAt
    const newDishId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const newDishRecord: Dish = {
      id: newDishId,
      name,
      aliasesJson: JSON.stringify(aliases),
      category,
      proteinType,
      sourceType,
      sourceLabel,
      sourceUrl,
      recipeStatus,
      baseServings,
      ingredientsJson: JSON.stringify(normalizedIngredients),
      stepsJson: JSON.stringify(normalizedSteps),
      cookCount: 0,
      lastCookedDate: null,
      createdAt,
    };

    // 8. Persist to Database
    await db.insert(dishes).values(newDishRecord);

    const insertedParsed = parseDish(newDishRecord);

    return NextResponse.json({
      success: true,
      dish: insertedParsed,
    });
  } catch (error: any) {
    console.error('[API /api/recipes POST error]:', error);
    return NextResponse.json(
      { error: error?.message || 'レシピの登録中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
