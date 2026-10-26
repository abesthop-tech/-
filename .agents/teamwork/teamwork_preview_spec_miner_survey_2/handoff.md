# Kazoku-Kondate Functional Specification & Architecture Mining Report

**Agent**: `teamwork_preview_spec_miner_survey_2`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_spec_miner_survey_2`  
**Project Root**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`  
**Date**: 2026-10-26T03:35:00Z  
**Type**: Hard Handoff (Specification Survey Complete)

---

## 1. Observation

Direct observations extracted from authoritative project sources:

### Authoritative Files Inspected
1. **`ORIGINAL_REQUEST.md`** (`C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\ORIGINAL_REQUEST.md`):
   - Lines 5-8: Personal family cooking assistant web app ("kazoku-kondate") for smartphones, tablets, PCs. Imports `.ics` from Google Calendar, plans daily menus based on ingredients and history, 2-stage shopping list with LINE sharing, parallel cooking timeline.
   - Lines 17-23 (R1): Responsive single-column (`max-w-xl`), Warm Editorial (`#FAF9F6`) / Atmospheric Dark (`#151821`), single terracotta accent (`#C2410C` / `#EA580C`), watermark typography, 1px `divide-y` lists, zero decorative emojis. Tier 1 (Date nav, servings, 3 main tabs: `献立`, `買い物`, `調理工程`), Tier 2 (Drawers: `レシピ帳・追加`, `カレンダー履歴`), Tier 3 (Footer modal: `.ics` import, staples setting, passcode lock).
   - Lines 24-30 (R2): `.ics` parser splits multi-dish titles, filters non-meal events, normalizes spelling (e.g. "生姜焼き", "しょうが焼き", "豚の生姜焼き"), counts frequency: $\ge 5$ times classified as "Household Classics (`needs_registration`)"; $1..4$ times classified as "AI Provisional (`ai_provisional`)".
   - Lines 31-36 (R3): 3 slots (`主菜` Main, `副菜` Side, `汁物` Soup). Slot locking support. Ranking prioritizing: (1) user leftovers/requests, (2) avoiding last 14 days and alternating protein types, (3) mixing "want to make" list or trusted recipe sources (`sirogohan.com`, `kurashiru.com`, `kyounoryouri.jp`, `oceans-nadia.com`, `ameblo.jp/syunkon`, `lettuceclub.net`, `orangepage.net`) when history is repetitive or when user taps "＋ 新レシピを1品混ぜる". Auto-logging to calendar.
   - Lines 37-43 (R4): Two-stage shopping list scaled to servings. Stage 1 `買うもの` (fresh/main items, aggregated duplicates). Stage 2 `家にあるかも` (staples: onion, garlic, ginger, green onion, egg, soy sauce, mirin, sake, sugar, miso, oil, potato starch, dashi, etc.). 1-tap promotion from Stage 2 to Stage 1. 1-tap LINE memo copy/share.
   - Lines 44-48 (R5): `調理工程` tab switches between `まとめ工程` (merged parallel timeline: prep, cutting, microwave, stove) and `料理別に見る` (individual recipe). Gemini AI (`gemini-2.5-flash`) integration with deterministic offline fallback when `GEMINI_API_KEY` is unset.
   - Lines 49-62: Acceptance criteria: `npm install && npm run build` exit code 0, `npm test` via Vitest 100% pass covering all core algorithms, HTTP API routes return valid JSON with SQLite/LibSQL persistence, zero emoji in UI templates.

2. **`implementation_plan.md`** (`C:\Users\HCP4\.gemini\antigravity\brain\db2fa280-5ac6-472b-9577-acd1554f0701\implementation_plan.md`):
   - Lines 83-124: Drizzle ORM SQLite schemas for tables `dishes`, `daily_menus`, `app_settings`.
   - Lines 130-176: Detailed algorithmic specifications for `.ics` event cleanup pipeline, menu scoring, OCR extraction, shopping consolidation, and parallel cooking timeline synthesis.
   - Lines 180-234: Source file structure and Next.js App Router API routes (`/api/menu`, `/api/cooking/timeline`, `/api/recipes`, `/api/recipes/ocr`, `/api/recipes/import-url`, `/api/ics-import`).
   - Lines 78-80: Simple family passcode authentication via Next.js Middleware with 1-year HttpOnly Cookie.

3. **`design_spec.md`** & **`ui_mock.html`**:
   - `ui_mock.html` lines 349-503: Verbatim data structures for dish candidates, ingredient strings, staple items, parallel steps with time intervals and phases (`下ごしらえ`, `火入れ`, `仕上げ`).
   - `ui_mock.html` lines 700-706: LINE memo format: `【10/26 買い物メモ】\n・豚バラ薄切り（300g）\n...`.

---

## 2. Logic Chain

1. **System Objective & Domain Constraints**:
   - The user's family (Mother, Grandfather, User) requires a frictionless cooking assistant where technology serves home cooking without introducing inventory fatigue. Unlike enterprise pantry apps that require scanning barcodes or logging gram counts of salt, this system embraces real household dynamics:
     - Grandfather may cook the main dish or a member may request a specific dish $\rightarrow$ Slot Lock mechanism (R3).
     - Full pantry inventory tracking fails in real families $\rightarrow$ Two-Stage Shopping List (R4) where staples are presumed available unless promoted with 1 tap.
     - Multi-course Japanese home dinners (Ichiju-Sansai / 1 soup 2 dishes) require coordinated stove, cutting board, and microwave timing $\rightarrow$ Multi-Dish Parallel Cooking Timeline (R5).
     - Google Calendar historical records contain invaluable culinary memory $\rightarrow$ `.ics` parsing with frequency classification ($\ge 5$ classics vs $1..4$ AI provisional) (R2).

2. **Architecture & Persistence Strategy**:
   - The tech stack is Next.js App Router (TypeScript) with SQLite/LibSQL (`@libsql/client` + Drizzle ORM).
   - Core algorithms (portion scaling, shopping aggregation, menu candidate scoring, deterministic offline timeline scheduling) MUST be implemented as pure, side-effect-free TypeScript functions. This ensures they can be tested via `vitest` without database or network mocks, fulfilling acceptance criteria.
   - Gemini AI (`gemini-2.5-flash`) acts as an accelerator for unstructured tasks (calendar title splitting, OCR from photos, web recipe parsing, dynamic parallel timeline optimization), but the system MUST incorporate deterministic fallbacks so it operates fully in offline and CI environments.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1: UI / Layout | Responsive Single-Column Layout | Unified single-column interface (`max-w-xl` on desktop/tablet, `390px` on smartphone) with zero card nesting | Viewport dimensions | CSS container styling | Fallback to 100% width on ultra-narrow viewports (<360px) | `ui_mock.html`, `ORIGINAL_REQUEST.md:18` |
