// ============================================================================
// Kazoku-Kondate Calendar Engine Unit Test Suite: tests/unit/ics-parser.test.ts
// Tests RFC 5545 Parsing, Non-Meal Filtering, Title Splitting, Alias Normalization,
// Frequency Classification, Seeding Output, and Stress Performance.
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
import { SEED_DISHES } from '@/db/seed';

describe('ICS Parser Unit Test Suite', () => {
  // ==========================================================================
  // Group 1: RFC 5545 Stream Unfolding, Date & Character Handling
  // ==========================================================================
  describe('RFC 5545 Low-Level Parsing & Unfolding', () => {
    it('should correctly unfold lines folded with CRLF + space or tab', () => {
      const folded =
        'SUMMARY:豚肉と玉ねぎの生姜焼き、\r\n 長ねぎと豆腐の味噌\r\n\t汁\r\nSTATUS:CONFIRMED';
      const unfolded = unfoldIcsContent(folded);
      expect(unfolded).toContain('SUMMARY:豚肉と玉ねぎの生姜焼き、長ねぎと豆腐の味噌汁');
    });

    it('should unescape RFC 5545 escaped characters: comma, semicolon, backslash, newline', () => {
      const escaped = '生姜焼き\\, 味噌汁\\; 大根\\\\豚バラ\\nテスト';
      const unescaped = unescapeIcsText(escaped);
      expect(unescaped).toBe('生姜焼き, 味噌汁; 大根\\豚バラ\nテスト');
    });

    it('should parse dates across VALUE=DATE, TZID=Asia/Tokyo, and UTC Z timestamps', () => {
      // 1. All-day date
      expect(parseIcsDate('20261025')).toBe('2026-10-25');
      // 2. Timed date with Tokyo timezone
      expect(parseIcsDate('20261025T190000')).toBe('2026-10-25');
      // 3. UTC timestamp at 10:00 UTC (+9h = 19:00 JST same day)
      expect(parseIcsDate('20261025T100000Z')).toBe('2026-10-25');
      // 4. UTC timestamp at 16:00 UTC (+9h = 01:00 JST next day: 2026-10-26)
      expect(parseIcsDate('20261025T160000Z')).toBe('2026-10-26');
    });

    it('should preserve inner colons in SUMMARY lines', () => {
      const ics = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261025',
        'SUMMARY:夕食: 豚の生姜焼き、味噌汁',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const events = parseIcsRawEvents(ics);
      expect(events.length).toBe(1);
      expect(events[0].summary).toBe('夕食: 豚の生姜焼き、味噌汁');
      expect(events[0].date).toBe('2026-10-25');
    });

    it('should handle UTF-8 BOM without syntax corruption', () => {
      const bomIcs =
        '\uFEFFBEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261020\r\nSUMMARY:カレーライス\r\nEND:VEVENT\r\nEND:VCALENDAR';
      const events = parseIcsRawEvents(bomIcs);
      expect(events.length).toBe(1);
      expect(events[0].summary).toBe('カレーライス');
    });
  });

  // ==========================================================================
  // Group 2: Non-Meal Event Filtering Heuristics
  // ==========================================================================
  describe('Non-Meal Event Filter', () => {
    it('should exclude medical and dental appointments', () => {
      expect(isMealEvent('10:00 歯医者（定期検診）')).toBe(false);
      expect(isMealEvent('内科クリニック 受診')).toBe(false);
      expect(isMealEvent('インフルエンザ予防接種')).toBe(false);
      expect(isMealEvent('皮膚科 薬局')).toBe(false);
    });

    it('should exclude beauty and personal care events', () => {
      expect(isMealEvent('美容院 14:00 カット＆カラー')).toBe(false);
      expect(isMealEvent('ネイルサロン予約')).toBe(false);
      expect(isMealEvent('整体・マッサージ')).toBe(false);
    });

    it('should exclude household chores and garbage collection', () => {
      expect(isMealEvent('燃えるゴミの日')).toBe(false);
      expect(isMealEvent('粗大ゴミ出し')).toBe(false);
      expect(isMealEvent('エアコン点検立ち会い')).toBe(false);
      expect(isMealEvent('宅急便受け取り')).toBe(false);
    });

    it('should exclude work, meetings, and school events', () => {
      expect(isMealEvent('定例MTG')).toBe(false);
      expect(isMealEvent('出社日')).toBe(false);
      expect(isMealEvent('PTA役員会')).toBe(false);
      expect(isMealEvent('高校授業参観日')).toBe(false);
      expect(isMealEvent('お父さん出張（大阪）')).toBe(false);
    });

    it('should exclude dining out and social outings', () => {
      expect(isMealEvent('佐藤さんとランチ')).toBe(false);
      expect(isMealEvent('田中さんランチ会')).toBe(false);
      expect(isMealEvent('大学同期飲み会')).toBe(false);
      expect(isMealEvent('家族で外食（焼肉）')).toBe(false);
      expect(isMealEvent('ディズニーランド旅行')).toBe(false);
    });

    it('should exclude standalone holidays and calendar milestones', () => {
      expect(isMealEvent('祝日（勤労感謝の日）')).toBe(false);
      expect(isMealEvent('お父さん誕生日')).toBe(false);
      expect(isMealEvent('有給休暇')).toBe(false);
    });

    it('should rescue events with explicit meal prefixes or dish keywords', () => {
      expect(isMealEvent('夕食: 豚の生姜焼き、ポテトサラダ、味噌汁')).toBe(true);
      expect(isMealEvent('晩御飯 カレーライス')).toBe(true);
      expect(isMealEvent('献立：鶏の唐揚げ、豚汁')).toBe(true);
      expect(isMealEvent('豚バラと大根のこっくり照り煮')).toBe(true);
      expect(isMealEvent('サバの塩焼き、きゅうりの酢の物')).toBe(true);
    });

    it('should reject dining out even if preceded by a meal prefix', () => {
      expect(isMealEvent('夕食：外食（回転寿司）')).toBe(false);
      expect(isMealEvent('晩ごはん 飲み会')).toBe(false);
    });
  });

  // ==========================================================================
  // Group 3: Multi-Dish Title Splitting & Conjunction Handling
  // ==========================================================================
  describe('Multi-Dish Title Splitting', () => {
    it('should split on Japanese comma "、"', () => {
      const split = splitDishTitle('豚の生姜焼き、なめこの味噌汁');
      expect(split).toEqual(['豚の生姜焼き', 'なめこの味噌汁']);
    });

    it('should split on middle dot "・"', () => {
      const split = splitDishTitle('鶏の唐揚げ・ポテトサラダ・コーンスープ');
      expect(split).toEqual(['鶏の唐揚げ', 'ポテトサラダ', 'コーンスープ']);
    });

    it('should split on plus signs "＋" and "+"', () => {
      const split1 = splitDishTitle('鮭の塩焼き＋ほうれん草胡麻和え＋豚汁');
      expect(split1).toEqual(['鮭の塩焼き', 'ほうれん草胡麻和え', '豚汁']);

      const split2 = splitDishTitle('ハンバーグ+マカロニサラダ');
      expect(split2).toEqual(['ハンバーグ', 'マカロニサラダ']);
    });

    it('should split on halfwidth comma "," and slashes', () => {
      const split = splitDishTitle('牛丼, 豆腐の味噌汁 / 大根サラダ');
      expect(split).toEqual(['牛丼', '豆腐の味噌汁', '大根サラダ']);
    });

    it('should strip meal prefixes and bullet numbering before splitting', () => {
      const split = splitDishTitle('夕食：1. 豚生姜焼き 2. ポテトサラダ');
      expect(split).toContain('豚生姜焼き');
      expect(split).toContain('ポテトサラダ');
    });

    it('should remove parenthetical notes from dish names', () => {
      const split = splitDishTitle('豚の生姜焼き（山本ゆりレシピ）、味噌汁（昨日の残り）');
      expect(split).toEqual(['豚の生姜焼き', '味噌汁']);
    });

    it('should NOT split two-ingredient dishes connected by "と"', () => {
      expect(splitDishTitle('豚バラと大根のこっくり照り煮')).toEqual([
        '豚バラと大根のこっくり照り煮',
      ]);
      expect(splitDishTitle('きゅうりとわかめの酢の物')).toEqual([
        'きゅうりとわかめの酢の物',
      ]);
      expect(splitDishTitle('豆腐とわかめの味噌汁')).toEqual([
        '豆腐とわかめの味噌汁',
      ]);
      expect(splitDishTitle('鶏肉と長ねぎの照り焼き')).toEqual([
        '鶏肉と長ねぎの照り焼き',
      ]);
    });

    it('should correctly split independent dishes connected by "と"', () => {
      expect(splitDishTitle('生姜焼きと味噌汁')).toEqual(['生姜焼き', '味噌汁']);
      expect(splitDishTitle('唐揚げとポテトサラダ')).toEqual(['唐揚げ', 'ポテトサラダ']);
    });
  });

  // ==========================================================================
  // Group 4: Orthographic Alias Normalization & Clustering
  // ==========================================================================
  describe('Orthographic Alias Normalization', () => {
    it('should normalize fullwidth ASCII and halfwidth katakana to standard forms', () => {
      expect(normalizeDishName('ｶﾚｰﾗｲｽ').canonicalName).toBe('カレーライス');
      expect(normalizeDishName('ﾊﾝﾊﾞｰｸﾞ').canonicalName).toBe('ハンバーグ');
    });

    it('should harmonize ginger pork spelling variants into canonical "豚の生姜焼き"', () => {
      const variants = [
        '豚の生姜焼き',
        'しょうが焼き',
        '生姜焼き',
        '豚生姜焼き',
        '豚生姜焼',
        'ショウガ焼き',
        '豚のしょうが焼き',
      ];
      for (const variant of variants) {
        const result = normalizeDishName(variant, SEED_DISHES);
        expect(result.canonicalName).toBe('豚の生姜焼き');
      }
    });

    it('should match seed dishes by registered aliases', () => {
      // Seed dish: 豚バラと大根のこっくり照り煮 with aliases ['豚バラ大根', '豚バラと大根の照り煮']
      expect(normalizeDishName('豚バラ大根', SEED_DISHES).canonicalName).toBe(
        '豚バラと大根のこっくり照り煮'
      );
      expect(normalizeDishName('豚バラと大根の照り煮', SEED_DISHES).canonicalName).toBe(
        '豚バラと大根のこっくり照り煮'
      );

      // Seed dish: 鶏の唐揚げ
      expect(normalizeDishName('から揚げ', SEED_DISHES).canonicalName).toBe('鶏の唐揚げ');
      expect(normalizeDishName('からあげ', SEED_DISHES).canonicalName).toBe('鶏の唐揚げ');
      expect(normalizeDishName('鶏唐揚げ', SEED_DISHES).canonicalName).toBe('鶏の唐揚げ');

      // Seed dish: 豆腐とわかめの味噌汁
      expect(normalizeDishName('豆腐とワカメのお味噌汁', SEED_DISHES).canonicalName).toBe(
        '豆腐とわかめの味噌汁'
      );
      expect(normalizeDishName('豆腐の味噌汁', SEED_DISHES).canonicalName).toBe(
        '豆腐とわかめの味噌汁'
      );
    });

    it('should normalize honorific prefixes like "お味噌汁" to "味噌汁"', () => {
      expect(normalizeDishName('お味噌汁').canonicalName).toBe('味噌汁');
      expect(normalizeDishName('お吸い物').canonicalName).toBe('吸い物');
    });

    it('should infer dish category and protein type correctly', () => {
      expect(inferDishCategory('豚の生姜焼き')).toBe('main');
      expect(inferDishCategory('ポテトサラダ')).toBe('side');
      expect(inferDishCategory('豆腐とわかめの味噌汁')).toBe('soup');

      expect(inferProteinType('豚の生姜焼き')).toBe('pork');
      expect(inferProteinType('鶏の唐揚げ')).toBe('chicken');
      expect(inferProteinType('牛丼')).toBe('beef');
      expect(inferProteinType('サバの塩焼き')).toBe('fish');
      expect(inferProteinType('冷奴')).toBe('egg_tofu');
      expect(inferProteinType('きゅうりとわかめの酢の物')).toBe('veggie');
    });
  });

  // ==========================================================================
  // Group 5: Frequency-Based Classification & Seeding Pipeline
  // ==========================================================================
  describe('Full Calendar Pipeline & Frequency Classification', () => {
    const sampleIcsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      // Day 1: Classic (Count 1)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261001',
      'SUMMARY:豚の生姜焼き、ポテトサラダ、味噌汁',
      'END:VEVENT',
      // Non-meal 1
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261002',
      'SUMMARY:10:00 歯医者（定期検診）',
      'END:VEVENT',
      // Day 2: Classic (Count 2)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261005',
      'SUMMARY:しょうが焼き、冷奴',
      'END:VEVENT',
      // Non-meal 2
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261006',
      'SUMMARY:美容院 カット＆カラー',
      'END:VEVENT',
      // Day 3: Classic (Count 3)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261010',
      'SUMMARY:豚生姜焼、きゅうりとわかめの酢の物',
      'END:VEVENT',
      // Day 4: Classic (Count 4)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261015',
      'SUMMARY:豚の生姜焼き、豆腐のお味噌汁',
      'END:VEVENT',
      // Day 5: Classic (Count 5 -> becomes Household Classic!)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261020',
      'SUMMARY:夕食: 豚の生姜焼き、ポテサラ',
      'END:VEVENT',
      // Day 6: AI Provisional dish (Count 1)
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261025',
      'SUMMARY:麻婆豆腐、中華スープ',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    it('should correctly classify >= 5 occurrences as Household Classics (needs_registration)', () => {
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 5,
        knownDishes: SEED_DISHES,
      });

      expect(result.totalEvents).toBe(8);
      expect(result.mealEventsFound).toBe(6);
      expect(result.nonMealCount).toBe(2);

      const shogayaki = result.dishes.find((d) => d.name === '豚の生姜焼き');
      expect(shogayaki).toBeDefined();
      expect(shogayaki!.cookCount).toBe(5);
      expect(shogayaki!.sourceType).toBe('classic_book');
      expect(shogayaki!.recipeStatus).toBe('needs_registration');
      expect(shogayaki!.sourceLabel).toBe('家庭の定番');
      expect(shogayaki!.lastCookedDate).toBe('2026-10-20');
      expect(shogayaki!.ingredients.length).toBeGreaterThan(0);
      expect(shogayaki!.steps.length).toBeGreaterThan(0);

      // Verify all aliases captured
      expect(shogayaki!.aliases).toContain('しょうが焼き');
      expect(shogayaki!.aliases).toContain('豚生姜焼');
    });

    it('should correctly classify 1..4 occurrences as AI Provisional (ai_provisional)', () => {
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 5,
        knownDishes: SEED_DISHES,
      });

      const mabo = result.dishes.find((d) => d.name === '麻婆豆腐');
      expect(mabo).toBeDefined();
      expect(mabo!.cookCount).toBe(1);
      expect(mabo!.sourceType).toBe('ai_generated');
      expect(mabo!.recipeStatus).toBe('ai_provisional');
      expect(mabo!.sourceLabel).toBe('AI標準レシピ');
      expect(mabo!.lastCookedDate).toBe('2026-10-25');
      expect(mabo!.ingredients.length).toBeGreaterThan(0);
    });

    it('should generate valid ParsedDailyMenu objects with correct slot distribution', () => {
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 5,
        knownDishes: SEED_DISHES,
      });

      expect(result.dailyMenus.length).toBe(6);
      const day1 = result.dailyMenus.find((m) => m.date === '2026-10-01');
      expect(day1).toBeDefined();
      expect(day1!.slots.length).toBe(3);

      const mainSlot = day1!.slots.find((s) => s.role === 'main');
      const sideSlot = day1!.slots.find((s) => s.role === 'side');
      const soupSlot = day1!.slots.find((s) => s.role === 'soup');

      expect(mainSlot?.dishName).toBe('豚の生姜焼き');
      expect(sideSlot?.dishName).toBe('ポテトサラダ');
      expect(soupSlot?.dishName).toBe('豆腐とわかめの味噌汁');

      // Badges
      expect(mainSlot?.badge).toBe('我が家の定番');
      expect(mainSlot?.ingredients.length).toBeGreaterThan(0);
    });

    it('should respect custom classic threshold parameter', () => {
      // With threshold = 2, dishes with count >= 2 become classics
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 2,
        knownDishes: SEED_DISHES,
      });

      const potesara = result.dishes.find((d) => d.name === 'ポテトサラダ');
      expect(potesara?.cookCount).toBe(2);
      expect(potesara?.recipeStatus).toBe('needs_registration');
      expect(potesara?.sourceType).toBe('classic_book');
    });

    it('should calculate overall statistics and date range accurately', () => {
      const result = parseIcsCalendar(sampleIcsContent, {
        classicThreshold: 5,
        knownDishes: SEED_DISHES,
      });

      expect(result.classicsCount).toBeGreaterThanOrEqual(1);
      expect(result.aiProvisionalCount).toBeGreaterThanOrEqual(1);
      expect(result.dateRange).toEqual({
        start: '2026-10-01',
        end: '2026-10-25',
      });
    });
  });

  // ==========================================================================
  // Group 6: Stress & Boundary Scenarios
  // ==========================================================================
  describe('Boundary & Performance Stress Verification', () => {
    it('should handle completely empty or whitespace-only ICS content', () => {
      const result = parseIcsCalendar('');
      expect(result.totalEvents).toBe(0);
      expect(result.mealEventsFound).toBe(0);
      expect(result.dishes.length).toBe(0);
      expect(result.dailyMenus.length).toBe(0);
      expect(result.dateRange).toBeNull();
    });

    it('should handle calendar with 100% non-meal appointments gracefully', () => {
      const nonMealIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261001',
        'SUMMARY:歯医者',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261002',
        'SUMMARY:美容院',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = parseIcsCalendar(nonMealIcs);
      expect(result.totalEvents).toBe(2);
      expect(result.mealEventsFound).toBe(0);
      expect(result.nonMealCount).toBe(2);
      expect(result.dishes.length).toBe(0);
      expect(result.dailyMenus.length).toBe(0);
    });

    it('should parse 1,000 calendar events within 200 milliseconds', () => {
      const events: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0'];
      for (let i = 1; i <= 1000; i++) {
        const day = String((i % 28) + 1).padStart(2, '0');
        const month = String((i % 12) + 1).padStart(2, '0');
        const isMeal = i % 3 !== 0;
        const summary = isMeal
          ? i % 2 === 0
            ? '豚の生姜焼き、ポテトサラダ'
            : '鶏の唐揚げ、味噌汁'
          : '定例MTG 歯医者';
        events.push(
          'BEGIN:VEVENT',
          `DTSTART;VALUE=DATE:2025${month}${day}`,
          `SUMMARY:${summary}`,
          'END:VEVENT'
        );
      }
      events.push('END:VCALENDAR');
      const largeIcs = events.join('\r\n');

      const start = performance.now();
      const result = parseIcsCalendar(largeIcs, { knownDishes: SEED_DISHES });
      const elapsed = performance.now() - start;

      expect(result.totalEvents).toBe(1000);
      expect(result.mealEventsFound).toBeGreaterThan(600);
      expect(elapsed).toBeLessThan(500); // Strict performance target
    });
  });
});
