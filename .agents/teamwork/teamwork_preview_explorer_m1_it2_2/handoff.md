# Handoff Report: SQLite Database Schema & Seed Logic Hardening Strategy

**Agent**: `teamwork_preview_explorer_m1_it2_2`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m1_it2_2`  
**Project Root**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`  
**Date**: 2026-10-26T04:07:00Z  
**Parent Orchestrator Conversation ID**: `35a3dc7b-a199-49dc-b838-a1010ac73ac1`  
**Milestone**: M1 - Core Foundation & Database (Iteration 2 Retry)  
**Handoff Type**: Hard Handoff  

---

## 1. Observation

### 1.1 Bug A: Falsy Zero Coercion in `dishToInsert` and `dailyMenuToInsert`
- **File**: `src/db/schema.ts`
- **Lines**: 193 and 217
- **Verbatim Code**:
  ```typescript
  // Line 193 in dishToInsert():
  baseServings: dish.baseServings || 3,

  // Line 217 in dailyMenuToInsert():
  servings: menu.servings || 3,
  ```
- **Observed Behavior**:
  In JavaScript, `0` is falsy. If a caller specifies `baseServings: 0` (e.g. for leftover planning, custom non-portion recipes, or zero-portion calculations) or `servings: 0`, evaluating `0 || 3` returns `3`. The zero value is lost and overwritten with the default `3`.
- **Reference in Challenger 1 Test** (`tests/unit/adversarial_db_stress.test.ts:394-397`):
  ```typescript
  const converted = dishToInsert(parsedWithZero);
  // BUG DEMONSTRATION: Expected 0, but received 3 due to `|| 3` instead of `?? 3`
  expect(converted.baseServings).toBe(3);
  ```

### 1.2 Bug B: Unshielded `JSON.parse` Fragility in Domain Deserializers
- **File**: `src/db/schema.ts`
- **Lines**: 176–178 (`parseDish`) and 207–209 (`parseDailyMenu`)
- **Verbatim Code**:
  ```typescript
  // parseDish (lines 176-178):
  aliases: JSON.parse(row.aliasesJson || '[]'),
  ingredients: JSON.parse(row.ingredientsJson || '[]'),
  steps: JSON.parse(row.stepsJson || '[]'),

  // parseDailyMenu (lines 207-209):
  slots: JSON.parse(row.slotsJson || '[]'),
  parallelSteps: row.parallelStepsJson ? JSON.parse(row.parallelStepsJson) : null,
  shoppingState: row.shoppingStateJson ? JSON.parse(row.shoppingStateJson) : null,
  ```
- **Observed Behavior**:
  If corrupted, truncated, or malformed JSON is present in SQLite text columns (e.g. `INVALID_JSON{`, `NOT_JSON[`, `{bad_json`), `JSON.parse` throws an unhandled `SyntaxError: Unexpected token ... in JSON`, crashing caller API endpoints without a recovery boundary.
- **Reference in Challenger 1 Test** (`tests/unit/adversarial_db_stress.test.ts:475-476`):
  ```typescript
  // CRITICAL OBSERVATION: parseDish performs unshielded JSON.parse(), throwing SyntaxError
  expect(() => parseDish(rows[0])).toThrow(SyntaxError);
  ```

### 1.3 Bug C: Flawed Auto-Seed Condition Re-Seeding Sample Menus
- **File**: `src/db/index.ts`
- **Lines**: 105–113
- **Verbatim Code**:
  ```typescript
  // 2. Check if dishes or daily_menus table needs initial seeding
  const result = await client.execute('SELECT COUNT(*) as count FROM dishes;');
  const menuResult = await client.execute('SELECT COUNT(*) as count FROM daily_menus;');
  const count = Number(result.rows[0]?.count ?? 0);
  const menuCount = Number(menuResult.rows[0]?.count ?? 0);

  // 3. Auto-seed if brand new or incomplete database
  if (count === 0 || menuCount < 14) {
    await seedDatabase(db);
  }
  ```
- **Observed Behavior**:
  `menuCount < 14` evaluates to `true` whenever the user has fewer than 14 daily menus. On a fresh user database, for the entire first 13 days of using the application, every cold start, server reboot, or API request calling `ensureDatabaseInitialized()` triggers `seedDatabase(db)`, attempting to re-insert the 14 historical sample menus ending on `2026-10-26`.

### 1.4 Crucial Test Dependency in `tests/unit/adversarial_db_stress.test.ts`
- In `tests/unit/adversarial_db_stress.test.ts`, tests at line 396 and line 476 were written by Challenger 1 specifically to *demonstrate* the pre-fix vulnerabilities:
  - Line 396: `expect(converted.baseServings).toBe(3);`
  - Line 476: `expect(() => parseDish(rows[0])).toThrow(SyntaxError);`
- When Bug A and Bug B are fixed in `src/db/schema.ts`, `converted.baseServings` will be `0` (not `3`), and `parseDish(rows[0])` will return fallback empty arrays without throwing `SyntaxError`. Therefore, the implementer must update these two test assertions to verify the hardened behavior.

---

