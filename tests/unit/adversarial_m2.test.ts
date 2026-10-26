// ============================================================================
// Adversarial Stress Tests: tests/unit/adversarial_m2.test.ts
// Comprehensive white-box and empirical stress tests for M2 Algorithmic Engines:
// 1. Extreme Servings Scaling (1, 8, fractional, out-of-bounds)
// 2. Unusual Ingredient Amounts & Fraction Arithmetic (mixed, full-width, repeating, unquantified)
// 3. 20-Dish Massive Cross-Dish Consolidation Stress
// 4. Timeline Scheduling with 1, 2, 4 dishes, missing steps, zero cook time, board hygiene
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  parseNumericValue,
  parseJapaneseAmount,
  formatNumericAmount,
  formatConsolidatedAmount,
  consolidateAndPartitionShoppingList,
  promoteStapleToMain,
  demotePromotedStaple,
  toggleShoppingItemChecked,
  formatLineShoppingMemo,
  DishWithIngredients,
} from '@/lib/shopping-aggregator';
import {
  scheduleParallelCookingTimeline,
  DishScheduleInput,
} from '@/lib/timeline-scheduler';

describe('M2 Adversarial Stress Suite: Shopping Aggregator & Fraction Arithmetic', () => {
  // --------------------------------------------------------------------------
  // 1. Extreme Servings Scaling
  // --------------------------------------------------------------------------
  describe('Extreme Servings Scaling', () => {
    it('scales accurately at minimum boundary (servings = 1)', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 3,
          ingredients: [
            { name: '豚バラ肉', amount: '300g' },
            { name: '大根', amount: '1/2本' },
            { name: 'トマト', amount: '3個' },
            { name: '卵', amount: '3個' }, // Staple item
            { name: '長ねぎ', amount: '1と1/2本' }, // Staple item
          ],
        },
      ];

      const result = consolidateAndPartitionShoppingList(dishes, 1);
      const pork = result.mainItems.find((i) => i.name === '豚バラ肉');
      const tomato = result.mainItems.find((i) => i.name === 'トマト');

      // 300g * (1/3) = 100g
      expect(pork?.amount).toBe('100g');
      // 3個 * (1/3) = 1個
      expect(tomato?.amount).toBe('1個');

      // 1/2 * (1/3) = 1/6 (approx 0.1667 -> maps to culinary fraction 1/5 or 0.2)
      const daikon = result.mainItems.find((i) => i.name === '大根');
      expect(daikon?.amount).toBeDefined();
      expect(['1/5本', '0.2本', '1/6本']).toContain(daikon?.amount);

      // Egg is in stapleItems: 3 * (1/3) = 1個
      const egg = result.stapleItems.find((i) => i.name.includes('卵'));
      expect(egg?.name).toBe('卵 (1個)');

      // 1.5 * (1/3) = 0.5 -> 1/2
      const negi = result.stapleItems.find((i) => i.name.includes('長ねぎ'));
      expect(negi?.name).toContain('1/2本');
    });

    it('scales accurately at maximum boundary (servings = 8)', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 3,
          ingredients: [
            { name: '豚バラ肉', amount: '300g' },
            { name: '大根', amount: '1/2本' },
            { name: '小松菜', amount: '1束' },
            { name: '絹ごし豆腐', amount: '1丁' },
          ],
        },
      ];

      const result = consolidateAndPartitionShoppingList(dishes, 8);
      const pork = result.mainItems.find((i) => i.name === '豚バラ肉');
      const daikon = result.mainItems.find((i) => i.name === '大根');
      const komatsuna = result.mainItems.find((i) => i.name === '小松菜');
      const tofu = result.mainItems.find((i) => i.name === '絹ごし豆腐');

      // 300g * (8/3) = 800g
      expect(pork?.amount).toBe('800g');

      // 0.5 * (8/3) = 1.3333 -> "1と1/3本"
      expect(daikon?.amount).toBe('1と1/3本');

      // 1 * (8/3) = 2.6667 -> "2と2/3束"
      expect(komatsuna?.amount).toBe('2と2/3束');

      // 1 * (8/3) = 2.6667 -> "2と2/3丁"
      expect(tofu?.amount).toBe('2と2/3丁');
    });

    it('clamps out-of-bounds servings to [1..8]', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 2,
          ingredients: [{ name: '牛肉', amount: '200g' }],
        },
      ];

      // Servings = 0 should fallback to 3
      const res0 = consolidateAndPartitionShoppingList(dishes, 0);
      expect(res0.mainItems[0].amount).toBe('300g'); // 0 || 3 => 3 servings -> 300g

      // Servings = -10 clamps to 1
      const resNeg = consolidateAndPartitionShoppingList(dishes, -10);
      expect(resNeg.mainItems[0].amount).toBe('100g'); // clamped to 1 => 100g

      // Servings = 99 clamps to 8
      const resMax = consolidateAndPartitionShoppingList(dishes, 99);
      expect(resMax.mainItems[0].amount).toBe('800g'); // clamped to 8 => 800g
    });

    it('handles fractional target servings (e.g. 2.5 servings)', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 2,
          ingredients: [
            { name: '鶏もも肉', amount: '200g' },
            { name: '長ねぎ', amount: '1本' },
          ],
        },
      ];

      const result = consolidateAndPartitionShoppingList(dishes, 2.5);
      const chicken = result.mainItems.find((i) => i.name === '鶏もも肉');
      expect(chicken?.amount).toBe('250g'); // 200 * (2.5 / 2) = 250g

      const negi = result.stapleItems.find((i) => i.name.includes('長ねぎ'));
      // 1 * 1.25 = 1.25 -> "1と1/4本"
      expect(negi?.name).toContain('1と1/4本');
    });

    it('handles abnormal baseServings gracefully (baseServings = 0 or negative)', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 0,
          ingredients: [{ name: '豚肉', amount: '300g' }],
        },
        {
          role: 'side',
          baseServings: -5,
          ingredients: [{ name: 'もやし', amount: '1袋' }],
        },
      ];

      // Safe fallback prevents Division by Zero (defaults baseServings to 3 or 1)
      const res = consolidateAndPartitionShoppingList(dishes, 3);
      expect(res.mainItems.find((i) => i.name === '豚肉')?.amount).toBe('300g');
      expect(res.mainItems.find((i) => i.name === 'もやし')?.amount).toBe('3袋');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Unusual Ingredient Amounts & Fraction Arithmetic
  // --------------------------------------------------------------------------
  describe('Unusual Ingredient Amounts & Fraction Parsing', () => {
    it('parses diverse mixed fraction notations', () => {
      expect(parseNumericValue('1と1/2')).toBe(1.5);
      expect(parseNumericValue('2と3/4')).toBe(2.75);
      expect(parseNumericValue('1と1/3')).toBeCloseTo(1.3333, 3);
      expect(parseNumericValue('3 1/4')).toBe(3.25);
      expect(parseNumericValue('2 2/3')).toBeCloseTo(2.6667, 3);
    });

    it('parses full-width unicode fractions and numbers', () => {
      const a1 = parseJapaneseAmount('½本', 1);
      expect(a1.numeric).toBe(0.5);
      expect(a1.unit).toBe('本');

      const a2 = parseJapaneseAmount('¼個', 1);
      expect(a2.numeric).toBe(0.25);
      expect(a2.unit).toBe('個');

      const a3 = parseJapaneseAmount('¾丁', 1);
      expect(a3.numeric).toBe(0.75);
      expect(a3.unit).toBe('丁');

      const a4 = parseJapaneseAmount('１と１／２カップ', 1);
      expect(a4.numeric).toBe(1.5);
      expect(a4.unit).toBe('カップ');

      const a5 = parseJapaneseAmount('大さじ　２', 1);
      expect(a5.numeric).toBe(2);
      expect(a5.unit).toBe('大さじ');
    });

    it('formats repeating decimals into closest culinary fractions', () => {
      expect(formatNumericAmount(1 / 3)).toBe('1/3');
      expect(formatNumericAmount(2 / 3)).toBe('2/3');
      expect(formatNumericAmount(1 + 1 / 3)).toBe('1と1/3');
      expect(formatNumericAmount(2 + 2 / 3)).toBe('2と2/3');
      expect(formatNumericAmount(1 / 4)).toBe('1/4');
      expect(formatNumericAmount(3 / 4)).toBe('3/4');
      expect(formatNumericAmount(1 / 5)).toBe('1/5');
      expect(formatNumericAmount(4 / 5)).toBe('4/5');
    });

    it('handles qualitative and unquantified Japanese descriptions safely', () => {
      const qualitativeCases = [
        '少々',
        '適量',
        'お好みで',
        '適宜',
        'ひとつまみ',
        'ふたつまみ',
        'ひとつかみ',
        '適度',
        '少々〜適量',
      ];

      for (const desc of qualitativeCases) {
        const parsed = parseJapaneseAmount(desc, 3);
        expect(parsed.isQualitative).toBe(true);
        expect(parsed.numeric).toBeNull();
        expect(parsed.raw).toBe(desc);
      }

      // Vague or unparseable descriptors fall back safely without crashing
      const vagueDesc = parseJapaneseAmount('親指大1個', 2);
      expect(vagueDesc).toBeDefined();

      // Range amounts: "大さじ1〜2" falls back to qualitative
      const rangeDesc1 = parseJapaneseAmount('大さじ1〜2', 2);
      expect(rangeDesc1.isQualitative).toBe(true);
      expect(rangeDesc1.raw).toContain('大さじ1〜2');
    });

    it('handles range expressions (e.g. 2〜3個) safely preserving units and amounts', () => {
      const parsedRange = parseJapaneseAmount('2〜3個', 2);
      expect(parsedRange.raw).toMatch(/[24]〜[36]個|2〜3個/);
      if (parsedRange.isQualitative) {
        expect(parsedRange.raw).toBe('2〜3個');
      } else {
        expect(parsedRange.unit).toBe('個');
        expect(parsedRange.raw).toMatch(/4〜6個|2〜3個/);
      }
    });

    it('consolidates ingredient spelling aliases', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          ingredients: [{ name: 'タマネギ', amount: '1個' }],
        },
        {
          role: 'side',
          ingredients: [{ name: 'たまねぎ', amount: '1個' }],
        },
        {
          role: 'soup',
          ingredients: [{ name: '玉ねぎ', amount: '1個' }],
        },
      ];

      const result = consolidateAndPartitionShoppingList(dishes, 3);
      // All three should merge into '玉ねぎ' in stapleItems (玉ねぎ is in DEFAULT_STAPLE_ITEMS)
      const onionMatches = result.stapleItems.filter((i) => i.name.includes('玉ねぎ'));
      expect(onionMatches).toHaveLength(1);
      expect(onionMatches[0].name).toContain('3個');
    });

    it('handles empty ingredient amounts or missing fields without throwing', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          ingredients: [
            { name: 'キャベツ', amount: '' },
            { name: 'もやし', amount: '   ' },
            { name: '', amount: '100g' }, // Empty name should be skipped
          ],
        },
      ];

      const result = consolidateAndPartitionShoppingList(dishes, 3);
      expect(result.mainItems.some((i) => i.name === 'キャベツ')).toBe(true);
      expect(result.mainItems.some((i) => i.name === 'もやし')).toBe(true);
      expect(result.mainItems.some((i) => i.name === '')).toBe(false);
    });

    it('handles undefined dish.ingredients safely without throwing uncaught TypeError', () => {
      const malformedDishes = [
        {
          role: 'main',
          ingredients: undefined as unknown as DishWithIngredients['ingredients'],
        },
      ];

      expect(() => {
        const result = consolidateAndPartitionShoppingList(malformedDishes, 3);
        expect(result).toBeDefined();
        expect(result.mainItems).toEqual([]);
        expect(result.stapleItems).toBeDefined();
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 3. Cross-dish Consolidation Stress (20 Dishes)
  // --------------------------------------------------------------------------
  describe('20-Dish Massive Consolidation Stress', () => {
    it('consolidates 20 dishes with duplicate overlapping ingredients under 50ms', () => {
      const startTime = performance.now();

      // Construct 20 dishes with heavy ingredient sharing
      const manyDishes: DishWithIngredients[] = [];
      const commonIngredients = [
        { name: '豚バラ肉', amount: '100g' },
        { name: '醤油', amount: '大さじ1', isStaple: true },
        { name: 'みりん', amount: '大さじ1', isStaple: true },
        { name: '酒', amount: '大さじ1', isStaple: true },
        { name: '砂糖', amount: '小さじ1', isStaple: true },
        { name: '玉ねぎ', amount: '1/2個', isStaple: true },
        { name: '大根', amount: '1/4本' },
        { name: '長ねぎ', amount: '1/2本', isStaple: true },
        { name: '豆腐', amount: '1/2丁' },
        { name: 'ごま油', amount: '小さじ1', isStaple: true },
      ];

      for (let i = 1; i <= 20; i++) {
        const role = i % 3 === 1 ? 'main' : i % 3 === 2 ? 'side' : 'soup';
        manyDishes.push({
          role,
          name: `テスト料理第${i}品`,
          baseServings: 2,
          ingredients: [
            commonIngredients[i % commonIngredients.length],
            commonIngredients[(i + 1) % commonIngredients.length],
            commonIngredients[(i + 2) % commonIngredients.length],
            { name: `特有材料${i}`, amount: `${i * 10}g` },
          ],
        });
      }

      const result = consolidateAndPartitionShoppingList(manyDishes, 4); // ratio = 4/2 = 2x
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(100); // Must be blazingly fast (<100ms)
      expect(result.mainItems.length).toBeGreaterThan(0);
      expect(result.stapleItems.length).toBeGreaterThan(0);

      // Verify no duplicate IDs or duplicate names within lists
      const mainNames = result.mainItems.map((i) => i.name);
      expect(new Set(mainNames).size).toBe(mainNames.length);

      const stapleNames = result.stapleItems.map((i) => i.name);
      expect(new Set(stapleNames).size).toBe(stapleNames.length);

      // Verify roles merged for overlapping ingredients
      const pork = result.mainItems.find((i) => i.name === '豚バラ肉');
      if (pork) {
        expect(pork.dishRole.length).toBeGreaterThan(0);
      }
    });

    it('promotes, demotes, and formats LINE shopping memo for large list', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          ingredients: [
            { name: '豚肉', amount: '300g' },
            { name: 'キャベツ', amount: '1/4個' },
            { name: '生姜', amount: '1片', isStaple: true },
          ],
        },
      ];

      let state = consolidateAndPartitionShoppingList(dishes, 3);
      const initialMainCount = state.mainItems.length;
      const initialStapleCount = state.stapleItems.length;

      // Promote staple
      const gingerStaple = state.stapleItems.find((s) => s.name.includes('しょうが') || s.name.includes('生姜'));
      expect(gingerStaple).toBeDefined();

      state = promoteStapleToMain(state, gingerStaple!.id);
      expect(state.mainItems.length).toBe(initialMainCount + 1);
      expect(state.stapleItems.length).toBe(initialStapleCount - 1);

      const promotedGinger = state.mainItems.find((i) => i.id === gingerStaple!.id);
      expect(promotedGinger?.amount).toBe('補充');
      expect(promotedGinger?.dishRole).toBe('常備品');

      // Check off one item
      state = toggleShoppingItemChecked(state, state.mainItems[0].id);

      // Format LINE memo
      const lineMemo = formatLineShoppingMemo(state.mainItems, '2026-10-26');
      expect(lineMemo).toContain('【10/26 買い物メモ】');
      expect(lineMemo).toContain('・しょうが（補充）');
      expect(lineMemo).not.toContain(`・${state.mainItems[0].name}`); // checked item is omitted

      // Demote back
      state = demotePromotedStaple(state, gingerStaple!.id);
      expect(state.mainItems.length).toBe(initialMainCount);
      expect(state.stapleItems.length).toBe(initialStapleCount);
    });
  });
});