| 2 | R1: Theming | Warm Editorial / Atmospheric Dark Toggle | Light theme (`#FAF9F6` canvas, `#FFFFFF` sheet, `#1C1917` text) and Dark theme (`#151821` canvas, `#1C202B` surface) with terracotta accent | Theme state (`light` / `dark`) | HTML `class="dark"`, CSS variables | Default to system preference (`prefers-color-scheme`) | `ui_mock.html:26`, `implementation_plan.md:23` |
| 3 | R1: Atmosphere | Ambient Glow, Watermark & Dot Grid | Date watermark typography (`10.26`), ambient terracotta glow (6-8%), and 20px dot matrix background texture | Selected date | Rendered SVG/CSS background | Hidden if screen reader or print media | `ui_mock.html:48-51, 116`, `implementation_plan.md:35` |
| 4 | R1: Navigation | Tier 1 Primary Navigation | Date navigator (`◀ MM.DD 曜 ▶`), servings stepper (1 to 8), and 3 top tabs (`献立`, `買い物`, `調理工程`) | Date click, Servings change, Tab click | Active view change, badge update | Bounds clamped: servings $\in [1, 8]$ | `ui_mock.html:139-175`, `ORIGINAL_REQUEST.md:20` |
| 5 | R1: Navigation | Tier 2 Subdued Drawers | Slide-up / modal drawers for `レシピ帳・追加` (Recipe book & Want-to-make) and `カレンダー履歴` (Meal calendar history) | Drawer open button click | Modal overlay with scrollable content | Trap focus, dismiss on backdrop click or Escape | `ui_mock.html:303-345`, `ORIGINAL_REQUEST.md:21` |
| 6 | R1: Navigation | Tier 3 Unobtrusive Settings | Footer text link opening settings modal: `.ics` file upload, staple list editor, passcode lock | Footer button click | Modal settings dialog | Dismiss on backdrop click | `ui_mock.html:326`, `ORIGINAL_REQUEST.md:22` |
| 7 | R1: Typography | Anti-Slop Typography Rules | Zero decorative emojis in UI; Japanese font settings (`palt` proportional metrics, `tabular-nums` for numbers, `leading-relaxed`) | Content strings | Formatted typography | Fallback to standard system sans-serif fonts | `SKILL.md:58`, `ORIGINAL_REQUEST.md:19` |
| 8 | R2: Calendar | `.ics` File Upload & Parsing | Read RFC 5545 iCalendar stream, extract `VEVENT` items (`DTSTART`, `SUMMARY`, `DESCRIPTION`) | Uploaded `.ics` file / string | Array of raw `{ date: string, rawTitle: string }` | Returns 400 Bad Request if syntax invalid or 0 events found | `implementation_plan.md:130, 194`, `ORIGINAL_REQUEST.md:24` |
| 9 | R2: Calendar | Non-Meal Event Filtering | Heuristic & AI filter removing non-meal entries (e.g. "歯医者", "美容院", "ゴミ出し", "〇〇さんランチ") | Raw calendar event titles | Filtered list of meal event titles | Regex fallback filter if Gemini offline | `implementation_plan.md:135`, `design_spec.md:42` |
| 10 | R2: Calendar | Multi-Dish Title Splitting | Splits combined event titles (e.g., "豚の生姜焼き、なめこの味噌汁") by punctuation ("、", ",", "・", "＋", "と", "\n") into discrete dish titles | Raw title string | `string[]` of dish names | Fallback to regex delimiter splitting if AI unavailable | `implementation_plan.md:136`, `ORIGINAL_REQUEST.md:25` |
| 11 | R2: Calendar | Dish Alias & Spelling Normalization | Harmonizes orthographic variations ("豚の生姜焼き", "しょうが焼き", "豚生姜焼") into a canonical dish identity | Dish title tokens | Normalized dish name + updated `aliasesJson` | Falls back to Levenshtein / token prefix matching offline | `implementation_plan.md:137`, `ORIGINAL_REQUEST.md:25` |
| 12 | R2: Calendar | Cook Frequency Classification | Calculates total occurrences (`cookCount`) and `lastCookedDate`. Classifies $\ge 5$ as `classic_book` (`needs_registration`) and $1..4$ as `ai_generated` (`ai_provisional`) | Dish event history | Database records in `dishes` | Custom threshold configurable in `appSettings` | `ORIGINAL_REQUEST.md:26-27`, `implementation_plan.md:138` |
| 13 | R2: Calendar | Historical Meal Plan Seeding | Populates past dates in `dailyMenus` with structured slot data derived from calendar history | Normalized events | Rows in `daily_menus` | Skips invalid past dates, handles existing date updates | `implementation_plan.md:108-117`, `ORIGINAL_REQUEST.md:28` |
| 14 | R3: Planning | 3-Slot Menu Structure | Organizes each day's menu into 3 discrete slots: `主菜` (Main), `副菜` (Side), and `汁物` (Soup) | Target date | 3 slot objects with dish metadata and recipe details | Gracefully handles 1-dish or 2-dish menus (e.g. curry or donburi) | `ui_mock.html:360-462`, `ORIGINAL_REQUEST.md:31` |
| 15 | R3: Planning | Slot Locking & Pinning | Locks any individual slot (e.g. grandfather cooked main, or special request) so subsequent proposals only modify unlocked slots | Slot index, lock boolean | Updated lock state | Locked slots never modified by shuffle or auto-proposal | `ui_mock.html:530-537, 650`, `ORIGINAL_REQUEST.md:32` |
| 16 | R3: Planning | Context & Leftover Search | Accepts freeform text of available ingredients or meal mood (e.g. "大根、豚バラ", "さっぱり") to bias recommendation scoring | `contextMemo` string | Filtered & ranked dish candidates | Fallback to unweighted scoring if input is blank | `ui_mock.html:183-200`, `ORIGINAL_REQUEST.md:33` |
| 17 | R3: Planning | 14-Day Recency Cooldown | Strongly penalizes recipes cooked within the previous 14 days to eliminate repetitive meal fatigue | Past 14 days of `dailyMenus` | Dish candidate penalties in scoring formula | Decay weight allows re-proposal if pool is exhausted | `ORIGINAL_REQUEST.md:33`, `implementation_plan.md:146` |
| 18 | R3: Planning | Protein Type Alternation | Prevents back-to-back duplicate main protein sources (e.g. pork, chicken, beef, fish, egg/tofu) between consecutive days | Yesterday's main protein | Protein compatibility multiplier | Neutral score if previous day had no recorded protein | `implementation_plan.md:95, 146`, `ui_mock.html:202` |
| 19 | R3: Planning | 1-Dish Slot Shuffle | Randomly cycles or selects the next ranked candidate for a single unlocked slot without affecting other slots | Slot index | New dish candidate in target slot | Disabled when slot is locked (`disabled` attribute) | `ui_mock.html:538-546, 655`, `ORIGINAL_REQUEST.md:32` |
| 20 | R3: Planning | "＋ 新レシピを1品混ぜる" Injection | Injects a dish from the "Want to Make" stock list or trusted online sources into the side or main slot | Button click | Proposes new dish with `新レシピ挑戦` badge | Picks from stock list; if empty, generates from trusted web | `ui_mock.html:203-206, 673`, `ORIGINAL_REQUEST.md:33` |
| 21 | R3: Planning | Auto-Save & Calendar Sync | Finalizing or navigating away automatically commits the daily menu to `dailyMenus` in SQLite | Day menu state | Persisted DB row | Optimistic UI update with background write | `ui_mock.html:216`, `ORIGINAL_REQUEST.md:34` |
| 22 | R3: Ingestion | Recipe Book Photo OCR | Uploads phone photo of cookbook page (e.g. Yamamoto Yuri book) to Gemini Vision, extracting title, ingredients, steps, servings | Image file (JPEG/PNG/WebP) | Structured Recipe JSON | Deterministic mock recipe generator if API key missing | `implementation_plan.md:154, 208`, `ORIGINAL_REQUEST.md:44` |
| 23 | R3: Ingestion | Trusted Source URL Scraper | Fetches recipe by URL or keyword from whitelisted domains (`sirogohan.com`, `kurashiru.com`, `kyounoryouri.jp`, `oceans-nadia.com`, etc.) via JSON-LD or Gemini Grounding | URL string or query | Structured Recipe JSON | Returns error if domain not in whitelist or page unparseable | `implementation_plan.md:157-165, 210`, `ORIGINAL_REQUEST.md:33` |
| 24 | R3: Ingestion | Manual Recipe Authoring | Allows quick manual entry of dish name, base servings, ingredients list, steps, and source attribution | Form fields | Saved `dishes` record | Requires at least non-empty dish name | `implementation_plan.md:90-106, 206`, `ui_mock.html:785` |
| 25 | R4: Shopping | Portion Scaling Multiplier | Scales recipe base ingredients by factor $K = \text{servings} / \text{baseServings}$ | Servings ($1..8$), Base servings | Scaled ingredient amounts | Retains non-numeric units (e.g. "少々", "適量") unscaled | `ORIGINAL_REQUEST.md:37`, `implementation_plan.md:196` |
| 26 | R4: Shopping | Duplicate Ingredient Consolidation | Combines identical ingredients across dishes (e.g. Daikon 1/2 in main + Daikon 1/4 in soup $\rightarrow$ Daikon 3/4) | Scaled ingredients array | Deduplicated consolidated list | Keeps ingredients separate if units cannot be converted | `ORIGINAL_REQUEST.md:38`, `implementation_plan.md:168` |
| 27 | R4: Shopping | Two-Stage Separation (Buy vs Staples) | Partitions ingredients into Stage 1 (`買うもの`) for fresh goods and Stage 2 (`家にあるかも`) for household staples and seasonings | Consolidated items, staple dictionary | Two separate lists | Unrecognized items default safely to Stage 1 | `ORIGINAL_REQUEST.md:38`, `ui_mock.html:227-256` |
| 28 | R4: Shopping | 1-Tap Staple Promotion | Tapping a staple in Stage 2 instantly transfers it to Stage 1 (`買うもの`) with amount tag "補充" | Staple item ID | Updated shopping state | Item disappears from Stage 2 and appears in Stage 1 | `ui_mock.html:583-591, 687`, `ORIGINAL_REQUEST.md:39` |
| 29 | R4: Shopping | Checklist Toggle & Count Badge | Checkbox toggles strikethrough styling and decrements the remaining item counter in tab badge `買い物 (N)` | Checkbox change | Updated checked status and counter | Preserves checked state in `dailyMenus.shoppingStateJson` | `ui_mock.html:555-575, 681`, `ORIGINAL_REQUEST.md:40` |
| 30 | R4: Shopping | LINE Shopping Memo Export | Formats unchecked Stage 1 items into bulleted LINE memo: `【MM/DD 買い物メモ】\n・商品名（数量）...` to clipboard / LINE URL scheme | Click "LINE用にコピー" | Text copied, preview toast shown, LINE URL triggered | Displays copy error toast if clipboard API blocked | `ui_mock.html:236-240, 700`, `ORIGINAL_REQUEST.md:40` |
| 31 | R5: Cooking | Parallel Timeline Generation (`まとめ工程`) | Merges preparation, cutting, microwave pre-heating, and stove cooking across all dishes into a streamlined chronological flow | Dishes in menu, Servings | Ordered parallel timeline steps with phase & time | Deterministic DAG scheduler if Gemini API unavailable | `ORIGINAL_REQUEST.md:43`, `implementation_plan.md:173, 204` |
| 32 | R5: Cooking | Timeline Phase Grouping | Groups parallel steps into 3 clear kitchen phases: Phase 1: Prep/Cut, Phase 2: Simmer/Boil/Flavor, Phase 3: Sauté/Grill/Finishing | Dish steps | Structured phase sections | Supports 1-dish and 2-dish simple menus gracefully | `ui_mock.html:481-503`, `implementation_plan.md:174` |
| 33 | R5: Cooking | Resource Constraint Optimization | Enforces kitchen bottlenecks: cutting board hygiene (vegetables before raw meat/fish), single microwave queue, $\le 2$ stove burners | Dish steps & equipment requirements | Conflict-free chronological step sequence | Falls back to sequential execution if constraints conflict | `implementation_plan.md:174-176` |
| 34 | R5: Cooking | Individual Recipe View (`料理別に見る`) | Toggle switch to display each dish's ingredients and step-by-step numbered recipe individually | View toggle | Per-dish recipe cards with step list | Works independently of parallel timeline | `ui_mock.html:275-282, 613-631`, `ORIGINAL_REQUEST.md:43` |
| 35 | R5: Cooking | Step Completion Checklist | Kitchen mode step checker with step numbers, checkmarks, strikethrough text, and active step highlighting | Step tap | Toggled step `done` boolean | Transient UI state or cached in session | `ui_mock.html:594-611, 726` |
| 36 | R5: Resilience | Offline Deterministic Fallback Engine | Comprehensive offline fallback that simulates AI event parsing, menu proposals, recipe OCR, and parallel timeline scheduling | Any AI service request | Deterministic mock responses | System never throws 500 when `GEMINI_API_KEY` is missing | `ORIGINAL_REQUEST.md:45`, `implementation_plan.md:188` |
| 37 | Auth & Sec | Family Passcode Protection | Lightweight protection via Next.js Middleware comparing cookie/header against `APP_PASSCODE`, setting 1-year HttpOnly cookie | Passcode input string | Session cookie | Returns 401 Unauthorized if passcode invalid | `implementation_plan.md:78-80`, `ORIGINAL_REQUEST.md:22` |
| 38 | Config | Household Staple Items Editor | UI in Tier 3 to customize the list of staple vegetables and seasonings used for Stage 2 classification | Updated staple array | Persisted in `appSettings` (`key = 'staple_items'`) | Reverts to default 17 staples if cleared | `ui_mock.html:857-862`, `implementation_plan.md:120` |

