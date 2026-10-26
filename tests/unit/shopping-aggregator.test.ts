// ============================================================================
// Unit Tests: tests/unit/shopping-aggregator.test.ts
// Tests: Portion scaling, Japanese unit parsing, fraction math, unit consolidation,
// 2-stage partitioning, 1-tap staple promotion, and LINE memo formatting.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  parseNumericValue,
  parseJapaneseAmount,
  formatNumericAmount,
  consolidateAndPartitionShoppingList,
  promoteStapleToMain,
  demotePromotedStaple,
  toggleShoppingItemChecked,
  formatLineShoppingMemo,
  DishWithIngredients,
} from '@/lib/shopping-aggregator';

describe('Shopping Aggregator Engine', () => {
  describe('Fraction & Numeric Parsing', () => {
    it('parses standard integers and decimals', () => {
      expect(parseNumericValue('300')).toBe(300);
      expect(parseNumericValue('1.5')).toBe(1.5);
      expect(parseNumericValue('0.25')).toBe(0.25);
    });

    it('parses pure fractions (1/2, 1/4, 3/4)', () => {
      expect(parseNumericValue('1/2')).toBe(0.5);
      expect(parseNumericValue('1/4')).toBe(0.25);
      expect(parseNumericValue('3/4')).toBe(0.75);
    });

    it('parses mixed fractions (1と1/2, 2 1/4)', () => {
      expect(parseNumericValue('1と1/2')).toBe(1.5);
      expect(parseNumericValue('2 1/4')).toBe(2.25);
    });
  });

  describe('Japanese Culinary Amount Scaling', () => {
    it('scales numeric units by portion ratio', () => {
      // 300g for 3 servings scaled to 2 servings (ratio 2/3)
      const res = parseJapaneseAmount('300g', 2 / 3);
      expect(res.numeric).toBe(200);
      expect(res.unit).toBe('g');
      expect(res.isQualitative).toBe(false);
    });

    it('scales fraction units by portion ratio (1/2本 * 1.5 = 3/4本)', () => {
      const res = parseJapaneseAmount('1/2本', 1.5);
      expect(res.numeric).toBe(0.75);
      expect(res.unit).toBe('本');
    });

    it('handles prefix spoons (大さじ2, 小さじ1/2)', () => {
      const res1 = parseJapaneseAmount('大さじ2', 1);
      expect(res1.numeric).toBe(2);
      expect(res1.unit).toBe('大さじ');

      const res2 = parseJapaneseAmount('小さじ1/2', 2);
      expect(res2.numeric).toBe(1);
      expect(res2.unit).toBe('小さじ');
    });

    it('leaves qualitative amounts unscaled verbatim strings', () => {
      const res1 = parseJapaneseAmount('少々', 3);
      expect(res1.numeric).toBeNull();
      expect(res1.isQualitative).toBe(true);
      expect(res1.raw).toBe('少々');

      const res2 = parseJapaneseAmount('適量', 2);
      expect(res2.isQualitative).toBe(true);
      expect(res2.raw).toBe('適量');

      const res3 = parseJapaneseAmount('お好みで', 4);
      expect(res3.isQualitative).toBe(true);
      expect(res3.raw).toBe('お好みで');
    });
  });

  describe('Formatting Fractions and Units', () => {
    it('formats clean fraction outputs', () => {
      expect(formatNumericAmount(0.5)).toBe('1/2');
      expect(formatNumericAmount(0.25)).toBe('1/4');
      expect(formatNumericAmount(0.75)).toBe('3/4');
      expect(formatNumericAmount(1.5)).toBe('1と1/2');
      expect(formatNumericAmount(2.0)).toBe('2');
    });
  });

  describe('Duplicate Consolidation Across Dishes', () => {
    it('consolidates identical ingredients across dishes with matching units (1/2本 + 1/4本 = 3/4本)', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 3,
          ingredients: [
            { name: '豚バラ薄切り', amount: '300g', isStaple: false },
            { name: '大根', amount: '1/2本', isStaple: false },
          ],
        },
        {
          role: 'soup',
          baseServings: 3,
          ingredients: [
            { name: '大根', amount: '1/4本', isStaple: false },
            { name: '絹ごし豆腐', amount: '1丁', isStaple: false },
          ],
        },
      ];

      const result = consolidateAndPartitionShoppingList(dishes, 3);
      const daikon = result.mainItems.find((i) => i.name === '大根');

      expect(daikon).toBeDefined();
      expect(daikon?.amount).toBe('3/4本');
      expect(daikon?.dishRole).toBe('主菜・汁物');
    });

    it('aggregates ingredients with mismatched units as compound strings', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 3,
          ingredients: [{ name: '大根', amount: '200g', isStaple: false }],
        },
        {
          role: 'soup',
          baseServings: 3,
          ingredients: [{ name: '大根', amount: '1/4本', isStaple: false }],
        },
      ];

      const result = consolidateAndPartitionShoppingList(dishes, 3);
      const daikon = result.mainItems.find((i) => i.name === '大根');

      expect(daikon).toBeDefined();
      expect(daikon?.amount).toContain('200g');
      expect(daikon?.amount).toContain('1/4本');
    });
  });

  describe('Two-Stage Partitioning (Buying vs Staples)', () => {
    it('partitions fresh produce into Stage 1 and 17 pantry staples into Stage 2', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 3,
          ingredients: [
            { name: '豚バラ薄切り', amount: '300g', isStaple: false },
            { name: '大根', amount: '1/2本', isStaple: false },
            { name: '醤油', amount: '大さじ2', isStaple: true },
            { name: 'みりん', amount: '大さじ2', isStaple: true },
            { name: '長ねぎ', amount: '1/2本', isStaple: true },
          ],
        },
      ];

      const result = consolidateAndPartitionShoppingList(dishes, 3);

      const mainNames = result.mainItems.map((i) => i.name);
      expect(mainNames).toContain('豚バラ薄切り');
      expect(mainNames).toContain('大根');
      expect(mainNames).not.toContain('醤油');
      expect(mainNames).not.toContain('長ねぎ');

      const stapleNames = result.stapleItems.map((i) => i.name);
      expect(stapleNames.some((n) => n.includes('醤油'))).toBe(true);
      expect(stapleNames.some((n) => n.includes('長ねぎ'))).toBe(true);
    });
  });

  describe('1-Tap Staple Promotion', () => {
    it('promotes staple to Stage 1 with amount "補充" and dishRole "常備品"', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 3,
          ingredients: [
            { name: '豚肉', amount: '200g', isStaple: false },
            { name: '長ねぎ', amount: '1/2本', isStaple: true },
          ],
        },
      ];

      const state = consolidateAndPartitionShoppingList(dishes, 3);
      const stapleItem = state.stapleItems.find((s) => s.name.includes('長ねぎ'));
      expect(stapleItem).toBeDefined();

      const promotedState = promoteStapleToMain(state, stapleItem!.id);
      expect(promotedState.stapleItems.find((s) => s.id === stapleItem!.id)).toBeUndefined();

      const promotedItem = promotedState.mainItems.find((i) => i.id === stapleItem!.id);
      expect(promotedItem).toBeDefined();
      expect(promotedItem?.name).toBe('長ねぎ');
      expect(promotedItem?.amount).toBe('補充');
      expect(promotedItem?.dishRole).toBe('常備品');
      expect(promotedItem?.promotedFromStaple).toBe(true);
      expect(promotedItem?.checked).toBe(false);
    });

    it('allows demoting a promoted item back to Stage 2', () => {
      const dishes: DishWithIngredients[] = [
        {
          role: 'main',
          baseServings: 3,
          ingredients: [{ name: 'しょうが', amount: '1片', isStaple: true }],
        },
      ];

      let state = consolidateAndPartitionShoppingList(dishes, 3);
      const staple = state.stapleItems[0];
      state = promoteStapleToMain(state, staple.id);
      expect(state.mainItems.length).toBe(1);

      state = demotePromotedStaple(state, staple.id);
      expect(state.mainItems.length).toBe(0);
      expect(state.stapleItems.length).toBe(1);
    });
  });

  describe('LINE Shopping Memo Formatter', () => {
    it('formats unchecked Stage 1 items with header and bullets', () => {
      const items = [
        { id: 1, name: '豚バラ薄切り', amount: '300g', dishRole: '主菜', checked: false },
        { id: 2, name: '大根', amount: '1/2本', dishRole: '主菜', checked: false },
        { id: 3, name: '小松菜', amount: '1束', dishRole: '副菜', checked: true }, // checked
      ];

      const memo = formatLineShoppingMemo(items, '2026-10-26');
      expect(memo).toContain('【10/26 買い物メモ】');
      expect(memo).toContain('・豚バラ薄切り（300g）');
      expect(memo).toContain('・大根（1/2本）');
      expect(memo).not.toContain('小松菜'); // checked item excluded
    });

    it('returns empty placeholder when all items are checked', () => {
      const items = [
        { id: 1, name: '豚バラ薄切り', amount: '300g', dishRole: '主菜', checked: true },
      ];

      const memo = formatLineShoppingMemo(items, '2026-10-26');
      expect(memo).toContain('【10/26 買い物メモ】');
      expect(memo).toContain('・（購入する品はありません）');
    });
  });
});