## 2. Logic Chain

1. **Remediating Bug A (Falsy Zero Preservation)**:
   - Observation 1.1 demonstrates that `dish.baseServings || 3` and `menu.servings || 3` treat numeric `0` as falsy.
   - In ECMAScript 2020+, the nullish coalescing operator `??` checks only for `null` and `undefined`, preserving `0`, `""`, and `false`.
   - Replacing `|| 3` with `?? 3` in both `dishToInsert` and `dailyMenuToInsert` ensures that legitimate `0` portions are preserved, while `null` or `undefined` default to standard 3 servings.
   - Furthermore, applying `??` to `dish.cookCount ?? 0`, `dish.aliases ?? []`, `dish.ingredients ?? []`, and `menu.slots ?? []` guards against undefined fields without falsy coercion.

2. **Remediating Bug B (Shielded JSON Deserialization)**:
   - Observation 1.2 shows that `JSON.parse` crashes with `SyntaxError` on malformed inputs.
   - Implementing an exported helper `safeJsonParse<T>(raw: string | null | undefined, fallback: T): T` provides:
     - Nullish/empty string checks returning `fallback` immediately.
     - `try { return JSON.parse(trimmed) as T; } catch { return fallback; }` preventing `SyntaxError` bubbles.
     - Normalization for JSON literal `"null"`: if `parsed === null && fallback !== null`, return `fallback`.
   - Applying `safeJsonParse` across `parseDish` (aliases, ingredients, steps) and `parseDailyMenu` (slots, parallelSteps, shoppingState) shields API routes and background workers from crashes due to corrupt or unexpected SQLite text column data.

3. **Remediating Bug C (Eliminating Spurious Auto-Seed)**:
   - Observation 1.3 shows that checking `menuCount < 14` causes recurring seeding for any user with fewer than 14 menus.
   - Initial database initialization only needs to seed when the database has no dishes registered: `dishCount === 0`.
   - When a fresh SQLite file is initialized, `dishes` has 0 rows (`dishCount === 0`), triggering `seedDatabase(db)` once.
   - `seedDatabase(db)` populates 13 catalog dishes (`SEED_DISHES`), 14 sample menus (`SEED_MENUS`), and 17 staple items.
   - On all subsequent server boots or route calls, `dishCount` is $\ge 13$, so `dishCount === 0` evaluates to `false`, preventing re-seeding.
   - Eliminating the redundant `SELECT COUNT(*) FROM daily_menus` query reduces startup database round-trips.

4. **Aligning Adversarial Stress Tests**:
   - Because Challenger 1 configured `adversarial_db_stress.test.ts` lines 396 and 476 to assert the existence of the flaws, fixing the code without updating the test assertions would cause test failures.
   - Updating the assertions to expect `converted.baseServings === 0` and `expect(() => parseDish(rows[0])).not.toThrow()` verifies that the fixes successfully prevent regression and crash scenarios.

---

## 3. Caveats

1. **Read-Only Explorer Constraint**:
   - As an explorer agent, no modifications were made directly to `src/db/schema.ts`, `src/db/index.ts`, or `tests/`.
   - Full proposed replacement files have been generated as artifacts in this agent's folder:
     - `proposed_schema.ts`
     - `proposed_index.ts`
     - `schema_and_index.patch`
2. **Middleware / Auth Test Scope**:
   - The test failures observed in `tests/unit/adversarial-auth.test.ts` pertain to `src/middleware.ts` and `src/app/api/auth/verify/route.ts` (Finding 1, Finding 2, Finding 3 of Reviewer 2). That is handled by peer worker `teamwork_preview_worker_m1_it2_1`. The database schema and index fixes are completely decoupled from middleware routing.

---

## 4. Conclusion

The SQLite database layer is hardened by applying the following concrete changes:
1. Replace `|| 3` with `?? 3` in `dishToInsert` and `dailyMenuToInsert`.
2. Add exported `safeJsonParse<T>` helper to `src/db/schema.ts` and use it in `parseDish` and `parseDailyMenu`.
3. In `src/db/index.ts`, query only `dishes` and seed strictly when `dishCount === 0`.
4. Update `tests/unit/adversarial_db_stress.test.ts` to assert that zero portions are preserved and corrupted JSON does not throw.

### 4.1 Complete Replacement Code: `src/db/schema.ts`

```typescript
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
```

---

### 4.2 Complete Replacement Code: `src/db/index.ts`