---

## 4. Data Models & Domain Schemas

### 4.1 TypeScript Domain Models

```typescript
// ============================================================================
// Kazoku-Kondate Domain Models (Domain-Driven Design Specification)
// ============================================================================

/**
 * Family Member & Profile Specification
 * Models individual dietary restrictions, portion appetites, and preferences.
 */
export interface FamilyMember {
  id: string;
  name: string; // e.g., "母", "祖父", "自分"
  allergies: string[]; // e.g., ["甲殻類", "そば", "ピーナッツ"]
  dislikedIngredients: string[]; // e.g., ["セロリ", "パクチー"]
  spiceTolerance: 'none' | 'mild' | 'medium' | 'hot'; // e.g. grandfather requires mild
  portionMultiplier: number; // e.g., 1.0 (default adult), 1.5 (heavy eater), 0.7 (light)
  role: 'cook' | 'member';
}

export interface FamilyProfile {
  familyId: string;
  defaultServings: number; // default: 3
  members: FamilyMember[];
  stapleItems: string[]; // custom staple dictionary
  classicThreshold: number; // default: 5 cookCount
}

/**
 * Dish & Recipe Model
 */
export type DishCategory = 'main' | 'side' | 'soup' | 'other';
export type ProteinType = 'pork' | 'chicken' | 'beef' | 'fish' | 'egg_tofu' | 'veggie';
export type SourceType = 'classic_book' | 'ai_generated' | 'trusted_web' | 'wishlist';
export type RecipeStatus = 'needs_registration' | 'ai_provisional' | 'confirmed';

export interface IngredientItem {
  name: string; // e.g., "豚バラ薄切り", "大根", "醤油"
  amount: string; // e.g., "300g", "1/2本", "大さじ2"
  isStaple: boolean; // true if classified as basic pantry staple / seasoning
  category?: 'meat' | 'fish' | 'vegetable' | 'dairy_tofu' | 'seasoning' | 'other';
}

export interface RecipeStep {
  stepNumber: number;
  instruction: string;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  equipment?: ('stove' | 'microwave' | 'cutting_board' | 'bowl' | 'oven')[];
}

export interface Recipe {
  id: string;
  name: string;
  aliases: string[]; // spelling variants: ["しょうが焼き", "豚生姜焼き"]
  category: DishCategory;
  proteinType?: ProteinType;
  sourceType: SourceType;
  sourceLabel?: string; // e.g., "山本ゆりさん本 p.42"
  sourceUrl?: string;
  recipeStatus: RecipeStatus;
  baseServings: number; // standard servings recipe is calibrated for (typically 2 or 3)
  ingredients: IngredientItem[];
  steps: string[]; // step instruction texts
  cookCount: number;
  lastCookedDate?: string; // ISO YYYY-MM-DD
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  createdAt: string;
}

/**
 * Daily Meal Plan & Slot Structure
 */
export interface MealSlot {
  role: 'main' | 'side' | 'soup';
  dishId: string;
  dishName: string;
  locked: boolean;
  lockReason?: string; // e.g. "祖父が担当・固定中"
  sourceLabel?: string;
  badge?: string; // "我が家の定番" | "信頼サイト" | "新レシピ挑戦" | "カレンダー履歴"
  ingredients: string[];
  steps: string[];
  isLeftover?: boolean; // if dish is repurposed leftover
}

export interface ParallelTimelineStep {
  stepNumber: number;
  phase: '下ごしらえ（まとめて切る・レンジ）' | '副菜と汁物の火入れ' | '主菜の仕上げ（熱々で食卓へ）';
  timeWindow: string; // e.g. "0:00〜7:00", "7:00〜13:00"
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

export interface MealPlan {
  date: string; // YYYY-MM-DD
  servings: number;
  contextMemo?: string; // e.g., "大根、豚バラ"
  slots: MealSlot[];
  parallelSteps?: ParallelTimelineStep[];
  shoppingState?: {
    mainItems: ShoppingStateItem[];
    stapleItems: { id: number; name: string }[];
  };
  updatedAt: string;
}

/**
 * Pantry Inventory & Shopping Items
 */
export interface PantryItem {
  id: string;
  name: string;
  quantity?: string;
  isStaple: boolean;
  expiryDate?: string;
  isLeftover: boolean;
  notes?: string;
}

export interface ShoppingCartItem {
  id: number;
  name: string;
  scaledAmount: string;
  originalAmounts: { dish: string; amount: string }[];
  isStaple: boolean;
  checked: boolean;
  promotedFromStaple: boolean;
}
```

