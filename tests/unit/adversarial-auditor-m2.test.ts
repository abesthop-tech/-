// ============================================================================
// Forensic Auditor Independent Adversarial Stress Test Suite: Milestone M2
// Verifies authentic mathematical behavior, boundary conditions, and absence
// of shortcuts or facade implementations across all 4 algorithmic engines.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseIcsCalendar,
  parseIcsRawEvents,
  unfoldIcsContent,
  unescapeIcsText,
  parseIcsDate,
  isMealEvent,
  splitDishTitle,
  normalizeDishName,
  inferDishCategory,
  inferProteinType,
  generateProvisionalIngredients,
} from '@/lib/ics-parser';
import {
  computeDaysDiff,
  tokenizeContextMemo,
  scoreDishCandidate,
  rankDishCandidates,
  proposeDailyMenu,
  shuffleSlotCandidate,
} from '@/lib/menu-planner';
import {
  parseNumericValue,
  parseJapaneseAmount,
  formatNumericAmount,
  consolidateAndPartitionShoppingList,
  promoteStapleToMain,
  demotePromotedStaple,
  toggleShoppingItemChecked,
  formatLineShoppingMemo,
} from '@/lib/shopping-aggregator';
import {
  scheduleParallelCookingTimeline,
  DishScheduleInput,
} from '@/lib/timeline-scheduler';
import {
  isGeminiConfigured,
  generateCookingTimelineWithGemini,
  ocrRecipePhoto,
  extractRecipeFromUrl,
  isAllowedRecipeUrl,
  DETERMINISTIC_OCR_FALLBACK_RECIPE,
} from '@/lib/gemini';
import type { ParsedDish, ParsedDailyMenu, MealSlot } from '@/db/schema';
import { SEED_DISHES } from '@/db/seed';