```typescript
// ============================================================================
// Kazoku-Kondate Database Client & Connection: src/db/index.ts
// Framework: LibSQL Client + Drizzle ORM
// Features: Hot-reload singleton, lazy initialization, auto-migration DDL fallback
// Hardened: Seed trigger restricted strictly to dishCount === 0
// ============================================================================
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { seedDatabase } from './seed';

// ----------------------------------------------------------------------------
// 1. Connection Singleton (Next.js Hot Reload Safe)
// ----------------------------------------------------------------------------

const globalForDb = globalThis as unknown as {
  libsqlClient: Client | undefined;
  drizzleDb: LibSQLDatabase<typeof schema> | undefined;
  dbInitPromise: Promise<void> | undefined;
};

const databaseUrl = process.env.DATABASE_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

export const client: Client =
  globalForDb.libsqlClient ??
  createClient({
    url: databaseUrl,
    authToken: authToken,
  });

export const db: LibSQLDatabase<typeof schema> =
  globalForDb.drizzleDb ??
  drizzle(client, { schema });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.libsqlClient = client;
  globalForDb.drizzleDb = db;
}

// ----------------------------------------------------------------------------
// 2. Automatic Schema Creation & Seed Fallback
// ----------------------------------------------------------------------------

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS dishes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    aliases_json TEXT NOT NULL,
    category TEXT NOT NULL,
    protein_type TEXT,
    source_type TEXT NOT NULL,
    source_label TEXT,
    source_url TEXT,
    recipe_status TEXT NOT NULL,
    base_servings INTEGER NOT NULL DEFAULT 3,
    ingredients_json TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    cook_count INTEGER NOT NULL DEFAULT 0,
    last_cooked_date TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS daily_menus (
    date TEXT PRIMARY KEY,
    servings INTEGER NOT NULL DEFAULT 3,
    context_memo TEXT,
    slots_json TEXT NOT NULL,
    parallel_steps_json TEXT,
    shopping_state_json TEXT,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_dishes_category ON dishes(category);`,
  `CREATE INDEX IF NOT EXISTS idx_dishes_protein ON dishes(protein_type);`,
  `CREATE INDEX IF NOT EXISTS idx_dishes_cook_count ON dishes(cook_count);`,
  `CREATE INDEX IF NOT EXISTS idx_daily_menus_date ON daily_menus(date);`,
];

/**
 * Initializes database tables and applies default seed data if database is empty.
 * Idempotent and concurrency-safe across multiple concurrent API route requests.
 */
export async function ensureDatabaseInitialized(): Promise<void> {
  if (globalForDb.dbInitPromise) {
    return globalForDb.dbInitPromise;
  }

  globalForDb.dbInitPromise = (async () => {
    // Set busy timeout and WAL mode for concurrent access robustness
    try {
      await client.execute('PRAGMA busy_timeout = 5000;');
      await client.execute('PRAGMA journal_mode = WAL;');
    } catch {
      // Ignored if memory or unsupported
    }

    // 1. Create tables and indices
    for (const statement of DDL_STATEMENTS) {
      await client.execute(statement);
    }

    // 2. Check if dishes table needs initial seeding
    const result = await client.execute('SELECT COUNT(*) as count FROM dishes;');
    const dishCount = Number(result.rows[0]?.count ?? 0);

    // 3. Auto-seed strictly on brand new, empty database (prevent spurious re-seeding)
    if (dishCount === 0) {
      await seedDatabase(db);
    }
  })();

  return globalForDb.dbInitPromise;
}

export default db;
```

---

### 4.3 Required Test Adjustments in `tests/unit/adversarial_db_stress.test.ts`

When applying these fixes, update `tests/unit/adversarial_db_stress.test.ts`:

1. **Lines 394–397 (Falsy Zero Assertion)**:
   ```typescript
   // Before:
   const converted = dishToInsert(parsedWithZero);
   // BUG DEMONSTRATION: Expected 0, but received 3 due to `|| 3` instead of `?? 3`
   expect(converted.baseServings).toBe(3);

   // After:
   const converted = dishToInsert(parsedWithZero);
   // VERIFIED FIX: Falsy zero is preserved (0 instead of coerced 3)
   expect(converted.baseServings).toBe(0);
   ```

2. **Lines 475–477 (Corrupted JSON Assertion)**:
   ```typescript
   // Before:
   // CRITICAL OBSERVATION: parseDish performs unshielded JSON.parse(), throwing SyntaxError
   expect(() => parseDish(rows[0])).toThrow(SyntaxError);

   // After:
   // VERIFIED FIX: parseDish safely falls back to defaults without throwing SyntaxError
   const parsed = parseDish(rows[0]);
   expect(parsed.aliases).toEqual([]);
   expect(parsed.ingredients).toEqual([]);
   expect(parsed.steps).toEqual([]);
   ```

---

## 5. Verification Method

To independently verify the hardened database layer once applied:

1. **Inspect Schema & Index Diff**:
   ```powershell
   git diff src/db/schema.ts src/db/index.ts
   ```
   Verify that:
   - `dish.baseServings ?? 3` and `menu.servings ?? 3` are present.
   - `safeJsonParse` is implemented and used for all JSON deserialization.
   - Auto-seed condition is strictly `if (dishCount === 0)`.

2. **Run DB Unit Tests & Adversarial Stress Suite**:
   ```powershell
   npx vitest run tests/unit/db.test.ts tests/unit/adversarial_db_stress.test.ts
   ```
   *Expected Result*: All 23 tests pass cleanly. Zero syntax errors, zero concurrency deadlocks, and zero falsy zero coercions.

3. **Verify Next.js Production Build**:
   ```powershell
   npm run build
   ```
   *Expected Result*: Exit code `0` with zero TypeScript compilation errors.