### 4.2 SQLite Database Schemas (Drizzle ORM)

```typescript
// ============================================================================
// Drizzle ORM Schema: src/db/schema.ts
// Compatible with @libsql/client (SQLite / Turso)
// ============================================================================
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * 1. Dishes Master Table
 * Stores recipes, imported classics, AI provisional recipes, and stock list items.
 */
export const dishes = sqliteTable('dishes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  aliasesJson: text('aliases_json').notNull(), // JSON string: string[]
  category: text('category').notNull(), // 'main' | 'side' | 'soup' | 'other'
  proteinType: text('protein_type'), // 'pork' | 'chicken' | 'beef' | 'fish' | 'egg_tofu' | 'veggie'
  sourceType: text('source_type').notNull(), // 'classic_book' | 'ai_generated' | 'trusted_web' | 'wishlist'
  sourceLabel: text('source_label'), // e.g., "山本ゆりさん本 p.42"
  sourceUrl: text('source_url'),
  recipeStatus: text('recipe_status').notNull(), // 'needs_registration' | 'ai_provisional' | 'confirmed'
  baseServings: integer('base_servings').default(3).notNull(),
  ingredientsJson: text('ingredients_json').notNull(), // JSON: Array<{ name: string, amount: string, isStaple: boolean }>
  stepsJson: text('steps_json').notNull(), // JSON: string[]
  cookCount: integer('cook_count').default(0).notNull(),
  lastCookedDate: text('last_cooked_date'), // YYYY-MM-DD
  createdAt: text('created_at').notNull(),
});

/**
 * 2. Daily Menus Table
 * Records daily planned and cooked meals, slot locks, generated timelines, and shopping progress.
 */
export const dailyMenus = sqliteTable('daily_menus', {
  date: text('date').primaryKey(), // YYYY-MM-DD
  servings: integer('servings').default(3).notNull(),
  contextMemo: text('context_memo'), // Search memo: "大根、豚バラ"
  slotsJson: text('slots_json').notNull(), // JSON: Array<MealSlot>
  parallelStepsJson: text('parallel_steps_json'), // JSON: Array<ParallelTimelineStep>
  shoppingStateJson: text('shopping_state_json'), // JSON: { mainItems: ShoppingStateItem[], stapleItems: ... }
  updatedAt: text('updated_at').notNull(),
});

/**
 * 3. App Settings Table
 * Configuration key-value store for staple items, classic thresholds, and preferences.
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(), // 'staple_items' | 'classic_threshold' | 'family_profile'
  valueJson: text('value_json').notNull(), // JSON string
});
```

