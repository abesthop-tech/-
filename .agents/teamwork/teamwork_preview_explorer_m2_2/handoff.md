# 5-Component Handoff Report: Menu Planning Engine & Variety Balancer

**Module**: `src/lib/menu-planner.ts` & `tests/unit/menu-planner.test.ts`  
**Milestone**: M2 - Algorithmic Engines & Business Logic  
**Author**: `teamwork_preview_explorer_m2_2`  
**Target Path**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_2\handoff.md`

---

## 1. Observation

Direct observations and evidence collected across authoritative specifications and existing codebases:

### 1.1 Original User Requirements (`ORIGINAL_REQUEST.md`)
- **Lines 30–35 (R3. Context-Aware Menu Planning & Slot Controls)**:
  > "Support daily menu planning across 3 slots (`主菜` Main, `副菜` Side, `汁物` Soup):
  > - Allow locking any individual slot (e.g., when the grandfather already made the main dish or a family member requested a specific dish) and proposing or shuffling only the unlocked slots.
  > - Rank and propose candidates prioritizing: (1) user-entered leftover/desired ingredients, (2) avoiding dishes made in the last 14 days and alternating protein types from the previous day, and (3) mixing in items from the 'want to make' stock list or trusted recipe sources (`sirogohan.com`, `kurashiru.com`, `kyounoryouri.jp`, `oceans-nadia.com`, `ameblo.jp/syunkon`, `lettuceclub.net`, `orangepage.net`) when recent history is repetitive or when the user clicks '＋ 新レシピを1品混ぜる'.
  > - Confirming or updating a day's menu automatically records it in the calendar history."

### 1.2 Feature Inventory & Interface Contracts (`PROJECT.md`)
- **Lines 26–28**:
  > "| 11 | Menu Balance Scoring Engine | Mathematical scoring: context matching, recency penalty, protein rotation | M2 | survey_2 |"  
  > "| 12 | Slot Lock & Shuffle Logic | Preserves locked slots; cycles candidate proposals for unlocked slots | M2 | survey_2 |"  
  > "| 13 | New Recipe Challenge Injection | Injects recipe from 'Want to Make' wishlist or trusted online sources | M2 | survey_2 |"
- **Lines 96**:
  > `proposeDailyMenu(date, servings, contextMemo, lockedSlots, pastMenus, allDishes, forceNew)` $\rightarrow$ `MealSlot[]`

### 1.3 Survey 2 Specification & Mathematical Formulation (`teamwork_preview_spec_miner_survey_2/handoff.md`)
- **Lines 308–330**:
  $$\text{Score}(i) = W_{\text{context}} \cdot S_{\text{context}}(i) + W_{\text{stock}} \cdot S_{\text{stock}}(i) + W_{\text{classic}} \cdot S_{\text{classic}}(i) - P_{\text{recency}}(i) - P_{\text{protein}}(i)$$
  - Context match weight: $W_{\text{context}} = 50.0$ per matched keyword.
  - Wishlist item bonus: $W_{\text{stock}} = 25.0$ (boost for "Want to Make" wishlist items).
  - Household classics reward: $W_{\text{classic}} = 15.0$ for cookCount $\ge 5$.
  - Recency cooldown penalty $P_{\text{recency}}(i)$:
    - $\le 3$ days ago: $-100.0$
    - $4 \le \text{days} \le 7$: $-60.0$
    - $8 \le \text{days} \le 14$: $-30.0$
    - $> 14$ days or never: $0.0$
  - Protein rotation penalty $P_{\text{protein}}(i)$ (evaluated on Main dish):
    - $-40.0$ if main dish protein matches yesterday ($D - 1$).
    - $-20.0$ if main dish protein matches 2 days ago ($D - 2$).
    - $0.0$ otherwise.
  - Stochastic variety jitter: small positive jitter ($+ [0, 5)$).
- **Lines 758–764 (Test Assertions)**:
  - Seed past 14 days of menus.
  - Assert candidate cooked 2 days ago receives recency penalty and is not selected.
  - Assert candidate matching `contextMemo` ("豚バラ") receives top score.
  - Assert locked slot (e.g. Grandfather's main) remains unchanged during proposal and shuffle.
  - Assert single-slot shuffle changes only the designated slot index.

### 1.4 Existing Database Types (`src/db/schema.ts`)
- **Lines 60–63**:
  ```typescript
  export type DishCategory = 'main' | 'side' | 'soup' | 'other';
  export type ProteinType = 'pork' | 'chicken' | 'beef' | 'fish' | 'egg_tofu' | 'veggie';
  export type SourceType = 'classic_book' | 'ai_generated' | 'trusted_web' | 'wishlist';
  export type RecipeStatus = 'needs_registration' | 'ai_provisional' | 'confirmed';
  ```
- **Lines 72–83**:
  ```typescript
  export interface MealSlot {
    role: 'main' | 'side' | 'soup';
    dishId: string;
    dishName: string;
    locked: boolean;
    lockReason?: string;
    sourceLabel?: string;
    badge?: string; // "我が家の定番" | "信頼サイト" | "新レシピ挑戦" | "カレンダー履歴"
    ingredients: string[];
    steps: string[];
    isLeftover?: boolean;
  }
  ```
- **Lines 137–163**:
  `ParsedDish` contains `id, name, aliases, category, proteinType, sourceType, sourceLabel, sourceUrl, recipeStatus, baseServings, ingredients, steps, cookCount, lastCookedDate, createdAt`.  
  `ParsedDailyMenu` contains `date, servings, contextMemo, slots, parallelSteps, shoppingState, updatedAt`.

### 1.5 Interactive Behavior (`ui_mock.html`)
- **Lines 359–462 & 528–548**:
  - 3 slots: `主菜` (main, locked by default with `祖父が担当・固定中`), `副菜` (side, unlocked), `汁物` (soup, unlocked).
  - Tapping "変更" (Shuffle) on an unlocked slot advances candidate index `(currentIdx + 1) % candidates.length`.
  - Tapping "提案する" (Batch propose) recalculates unlocked slots only.
  - Tapping "＋ 新レシピを1品混ぜる" (`proposeNewChallenge()`) replaces the side dish with a wishlist candidate and assigns badge `"新レシピ挑戦"`.

---

## 2. Logic Chain

From the observations, we deduce the following architectural and algorithmic requirements:

### Step 1: Triad Slot Role Representation & Display
- **Observation**: `schema.ts` defines `MealSlot.role` as `'main' | 'side' | 'soup'`. The Japanese UI uses `'主菜'`, `'副菜'`, `'汁物'`.
- **Reasoning**: To maintain 100% type compatibility with Drizzle ORM and `ParsedDailyMenu.slots`, the engine's canonical internal role type must be `'main' | 'side' | 'soup'`.
- **Deduction**: Provide bidirectional helpers:
  - `ROLE_LABELS: Record<'main'|'side'|'soup', string> = { main: '主菜', side: '副菜', soup: '汁物' }`
  - `dishToMealSlot(role, dish, locked, lockReason, isLeftover, isChallenge)` creates a well-formed `MealSlot` conforming to `schema.ts`.

### Step 2: Scoring Objective Formula Calibration & Breakdown
- **Observation**: The objective function balances 5 distinct signals: context match, recency cooldown, protein rotation, classics loyalty, and wishlist prioritization.
- **Reasoning**: Combining these into a single integer/floating score is necessary for ranking, but returning a structured `breakdown` object inside `ScoredDish` provides full transparency, simplifies debugging, and enables UI explanations (e.g. "前日: 鶏肉を考慮中").
- **Deduction**:
  1. **Context match ($+50/\text{token}$)**: Split `contextMemo` by `[\s,、・+＋\n\t]+`. Match against `dish.name`, `dish.aliases`, and `dish.ingredients[].name`. If matched, set `isLeftover: true`.
  2. **Recency cooldown**: Compute `computeDaysDiff(lastCooked, targetDate)`. If $\le 3 \rightarrow -100$; $4..7 \rightarrow -60$; $8..14 \rightarrow -30$; $> 14 \rightarrow 0$.
  3. **Protein rotation**: Only applied to `main` slot. Check yesterday's ($D-1$) main protein ($-40$) and 2 days ago's ($D-2$) main protein ($-20$).
  4. **Classics loyalty**: `cookCount >= 5` yields $+15$.
  5. **Wishlist priority**: `sourceType === 'wishlist'` yields $+25$.
  6. **Variety Jitter**: Add $[0, \text{jitterRange})$. Crucially, default `jitterRange` to `5.0` in production, but allow configuring `jitterRange: 0` in `MenuPlannerOptions` to ensure **100% deterministic, non-flaky unit tests**.

### Step 3: Slot Lock Preservation Invariant
- **Observation**: Users lock slots when grandfather cooks, or when a family member requests a dish.
- **Reasoning**: If a slot is marked `locked: true`, its `dishId` must be preserved without alteration during batch re-proposal (`proposeDailyMenu`). Furthermore, its `dishId` must be reserved so other unlocked slots cannot accidentally select the same dish.
- **Deduction**:
  - Maintain `usedDishIds: Set<string>` initialized with all locked slots.
  - When iterating over slots in `proposeDailyMenu`, if `slot.locked === true`, immediately retain the slot and skip candidate selection.
  - If all 3 slots are locked, return the triad unchanged immediately.

### Step 4: Single-Slot Candidate Shuffle Mechanism
- **Observation**: Clicking "変更" changes only that specific slot, cycling through candidates.
- **Reasoning**: Shuffle must preserve all other slots (both locked and unlocked). It must rank candidates for the target role excluding dishes currently assigned to other slots, find the current dish's index in the ranked list, and advance cyclically: $(idx + 1) \pmod N$.
- **Deduction**: Implement `shuffleSlotCandidate(targetRole, currentSlots, pastMenus, allDishes, options)`. If the target slot is locked, return `currentSlots` unchanged.

### Step 5: "＋ 新レシピを1品混ぜる" Challenge Injection
- **Observation**: R3 requires mixing in recipes from the wishlist or trusted sites when clicking "＋ 新レシピを1品混ぜる".
- **Reasoning**: Trying a new recipe is safest with side dishes (副菜). If side is locked, fallback to main, then soup. The challenge dish must come from `sourceType === 'wishlist' || sourceType === 'trusted_web' || cookCount === 0`.
- **Deduction**: In `proposeDailyMenu(..., forceNewChallenge: true)`, identify the target challenge slot (prefer `side`), filter that slot's candidate pool to challenge recipes, select the top scored, and assign `badge: '新レシピ挑戦'`.

---

## 3. Caveats

1. **Date Arithmetic & Timezones**:
   Google Calendar `.ics` and database dates are formatted as ISO strings (`YYYY-MM-DD`). To prevent 1-day daylight saving or UTC/JST boundary skew, date difference calculations must parse dates as explicit UTC midnights (`${dateStr}T00:00:00Z`).
2. **Distinct Dish Invariant**:
   A single meal triad should never contain duplicate dishes across slots (e.g. Tonjiru as Main and Tonjiru as Soup). The engine enforces a `usedDishIds` set to eliminate dishes already selected in other slots.
3. **Empty or Degenerate Catalog Fallback**:
   If a user's database has 0 dishes in a category (e.g. no soup dishes registered yet), the planner must gracefully return an informative placeholder slot (`dishId: 'placeholder_soup'`, `dishName: '汁物（未登録）'`) rather than throwing an unhandled exception or returning `undefined`.

---

## 4. Conclusion & Complete Blueprints

### 4.1 Production Implementation Blueprint: `src/lib/menu-planner.ts`

```typescript
// ============================================================================
// Kazoku-Kondate Menu Planning Engine & Variety Balancer: src/lib/menu-planner.ts
// Milestone: M2 - Algorithmic Engines & Business Logic
// ============================================================================