// ----------------------------------------------------------------------------
// Test Helper Factory
// ----------------------------------------------------------------------------
function makeDish(overrides: Partial<ParsedDish>): ParsedDish {
  return {
    id: `dish_adv_${Math.random().toString(36).substring(2, 9)}`,
    name: 'アドバーサリアル料理',
    aliases: [],
    category: 'main',
    proteinType: 'pork',
    sourceType: 'classic_book',
    sourceLabel: '家庭の定番',
    sourceUrl: null,
    recipeStatus: 'confirmed',
    baseServings: 3,
    ingredients: [{ name: '豚肉', amount: '300g', isStaple: false }],
    steps: ['調理する'],
    cookCount: 5,
    lastCookedDate: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('M2 Forensic Auditor: Engine 1 (ics-parser.ts)', () => {
  it('handles malformed ICS streams, mixed line endings, and truncated blocks', () => {
    const malformed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261101',
      'SUMMARY:夕食: 豚肉の生姜焼き',
      // Missing END:VEVENT
      'BEGIN:VEVENT',
      'DTSTART:20261102T090000Z',
      'SUMMARY:鶏の唐揚げ、ポテサラ',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    const result = parseIcsCalendar(malformed);
    expect(result.totalEvents).toBeGreaterThanOrEqual(1);
    expect(result.mealEventsFound).toBeGreaterThanOrEqual(1);
  });

  it('verifies strict boundary classification between count=4 (ai_provisional) and count=5 (needs_registration)', () => {
    // Generate exactly 4 occurrences of Dish A and 5 occurrences of Dish B
    const events: string[] = ['BEGIN:VCALENDAR'];
    for (let i = 1; i <= 4; i++) {
      events.push(
        'BEGIN:VEVENT',
        `DTSTART;VALUE=DATE:2026100${i}`,
        'SUMMARY:豚バラ大根',
        'END:VEVENT'
      );
    }
    for (let i = 1; i <= 5; i++) {
      events.push(
        'BEGIN:VEVENT',
        `DTSTART;VALUE=DATE:2026101${i}`,
        'SUMMARY:鶏肉と長ねぎの照り焼き',
        'END:VEVENT'
      );
    }
    events.push('END:VCALENDAR');

    const result = parseIcsCalendar(events.join('\r\n'), { knownDishes: SEED_DISHES });
    const dishA = result.dishes.find((d) => d.name === '豚バラと大根のこっくり照り煮');
    const dishB = result.dishes.find((d) => d.name === '鶏肉と長ねぎの照り焼き');

    expect(dishA).toBeDefined();
    expect(dishA?.cookCount).toBe(4);
    expect(dishA?.recipeStatus).toBe('ai_provisional');
    expect(dishA?.sourceType).toBe('ai_generated');

    expect(dishB).toBeDefined();
    expect(dishB?.cookCount).toBe(5);
    expect(dishB?.recipeStatus).toBe('needs_registration');
    expect(dishB?.sourceType).toBe('classic_book');
  });

  it('splits titles with complex combinations of delimiters, brackets, and conjunctions', () => {
    const raw = '夕食：【白ごはん.com】1. 鮭とキャベツのちゃんちゃん焼き 2. 豆腐とわかめの味噌汁 ＋ ポテサラ';
    const split = splitDishTitle(raw);

    // Multi-dish splitter should preserve ingredient compound dishes while splitting the triad
    expect(split.some((t) => t.includes('ちゃんちゃん焼き'))).toBe(true);
    expect(split.some((t) => t.includes('味噌汁'))).toBe(true);
    expect(split.some((t) => t.includes('ポテサラ'))).toBe(true);
  });
});

describe('M2 Forensic Auditor: Engine 2 (menu-planner.ts)', () => {
  const targetDate = '2026-10-26';
  const noJitter = { jitterRange: 0 };

  it('empirically verifies exact mathematical score calculation', () => {
    // Score = 50 * N_context + 25 * S_wishlist + 15 * S_classic - P_recency - P_protein
    const dish = makeDish({
      cookCount: 10, // Classic (+15)
      sourceType: 'classic_book',
      proteinType: 'pork',
      lastCookedDate: '2026-10-24', // 2 days ago -> Recency -100
      ingredients: [
        { name: '豚肉', amount: '200g', isStaple: false },
        { name: '玉ねぎ', amount: '1個', isStaple: true },
      ],
    });

    const recentProteins = {
      yesterdayProtein: 'chicken' as const,
      twoDaysAgoProtein: 'pork' as const, // Matches 2-days-ago main protein -> Protein -20
    };

    const scored = scoreDishCandidate(
      dish,
      'main',
      targetDate,
      ['豚肉', '玉ねぎ'], // 2 keyword matches -> Context +100
      recentProteins,
      [],
      noJitter
    );

    // Expected: +100 (context) + 15 (classic) - 100 (recency <=3d) - 20 (protein D-2) = -5
    expect(scored.breakdown.contextMatch).toBe(100);
    expect(scored.breakdown.classicsBonus).toBe(15);
    expect(scored.breakdown.wishlistBonus).toBe(0);
    expect(scored.breakdown.recencyPenalty).toBe(100);
    expect(scored.breakdown.proteinPenalty).toBe(20);
    expect(scored.score).toBe(-5);
  });

  it('guarantees slot locking invariant under extreme adversarial candidate exhaustion', () => {
    const lockedMain: MealSlot = {
      role: 'main',
      dishId: 'locked_main_dish_123',
      dishName: '不変の主菜',
      locked: true,
      lockReason: '家族の絶対指定',
      ingredients: [],
      steps: [],
    };

    const lockedSide: MealSlot = {
      role: 'side',
      dishId: 'locked_side_dish_456',
      dishName: '不変の副菜',
      locked: true,
      lockReason: '作り置き',
      ingredients: [],
      steps: [],
    };

    const soupDish = makeDish({ category: 'soup', id: 'soup_789', name: '唯一の汁物' });

    const proposed = proposeDailyMenu({
      targetDate,
      currentSlots: [lockedMain, lockedSide],
      allDishes: [soupDish], // Only soup dish available
      forceNewChallenge: true, // Even with challenge request, locked slots MUST NOT be overwritten!
      options: noJitter,
    });

    expect(proposed[0].dishId).toBe('locked_main_dish_123');
    expect(proposed[0].locked).toBe(true);
    expect(proposed[0].lockReason).toBe('家族の絶対指定');

    expect(proposed[1].dishId).toBe('locked_side_dish_456');
    expect(proposed[1].locked).toBe(true);

    expect(proposed[2].dishId).toBe('soup_789');
  });

  it('shuffling an unlocked slot never mutates peer slots or locked slots', () => {
    const lockedMain: MealSlot = {
      role: 'main',
      dishId: 'main_1',
      dishName: 'Main One',
      locked: true,
      ingredients: [],
      steps: [],
    };
    const sideA = makeDish({ category: 'side', id: 'side_a', name: 'Side A' });
    const sideB = makeDish({ category: 'side', id: 'side_b', name: 'Side B' });
    const soupDish = makeDish({ category: 'soup', id: 'soup_1', name: 'Soup 1' });

    const initialSlots: MealSlot[] = [
      lockedMain,
      { role: 'side', dishId: 'side_a', dishName: 'Side A', locked: false, ingredients: [], steps: [] },
      { role: 'soup', dishId: 'soup_1', dishName: 'Soup 1', locked: false, ingredients: [], steps: [] },
    ];

    const shuffled = shuffleSlotCandidate(
      'side',
      initialSlots,
      [],
      [sideA, sideB, soupDish],
      noJitter
    );

    expect(shuffled[0].dishId).toBe('main_1');
    expect(shuffled[0].locked).toBe(true);
    expect(shuffled[2].dishId).toBe('soup_1');
    expect(shuffled[1].dishId).toBe('side_b');
  });
});

describe('M2 Forensic Auditor: Engine 3 (shopping-aggregator.ts)', () => {
  it('correctly consolidates fractions, decimals, and multiple dishes at arbitrary servings', () => {
    const dishes = [
      {
        role: 'main',
        baseServings: 2,
        ingredients: [
          { name: '豚肉', amount: '200g', isStaple: false },
          { name: 'キャベツ', amount: '1/4個', isStaple: false },
        ],
      },
      {
        role: 'soup',
        baseServings: 4,
        ingredients: [
          { name: 'キャベツ', amount: '1/2個', isStaple: false },
          { name: '豆腐', amount: '1丁', isStaple: false },
        ],
      },
    ];

    // Target servings = 4
    // Main scaled by 4/2 = 2x -> 豚肉: 400g, キャベツ: 1/2個
    // Soup scaled by 4/4 = 1x -> キャベツ: 1/2個, 豆腐: 1丁
    // Total キャベツ: 1/2 + 1/2 = 1個
    const state = consolidateAndPartitionShoppingList(dishes, 4);

    const pork = state.mainItems.find((i) => i.name === '豚肉');
    expect(pork?.amount).toBe('400g');

    const cabbage = state.mainItems.find((i) => i.name === 'キャベツ');
    expect(cabbage?.amount).toBe('1個');
    expect(cabbage?.dishRole).toBe('主菜・汁物');

    const tofu = state.mainItems.find((i) => i.name === '豆腐');
    expect(tofu?.amount).toBe('1丁');
  });

  it('promotes and demotes staples with state immutability', () => {
    const dishes = [
      {
        role: 'main',
        baseServings: 3,
        ingredients: [
          { name: '玉ねぎ', amount: '1個', isStaple: true },
          { name: '牛肉', amount: '250g', isStaple: false },
        ],
      },
    ];

    const state0 = consolidateAndPartitionShoppingList(dishes, 3);
    const onionStaple = state0.stapleItems.find((s) => s.name.includes('玉ねぎ'));
    expect(onionStaple).toBeDefined();

    const state1 = promoteStapleToMain(state0, onionStaple!.id);
    expect(state1.stapleItems.find((s) => s.id === onionStaple!.id)).toBeUndefined();
    const promotedOnion = state1.mainItems.find((i) => i.id === onionStaple!.id);
    expect(promotedOnion?.amount).toBe('補充');
    expect(promotedOnion?.dishRole).toBe('常備品');
    expect(promotedOnion?.promotedFromStaple).toBe(true);

    const state2 = demotePromotedStaple(state1, promotedOnion!.id);
    expect(state2.mainItems.find((i) => i.id === promotedOnion!.id)).toBeUndefined();
    expect(state2.stapleItems.find((s) => s.id === onionStaple!.id)).toBeDefined();
  });

  it('formats LINE shopping memo accurately excluding checked items', () => {
    const items = [
      { id: 1, name: '牛肩ロース', amount: '400g', dishRole: '主菜', checked: false },
      { id: 2, name: 'じゃがいも', amount: '3個', dishRole: '副菜', checked: false },
      { id: 3, name: 'にんじん', amount: '1本', dishRole: '副菜', checked: true }, // bought already
    ];

    const memo = formatLineShoppingMemo(items, '2026-10-31');
    expect(memo).toContain('【10/31 買い物メモ】');
    expect(memo).toContain('・牛肩ロース（400g）');
    expect(memo).toContain('・じゃがいも（3個）');
    expect(memo).not.toContain('にんじん');
  });
});

describe('M2 Forensic Auditor: Engine 4 (timeline-scheduler.ts & gemini.ts)', () => {
  it('schedules arbitrary dishes maintaining cutting board hygiene sequence', () => {
    const dishes: DishScheduleInput[] = [
      {
        name: '牛カルビのスタミナ炒め',
        role: 'main',
        ingredients: [
          { name: '牛カルビ肉', amount: '300g' },
          { name: 'キャベツ', amount: '1/4個' },
        ],
        steps: ['キャベツをざく切りにする。', '牛肉とキャベツを炒める。'],
      },
      {
        name: '厚揚げと小松菜のさっと煮',
        role: 'side',
        ingredients: [
          { name: '小松菜', amount: '1束' },
          { name: '厚揚げ', amount: '1枚' },
        ],
        steps: ['小松菜と厚揚げを切って煮る。'],
      },
    ];

    const schedule = scheduleParallelCookingTimeline(dishes, 3);
    expect(schedule.estimatedMinutes).toBe(23);
    expect(schedule.steps).toHaveLength(3);

    const p1 = schedule.steps[0];
    // Check hygiene ordering: vegetables -> tofu/processed -> meats/seafood
    expect(p1.instruction).toContain('まな板の衛生順');
    expect(p1.instruction).toContain('野菜');
    expect(p1.instruction).toContain('肉・魚');
  });

  it('guarantees deterministic offline fallback without uncaught network exceptions', async () => {
    const dishes: DishScheduleInput[] = [
      {
        name: 'サンマの塩焼き',
        role: 'main',
        steps: ['サンマをグリルで焼く'],
      },
    ];

    const timeline = await generateCookingTimelineWithGemini(dishes, 2);
    expect(timeline.steps).toHaveLength(3);
    expect(timeline.estimatedMinutes).toBeGreaterThan(0);

    const ocr = await ocrRecipePhoto('sample_data');
    expect(ocr.name).toBe(DETERMINISTIC_OCR_FALLBACK_RECIPE.name);

    expect(isAllowedRecipeUrl('https://www.kurashiru.com/recipes/test')).toBe(true);
    expect(isAllowedRecipeUrl('https://untrusted-cooking-site.xyz/recipe')).toBe(false);
  });
});