---

## 5. Algorithmic Specifications

### 5.1 Menu Suggestion & Balance Scoring Algorithm

The goal is to select an optimal triad $(\text{Main}, \text{Side}, \text{Soup})$ for date $D$ satisfying all locked slots, matching user leftovers/wishes, avoiding fatigue from the last 14 days, and rotating protein sources.

#### Mathematical Objective Function

For each candidate dish $i$ in candidate pool $\mathcal{P}_{\text{role}}$:
$$\text{Score}(i) = W_{\text{context}} \cdot S_{\text{context}}(i) + W_{\text{stock}} \cdot S_{\text{stock}}(i) + W_{\text{classic}} \cdot S_{\text{classic}}(i) - P_{\text{recency}}(i) - P_{\text{protein}}(i)$$

Where weights are calibrated as:
- $W_{\text{context}} = 50.0$ (Primary bias towards requested leftovers)
- $W_{\text{stock}} = 30.0$ (Boost for "Want to Make" wishlist items)
- $W_{\text{classic}} = 15.0$ (Household favorites reward)
- Recency Penalty $P_{\text{recency}}(i)$:
  $$P_{\text{recency}}(i) = \begin{cases} 
  100.0 & \text{if } \text{daysSinceCooked}(i) \le 3 \\
  60.0 & \text{if } 4 \le \text{daysSinceCooked}(i) \le 7 \\
  30.0 & \text{if } 8 \le \text{daysSinceCooked}(i) \le 14 \\
  0.0 & \text{if } \text{daysSinceCooked}(i) > 14 \text{ or never}
  \end{cases}$$
- Protein Rotation Penalty $P_{\text{protein}}(i)$:
  If candidate $i$ is a main dish ($role = \text{'main'}$):
  $$P_{\text{protein}}(i) = \begin{cases} 
  40.0 & \text{if } i.proteinType == \text{ProteinType}(D - 1) \\
  20.0 & \text{if } i.proteinType == \text{ProteinType}(D - 2) \\
  0.0 & \text{otherwise}
  \end{cases}$$

#### Procedural Pseudocode

```typescript
function proposeDailyMenu(
  targetDate: string,
  servings: number,
  contextMemo: string,
  currentSlots: MealSlot[],
  pastMenus: MealPlan[],
  allDishes: Recipe[],
  forceNewChallenge: boolean
): MealSlot[] {
  const resultSlots: MealSlot[] = [...currentSlots];
  const queryTokens = contextMemo
    ? contextMemo.split(/[\s,、]+/).filter(t => t.trim().length > 0)
    : [];

  // 1. Identify previous 14 days of cooked dish IDs
  const recent14Days = pastMenus.filter(m => {
    const diffDays = computeDaysDiff(m.date, targetDate);
    return diffDays > 0 && diffDays <= 14;
  });
  const recentDishIds = new Set(recent14Days.flatMap(m => m.slots.map(s => s.dishId)));

  // 2. Identify yesterday's and 2-days-ago main protein
  const yesterdayMenu = pastMenus.find(m => computeDaysDiff(m.date, targetDate) === 1);
  const yesterdayMainDishId = yesterdayMenu?.slots.find(s => s.role === 'main')?.dishId;
  const yesterdayProtein = allDishes.find(d => d.id === yesterdayMainDishId)?.proteinType;

  // 3. For each slot role ('main', 'side', 'soup')
  for (let roleIndex = 0; roleIndex < resultSlots.length; roleIndex++) {
    const slot = resultSlots[roleIndex];
    if (slot.locked) {
      continue; // Respect grandfather's cooking or locked request
    }

    const role = slot.role;
    let pool = allDishes.filter(d => d.category === role);

    // If "forceNewChallenge" is requested on side/main, pick from wishlist or trusted web
    if (forceNewChallenge && (role === 'side' || role === 'main')) {
      const challengeCandidates = pool.filter(d => d.sourceType === 'wishlist' || d.sourceType === 'trusted_web');
      if (challengeCandidates.length > 0) {
        pool = challengeCandidates;
      }
    }

    // Score candidates
    const scored = pool.map(dish => {
      let score = 0;

      // Context leftover match
      if (queryTokens.length > 0) {
        const textContent = dish.name + ' ' + dish.ingredients.map(ig => ig.name).join(' ');
        const matched = queryTokens.filter(t => textContent.includes(t));
        score += matched.length * 50;
      }

      // Recency penalty
      if (recentDishIds.has(dish.id)) {
        const lastCook = dish.lastCookedDate ? computeDaysDiff(dish.lastCookedDate, targetDate) : 7;
        if (lastCook <= 3) score -= 100;
        else if (lastCook <= 7) score -= 60;
        else if (lastCook <= 14) score -= 30;
      }

      // Protein diversity
      if (role === 'main' && dish.proteinType && yesterdayProtein) {
        if (dish.proteinType === yesterdayProtein) {
          score -= 40;
        }
      }

      // Classics reward
      if (dish.cookCount >= 5) {
        score += 15;
      }
      if (dish.sourceType === 'wishlist') {
        score += 25;
      }

      // Small jitter for stochastic variety
      score += Math.random() * 5;

      return { dish, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const chosen = scored[0]?.dish || pool[0];

    resultSlots[roleIndex] = {
      role: role,
      dishId: chosen.id,
      dishName: chosen.name,
      locked: false,
      sourceLabel: chosen.sourceLabel || chosen.sourceType,
      badge: chosen.cookCount >= 5 ? '我が家の定番' : (chosen.sourceType === 'wishlist' ? '新レシピ挑戦' : 'カレンダー履歴'),
      ingredients: chosen.ingredients.map(i => `${i.name} ${i.amount}`),
      steps: chosen.steps
    };
  }

  return resultSlots;
}
```

---

### 5.2 Recipe Portion Scaling & Ingredient Unit Consolidation

