// ============================================================================
// Kazoku-Kondate Database Schema: src/db/schema.ts
// Framework: Drizzle ORM (SQLite / LibSQL)
// Hardened: Safe JSON parsing, nullish coalescing for numeric servings
// ============================================================================
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ----------------------------------------------------------------------------
// 1. Table Definitions
// ----------------------------------------------------------------------------

/**
 * Dishes Master Table
 * Stores recipes, imported classics, AI provisional recipes, and wishlist items.
 */
export const dishes = sqliteTable('dishes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  aliasesJson: text('aliases_json').notNull(), // JSON: string[]
  category: text('category').notNull(), // 'main' | 'side' | 'soup' | 'other'
  proteinType: text('protein_type'), // 'pork' | 'chicken' | 'beef' | 'fish' | 'egg_tofu' | 'veggie'
  sourceType: text('source_type').notNull(), // 'classic_book' | 'ai_generated' | 'trusted_web' | 'wishlist'
  sourceLabel: text('source_label'), // e.g. "山本ゆりさんレシピ本 (p.42)", "白ごはん.com"
  sourceUrl: text('source_url'), // external reference URL if available
  recipeStatus: text('recipe_status').notNull(), // 'needs_registration' | 'ai_provisional' | 'confirmed'
  baseServings: integer('base_servings').default(3).notNull(),
  ingredientsJson: text('ingredients_json').notNull(), // JSON: IngredientItem[]
  stepsJson: text('steps_json').notNull(), // JSON: string[]
  cookCount: integer('cook_count').default(0).notNull(), // total times cooked
  lastCookedDate: text('last_cooked_date'), // YYYY-MM-DD
  createdAt: text('created_at').notNull(), // ISO 8601
});

/**
 * Daily Menus Table
 * Records daily planned and cooked meals, slot locks, parallel timelines, and shopping progress.
 */
export const dailyMenus = sqliteTable('daily_menus', {
  date: text('date').primaryKey(), // YYYY-MM-DD
  servings: integer('servings').default(3).notNull(),
  contextMemo: text('context_memo'), // User search input: e.g. "大根、豚バラ"
  slotsJson: text('slots_json').notNull(), // JSON: MealSlot[]
  parallelStepsJson: text('parallel_steps_json'), // JSON: ParallelTimelineStep[] (cached guide)
  shoppingStateJson: text('shopping_state_json'), // JSON: ShoppingState
  updatedAt: text('updated_at').notNull(), // ISO 8601
});

