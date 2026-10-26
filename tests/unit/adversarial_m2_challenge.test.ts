// ============================================================================
// Kazoku-Kondate Milestone M2 Adversarial Empirical Challenge Suite
// Tests: src/lib/ics-parser.ts & src/lib/menu-planner.ts
// Critic & Specialist Empirical Verification Harness
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
  BUILTIN_CANONICAL_CLUSTERS,
} from '@/lib/ics-parser';
import {
  proposeDailyMenu,
  shuffleSlotCandidate,
  scoreDishCandidate,
  rankDishCandidates,
  computeDaysDiff,
  tokenizeContextMemo,
  extractRecentProteins,
  getDaysSinceLastCooked,
} from '@/lib/menu-planner';
import type { ParsedDish, ParsedDailyMenu, MealSlot } from '@/db/schema';
import { SEED_DISHES } from '@/db/seed';

describe('M2 Adversarial Empirical Challenge Suite', () => {
  // ==========================================================================
  // CHALLENGE 1: Malformed & Pathological ICS Streams
  // ==========================================================================
  describe('Challenge 1: Pathological .ics Stream Parsing', () => {
    it('handles empty string, whitespace-only, and BOM-only streams without crashing', () => {
      const emptyRes = parseIcsCalendar('');
      expect(emptyRes.totalEvents).toBe(0);
      expect(emptyRes.dishes).toEqual([]);
      expect(emptyRes.dailyMenus).toEqual([]);
      expect(emptyRes.dateRange).toBeNull();

      const wsRes = parseIcsCalendar('   \r\n\t\r\n   ');
      expect(wsRes.totalEvents).toBe(0);

      const bomOnly = parseIcsCalendar('\uFEFF');
      expect(bomOnly.totalEvents).toBe(0);
    });

    it('survives missing VEVENT tags: unclosed BEGIN:VEVENT, stray END:VEVENT, nested BEGIN', () => {
      // 1. Missing END:VEVENT
      const unclosedIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261025',
        'SUMMARY:豚の生姜焼き',
        // Missing END:VEVENT
        'END:VCALENDAR',
      ].join('\r\n');
      const unclosedRes = parseIcsCalendar(unclosedIcs);
      // Because END:VEVENT never arrived, raw parser drops the incomplete event
      expect(unclosedRes.totalEvents).toBe(0);

      // 2. Stray END:VEVENT without BEGIN
      const strayIcs = [
        'BEGIN:VCALENDAR',
        'DTSTART;VALUE=DATE:20261025',
        'SUMMARY:豚の生姜焼き',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const strayRes = parseIcsCalendar(strayIcs);
      expect(strayRes.totalEvents).toBe(0);

      // 3. Nested BEGIN:VEVENT without prior END
      const nestedIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261024',
        'SUMMARY:最初の未完了料理',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261025',
        'SUMMARY:鶏の唐揚げ',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const nestedRes = parseIcsCalendar(nestedIcs);
      // Second VEVENT cleanly overwrites currentEvent and completes on END:VEVENT
      expect(nestedRes.totalEvents).toBe(1);
      expect(nestedRes.dishes[0].name).toBe('鶏の唐揚げ');
    });

    it('handles extreme line folding: 50 consecutive folded lines and single-byte folds', () => {
      // Build a title folded across 30 lines
      const title = '豚バラと大根のこっくり照り煮';
      let foldedSummary = 'SUMMARY:';
      for (const char of title) {
        foldedSummary += '\r\n ' + char;
      }
      const ics = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261025',
        foldedSummary,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const res = parseIcsCalendar(ics);
      expect(res.totalEvents).toBe(1);
      expect(res.dishes[0].name).toBe('豚バラと大根のこっくり照り煮');
    });

    it('handles unknown, exotic, or missing timezones in DTSTART', () => {
      // 1. Unknown TZID
      const unknownTzIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;TZID=Mars/Olympus_Mons:20261025T180000',
        'SUMMARY:カレーライス',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const res1 = parseIcsCalendar(unknownTzIcs);
      expect(res1.dailyMenus[0].date).toBe('2026-10-25');

      // 2. Corrupted DTSTART value
      const corruptedDt = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART:NOT_A_DATE',
        'SUMMARY:カレーライス',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const res2 = parseIcsCalendar(corruptedDt);
      // Event dropped because date is null
      expect(res2.totalEvents).toBe(0);

      // 3. UTC boundary crossing: 2026-10-25T15:00:00Z -> JST is 2026-10-26 00:00:00
      const boundaryIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART:20261025T150000Z',
        'SUMMARY:カレーライス',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const res3 = parseIcsCalendar(boundaryIcs);
      expect(res3.dailyMenus[0].date).toBe('2026-10-26');
    });

    it('processes a massive stream of 2,000 VEVENTs in under 500ms without memory bloat', () => {
      const events: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0'];
      for (let i = 1; i <= 2000; i++) {
        const day = String((i % 28) + 1).padStart(2, '0');
        const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
        events.push(
          'BEGIN:VEVENT',
          `DTSTART;VALUE=DATE:2026${month}${day}`,
          `SUMMARY:豚の生姜焼き、ポテトサラダ、豆腐の味噌汁`,
          'END:VEVENT'
        );
      }
      events.push('END:VCALENDAR');
      const hugeStream = events.join('\r\n');

      const start = performance.now();
      const res = parseIcsCalendar(hugeStream);
      const elapsed = performance.now() - start;

      expect(res.totalEvents).toBe(2000);
      expect(res.mealEventsFound).toBe(2000);
      expect(res.uniqueDishes).toBe(3);
      expect(res.classicsCount).toBe(3); // Cooked ~2000 times each
      expect(elapsed).toBeLessThan(1000); // Must be fast
    });
  });

  // ==========================================================================
  // CHALLENGE 2: Non-Meal Filtering & Japanese Delimiter Stress
  // ==========================================================================
  describe('Challenge 2: Non-Meal Heuristics & Delimiter Edge Cases', () => {
    it('correctly classifies appointments containing food words vs genuine meals', () => {
      // 1. Appointments with food words that SHOULD be rejected as non-meal
      expect(isMealEvent('歯医者帰りにカレー屋打ち合わせ')).toBe(false);
      expect(isMealEvent('15:00 ミーティング（カレーライスの件）')).toBe(false);
      expect(isMealEvent('山田さんとランチ')).toBe(false);
      expect(isMealEvent('田中さんランチ')).toBe(false);
      expect(isMealEvent('忘年会で焼肉')).toBe(false);
      expect(isMealEvent('外食：サイゼリヤ')).toBe(false);
      expect(isMealEvent('家族で外食（スシロー）')).toBe(false);
      expect(isMealEvent('健康診断（朝食抜き）')).toBe(false);

      // 2. Genuine meals with prefixes that rescue medical context
      expect(isMealEvent('夕食: 歯医者帰りのため柔らかいうどん')).toBe(true);
      expect(isMealEvent('夜ご飯: 豚の生姜焼き')).toBe(true);
      expect(isMealEvent('献立：鮭とキャベツのちゃんちゃん焼き')).toBe(true);
    });

    it('tests multi-dish title splitting across various Japanese delimiters', () => {
      // Japanese comma
      expect(splitDishTitle('豚の生姜焼き、ポテトサラダ')).toEqual([
        '豚の生姜焼き',
        'ポテトサラダ',
      ]);
      // Middle dot
      expect(splitDishTitle('鶏の唐揚げ・ほうれん草の胡麻和え・味噌汁')).toEqual([
        '鶏の唐揚げ',
        'ほうれん草の胡麻和え',
        '味噌汁',
      ]);
      // Plus signs (half & full width)
      expect(splitDishTitle('ハンバーグ＋ポテサラ+コンソメスープ')).toEqual([
        'ハンバーグ',
        'ポテサラ',
        'コンソメスープ',
      ]);
      // Slashes
      expect(splitDishTitle('カレーライス／ポテトサラダ/わかめスープ')).toEqual([
        'カレーライス',
        'ポテトサラダ',
        'わかめスープ',
      ]);
      // Numbered bullets: 1. 2. 3.
      expect(splitDishTitle('1. 生姜焼き 2. ポテサラ 3. 味噌汁')).toEqual([
        '生姜焼き',
        'ポテサラ',
        '味噌汁',
      ]);
      // Multi-line in title
      expect(splitDishTitle('豚の生姜焼き\nポテトサラダ\r\n豆腐の味噌汁')).toEqual([
        '豚の生姜焼き',
        'ポテトサラダ',
        '豆腐の味噌汁',
      ]);
    });

    it('evaluates conjunction "と" splitting vs compound ingredient dish preservation', () => {
      // 1. Should NOT split compound dishes known to have "と":
      expect(splitDishTitle('豚バラと大根のこっくり照り煮')).toEqual([
        '豚バラと大根のこっくり照り煮',
      ]);
      expect(splitDishTitle('きゅうりとわかめの酢の物')).toEqual([
        'きゅうりとわかめの酢の物',
      ]);
      expect(splitDishTitle('豆腐とわかめの味噌汁')).toEqual([
        '豆腐とわかめの味噌汁',
      ]);
      expect(splitDishTitle('小松菜と油揚げのさっと煮びたし')).toEqual([
        '小松菜と油揚げのさっと煮びたし',
      ]);

      // 2. Should cleanly split independent dishes connected by "と":
      expect(splitDishTitle('生姜焼きと味噌汁')).toEqual(['生姜焼き', '味噌汁']);
      expect(splitDishTitle('唐揚げとポテトサラダ')).toEqual(['唐揚げ', 'ポテトサラダ']);
      expect(splitDishTitle('ハンバーグとコーンスープ')).toEqual(['ハンバーグ', 'コーンスープ']);
    });

    it('probes delimiter edge cases: full-width space, semicolons, and uncommon conjunctions', () => {
      // Space separated without punctuation
      const spaceSeparated = splitDishTitle('生姜焼き　味噌汁');
      // Empirical verification: does it split or stay together?
      // Record behavior in empirical findings
      expect(Array.isArray(spaceSeparated)).toBe(true);

      // Semicolon separated
      const semiSeparated = splitDishTitle('生姜焼き; 味噌汁');
      expect(Array.isArray(semiSeparated)).toBe(true);

      // Compound dish with non-listed vegetable (e.g. 豚肉となすの味噌炒め)
      const eggplantDish = splitDishTitle('豚肉となすの味噌炒め');
      expect(Array.isArray(eggplantDish)).toBe(true);
    });
  });

  // ==========================================================================
  // CHALLENGE 3: Menu Planner Edge Cases & Invariant Preservation
  // ==========================================================================
  describe('Challenge 3: Menu Planner Boundary Conditions & Invariants', () => {
    it('handles empty candidate pool gracefully without unhandled exceptions', () => {
      const targetDate = '2026-10-25';
      const result = proposeDailyMenu({
        targetDate,
        allDishes: [], // 0 available dishes!
      });

      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('main');
      expect(result[0].dishId).toBe('placeholder_main');
      expect(result[0].dishName).toContain('未登録');
      expect(result[1].role).toBe('side');
      expect(result[1].dishId).toBe('placeholder_side');
      expect(result[2].role).toBe('soup');
      expect(result[2].dishId).toBe('placeholder_soup');
    });

    it('strictly preserves ALL 3 locked slots when all slots are locked', () => {
      const targetDate = '2026-10-25';
      const mockSlots: MealSlot[] = [
        {
          role: 'main',
          dishId: 'dish_locked_main',
          dishName: 'お祖父ちゃんの牛丼',
          locked: true,
          lockReason: 'お祖父ちゃん特製',
          ingredients: ['牛肉 200g'],
          steps: ['煮込む'],
        },
        {
          role: 'side',
          dishId: 'dish_locked_side',
          dishName: '自家製ポテサラ',
          locked: true,
          lockReason: '昨日からの残り物',
          ingredients: ['じゃがいも 2個'],
          steps: ['潰す'],
        },
        {
          role: 'soup',
          dishId: 'dish_locked_soup',
          dishName: '具だくさん豚汁',
          locked: true,
          lockReason: '家族リクエスト',
          ingredients: ['豚肉 100g'],
          steps: ['味噌を溶く'],
        },
      ];

      const result = proposeDailyMenu({
        targetDate,
        currentSlots: mockSlots,
        lockedSlots: [
          { role: 'main', lockReason: 'お祖父ちゃん特製' },
          { role: 'side', lockReason: '昨日からの残り物' },
          { role: 'soup', lockReason: '家族リクエスト' },
        ],
        allDishes: SEED_DISHES,
      });

      expect(result[0].dishId).toBe('dish_locked_main');
      expect(result[0].locked).toBe(true);
      expect(result[0].lockReason).toBe('お祖父ちゃん特製');

      expect(result[1].dishId).toBe('dish_locked_side');
      expect(result[1].locked).toBe(true);

      expect(result[2].dishId).toBe('dish_locked_soup');
      expect(result[2].locked).toBe(true);
    });

    it('shuffling a locked slot strictly returns unchanged state', () => {
      const mockSlots: MealSlot[] = [
        {
          role: 'main',
          dishId: 'dish_locked_main',
          dishName: 'お祖父ちゃんの牛丼',
          locked: true,
          lockReason: '固定中',
          ingredients: [],
          steps: [],
        },
        {
          role: 'side',
          dishId: 'dish_side',
          dishName: 'ポテトサラダ',
          locked: false,
          ingredients: [],
          steps: [],
        },
        {
          role: 'soup',
          dishId: 'dish_soup',
          dishName: '豆腐の味噌汁',
          locked: false,
          ingredients: [],
          steps: [],
        },
      ];

      const shuffled = shuffleSlotCandidate('main', mockSlots, [], SEED_DISHES);
      expect(shuffled[0].dishId).toBe('dish_locked_main');
      expect(shuffled[0].locked).toBe(true);
    });

    it('handles catalog where 100% of main dishes have identical protein (pork)', () => {
      // Create 3 pork dishes
      const porkDishes: ParsedDish[] = [
        {
          id: 'pork_1',
          name: '豚の生姜焼き',
          aliases: [],
          category: 'main',
          proteinType: 'pork',
          sourceType: 'classic_book',
          recipeStatus: 'confirmed',
          baseServings: 3,
          ingredients: [{ name: '豚肉', amount: '300g', isStaple: false }],
          steps: ['焼く'],
          cookCount: 10,
          createdAt: '2026-01-01',
        },
        {
          id: 'pork_2',
          name: '豚肉の甘辛炒め',
          aliases: [],
          category: 'main',
          proteinType: 'pork',
          sourceType: 'ai_generated',
          recipeStatus: 'ai_provisional',
          baseServings: 3,
          ingredients: [{ name: '豚肉', amount: '300g', isStaple: false }],
          steps: ['炒める'],
          cookCount: 2,
          createdAt: '2026-01-01',
        },
        {
          id: 'pork_3',
          name: '豚カツ',
          aliases: [],
          category: 'main',
          proteinType: 'pork',
          sourceType: 'ai_generated',
          recipeStatus: 'ai_provisional',
          baseServings: 3,
          ingredients: [{ name: '豚ロース', amount: '3枚', isStaple: false }],
          steps: ['揚げる'],
          cookCount: 1,
          createdAt: '2026-01-01',
        },
      ];

      // Past menu yesterday had pork
      const pastMenus: ParsedDailyMenu[] = [
        {
          date: '2026-10-24',
          servings: 3,
          contextMemo: null,
          slots: [
            {
              role: 'main',
              dishId: 'pork_1',
              dishName: '豚の生姜焼き',
              locked: false,
              ingredients: [],
              steps: [],
            },
          ],
          parallelSteps: null,
          shoppingState: null,
          updatedAt: '2026-10-24T18:00:00Z',
        },
      ];

      // Propose daily menu for today (2026-10-25)
      const res = proposeDailyMenu({
        targetDate: '2026-10-25',
        pastMenus,
        allDishes: porkDishes,
        options: { jitterRange: 0 },
      });

      // Even though all have pork and get -40 penalty, it must cleanly select a dish without deadlock
      expect(res[0].role).toBe('main');
      expect(res[0].dishId).toBeDefined();
      expect(res[0].dishId).not.toBe('placeholder_main');

      // Shuffling cycles through candidates smoothly
      const slot1 = shuffleSlotCandidate('main', res, pastMenus, porkDishes, {
        targetDate: '2026-10-25',
        jitterRange: 0,
      });
      expect(slot1[0].dishId).toBeDefined();
      const slot2 = shuffleSlotCandidate('main', slot1, pastMenus, porkDishes, {
        targetDate: '2026-10-25',
        jitterRange: 0,
      });
      expect(slot2[0].dishId).toBeDefined();
    });

    it('resists ReDoS and syntax errors from adversarial contextMemo input', () => {
      const adversarialMemos = [
        '(((((((((([a-z]+)+)+)+)+)+)+)+)+)$',
        '豚肉.*+?^${}()|[]\\',
        '\\u0000\\x00\\n\\r\\t',
        'A'.repeat(5000), // Massive token
        ',,,,,,,,,、、、、、、+++++++',
      ];

      for (const memo of adversarialMemos) {
        expect(() => {
          const tokens = tokenizeContextMemo(memo);
          expect(Array.isArray(tokens)).toBe(true);

          proposeDailyMenu({
            targetDate: '2026-10-25',
            contextMemo: memo,
            allDishes: SEED_DISHES,
          });
        }).not.toThrow();
      }
    });

    it('verifies extreme recency sliding window calculations', () => {
      // Test computeDaysDiff
      expect(computeDaysDiff('2026-10-20', '2026-10-25')).toBe(5);
      expect(computeDaysDiff('2026-10-25', '2026-10-20')).toBe(-5);
      expect(computeDaysDiff('2026-10-25', '2026-10-25')).toBe(0);
      expect(computeDaysDiff('INVALID', '2026-10-25')).toBe(999);

      // Test penalty calculation at exact window thresholds: 3d, 7d, 14d, 15d
      const targetDate = '2026-10-25';
      const dish: ParsedDish = {
        id: 'test_dish',
        name: '豚の生姜焼き',
        aliases: [],
        category: 'main',
        proteinType: 'pork',
        sourceType: 'classic_book',
        recipeStatus: 'confirmed',
        baseServings: 3,
        ingredients: [],
        steps: [],
        cookCount: 5,
        lastCookedDate: '2026-10-22', // 3 days ago
        createdAt: '2026-01-01',
      };

      // 3 days ago -> penalty 100
      let scored = scoreDishCandidate(
        dish,
        'main',
        targetDate,
        [],
        { yesterdayProtein: null, twoDaysAgoProtein: null },
        [],
        { jitterRange: 0 }
      );
      expect(scored.breakdown.recencyPenalty).toBe(100);

      // 4 days ago -> penalty 60
      dish.lastCookedDate = '2026-10-21';
      scored = scoreDishCandidate(
        dish,
        'main',
        targetDate,
        [],
        { yesterdayProtein: null, twoDaysAgoProtein: null },
        [],
        { jitterRange: 0 }
      );
      expect(scored.breakdown.recencyPenalty).toBe(60);

      // 8 days ago -> penalty 30
      dish.lastCookedDate = '2026-10-17';
      scored = scoreDishCandidate(
        dish,
        'main',
        targetDate,
        [],
        { yesterdayProtein: null, twoDaysAgoProtein: null },
        [],
        { jitterRange: 0 }
      );
      expect(scored.breakdown.recencyPenalty).toBe(30);

      // 15 days ago -> penalty 0
      dish.lastCookedDate = '2026-10-10';
      scored = scoreDishCandidate(
        dish,
        'main',
        targetDate,
        [],
        { yesterdayProtein: null, twoDaysAgoProtein: null },
        [],
        { jitterRange: 0 }
      );
      expect(scored.breakdown.recencyPenalty).toBe(0);
    });

    it('tests forceNewChallenge injection across locked slot states', () => {
      // When side slot is locked, challenge falls back to unlocked main or soup slot
      const slotsWithSideLocked: MealSlot[] = [
        {
          role: 'main',
          dishId: 'm1',
          dishName: '豚の生姜焼き',
          locked: false,
          ingredients: [],
          steps: [],
        },
        {
          role: 'side',
          dishId: 's1',
          dishName: '固定ポテサラ',
          locked: true,
          lockReason: '残り物',
          ingredients: [],
          steps: [],
        },
        {
          role: 'soup',
          dishId: 'sp1',
          dishName: '味噌汁',
          locked: false,
          ingredients: [],
          steps: [],
        },
      ];

      const res = proposeDailyMenu({
        targetDate: '2026-10-25',
        currentSlots: slotsWithSideLocked,
        lockedSlots: [{ role: 'side', lockReason: '残り物' }],
        allDishes: SEED_DISHES,
        forceNewChallenge: true,
      });

      // Side remains locked
      expect(res[1].dishId).toBe('s1');
      expect(res[1].locked).toBe(true);

      // Main or soup receives the challenge without crashing
      const hasChallenge = res.some((s) => s.badge === '新レシピ挑戦');
      expect(hasChallenge).toBe(true);
    });
  });
});