#### Scaling Mechanics
Given target servings $S_{\text{target}}$ and base recipe servings $S_{\text{base}}$:
$$\text{Ratio } R = \frac{S_{\text{target}}}{S_{\text{base}}}$$

#### Unit Parsing & Fraction Handling
Amounts in Japanese home cooking take forms:
- Decimals and Integers: `300g`, `2本`, `1個`, `1枚` $\rightarrow \text{Amount} \times R$.
- Fractions: `1/2本`, `1/4個`, `3/4パック` $\rightarrow (\text{Numerator}/\text{Denominator}) \times R$.
- Traditional Japanese culinary measures:
  - `大さじ1` ($15\,\text{ml}$) $\rightarrow$ `大さじ` $(1 \times R)$
  - `小さじ1` ($5\,\text{ml}$) $\rightarrow$ `小さじ` $(1 \times R)$
  - `カップ1` ($200\,\text{ml}$) $\rightarrow$ `カップ` $(1 \times R)$
- Unquantified qualitative descriptions:
  - `少々` (a pinch), `適量` (as needed), `お好みで` (to taste) $\rightarrow$ Unscaled verbatim string.

#### Unit Harmonization & Consolidation
When multiple dishes use the same ingredient (e.g. Daikon radish):
$$\text{Total Daikon} = \text{Daikon}_{\text{Main}} + \text{Daikon}_{\text{Soup}}$$
- If units match (e.g. `1/2本` + `1/4本`): convert to common fraction $\rightarrow$ `3/4本`.
- If units mismatch (e.g. `200g` + `1/4本`): aggregate as compound string `200g + 1/4本`.

#### Staples Partitioning
Ingredient $ig$ is tested against staple dictionary:
$$\text{isStaple}(ig) = \exists s \in \text{StapleList} \text{ s.t. } ig.\text{name}.\text{includes}(s)$$
- If `true` $\rightarrow$ Assigned to Stage 2 (`家にあるかも`).
- If `false` $\rightarrow$ Assigned to Stage 1 (`買うもの`).

```typescript
export function consolidateAndPartitionShoppingList(
  dishes: { dishRole: string; baseServings: number; ingredients: IngredientItem[] }[],
  targetServings: number,
  stapleList: string[]
): {
  mainItems: ShoppingStateItem[];
  stapleItems: { id: number; name: string }[];
} {
  const aggregatedMap = new Map<string, {
    totalUnits: Map<string, number>;
    rawStrings: string[];
    roles: Set<string>;
    isStaple: boolean;
  }>();

  for (const dish of dishes) {
    const ratio = targetServings / (dish.baseServings || 3);
    for (const item of dish.ingredients) {
      const normName = normalizeIngredientName(item.name);
      const isStaple = item.isStaple || stapleList.some(s => normName.includes(s));
      const parsed = parseJapaneseAmount(item.amount, ratio);

      if (!aggregatedMap.has(normName)) {
        aggregatedMap.set(normName, {
          totalUnits: new Map(),
          rawStrings: [],
          roles: new Set([dish.dishRole]),
          isStaple
        });
      }

      const entry = aggregatedMap.get(normName)!;
      entry.roles.add(dish.dishRole);

      if (parsed.numeric !== null && parsed.unit) {
        const cur = entry.totalUnits.get(parsed.unit) || 0;
        entry.totalUnits.set(parsed.unit, cur + parsed.numeric);
      } else {
        entry.rawStrings.push(item.amount);
      }
    }
  }

  const mainItems: ShoppingStateItem[] = [];
  const stapleItems: { id: number; name: string }[] = [];
  let idCounter = 1;

  aggregatedMap.forEach((entry, name) => {
    const formattedAmount = formatConsolidatedAmount(entry.totalUnits, entry.rawStrings);
    const roleLabel = Array.from(entry.roles).join('・');

    if (entry.isStaple) {
      stapleItems.push({
        id: 100 + idCounter++,
        name: `${name}${formattedAmount ? ` (${formattedAmount})` : ''}`
      });
    } else {
      mainItems.push({
        id: idCounter++,
        name,
        amount: formattedAmount,
        dishRole: roleLabel,
        checked: false,
        promotedFromStaple: false
      });
    }
  });

  return { mainItems, stapleItems };
}
```

---

### 5.3 Multi-Dish Cooking Timeline Scheduling Algorithm (DAG & Critical Path)

A home chef typically prepares 3 dishes using 1 cutting board, 1 microwave, and 1–2 stove burners. The schedule must minimize downtime, guarantee food safety, and ensure all dishes are ready simultaneously.

#### Scheduling Phases & Priorities
1. **Phase 1: `下ごしらえ（まとめて切る・レンジ）` (0:00 – T1)**:
   - **Rule 1.1 (Board Hygiene)**: Cut all vegetables first, followed by tofu/processed items, followed last by raw meats and seafood (prevents having to scrub and sanitize the cutting board midway).
   - **Rule 1.2 (Microwave Pre-Cook Start)**: Any dense vegetables (daikon, squash, potato) requiring microwave pre-cooking are microwaved immediately while the remaining ingredients are sliced.
2. **Phase 2: `副菜と汁物の火入れ` (T1 – T2)**:
   - **Rule 2.1 (Simmering & Flavor Infusion)**: Soups (miso soup, dashi) and braised/boiled side dishes (nimono, ohitashi) are brought to a boil and simmered early so they can rest off-heat to absorb flavor.
   - **Rule 2.2 (Salad / Cold Dressing)**: Cold vegetable dishes (sunomono, ae-mono) are dressed and set aside.
3. **Phase 3: `主菜の仕上げ（熱々で食卓へ）` (T2 – End)**:
   - **Rule 3.1 (Stove Climax)**: Main sautéing, pan-frying, or high-heat stir-frying occurs in the final 8–10 minutes so proteins are served piping hot.
   - **Rule 3.2 (Final Soup Garnish)**: Add delicate garnishes (green onion, beaten egg, wakame) to soup right before dishing up.

#### Parallel Timeline DAG Representation

```mermaid
gantt
    title 並行調理タイムライン（まとめ工程）
    dateFormat  m:ss
    axisFormat  %M:%S
    
    section Phase 1: 下ごしらえ
    全品野菜カット (小松菜・長ねぎ・豆腐)  :done, p1, 00:00, 3m
    大根レンジ加熱 (600W 5分)              :crit, active, p2, 01:00, 5m
    肉魚カット (豚バラ4cm幅)              :done, p3, 03:00, 2m
    
    section Phase 2: 火入れ
    副菜・小松菜煮びたし火入れ (2分煮て味染み) :p4, 06:00, 3m
    汁物・豆腐わかめ味噌汁 だし沸かし・味噌溶き :p5, 08:00, 4m
    
    section Phase 3: 主菜仕上げ
    主菜・豚バラ大根炒め照り煮 (熱々完成)     :crit, p6, 12:00, 10m
    汁物温め直し・ネギ投入                  :p7, 21:00, 2m
```