/**
 * App Settings Table
 * Key-value configuration for pantry staples, classic thresholds, and family profiles.
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(), // 'staple_items' | 'classic_threshold' | 'family_profile'
  valueJson: text('value_json').notNull(), // JSON string
});

// ----------------------------------------------------------------------------
// 2. TypeScript Types & Domain Interfaces
// ----------------------------------------------------------------------------

export type DishCategory = 'main' | 'side' | 'soup' | 'other';
export type ProteinType = 'pork' | 'chicken' | 'beef' | 'fish' | 'egg_tofu' | 'veggie';
export type SourceType = 'classic_book' | 'ai_generated' | 'trusted_web' | 'wishlist';
export type RecipeStatus = 'needs_registration' | 'ai_provisional' | 'confirmed';

export interface IngredientItem {
  name: string; // e.g. "豚バラ薄切り", "大根", "醤油"
  amount: string; // e.g. "300g", "1/2本", "大さじ2"
  isStaple: boolean; // true if basic household staple
  category?: 'meat' | 'fish' | 'vegetable' | 'dairy_tofu' | 'seasoning' | 'other';
}

export interface MealSlot {
  role: 'main' | 'side' | 'soup';
  dishId: string;
  dishName: string;
  locked: boolean;
  lockReason?: string; // e.g. "祖父が担当・固定中"
  sourceLabel?: string;
  badge?: string; // "我が家の定番" | "信頼サイト" | "新レシピ挑戦" | "カレンダー履歴"
  ingredients: string[]; // e.g. ["豚バラ薄切り 300g", "大根 1/2本"]
  steps: string[];
  isLeftover?: boolean;
}

export interface ParallelTimelineStep {
  stepNumber: number;
  phase: '下ごしらえ（まとめて切る・レンジ）' | '副菜と汁物の火入れ' | '主菜の仕上げ（熱々で食卓へ）';
  timeWindow: string; // e.g. "0:00〜7:00"
  dishTag: string; // e.g. "全品共通", "副菜・汁物", "主菜"
  instruction: string;
  done: boolean;
  timerMinutes?: number;
}

export interface ShoppingStateItem {
  id: number;
  name: string;
  amount: string;
  dishRole: string; // "主菜" | "副菜" | "汁物" | "常備品"
  checked: boolean;
  promotedFromStaple?: boolean;
}

export interface ShoppingState {
  mainItems: ShoppingStateItem[];
  stapleItems: { id: number; name: string }[];
}

export interface FamilyMember {
  id: string;
  name: string;
  role: 'cook' | 'member';
}

export interface FamilyProfile {
  familyId: string;
  defaultServings: number;
  members: FamilyMember[];
  stapleItems: string[];
  classicThreshold: number;
}

// Inferred Drizzle table types
export type Dish = typeof dishes.$inferSelect;
export type NewDish = typeof dishes.$inferInsert;

export type DailyMenu = typeof dailyMenus.$inferSelect;
export type NewDailyMenu = typeof dailyMenus.$inferInsert;

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

// ----------------------------------------------------------------------------
// 3. Domain Entity Types (Parsed with Structured Fields)
// ----------------------------------------------------------------------------

export interface ParsedDish {
  id: string;
  name: string;
  aliases: string[];
  category: DishCategory;
  proteinType?: ProteinType | null;
  sourceType: SourceType;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  recipeStatus: RecipeStatus;
  baseServings: number;
  ingredients: IngredientItem[];
  steps: string[];
  cookCount: number;
  lastCookedDate?: string | null;
  createdAt: string;
}

export interface ParsedDailyMenu {
  date: string;
  servings: number;
  contextMemo?: string | null;
  slots: MealSlot[];
  parallelSteps?: ParallelTimelineStep[] | null;
  shoppingState?: ShoppingState | null;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 4. Serialization & Parsing Utilities
// ----------------------------------------------------------------------------

/**
 * Safe JSON parser with type-safe fallback default.
 * Shields the application from SyntaxError when encountering corrupted or empty JSON text columns.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null && fallback !== null) {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function parseDish(row: Dish): ParsedDish {
  return {
    ...row,
    category: row.category as DishCategory,
    proteinType: (row.proteinType as ProteinType) || null,
    sourceType: row.sourceType as SourceType,
    recipeStatus: row.recipeStatus as RecipeStatus,
    aliases: safeJsonParse<string[]>(row.aliasesJson, []),
    ingredients: safeJsonParse<IngredientItem[]>(row.ingredientsJson, []),
    steps: safeJsonParse<string[]>(row.stepsJson, []),
  };
}

export function dishToInsert(dish: ParsedDish): NewDish {
  return {
    id: dish.id,
    name: dish.name,
    aliasesJson: JSON.stringify(dish.aliases ?? []),
    category: dish.category,
    proteinType: dish.proteinType ?? null,
    sourceType: dish.sourceType,
    sourceLabel: dish.sourceLabel ?? null,
    sourceUrl: dish.sourceUrl ?? null,
    recipeStatus: dish.recipeStatus,
    baseServings: dish.baseServings ?? 3,
    ingredientsJson: JSON.stringify(dish.ingredients ?? []),
    stepsJson: JSON.stringify(dish.steps ?? []),
    cookCount: dish.cookCount ?? 0,
    lastCookedDate: dish.lastCookedDate ?? null,
    createdAt: dish.createdAt || new Date().toISOString(),
  };
}

export function parseDailyMenu(row: DailyMenu): ParsedDailyMenu {
  return {
    date: row.date,
    servings: row.servings,
    contextMemo: row.contextMemo ?? null,
    slots: safeJsonParse<MealSlot[]>(row.slotsJson, []),
    parallelSteps: safeJsonParse<ParallelTimelineStep[] | null>(row.parallelStepsJson, null),
    shoppingState: safeJsonParse<ShoppingState | null>(row.shoppingStateJson, null),
    updatedAt: row.updatedAt,
  };
}

export function dailyMenuToInsert(menu: ParsedDailyMenu): NewDailyMenu {
  return {
    date: menu.date,
    servings: menu.servings ?? 3,
    contextMemo: menu.contextMemo ?? null,
    slotsJson: JSON.stringify(menu.slots ?? []),
    parallelStepsJson: menu.parallelSteps ? JSON.stringify(menu.parallelSteps) : null,
    shoppingStateJson: menu.shoppingState ? JSON.stringify(menu.shoppingState) : null,
    updatedAt: menu.updatedAt || new Date().toISOString(),
  };
}
