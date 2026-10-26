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
        ...(lockReason ? { lockReason } : {}),
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