---

## 6. Edge Cases & Error Handling

| # | Feature | Input / Scenario | Expected / Observed Behavior | Recovery / Fallback Strategy |
|---|---------|------------------|------------------------------|------------------------------|
| 1 | Servings Stepper | Stepper decremented at 1 person (`servings = 1`) | Stepper minus button does not decrement below 1; stays clamped at 1 | Enforce `Math.max(1, Math.min(8, servings + delta))` |
| 2 | Servings Stepper | Stepper incremented at 8 persons (`servings = 8`) | Stepper plus button does not exceed 8; stays clamped at 8 | Visual boundary feedback, ignore excess clicks |
| 3 | Slot Locking | User locks all 3 slots (`main`, `side`, `soup`) and clicks "提案する" | No slots are changed; app retains all 3 locked dishes | Toast notification: "すべての枠が固定されています" |
| 4 | Slot Shuffle | User clicks "変更" on a locked slot | Button is disabled (`disabled` attribute, opacity 0.4) | Cursor shows `not-allowed`, click handler returns early |
| 5 | Menu Suggestion | Search input contains non-food strings (e.g. "あいうえおxyz") | No ingredient match found in database | Scores default to popularity/recency cooldown balance; no crash |
| 6 | Menu Suggestion | Database contains 0 dishes (brand new clean install) | Zero candidate dishes available in DB | Empty state card prompting user to import `.ics` or add recipe |
| 7 | Menu Suggestion | User desires single-dish meal (e.g. "カレーライス" or "牛丼") | Slot list adjusts: Main filled with single-dish, Side/Soup left optional | System allows empty side/soup slots without error |
| 8 | Shopping List | All items in Stage 1 checked off by user in store | Remaining count badge updates to `(0)`, counter shows `残り 0点` | Empty checklist state: "すべての材料を購入しました" |
| 9 | Shopping List | User taps all staple items in Stage 2 to promote | Stage 2 empty | Renders message: `すべて買うものリストへ移動済みです` |
| 10 | LINE Copy | Browser clipboard API blocked or denied permission | `navigator.clipboard.writeText` rejects promise | Fallback to `document.execCommand('copy')` and display modal text for manual copy |
| 11 | LINE Copy | User clicks LINE export when Stage 1 has 0 unchecked items | Unchecked list is empty | Copies header: `【MM/DD 買い物メモ】\n・（購入する品はありません）` |
| 12 | `.ics` Parsing | Uploaded `.ics` is empty (0 bytes) or corrupted text | Parser fails to find `BEGIN:VCALENDAR` or `BEGIN:VEVENT` | API returns HTTP 400 with message "有効なカレンダーファイルではありません" |
| 13 | `.ics` Parsing | Calendar has 500 events, but all are non-food (dentist, work) | Filter excludes all 500 events, resulting in 0 meals | UI displays message: "料理の予定が見つかりませんでした" |
| 14 | Recipe Book OCR | Uploaded image is blurry, dark, or not a cookbook | Gemini Vision cannot identify recipe structure | Returns HTTP 422 with message "レシピが認識できませんでした。手入力をお試しください" |
| 15 | Recipe URL Import | User submits URL not in whitelist (e.g. random blog or spam site) | Scraper validates domain against allowed whitelist | Returns HTTP 400 with message "対応している信頼レシピサイトのURLを入力してください" |
| 16 | Gemini API | `GEMINI_API_KEY` environment variable missing or offline | AI client detects missing key or network failure | Graceful deterministic fallback: regex parser, rule-based timeline, mock OCR |
| 17 | Passcode Lock | User enters incorrect passcode in login modal | Middleware compares with `APP_PASSCODE` | Returns HTTP 401 with shake animation on passcode input |
| 18 | Fraction Math | Scaling yields repeating decimal (e.g. 1/3 can $\times$ 2 = 0.666...) | Formatter evaluates nearest fraction or rounds to 1 decimal place | Displays `約0.7缶` or `2/3缶` instead of `0.666666667` |

---

## 7. Cross-Module Contracts & API Specifications

### 7.1 REST API Endpoints

#### 1. `POST /api/menu`
- **Purpose**: Get or propose daily menu for a given date.
- **Request Body**:
  ```json
  {
    "date": "2026-10-26",
    "servings": 3,
    "contextMemo": "大根、豚バラ",
    "lockedSlots": [
      { "role": "main", "dishId": "dish_123" }
    ],
    "forceNewChallenge": false
  }
  ```
- **Response Body (200 OK)**:
  ```json
  {
    "date": "2026-10-26",
    "servings": 3,
    "slots": [
      {
        "role": "main",
        "dishId": "dish_123",
        "dishName": "豚バラと大根のこっくり照り煮",
        "locked": true,
        "sourceLabel": "山本ゆりさんレシピ本 (p.42)",
        "badge": "我が家の定番",
        "ingredients": ["豚バラ薄切り 300g", "大根 1/2本"],
        "steps": ["大根はいちょう切り...", "フライパンで炒め..."]
      },
      {
        "role": "副菜",
        "dishId": "dish_456",
        "dishName": "小松菜と油揚げのさっと煮びたし",
        "locked": false,
        "sourceLabel": "白ごはん.com",
        "badge": "我が家の定番",
        "ingredients": ["小松菜 1束", "油揚げ 1枚"],
        "steps": ["小松菜は4cm...", "鍋にだし汁を沸かし..."]
      },
      {
        "role": "汁物",
        "dishId": "dish_789",
        "dishName": "豆腐とわかめの味噌汁",
        "locked": false,
        "sourceLabel": "家庭の定番",
        "badge": "我が家の定番",
        "ingredients": ["絹ごし豆腐 1丁", "長ねぎ 1/2本"],
        "steps": ["だし汁を沸かし...", "味噌を溶き入れ..."]
      }
    ]
  }
  ```

#### 2. `POST /api/cooking/timeline`
- **Purpose**: Generate or fetch cached parallel cooking timeline.
- **Request Body**:
  ```json
  {
    "date": "2026-10-26",
    "servings": 3,
    "dishes": [
      { "name": "豚バラと大根のこっくり照り煮", "role": "main", "steps": [...] },
      { "name": "小松菜と油揚げのさっと煮びたし", "role": "side", "steps": [...] },
      { "name": "豆腐とわかめの味噌汁", "role": "soup", "steps": [...] }
    ]
  }
  ```