import type {
  MealSlot,
  ParsedDish,
  ParsedDailyMenu,
  DishCategory,
  ProteinType,
  SourceType,
} from '@/db/schema';

// ----------------------------------------------------------------------------
// 1. Types & Interfaces
// ----------------------------------------------------------------------------

export type SlotRole = 'main' | 'side' | 'soup';

export const TRIAD_ROLES: readonly SlotRole[] = ['main', 'side', 'soup'] as const;

export const ROLE_LABELS: Record<SlotRole, string> = {
  main: '主菜',
  side: '副菜',
  soup: '汁物',
};

export interface ScoreBreakdown {
  contextMatch: number; // +50 per matched leftover/request keyword
  matchedKeywords: string[];
  recencyPenalty: number; // -100 (<=3d), -60 (4-7d), -30 (8-14d), 0 (>14d)
  daysSinceCooked: number | null;
  proteinPenalty: number; // -40 (yesterday main), -20 (2-days-ago main), 0 (otherwise)
  matchedProtein: ProteinType | null;
  classicsBonus: number; // +15 if cookCount >= classicThreshold
  wishlistBonus: number; // +25 if sourceType === 'wishlist'
  jitter: number; // [0, jitterRange)
}

export interface ScoredDish {
  dish: ParsedDish;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface MenuPlannerOptions {
  classicThreshold?: number; // default: 5
  recencyWindowDays?: number; // default: 14
  contextKeywordWeight?: number; // default: 50.0
  classicsBonusWeight?: number; // default: 15.0
  wishlistBonusWeight?: number; // default: 25.0
  yesterdayProteinPenalty?: number; // default: 40.0
  twoDaysAgoProteinPenalty?: number; // default: 20.0
  jitterRange?: number; // default: 5.0 (set to 0 for deterministic testing)
  rng?: () => number; // optional PRNG override
}

export interface ProposeDailyMenuInput {
  targetDate: string; // YYYY-MM-DD
  servings?: number; // default: 3
  contextMemo?: string | null; // e.g. "大根、豚バラ"
  currentSlots?: MealSlot[]; // Existing triad (if re-proposing or updating)
  lockedSlots?: Array<{ role: SlotRole; dishId?: string; lockReason?: string }>;
  pastMenus?: ParsedDailyMenu[]; // Recent 14-day history
  allDishes: ParsedDish[]; // Catalog of available dishes
  forceNewChallenge?: boolean; // "＋ 新レシピを1品混ぜる"
  options?: MenuPlannerOptions;
}

// ----------------------------------------------------------------------------
// 2. Utility & Date Arithmetic Helpers
// ----------------------------------------------------------------------------

/**
 * Computes calendar day difference between two YYYY-MM-DD dates.
 * Returns positive integer when laterDate > earlierDate.
 */
export function computeDaysDiff(earlierDate: string, laterDate: string): number {
  const t1 = Date.parse(`${earlierDate}T00:00:00Z`);
  const t2 = Date.parse(`${laterDate}T00:00:00Z`);
  if (isNaN(t1) || isNaN(t2)) return 999;
  return Math.round((t2 - t1) / 86400000);
}

/**
 * Tokenizes search query into clean keyword array.
 * Splits on whitespace, commas, Japanese ideographic commas, pluses, and bullets.
 */
export function tokenizeContextMemo(memo?: string | null): string[] {
  if (!memo) return [];
  return memo
    .split(/[\s,、・+＋\n\t]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Resolves the display badge for a dish.
 */
export function resolveDishBadge(
  dish: ParsedDish,
  isChallenge = false,
  classicThreshold = 5
): string {
  if (isChallenge || dish.sourceType === 'wishlist') {
    return '新レシピ挑戦';
  }
  if (dish.cookCount >= classicThreshold) {
    return '我が家の定番';
  }
  if (dish.sourceType === 'trusted_web') {
    return '信頼サイト';
  }
  return 'カレンダー履歴';
}

/**
 * Maps a ParsedDish entity into a UI-ready MealSlot.
 */
export function dishToMealSlot(
  role: SlotRole,
  dish: ParsedDish,
  locked = false,
  lockReason?: string,
  isLeftover = false,
  isChallenge = false,
  classicThreshold = 5
): MealSlot {
  return {
    role,
    dishId: dish.id,
    dishName: dish.name,
    locked,
    lockReason: locked ? lockReason || '固定中' : undefined,
    sourceLabel:
      dish.sourceLabel || (dish.sourceType === 'classic_book' ? '家庭の定番' : undefined),
    badge: resolveDishBadge(dish, isChallenge, classicThreshold),
    ingredients: dish.ingredients.map((i) => `${i.name} ${i.amount}`.trim()),
    steps: [...dish.steps],
    isLeftover,
  };
}

/**
 * Creates a graceful placeholder slot when no dish candidates are found.
 */
export function createPlaceholderSlot(role: SlotRole): MealSlot {
  return {
    role,
    dishId: `placeholder_${role}`,
    dishName: `${ROLE_LABELS[role]}（未登録）`,
    locked: false,
    ingredients: [],
    steps: [],
    badge: undefined,
  };
}

/**
 * Finds how many days ago a dish was cooked, checking both pastMenus and dish.lastCookedDate.
 */
export function getDaysSinceLastCooked(
  dish: ParsedDish,
  targetDate: string,
  pastMenus: ParsedDailyMenu[] = []
): number | null {
  let minDays: number | null = null;

  for (const menu of pastMenus) {
    const diff = computeDaysDiff(menu.date, targetDate);
    if (diff > 0) {
      const cookedInMenu = menu.slots.some((s) => s.dishId === dish.id);
      if (cookedInMenu) {
        if (minDays === null || diff < minDays) {
          minDays = diff;
        }
      }
    }
  }

  if (dish.lastCookedDate) {
    const diff = computeDaysDiff(dish.lastCookedDate, targetDate);
    if (diff > 0) {
      if (minDays === null || diff < minDays) {
        minDays = diff;
      }
    }
  }

  return minDays;
}

/**
 * Extracts the protein type used in the main dish of yesterday (D-1) and 2 days ago (D-2).
 */
export function extractRecentProteins(
  targetDate: string,
  pastMenus: ParsedDailyMenu[] = [],
  allDishes: ParsedDish[] = []
): { yesterdayProtein: ProteinType | null; twoDaysAgoProtein: ProteinType | null } {
  const dishMap = new Map(allDishes.map((d) => [d.id, d]));
  let yesterdayProtein: ProteinType | null = null;
  let twoDaysAgoProtein: ProteinType | null = null;

  for (const menu of pastMenus) {
    const diff = computeDaysDiff(menu.date, targetDate);
    if (diff === 1 && !yesterdayProtein) {
      const mainSlot = menu.slots.find((s) => s.role === 'main');
      if (mainSlot) {
        const dish = dishMap.get(mainSlot.dishId);
        if (dish?.proteinType) yesterdayProtein = dish.proteinType;
      }
    } else if (diff === 2 && !twoDaysAgoProtein) {
      const mainSlot = menu.slots.find((s) => s.role === 'main');
      if (mainSlot) {
        const dish = dishMap.get(mainSlot.dishId);
        if (dish?.proteinType) twoDaysAgoProtein = dish.proteinType;
      }
    }
  }

  return { yesterdayProtein, twoDaysAgoProtein };
}

// ----------------------------------------------------------------------------
// 3. Mathematical Scoring Engine
// ----------------------------------------------------------------------------

/**
 * Evaluates candidate dish against objective scoring formula:
 * Score = W_context * S_context + W_stock * S_stock + W_classic * S_classic - P_recency - P_protein + Jitter
 */
export function scoreDishCandidate(
  dish: ParsedDish,
  role: SlotRole,
  targetDate: string,
  contextTokens: string[],
  recentProteins: { yesterdayProtein: ProteinType | null; twoDaysAgoProtein: ProteinType | null },
  pastMenus: ParsedDailyMenu[],
  options?: MenuPlannerOptions
): ScoredDish {
  const classicThreshold = options?.classicThreshold ?? 5;
  const contextWeight = options?.contextKeywordWeight ?? 50.0;
  const classicsBonusWeight = options?.classicsBonusWeight ?? 15.0;
  const wishlistBonusWeight = options?.wishlistBonusWeight ?? 25.0;
  const yesterdayProteinPenaltyWeight = options?.yesterdayProteinPenalty ?? 40.0;
  const twoDaysAgoProteinPenaltyWeight = options?.twoDaysAgoProteinPenalty ?? 20.0;
  const jitterRange = options?.jitterRange ?? 5.0;
  const rng = options?.rng ?? Math.random;

  // 1. Context Keyword Match
  const matchedKeywords: string[] = [];
  if (contextTokens.length > 0) {
    const corpus = [
      dish.name,
      ...(dish.aliases ?? []),
      ...dish.ingredients.map((ig) => ig.name),
    ].join(' ').toLowerCase();

    for (const token of contextTokens) {
      if (corpus.includes(token.toLowerCase())) {
        matchedKeywords.push(token);
      }
    }
  }
  const contextMatchScore = matchedKeywords.length * contextWeight;

  // 2. Recency Cooldown Penalty (14-day window)
  const daysSinceCooked = getDaysSinceLastCooked(dish, targetDate, pastMenus);
  let recencyPenalty = 0;
  if (daysSinceCooked !== null) {
    if (daysSinceCooked <= 3) {
      recencyPenalty = 100.0;
    } else if (daysSinceCooked <= 7) {
      recencyPenalty = 60.0;
    } else if (daysSinceCooked <= 14) {
      recencyPenalty = 30.0;
    }
  }

  // 3. Protein Rotation Penalty (Main dishes only)
  let proteinPenalty = 0;
  let matchedProtein: ProteinType | null = null;
  if (role === 'main' && dish.proteinType) {
    if (recentProteins.yesterdayProtein && dish.proteinType === recentProteins.yesterdayProtein) {
      proteinPenalty = yesterdayProteinPenaltyWeight;
      matchedProtein = recentProteins.yesterdayProtein;
    } else if (
      recentProteins.twoDaysAgoProtein &&
      dish.proteinType === recentProteins.twoDaysAgoProtein
    ) {
      proteinPenalty = twoDaysAgoProteinPenaltyWeight;
      matchedProtein = recentProteins.twoDaysAgoProtein;
    }
  }

  // 4. Household Classics Bonus (>= 5 cookCount)
  const classicsBonus = dish.cookCount >= classicThreshold ? classicsBonusWeight : 0;

  // 5. Wishlist Item Bonus
  const wishlistBonus = dish.sourceType === 'wishlist' ? wishlistBonusWeight : 0;

  // 6. Stochastic Variety Jitter
  const jitter = jitterRange > 0 ? rng() * jitterRange : 0;

  // Total Score Calculation
  const totalScore =
    contextMatchScore +
    wishlistBonus +
    classicsBonus -
    recencyPenalty -
    proteinPenalty +
    jitter;

  return {
    dish,
    score: totalScore,
    breakdown: {
      contextMatch: contextMatchScore,
      matchedKeywords,
      recencyPenalty,
      daysSinceCooked,
      proteinPenalty,
      matchedProtein,
      classicsBonus,
      wishlistBonus,
      jitter,
    },
  };
}

/**
 * Scores and sorts candidate dishes for a given role in descending order.
 */
export function rankDishCandidates(
  candidates: ParsedDish[],
  role: SlotRole,
  targetDate: string,
  contextMemo: string | null | undefined,
  pastMenus: ParsedDailyMenu[] = [],
  allDishes: ParsedDish[] = [],
  options?: MenuPlannerOptions
): ScoredDish[] {
  const contextTokens = tokenizeContextMemo(contextMemo);
  const recentProteins = extractRecentProteins(targetDate, pastMenus, allDishes);

  const scored = candidates.map((dish) =>
    scoreDishCandidate(
      dish,
      role,
      targetDate,
      contextTokens,
      recentProteins,
      pastMenus,
      options
    )
  );

  return scored.sort((a, b) => b.score - a.score);
}

// ----------------------------------------------------------------------------
// 4. Propose Daily Menu & Slot Controls
// ----------------------------------------------------------------------------

/**
 * Generates an optimal 3-slot daily meal triad (Main, Side, Soup).
 * Strictly preserves locked slots, scores candidates, eliminates duplicate dishes,
 * and injects challenge recipes when requested.
 */
export function proposeDailyMenu(input: ProposeDailyMenuInput): MealSlot[] {
  const {
    targetDate,
    contextMemo,
    currentSlots,
    lockedSlots = [],
    pastMenus = [],
    allDishes,
    forceNewChallenge = false,
    options,
  } = input;

  const classicThreshold = options?.classicThreshold ?? 5;
  const contextTokens = tokenizeContextMemo(contextMemo);
  const recentProteins = extractRecentProteins(targetDate, pastMenus, allDishes);

  // Initialize slots template
  const resultSlots: MealSlot[] = [];
  const usedDishIds = new Set<string>();

  // Map of explicit lock overrides
  const lockedRolesMap = new Map<SlotRole, { dishId?: string; lockReason?: string }>();
  for (const l of lockedSlots) {
    lockedRolesMap.set(l.role, { dishId: l.dishId, lockReason: l.lockReason });
  }

  // Pre-populate slots and track locked dish IDs
  for (const role of TRIAD_ROLES) {
    const existingSlot = currentSlots?.find((s) => s.role === role);
    const lockConfig = lockedRolesMap.get(role);

    const isLocked = lockConfig !== undefined || existingSlot?.locked === true;
    const lockReason = lockConfig?.lockReason || existingSlot?.lockReason;

    if (isLocked && existingSlot) {
      resultSlots.push({
        ...existingSlot,
        locked: true,
        lockReason: lockReason || existingSlot.lockReason || '固定中',
      });
      usedDishIds.add(existingSlot.dishId);
    } else {
      resultSlots.push(existingSlot || createPlaceholderSlot(role));
    }
  }

  // If all 3 slots are already locked, return immediately
  if (resultSlots.every((s) => s.locked)) {
    return resultSlots;
  }

  // Determine which unlocked slot receives the challenge recipe (prefer side)
  let challengeTargetRole: SlotRole | null = null;
  if (forceNewChallenge) {
    const unlockedRoles = TRIAD_ROLES.filter((r) => {
      const slot = resultSlots.find((s) => s.role === r);
      return !slot?.locked;
    });

    if (unlockedRoles.includes('side')) {
      challengeTargetRole = 'side';
    } else if (unlockedRoles.length > 0) {
      challengeTargetRole = unlockedRoles[0];
    }
  }

  // Propose candidates for unlocked slots
  for (let i = 0; i < resultSlots.length; i++) {
    const slot = resultSlots[i];
    if (slot.locked) continue;

    const role = slot.role;
    let pool = allDishes.filter(
      (d) =>
        (d.category === role || (d.category === 'other' && role === 'side')) &&
        !usedDishIds.has(d.id)
    );

    const isChallengeSlot = role === challengeTargetRole;

    if (isChallengeSlot) {
      const challengePool = pool.filter(
        (d) =>
          d.sourceType === 'wishlist' ||
          d.sourceType === 'trusted_web' ||
          d.cookCount === 0
      );
      if (challengePool.length > 0) {
        pool = challengePool;
      }
    }

    if (pool.length === 0) {
      // Fallback: relax category filter if available, or keep placeholder
      continue;
    }

    const scored = pool.map((dish) =>
      scoreDishCandidate(
        dish,
        role,
        targetDate,
        contextTokens,
        recentProteins,
        pastMenus,
        options
      )
    );

    scored.sort((a, b) => b.score - a.score);
    const chosen = scored[0].dish;
    usedDishIds.add(chosen.id);

    const isLeftover = scored[0].breakdown.contextMatch > 0;

    resultSlots[i] = dishToMealSlot(
      role,
      chosen,
      false,
      undefined,
      isLeftover,
      isChallengeSlot || chosen.sourceType === 'wishlist',
      classicThreshold
    );
  }

  return resultSlots;
}

// ----------------------------------------------------------------------------
// 5. Single-Slot Candidate Shuffle
// ----------------------------------------------------------------------------

/**
 * Shuffles an individual slot to its next ranked candidate.
 * Strictly respects slot lock (no-op if locked).
 * Excludes dishes assigned to other slots in the current triad.
 */
export function shuffleSlotCandidate(
  targetRole: SlotRole,
  currentSlots: MealSlot[],
  pastMenus: ParsedDailyMenu[] = [],
  allDishes: ParsedDish[] = [],
  options?: MenuPlannerOptions & { contextMemo?: string; targetDate?: string }
): MealSlot[] {
  const slotIdx = currentSlots.findIndex((s) => s.role === targetRole);
  if (slotIdx === -1) return currentSlots;

  const targetSlot = currentSlots[slotIdx];
  if (targetSlot.locked) {
    // Locked slots cannot be shuffled
    return currentSlots;
  }

  const targetDate = options?.targetDate || new Date().toISOString().slice(0, 10);
  const contextMemo = options?.contextMemo || null;
  const classicThreshold = options?.classicThreshold ?? 5;

  // Exclude dishes currently used in the OTHER slots
  const otherDishIds = new Set(
    currentSlots.filter((_, idx) => idx !== slotIdx).map((s) => s.dishId)
  );

  const pool = allDishes.filter(
    (d) =>
      (d.category === targetRole || (d.category === 'other' && targetRole === 'side')) &&
      !otherDishIds.has(d.id)
  );

  if (pool.length === 0) return currentSlots;

  const ranked = rankDishCandidates(
    pool,
    targetRole,
    targetDate,
    contextMemo,
    pastMenus,
    allDishes,
    options
  );

  const curDishId = targetSlot.dishId;
  const curIdx = ranked.findIndex((r) => r.dish.id === curDishId);
  const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % ranked.length;
  const nextCandidate = ranked[nextIdx];

  const updatedSlot = dishToMealSlot(
    targetRole,
    nextCandidate.dish,
    false,
    undefined,
    nextCandidate.breakdown.contextMatch > 0,
    nextCandidate.dish.sourceType === 'wishlist',
    classicThreshold
  );

  const nextSlots = [...currentSlots];
  nextSlots[slotIdx] = updatedSlot;
  return nextSlots;
}
```

---

### 4.2 Unit Test Blueprint: `tests/unit/menu-planner.test.ts`

```typescript
// ============================================================================
// Kazoku-Kondate Menu Planner Unit Tests: tests/unit/menu-planner.test.ts
// Milestone: M2 - Algorithmic Engines & Business Logic
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  computeDaysDiff,
  tokenizeContextMemo,
  resolveDishBadge,
  scoreDishCandidate,
  rankDishCandidates,
  proposeDailyMenu,
  shuffleSlotCandidate,
  type SlotRole,
} from '@/lib/menu-planner';
import type { ParsedDish, ParsedDailyMenu, MealSlot } from '@/db/schema';

// ----------------------------------------------------------------------------
// Test Mock Fixtures
// ----------------------------------------------------------------------------

function makeTestDish(overrides: Partial<ParsedDish>): ParsedDish {
  return {
    id: 'dish_test',
    name: 'テスト料理',
    aliases: [],
    category: 'main',
    proteinType: 'pork',
    sourceType: 'classic_book',
    sourceLabel: '家庭の定番',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [{ name: '豚肉', amount: '200g', isStaple: false }],
    steps: ['炒める'],
    cookCount: 6,
    lastCookedDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const SAMPLE_DISH_CATALOG: ParsedDish[] = [
  // Mains
  makeTestDish({
    id: 'dish_butabara_daikon',
    name: '豚バラと大根のこっくり照り煮',
    aliases: ['豚バラ大根'],
    category: 'main',
    proteinType: 'pork',
    sourceType: 'classic_book',
    cookCount: 8,
    lastCookedDate: '2026-09-14',
    ingredients: [
      { name: '豚バラ薄切り', amount: '300g', isStaple: false },
      { name: '大根', amount: '1/2本', isStaple: false },
    ],
  }),
  makeTestDish({
    id: 'dish_shogayaki',
    name: '豚の生姜焼き',
    aliases: ['生姜焼き'],
    category: 'main',
    proteinType: 'pork',
    sourceType: 'classic_book',
    cookCount: 12,
    lastCookedDate: '2026-10-24', // 2 days ago from 2026-10-26
    ingredients: [
      { name: '豚ロース薄切り', amount: '350g', isStaple: false },
      { name: '玉ねぎ', amount: '1個', isStaple: true },
    ],
  }),
  makeTestDish({
    id: 'dish_chanchan_yaki',
    name: '鮭とキャベツのちゃんちゃん焼き',
    aliases: ['鮭のちゃんちゃん焼き'],
    category: 'main',
    proteinType: 'fish',
    sourceType: 'trusted_web',
    sourceLabel: '白ごはん.com',
    cookCount: 4,
    lastCookedDate: '2026-10-02', // 24 days ago
    ingredients: [
      { name: '生鮭', amount: '3切れ', isStaple: false },
      { name: 'キャベツ', amount: '1/4個', isStaple: false },
    ],
  }),
  makeTestDish({
    id: 'dish_teriyaki_chicken',
    name: '鶏肉と長ねぎの照り焼き',
    aliases: ['チキン照り焼き'],
    category: 'main',
    proteinType: 'chicken',
    sourceType: 'classic_book',
    cookCount: 9,
    lastCookedDate: '2026-10-25', // 1 day ago (yesterday)
    ingredients: [
      { name: '鶏もも肉', amount: '2枚', isStaple: false },
      { name: '長ねぎ', amount: '2本', isStaple: true },
    ],
  }),

  // Sides
  makeTestDish({
    id: 'dish_komatsuna_nibitashi',
    name: '小松菜と油揚げのさっと煮びたし',
    category: 'side',
    proteinType: 'veggie',
    sourceType: 'trusted_web',
    sourceLabel: '白ごはん.com',
    cookCount: 11,
    lastCookedDate: '2026-10-05',
    ingredients: [
      { name: '小松菜', amount: '1束', isStaple: false },
      { name: '油揚げ', amount: '1枚', isStaple: false },
    ],
  }),
  makeTestDish({
    id: 'dish_tomato_tuna',
    name: 'トマトとツナのポン酢和え',
    category: 'side',
    proteinType: 'veggie',
    sourceType: 'wishlist',
    sourceLabel: 'クラシル公式',
    cookCount: 0,
    lastCookedDate: null,
    ingredients: [
      { name: 'トマト', amount: '2個', isStaple: false },
      { name: 'ツナ缶', amount: '1缶', isStaple: false },
    ],
  }),
  makeTestDish({
    id: 'dish_kyuri_sunomono',
    name: 'きゅうりとわかめの酢の物',
    category: 'side',
    proteinType: 'veggie',
    sourceType: 'ai_generated',
    cookCount: 2,
    lastCookedDate: '2026-10-23', // 3 days ago
    ingredients: [{ name: 'きゅうり', amount: '2本', isStaple: false }],
  }),

  // Soups
  makeTestDish({
    id: 'dish_miso_tofu_wakame',
    name: '豆腐とわかめの味噌汁',
    category: 'soup',
    proteinType: 'egg_tofu',
    sourceType: 'classic_book',
    cookCount: 34,
    lastCookedDate: '2026-10-21', // 5 days ago
    ingredients: [
      { name: '絹ごし豆腐', amount: '1丁', isStaple: false },
      { name: 'わかめ', amount: '大さじ2', isStaple: true },
    ],
  }),
  makeTestDish({
    id: 'dish_kakutama_soup',
    name: 'かきたま中華スープ',
    category: 'soup',
    proteinType: 'egg_tofu',
    sourceType: 'classic_book',
    cookCount: 6,
    lastCookedDate: '2026-09-28',
    ingredients: [
      { name: '卵', amount: '1個', isStaple: true },
      { name: 'えのき', amount: '1/2袋', isStaple: false },
    ],
  }),
];

const PAST_MENUS_FIXTURE: ParsedDailyMenu[] = [
  {
    date: '2026-10-25', // Yesterday
    servings: 3,
    slots: [
      {
        role: 'main',
        dishId: 'dish_teriyaki_chicken',
        dishName: '鶏肉と長ねぎの照り焼き',
        locked: false,
        ingredients: [],
        steps: [],
      },
    ],
    updatedAt: '2026-10-25T19:00:00Z',
  },
  {
    date: '2026-10-24', // 2 days ago
    servings: 3,
    slots: [
      {
        role: 'main',
        dishId: 'dish_shogayaki',
        dishName: '豚の生姜焼き',
        locked: false,
        ingredients: [],
        steps: [],
      },
    ],
    updatedAt: '2026-10-24T19:00:00Z',
  },
];

// ----------------------------------------------------------------------------
// Test Suites
// ----------------------------------------------------------------------------

describe('Menu Planning Engine: Date & Tokenizer Utilities', () => {
  it('calculates days difference accurately across calendar boundaries', () => {
    expect(computeDaysDiff('2026-10-25', '2026-10-26')).toBe(1);
    expect(computeDaysDiff('2026-10-26', '2026-10-26')).toBe(0);
    expect(computeDaysDiff('2026-10-23', '2026-10-26')).toBe(3);
    expect(computeDaysDiff('2026-09-30', '2026-10-01')).toBe(1);
    expect(computeDaysDiff('invalid', '2026-10-26')).toBe(999);
  });

  it('tokenizes Japanese context search inputs correctly', () => {
    expect(tokenizeContextMemo('大根、豚バラ')).toEqual(['大根', '豚バラ']);
    expect(tokenizeContextMemo('キャベツ・しめじ＋豆腐')).toEqual(['キャベツ', 'しめじ', '豆腐']);
    expect(tokenizeContextMemo('  鶏肉   魚系 \n さっぱり ')).toEqual(['鶏肉', '魚系', 'さっぱり']);
    expect(tokenizeContextMemo('')).toEqual([]);
    expect(tokenizeContextMemo(null)).toEqual([]);
  });
});

describe('Menu Balance Scoring Formula Verification', () => {
  const targetDate = '2026-10-26';
  const noJitter = { jitterRange: 0 };

  it('awards +50 per keyword match for leftover/requested ingredients', () => {
    const dish = SAMPLE_DISH_CATALOG.find((d) => d.id === 'dish_butabara_daikon')!;
    const scored = scoreDishCandidate(
      dish,
      'main',
      targetDate,
      ['大根', '豚バラ'],
      { yesterdayProtein: null, twoDaysAgoProtein: null },
      [],
      noJitter
    );
    expect(scored.breakdown.matchedKeywords).toContain('大根');
    expect(scored.breakdown.matchedKeywords).toContain('豚バラ');
    expect(scored.breakdown.contextMatch).toBe(100); // 2 * 50
  });

  it('applies 14-day recency cooldown penalties correctly', () => {
    // <= 3 days: -100
    const dish3d = makeTestDish({ lastCookedDate: '2026-10-23', cookCount: 1 });
    const score3d = scoreDishCandidate(
      dish3d,
      'main',
      targetDate,
      [],
      { yesterdayProtein: null, twoDaysAgoProtein: null },
      [],
      noJitter
    );
    expect(score3d.breakdown.recencyPenalty).toBe(100);

    // 4 to 7 days: -60
    const dish5d = makeTestDish({ lastCookedDate: '2026-10-21', cookCount: 1 });
    const score5d = scoreDishCandidate(
      dish5d,
      'main',
      targetDate,
      [],
      { yesterdayProtein: null, twoDaysAgoProtein: null },
      [],
      noJitter
    );
    expect(score5d.breakdown.recencyPenalty).toBe(60);

    // 8 to 14 days: -30
    const dish10d = makeTestDish({ lastCookedDate: '2026-10-16', cookCount: 1 });
    const score10d = scoreDishCandidate(
      dish10d,
      'main',
      targetDate,
      [],
      { yesterdayProtein: null, twoDaysAgoProtein: null },
      [],
      noJitter
    );
    expect(score10d.breakdown.recencyPenalty).toBe(30);

    // > 14 days: 0
    const dish20d = makeTestDish({ lastCookedDate: '2026-10-06', cookCount: 1 });
    const score20d = scoreDishCandidate(
      dish20d,
      'main',
      targetDate,
      [],
      { yesterdayProtein: null, twoDaysAgoProtein: null },
      [],
      noJitter
    );
    expect(score20d.breakdown.recencyPenalty).toBe(0);
  });

  it('penalizes main dishes matching yesterday (-40) or 2-days-ago (-20) protein', () => {
    const chickenDish = makeTestDish({ proteinType: 'chicken', cookCount: 1 });
    const porkDish = makeTestDish({ proteinType: 'pork', cookCount: 1 });
    const beefDish = makeTestDish({ proteinType: 'beef', cookCount: 1 });

    const recentProteins = {
      yesterdayProtein: 'chicken' as const,
      twoDaysAgoProtein: 'pork' as const,
    };

    // Matches yesterday
    const scoreChicken = scoreDishCandidate(
      chickenDish,
      'main',
      targetDate,
      [],
      recentProteins,
      [],
      noJitter
    );
    expect(scoreChicken.breakdown.proteinPenalty).toBe(40);

    // Matches 2 days ago
    const scorePork = scoreDishCandidate(
      porkDish,
      'main',
      targetDate,
      [],
      recentProteins,
      [],
      noJitter
    );
    expect(scorePork.breakdown.proteinPenalty).toBe(20);

    // Different protein
    const scoreBeef = scoreDishCandidate(
      beefDish,
      'main',
      targetDate,
      [],
      recentProteins,
      [],
      noJitter
    );
    expect(scoreBeef.breakdown.proteinPenalty).toBe(0);

    // Side dish never receives protein penalty
    const scoreSideChicken = scoreDishCandidate(
      chickenDish,
      'side',
      targetDate,
      [],
      recentProteins,
      [],
      noJitter
    );
    expect(scoreSideChicken.breakdown.proteinPenalty).toBe(0);
  });

  it('rewards household classics (+15) and wishlist items (+25)', () => {
    const classicDish = makeTestDish({ cookCount: 7, sourceType: 'classic_book' });
    const wishlistDish = makeTestDish({ cookCount: 0, sourceType: 'wishlist' });

    const scoreClassic = scoreDishCandidate(
      classicDish,
      'main',
      targetDate,
      [],
      { yesterdayProtein: null, twoDaysAgoProtein: null },
      [],
      noJitter
    );
    expect(scoreClassic.breakdown.classicsBonus).toBe(15);
    expect(scoreClassic.breakdown.wishlistBonus).toBe(0);

    const scoreWishlist = scoreDishCandidate(
      wishlistDish,
      'main',
      targetDate,
      [],
      { yesterdayProtein: null, twoDaysAgoProtein: null },
      [],
      noJitter
    );
    expect(scoreWishlist.breakdown.classicsBonus).toBe(0);
    expect(scoreWishlist.breakdown.wishlistBonus).toBe(25);
  });
});

describe('Propose Daily Menu (3-Slot Triad Generation)', () => {
  const targetDate = '2026-10-26';
  const options = { jitterRange: 0 };

  it('generates a complete 3-slot triad matching user leftovers with top rank', () => {
    const proposed = proposeDailyMenu({
      targetDate,
      contextMemo: '大根、豚バラ',
      pastMenus: PAST_MENUS_FIXTURE,
      allDishes: SAMPLE_DISH_CATALOG,
      options,
    });

    expect(proposed.length).toBe(3);
    expect(proposed[0].role).toBe('main');
    expect(proposed[1].role).toBe('side');
    expect(proposed[2].role).toBe('soup');

    // Main should pick Butabara Daikon due to +100 context match
    expect(proposed[0].dishId).toBe('dish_butabara_daikon');
    expect(proposed[0].isLeftover).toBe(true);
    expect(proposed[0].badge).toBe('我が家の定番');

    // Ensure all 3 slots have distinct dishes
    const uniqueIds = new Set(proposed.map((s) => s.dishId));
    expect(uniqueIds.size).toBe(3);
  });

  it('strictly preserves locked slots during batch re-proposal', () => {
    const grandfatherLockedSlot: MealSlot = {
      role: 'main',
      dishId: 'dish_teriyaki_chicken',
      dishName: '鶏肉と長ねぎの照り焼き',
      locked: true,
      lockReason: '祖父が担当・固定中',
      ingredients: ['鶏もも肉 2枚'],
      steps: ['照り焼きにする'],
      badge: '我が家の定番',
    };

    const proposed = proposeDailyMenu({
      targetDate,
      contextMemo: '大根、豚バラ', // Even though context prefers pork, locked main must NOT change!
      currentSlots: [grandfatherLockedSlot],
      pastMenus: PAST_MENUS_FIXTURE,
      allDishes: SAMPLE_DISH_CATALOG,
      options,
    });

    expect(proposed[0].dishId).toBe('dish_teriyaki_chicken');
    expect(proposed[0].locked).toBe(true);
    expect(proposed[0].lockReason).toBe('祖父が担当・固定中');

    // Side and soup slots are filled with other candidates
    expect(proposed[1].dishId).not.toBe('dish_teriyaki_chicken');
    expect(proposed[2].dishId).not.toBe('dish_teriyaki_chicken');
  });

  it('returns untouched array if all 3 slots are locked', () => {
    const allLocked: MealSlot[] = [
      { role: 'main', dishId: 'd1', dishName: 'Main1', locked: true, ingredients: [], steps: [] },
      { role: 'side', dishId: 'd2', dishName: 'Side2', locked: true, ingredients: [], steps: [] },
      { role: 'soup', dishId: 'd3', dishName: 'Soup3', locked: true, ingredients: [], steps: [] },
    ];

    const result = proposeDailyMenu({
      targetDate,
      currentSlots: allLocked,
      allDishes: SAMPLE_DISH_CATALOG,
      options,
    });

    expect(result).toEqual(allLocked);
  });
});

describe('Single-Slot Candidate Shuffle ("変更" Action)', () => {
  const targetDate = '2026-10-26';
  const options = { jitterRange: 0, targetDate };

  it('cycles to the next ranked candidate for an unlocked slot without modifying other slots', () => {
    const initialSlots: MealSlot[] = [
      {
        role: 'main',
        dishId: 'dish_butabara_daikon',
        dishName: '豚バラと大根のこっくり照り煮',
        locked: false,
        ingredients: [],
        steps: [],
      },
      {
        role: 'side',
        dishId: 'dish_komatsuna_nibitashi',
        dishName: '小松菜と油揚げのさっと煮びたし',
        locked: false,
        ingredients: [],
        steps: [],
      },
      {
        role: 'soup',
        dishId: 'dish_miso_tofu_wakame',
        dishName: '豆腐とわかめの味噌汁',
        locked: false,
        ingredients: [],
        steps: [],
      },
    ];

    // Shuffle the Side slot
    const shuffledOnce = shuffleSlotCandidate(
      'side',
      initialSlots,
      PAST_MENUS_FIXTURE,
      SAMPLE_DISH_CATALOG,
      options
    );

    expect(shuffledOnce[0].dishId).toBe('dish_butabara_daikon'); // Unchanged
    expect(shuffledOnce[2].dishId).toBe('dish_miso_tofu_wakame'); // Unchanged
    expect(shuffledOnce[1].dishId).not.toBe('dish_komatsuna_nibitashi'); // Cycled

    // Shuffle again should cycle to the next candidate
    const shuffledTwice = shuffleSlotCandidate(
      'side',
      shuffledOnce,
      PAST_MENUS_FIXTURE,
      SAMPLE_DISH_CATALOG,
      options
    );
    expect(shuffledTwice[1].dishId).not.toBe(shuffledOnce[1].dishId);
  });

  it('refuses to shuffle a locked slot (returns identical array)', () => {
    const lockedSlots: MealSlot[] = [
      {
        role: 'main',
        dishId: 'dish_shogayaki',
        dishName: '豚の生姜焼き',
        locked: true,
        ingredients: [],
        steps: [],
      },
    ];

    const result = shuffleSlotCandidate(
      'main',
      lockedSlots,
      PAST_MENUS_FIXTURE,
      SAMPLE_DISH_CATALOG,
      options
    );

    expect(result[0].dishId).toBe('dish_shogayaki');
    expect(result[0].locked).toBe(true);
  });
});

describe('New Recipe Challenge Injection ("＋ 新レシピを1品混ぜる")', () => {
  const targetDate = '2026-10-26';
  const options = { jitterRange: 0 };

  it('injects a wishlist or trusted web recipe into the side slot with challenge badge', () => {
    const proposed = proposeDailyMenu({
      targetDate,
      pastMenus: PAST_MENUS_FIXTURE,
      allDishes: SAMPLE_DISH_CATALOG,
      forceNewChallenge: true,
      options,
    });

    expect(proposed.length).toBe(3);
    const sideSlot = proposed.find((s) => s.role === 'side')!;
    expect(sideSlot.dishId).toBe('dish_tomato_tuna'); // Wishlist dish
    expect(sideSlot.badge).toBe('新レシピ挑戦');
  });

  it('injects challenge into main slot if side slot is locked', () => {
    const lockedSide: MealSlot = {
      role: 'side',
      dishId: 'dish_komatsuna_nibitashi',
      dishName: '小松菜と油揚げのさっと煮びたし',
      locked: true,
      ingredients: [],
      steps: [],
    };

    const proposed = proposeDailyMenu({
      targetDate,
      currentSlots: [lockedSide],
      pastMenus: PAST_MENUS_FIXTURE,
      allDishes: SAMPLE_DISH_CATALOG,
      forceNewChallenge: true,
      options,
    });

    // Side slot remains locked
    expect(proposed[1].dishId).toBe('dish_komatsuna_nibitashi');
    expect(proposed[1].locked).toBe(true);

    // Main slot receives challenge dish (e.g. Chanchan yaki from trusted_web)
    expect(proposed[0].dishId).toBe('dish_chanchan_yaki');
    expect(proposed[0].badge).toBe('新レシピ挑戦');
  });
});

describe('Edge Cases & Degenerate Scenarios', () => {
  it('handles empty dish catalog without throwing uncaught exceptions', () => {
    const result = proposeDailyMenu({
      targetDate: '2026-10-26',
      allDishes: [],
    });
    expect(result.length).toBe(3);
    expect(result[0].dishId).toBe('placeholder_main');
    expect(result[1].dishId).toBe('placeholder_side');
    expect(result[2].dishId).toBe('placeholder_soup');
  });

  it('handles complex Japanese punctuation in contextMemo gracefully', () => {
    const tokens = tokenizeContextMemo('大根、豚バラ・キャベツ＋豆腐 \n えのき');
    expect(tokens).toEqual(['大根', '豚バラ', 'キャベツ', '豆腐', 'えのき']);
  });
});
```

---

## 5. Verification Method

To independently verify the implementation and unit test suite:

1. **Verify Database Alignment**:
   Inspect `src/db/schema.ts` to confirm exact alignment of `MealSlot` and `ParsedDish` properties.
2. **Execute Unit Tests**:
   Once implemented by the designated coder agent:
   ```powershell
   npx vitest run tests/unit/menu-planner.test.ts
   ```
   **Expected Result**: 100% of test cases pass with exit code 0.
3. **End-to-End Build**:
   ```powershell
   npm run build
   ```
   **Expected Result**: Zero TypeScript compilation errors or unresolved module imports.
4. **Invalidation Conditions**:
   - If locked slots are overwritten during batch re-proposal.
   - If protein rotation penalty fails to deduct 40 points when main dish matches yesterday's protein.
   - If stochastic jitter causes non-deterministic failures in test runs.