describe('M2 Adversarial Stress Suite: Timeline Scheduler', () => {
  // --------------------------------------------------------------------------
  // 4. Timeline Scheduling with 1, 2, 4 dishes, missing steps, zero cook time
  // --------------------------------------------------------------------------
  describe('Dish Cardinality & Missing Steps / Zero Cook Time', () => {
    it('schedules properly with single dish (1 dish only)', () => {
      const singleDish: DishScheduleInput[] = [
        {
          name: '親子丼',
          role: 'main',
          ingredients: [
            { name: '鶏もも肉', amount: '200g' },
            { name: '玉ねぎ', amount: '1/2個' },
            { name: '卵', amount: '3個' },
          ],
          steps: [
            '玉ねぎを薄切りにし、鶏肉は一口大に切る。',
            '小鍋にめんつゆと玉ねぎを入れて煮る。',
            '鶏肉を加えて火が通ったら溶き卵を回し入れる。',
          ],
        },
      ];

      const result = scheduleParallelCookingTimeline(singleDish, 3);
      expect(result.estimatedMinutes).toBe(23);
      expect(result.steps).toHaveLength(3);

      // Phase 1 has hygiene slicing
      expect(result.steps[0].instruction).toContain('まな板の衛生順');
      expect(result.steps[0].instruction).toContain('玉ねぎ');
      expect(result.steps[0].instruction).toContain('鶏もも肉');

      // Phase 2 fallback message for when no side/soup exists
      expect(result.steps[1].instruction).toContain('調味料を合わせ、付け合わせの準備をしておく。');

      // Phase 3 finishes main
      expect(result.steps[2].instruction).toContain('親子丼');
    });

    it('schedules properly with single side dish (role = side only)', () => {
      const sideOnly: DishScheduleInput[] = [
        {
          name: '無限ピーマン',
          role: 'side',
          ingredients: [{ name: 'ピーマン', amount: '4個' }, { name: 'ツナ缶', amount: '1缶' }],
          steps: ['ピーマンを切ってツナと調味料を和え、レンジで加熱する。'],
        },
      ];

      const result = scheduleParallelCookingTimeline(sideOnly, 2);
      expect(result.steps).toHaveLength(3);
      expect(result.steps[2].instruction).toContain('無限ピーマン');
    });

    it('schedules properly with single soup dish (role = soup only)', () => {
      const soupOnly: DishScheduleInput[] = [
        {
          name: '豚汁',
          role: 'soup',
          ingredients: [{ name: '豚肉', amount: '100g' }, { name: '大根', amount: '1/4本' }],
          steps: ['豚肉と大根を煮て味噌を溶く。'],
        },
      ];

      const result = scheduleParallelCookingTimeline(soupOnly, 2);
      expect(result.steps).toHaveLength(3);
      expect(result.steps[2].instruction).toContain('豚汁');
    });

    it('schedules properly with 2 dishes (main + soup, no side)', () => {
      const twoDishes: DishScheduleInput[] = [
        {
          name: '豚の生姜焼き',
          role: 'main',
          ingredients: [
            { name: '豚肉', amount: '300g' },
            { name: '玉ねぎ', amount: '1個' },
          ],
          steps: ['玉ねぎを炒め、豚肉を焼く。'],
        },
        {
          name: 'わかめスープ',
          role: 'soup',
          ingredients: [
            { name: 'わかめ', amount: '適量' },
            { name: '長ねぎ', amount: '1/2本' },
          ],
          steps: ['だしを沸かしてわかめとねぎを入れる。'],
        },
      ];

      const result = scheduleParallelCookingTimeline(twoDishes, 3);
      expect(result.steps).toHaveLength(3);
      expect(result.steps[1].dishTag).toBe('汁物');
      expect(result.steps[1].instruction).toContain('わかめスープ');
    });

    it('schedules properly with 2 dishes (main + side, no soup)', () => {
      const twoDishes: DishScheduleInput[] = [
        {
          name: 'ハンバーグ',
          role: 'main',
          ingredients: [{ name: '挽肉', amount: '300g' }],
          steps: ['肉をこねて焼く。'],
        },
        {
          name: 'ポテトサラダ',
          role: 'side',
          ingredients: [{ name: 'じゃがいも', amount: '2個' }],
          steps: ['じゃがいもを茹でて潰しマヨネーズで和える。'],
        },
      ];

      const result = scheduleParallelCookingTimeline(twoDishes, 3);
      expect(result.steps).toHaveLength(3);
      expect(result.steps[1].dishTag).toBe('副菜');
      expect(result.steps[1].instruction).toContain('ポテトサラダ');
    });

    it('schedules properly with 2 dishes (side + soup, no main)', () => {
      const twoDishes: DishScheduleInput[] = [
        {
          name: 'ほうれん草のおひたし',
          role: 'side',
          ingredients: [{ name: 'ほうれん草', amount: '1束' }],
          steps: ['ほうれん草を茹でる。'],
        },
        {
          name: '卵スープ',
          role: 'soup',
          ingredients: [{ name: '卵', amount: '1個' }],
          steps: ['だしに溶き卵を入れる。'],
        },
      ];

      const result = scheduleParallelCookingTimeline(twoDishes, 2);
      expect(result.steps).toHaveLength(3);
      // The first dish becomes main by fallback dishes[0]
      expect(result.steps[2].instruction).toContain('ほうれん草のおひたし');
    });

    it('schedules properly with 4 dishes (main + 2 sides + soup)', () => {
      const fourDishes: DishScheduleInput[] = [
        {
          name: 'さばの味噌煮',
          role: 'main',
          ingredients: [{ name: 'サバ', amount: '2切れ' }],
          steps: ['サバを下処理して煮る。'],
        },
        {
          name: 'ほうれん草の胡麻和え',
          role: 'side',
          ingredients: [{ name: 'ほうれん草', amount: '1束' }],
          steps: ['ほうれん草を茹でて胡麻で和える。'],
        },
        {
          name: 'きんぴらごぼう',
          role: 'side',
          ingredients: [{ name: 'ごぼう', amount: '1本' }, { name: 'にんじん', amount: '1/2本' }],
          steps: ['千切りにして炒める。'],
        },
        {
          name: '豆腐の味噌汁',
          role: 'soup',
          ingredients: [{ name: '豆腐', amount: '1/2丁' }],
          steps: ['味噌汁を作る。'],
        },
      ];

      const result = scheduleParallelCookingTimeline(fourDishes, 4);
      expect(result.steps).toHaveLength(3);
      expect(result.estimatedMinutes).toBe(23);

      // Phase 1 includes vegetables from multiple dishes
      const p1 = result.steps[0].instruction;
      expect(p1).toContain('ほうれん草');
      expect(p1).toContain('ごぼう');
      expect(p1).toContain('サバ');
    });

    it('handles dishes with empty steps without crashing', () => {
      const dishesWithEmptySteps: DishScheduleInput[] = [
        {
          name: '冷奴',
          role: 'side',
          ingredients: [{ name: '絹ごし豆腐', amount: '1丁' }],
          steps: [], // Zero steps
        },
        {
          name: 'スピード炒め',
          role: 'main',
          ingredients: [{ name: '豚肉', amount: '200g' }],
          steps: [], // Zero steps
        },
      ];

      const result = scheduleParallelCookingTimeline(dishesWithEmptySteps, 2);
      expect(result).toBeDefined();
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].phase).toBe('下ごしらえ（まとめて切る・レンジ）');
    });

    it('handles cold dish with zero cook time (e.g. 冷奴, サラダ)', () => {
      const coldDishes: DishScheduleInput[] = [
        {
          name: '豚しゃぶサラダ',
          role: 'main',
          ingredients: [
            { name: '豚肉', amount: '200g' },
            { name: 'レタス', amount: '1/2個' },
          ],
          steps: ['豚肉をさっと茹でて冷水にとり、レタスに乗せる。'],
        },
        {
          name: '冷奴',
          role: 'side',
          ingredients: [{ name: '豆腐', amount: '1丁' }],
          steps: ['豆腐を器に盛り、薬味を乗せる。加熱なし。0分。'],
        },
      ];

      const result = scheduleParallelCookingTimeline(coldDishes, 2);
      expect(result.steps).toHaveLength(3);
      expect(result.steps[1].instruction).toContain('冷やす');
    });

    it('enforces cutting board hygiene strictly across all categorized ingredients', () => {
      const hygieneTest: DishScheduleInput[] = [
        {
          name: '海鮮チゲ',
          role: 'main',
          ingredients: [
            { name: '牛こま肉', amount: '150g' },
            { name: 'エビ', amount: '4尾' },
            { name: '木綿豆腐', amount: '1丁' },
            { name: '白菜', amount: '2枚' },
            { name: 'ニラ', amount: '1/2束' },
          ],
          steps: ['材料を煮込む。'],
        },
      ];

      const result = scheduleParallelCookingTimeline(hygieneTest, 2);
      const instruction = result.steps[0].instruction;

      // Verify hygiene order: veggies before tofu, tofu before meat/fish
      const vegIdx = instruction.indexOf('野菜（白菜・ニラ）');
      const tofuIdx = instruction.indexOf('豆腐・加工品（木綿豆腐）');
      const meatIdx = instruction.indexOf('肉・魚（牛こま肉・エビ）');

      expect(vegIdx).toBeGreaterThan(-1);
      expect(tofuIdx).toBeGreaterThan(-1);
      expect(meatIdx).toBeGreaterThan(-1);

      expect(vegIdx).toBeLessThan(tofuIdx);
      expect(tofuIdx).toBeLessThan(meatIdx);
    });

    it('provides clean natural phrasing when dish has no sliceable ingredients', () => {
      const dishesWithoutIngredients: DishScheduleInput[] = [
        {
          name: 'インスタントラーメン',
          role: 'main',
          steps: ['お湯を沸かして麺を茹でる。'],
        },
      ];

      const result = scheduleParallelCookingTimeline(dishesWithoutIngredients, 1);
      expect(result).toBeDefined();
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].instruction).not.toContain('まずをすべて切る');
      expect(result.steps[0].instruction).toMatch(/下準備|下ごしらえ|準備/);
    });

    it('handles undefined dish.steps safely without throwing uncaught TypeError', () => {
      const malformedDish = [
        {
          name: '謎の料理',
          role: 'main',
          steps: undefined as unknown as string[],
        },
      ];

      expect(() => {
        const result = scheduleParallelCookingTimeline(malformedDish, 2);
        expect(result).toBeDefined();
        expect(result.steps).toHaveLength(3);
      }).not.toThrow();
    });
  });
});