- **Response Body (200 OK)**:
  ```json
  {
    "estimatedMinutes": 25,
    "steps": [
      {
        "stepNumber": 1,
        "phase": "下ごしらえ（まとめて切る・レンジ）",
        "timeWindow": "0:00〜7:00",
        "dishTag": "全品共通",
        "instruction": "大根(1/2本)をいちょう切りにして耐熱皿に入れ、レンジ600Wで5分加熱開始。加熱中に小松菜・油揚げ・豆腐・長ねぎ・豚バラ肉をすべて切る。",
        "done": false
      },
      {
        "stepNumber": 2,
        "phase": "副菜と汁物の火入れ",
        "timeWindow": "7:00〜13:00",
        "dishTag": "副菜・汁物",
        "instruction": "小鍋2つにだし汁を沸かす。片方で小松菜と油揚げを2分煮て火を止め味を含ませる。もう片方に豆腐を入れて味噌汁を作る。",
        "done": false
      },
      {
        "stepNumber": 3,
        "phase": "主菜の仕上げ（熱々で食卓へ）",
        "timeWindow": "13:00〜23:00",
        "dishTag": "主菜",
        "instruction": "フライパンで豚バラ肉を炒め、レンジ加熱済みの大根を投入。調味料を加えて強めの中火で7〜8分照りが出るまで煮絡めて完成。",
        "done": false
      }
    ]
  }
  ```

#### 3. `POST /api/recipes/ocr`
- **Purpose**: Extract structured recipe from uploaded photo.
- **Request (Multipart Form Data)**: `image` file.
- **Response Body (200 OK)**:
  ```json
  {
    "name": "ハッシュドポーク",
    "category": "main",
    "baseServings": 2,
    "ingredients": [
      { "name": "豚こま切れ肉", "amount": "200g", "isStaple": false },
      { "name": "玉ねぎ", "amount": "1/2個", "isStaple": true }
    ],
    "steps": ["玉ねぎは薄切り...", "フライパンで炒めて調味料を加える"]
  }
  ```

#### 4. `POST /api/ics-import`
- **Purpose**: Upload `.ics` calendar, parse, deduplicate, classify frequency, seed database.
- **Request (Multipart Form Data)**: `file` (.ics).
- **Response Body (200 OK)**:
  ```json
  {
    "totalEvents": 412,
    "mealEventsFound": 328,
    "uniqueDishes": 84,
    "classicsCount": 26,
    "aiProvisionalCount": 58,
    "dateRange": { "start": "2024-01-01", "end": "2026-10-25" }
  }
  ```

---

## 8. Verification Criteria & Automated Test Plan

### Automated Test Specifications (`npm test` via Vitest)

1. **`test/ics-parser.test.ts`**:
   - Parse RFC 5545 sample stream with single-day and multi-day events.
   - Assert extraction of Japanese title strings.
   - Assert filtering of non-meal keywords ("歯医者", "美容院", "会議").
   - Assert title splitting on punctuation ("、", "・", "＋", "\n").
   - Assert alias normalization: `["豚の生姜焼き", "しょうが焼き"]` $\rightarrow$ `"豚の生姜焼き"`.
   - Assert frequency threshold classification: dishes with count $\ge 5 \rightarrow `classic_book`$; count $1..4 \rightarrow `ai_provisional`$.

2. **`test/menu-engine.test.ts`**:
   - Seed past 14 days of menus.
   - Assert that candidate cooked 2 days ago receives recency penalty and is not selected.
   - Assert that candidate matching `contextMemo` ("豚バラ") receives top score.
   - Assert that locked slot (e.g. Grandfather's main) remains unchanged during proposal and shuffle.
   - Assert single-slot shuffle changes only the designated slot index.

3. **`test/shopping-aggregator.test.ts`**:
   - Given Main dish using `大根 1/2本` and Soup using `大根 1/4本` scaled to 3 servings.
   - Assert consolidated quantity equals `大根 3/4本`.
   - Assert separation: `豚バラ薄切り` in Stage 1, `長ねぎ` and `醤油` in Stage 2.
   - Assert 1-tap promotion transfers item from Stage 2 into Stage 1 with amount `"補充"`.
   - Assert LINE format generation outputs expected header and bulleted items.

4. **`test/cooking-timeline.test.ts`**:
   - Input 3 dishes with prep, microwave, simmer, and stir-fry steps.
   - Assert output timeline contains 3 distinct phases.
   - Assert vegetable cut step precedes raw meat cut step.
   - Assert deterministic fallback operates when `GEMINI_API_KEY` is not set.

---

## 9. Caveats

1. **AI Grounding & Network Isolation**:
   - The `@google/genai` SDK requires internet access and a valid `GEMINI_API_KEY` for live generative responses. In sandboxed test environments, tests must verify that the deterministic fallback path operates transparently without error.
2. **Calendar Timezone Formatting**:
   - Google Calendar exports `.ics` dates in either `VALUE=DATE` (e.g. `20261026`) or `TZID=Asia/Tokyo` format (e.g. `20261026T190000`). The `.ics` parser must handle both formats and strip time components cleanly into `YYYY-MM-DD`.
3. **Pantry Inventory Tracking Scope**:
   - The user specification deliberately rejects full gram-level refrigerator inventory tracking to prevent user burnout. The application relies on the two-stage shopping checklist model rather than an ERP inventory decrement system.

---

## 10. Conclusion

The functional architecture for "kazoku-kondate" has been comprehensively mined and defined across all requirements R1 through R5:
- **R1**: Single-column responsive layout, Warm Editorial / Atmospheric Dark theming, 3-tier hierarchy, anti-slop typography.
- **R2**: Robust `.ics` calendar import, event cleaning, title splitting, spelling normalization, and frequency-based classification ($\ge 5$ classics vs $1..4$ AI provisional).
- **R3**: 3-slot planning (`主菜`, `副菜`, `汁物`), slot lock/pinning, leftover-aware scoring, 14-day recency cooldown, protein rotation, and stock list injection.
- **R4**: Servings-scaled shopping list, fraction unit consolidation, two-stage partitioning (Main vs Staples), 1-tap promotion, and LINE memo formatting.
- **R5**: Multi-dish parallel cooking timeline DAG with kitchen resource constraints and seamless offline deterministic fallback.

This specification provides the implementer with unambiguous interface contracts, exact data models, mathematical scoring formulas, and test assertions.

---

## 11. Verification Method

To independently verify this specification:
1. Review the data schemas and algorithms against `C:\Users\HCP4\.gemini\antigravity\brain\db2fa280-5ac6-472b-9577-acd1554f0701\implementation_plan.md`.
2. Inspect `C:\Users\HCP4\.gemini\antigravity\brain\db2fa280-5ac6-472b-9577-acd1554f0701\ui_mock.html` to confirm that all UI states, data bindings, and action handlers match the inventory.
3. Verify test assertions against the acceptance criteria defined in `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\ORIGINAL_REQUEST.md`.
