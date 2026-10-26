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
