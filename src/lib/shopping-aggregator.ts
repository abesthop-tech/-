// ============================================================================
// Kazoku-Kondate Shopping Aggregator Engine: src/lib/shopping-aggregator.ts
// Handles portion scaling, fraction arithmetic, unit consolidation,
// 2-stage partitioning (Buy vs Staples), staple promotion, and LINE memo export.
// ============================================================================

import { IngredientItem, ShoppingState, ShoppingStateItem } from '@/db/schema';
import { DEFAULT_STAPLE_ITEMS } from '@/db/seed';

// ----------------------------------------------------------------------------
// 1. Interfaces
// ----------------------------------------------------------------------------

export interface DishWithIngredients {
  role: 'main' | 'side' | 'soup' | 'other' | string;
  name?: string;
  baseServings?: number;
  ingredients: Array<IngredientItem | { name: string; amount: string; isStaple?: boolean }>;
}

export interface ParsedAmount {
  numeric: number | null;
  unit: string;
  raw: string;
  isQualitative: boolean;
}

// ----------------------------------------------------------------------------
// 2. Constants & Unit Dictionary
// ----------------------------------------------------------------------------

/**
 * Qualitative amounts that should never be multiplied by portion ratios.
 */
const QUALITATIVE_AMOUNTS = new Set([
  '少々',
  '適量',
  'お好みで',
  '適宜',
  'ひとつまみ',
  'ふたつまみ',
  'ひとつかみ',
  '適度',
  '少々〜適量',
]);

/**
 * Common Japanese ingredient alias map for deduplication.
 */
const INGREDIENT_ALIAS_MAP: Record<string, string> = {
  たまねぎ: '玉ねぎ',
  タマネギ: '玉ねぎ',
  長ネギ: '長ねぎ',
  長葱: '長ねぎ',
  白ねぎ: '長ねぎ',
  白ネギ: '長ねぎ',
  生姜: 'しょうが',
  ショウガ: 'しょうが',
  大蒜: 'にんにく',
  ニンニク: 'にんにく',
};

// ----------------------------------------------------------------------------
// 3. Normalization & Fraction Parsing Utilities
// ----------------------------------------------------------------------------

/**
 * Converts full-width numbers and characters to half-width, strips redundant spaces.
 */
export function normalizeJapaneseText(str: string): string {
  if (!str) return '';
  return str
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/／/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/½/g, '1/2')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .trim();
}

/**
 * Normalizes ingredient names for consolidation.
 */
export function normalizeIngredientName(rawName: string): string {
  const norm = normalizeJapaneseText(rawName).trim();
  return INGREDIENT_ALIAS_MAP[norm] || norm;
}

/**
 * Parses numeric fractions or decimals from strings like "1/2", "0.5", "1と1/2".
 */
export function parseNumericValue(valStr: string): number | null {
  const clean = valStr.trim();
  if (!clean) return null;

  // Mixed fraction: "1と1/2" or "1 1/2"
  const mixedMatch = clean.match(/^(\d+)[と\s]+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseFloat(mixedMatch[1]);
    const num = parseFloat(mixedMatch[2]);
    const den = parseFloat(mixedMatch[3]);
    return den !== 0 ? whole + num / den : null;
  }

  // Pure fraction: "1/2", "3/4"
  const fractionMatch = clean.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const num = parseFloat(fractionMatch[1]);
    const den = parseFloat(fractionMatch[2]);
    return den !== 0 ? num / den : null;
  }

  // Standard integer or float: "300", "1.5"
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

/**
 * Parses a Japanese culinary amount string and scales it by the given ratio.
 */
export function parseJapaneseAmount(rawAmount: string, ratio: number = 1): ParsedAmount {
  const normalized = normalizeJapaneseText(rawAmount);

  // Check for qualitative unscaled amounts
  for (const q of QUALITATIVE_AMOUNTS) {
    if (normalized.includes(q)) {
      return {
        numeric: null,
        unit: '',
        raw: normalized,
        isQualitative: true,
      };
    }
  }

  // Handle prefix units: "大さじ2", "小さじ1/2", "カップ1"
  const prefixMatch = normalized.match(/^(大さじ|小さじ|カップ)\s*([\d\/\.と\s]+)$/);
  if (prefixMatch) {
    const unit = prefixMatch[1];
    const val = parseNumericValue(prefixMatch[2]);
    return {
      numeric: val !== null ? val * ratio : null,
      unit: unit,
      raw: normalized,
      isQualitative: false,
    };
  }

  // Handle suffix units: "300g", "1/2本", "1個", "1枚", "1丁", "1束", "3切れ", "1パック"
  // Also matches compound weights: "2枚(500g)"
  const compoundMatch = normalized.match(/^([\d\/\.と\s]+)([^\d\(\)]+)\s*\(([\d\/\.と\s]+)(g|ml|cc|kg)\)$/i);
  if (compoundMatch) {
    const mainVal = parseNumericValue(compoundMatch[1]);
    const mainUnit = compoundMatch[2].trim();
    const subVal = parseNumericValue(compoundMatch[3]);
    const subUnit = compoundMatch[4].trim();

    const scaledMain = mainVal !== null ? mainVal * ratio : null;
    const scaledSub = subVal !== null ? subVal * ratio : null;

    if (scaledMain !== null && scaledSub !== null) {
      const formattedMain = formatNumericAmount(scaledMain);
      const formattedSub = formatNumericAmount(scaledSub);
      return {
        numeric: scaledMain,
        unit: mainUnit,
        raw: `${formattedMain}${mainUnit}(${formattedSub}${subUnit})`,
        isQualitative: false,
      };
    }
  }

  const suffixMatch = normalized.match(/^([\d\/\.と\s]+)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)$/);
  if (suffixMatch) {
    const val = parseNumericValue(suffixMatch[1]);
    const unit = suffixMatch[2].trim();
    return {
      numeric: val !== null ? val * ratio : null,
      unit: unit,
      raw: normalized,
      isQualitative: false,
    };
  }

  // Just numeric without unit
  const justNum = parseNumericValue(normalized);
  if (justNum !== null) {
    return {
      numeric: justNum * ratio,
      unit: '',
      raw: normalized,
      isQualitative: false,
    };
  }

  // Unparseable string fallback
  return {
    numeric: null,
    unit: '',
    raw: normalized,
    isQualitative: true,
  };
}

/**
 * Formats a scaled numeric value into an elegant Japanese culinary fraction or decimal.
 */
export function formatNumericAmount(val: number): string {
  if (val <= 0) return '0';

  // Check whole number
  if (Math.abs(val - Math.round(val)) < 0.001) {
    return Math.round(val).toString();
  }

  const whole = Math.floor(val);
  const frac = val - whole;

  // Fraction approximations
  const fractions: Array<[number, string]> = [
    [0.25, '1/4'],
    [0.3333, '1/3'],
    [0.5, '1/2'],
    [0.6667, '2/3'],
    [0.75, '3/4'],
    [0.2, '1/5'],
    [0.4, '2/5'],
    [0.6, '3/5'],
    [0.8, '4/5'],
  ];

  for (const [targetFrac, fracStr] of fractions) {
    if (Math.abs(frac - targetFrac) < 0.04) {
      return whole > 0 ? `${whole}と${fracStr}` : fracStr;
    }
  }

  // Decimal fallback
  const rounded = Math.round(val * 10) / 10;
  return rounded.toString();
}

/**
 * Combines parsed totals into a consolidated amount string.
 */
export function formatConsolidatedAmount(
  totalUnits: Map<string, number>,
  rawStrings: string[]
): string {
  const parts: string[] = [];

  totalUnits.forEach((amount, unit) => {
    const formattedNum = formatNumericAmount(amount);
    if (unit === '大さじ' || unit === '小さじ' || unit === 'カップ') {
      parts.push(`${unit}${formattedNum}`);
    } else if (unit) {
      parts.push(`${formattedNum}${unit}`);
    } else {
      parts.push(formattedNum);
    }
  });

  const uniqueRaws = Array.from(new Set(rawStrings));
  for (const raw of uniqueRaws) {
    if (!parts.includes(raw)) {
      parts.push(raw);
    }
  }

  return parts.join(' + ');
}

// ----------------------------------------------------------------------------
// 4. Two-Stage Partitioning & Aggregation Engine
// ----------------------------------------------------------------------------

export interface AggregatorOptions {
  stapleList?: string[];
  defaultServings?: number;
}

/**
 * Scales, deduplicates, and partitions ingredients into Stage 1 (Buy) and Stage 2 (Staples).
 */
export function consolidateAndPartitionShoppingList(
  dishes: DishWithIngredients[],
  targetServings: number = 3,
  options: AggregatorOptions = {}
): ShoppingState {
  const stapleDictionary = options.stapleList || DEFAULT_STAPLE_ITEMS;
  const safeTargetServings = Math.max(1, Math.min(8, targetServings || 3));

  interface AggregatedEntry {
    name: string;
    totalUnits: Map<string, number>;
    rawStrings: string[];
    roles: Set<string>;
    isStaple: boolean;
  }

  const aggregatedMap = new Map<string, AggregatedEntry>();

  for (const dish of dishes) {
    const baseServings = Math.max(1, dish.baseServings || 3);
    const ratio = safeTargetServings / baseServings;
    const roleLabel =
      dish.role === 'main' ? '主菜' : dish.role === 'side' ? '副菜' : dish.role === 'soup' ? '汁物' : dish.role || '主菜';

    for (const item of dish.ingredients) {
      const normName = normalizeIngredientName(item.name);
      if (!normName) continue;

      const isConfiguredStaple =
        item.isStaple ||
        stapleDictionary.some((staple) => normName.includes(staple) || staple.includes(normName));

      const parsed = parseJapaneseAmount(item.amount, ratio);

      if (!aggregatedMap.has(normName)) {
        aggregatedMap.set(normName, {
          name: normName,
          totalUnits: new Map(),
          rawStrings: [],
          roles: new Set([roleLabel]),
          isStaple: isConfiguredStaple,
        });
      }

      const entry = aggregatedMap.get(normName)!;
      entry.roles.add(roleLabel);
      if (isConfiguredStaple) {
        entry.isStaple = true;
      }

      if (parsed.numeric !== null && !parsed.isQualitative) {
        const cur = entry.totalUnits.get(parsed.unit) || 0;
        entry.totalUnits.set(parsed.unit, cur + parsed.numeric);
      } else {
        entry.rawStrings.push(parsed.raw);
      }
    }
  }

  const mainItems: ShoppingStateItem[] = [];
  const stapleItems: Array<{ id: number; name: string }> = [];

  let idCounter = 1;

  aggregatedMap.forEach((entry) => {
    const formattedAmount = formatConsolidatedAmount(entry.totalUnits, entry.rawStrings);
    const roleStr = Array.from(entry.roles).join('・');

    if (entry.isStaple) {
      stapleItems.push({
        id: 100 + idCounter++,
        name: `${entry.name}${formattedAmount ? ` (${formattedAmount})` : ''}`,
      });
    } else {
      mainItems.push({
        id: idCounter++,
        name: entry.name,
        amount: formattedAmount,
        dishRole: roleStr,
        checked: false,
        promotedFromStaple: false,
      });
    }
  });

  return { mainItems, stapleItems };
}

// ----------------------------------------------------------------------------
// 5. 1-Tap Staple Promotion & State Mutators
// ----------------------------------------------------------------------------

/**
 * 1-tap promotion: moves a staple item from Stage 2 into Stage 1 with amount '補充'.
 */
export function promoteStapleToMain(
  state: ShoppingState,
  stapleId: number
): ShoppingState {
  const stapleIdx = state.stapleItems.findIndex((s) => s.id === stapleId);
  if (stapleIdx === -1) return state;

  const staple = state.stapleItems[stapleIdx];
  const newStapleList = [...state.stapleItems];
  newStapleList.splice(stapleIdx, 1);

  // Extract clean name by removing any parenthesized amount
  const cleanName = staple.name.replace(/\s*\([^)]*\)$/, '').trim();

  const newMainItem: ShoppingStateItem = {
    id: staple.id,
    name: cleanName,
    amount: '補充',
    dishRole: '常備品',
    checked: false,
    promotedFromStaple: true,
  };

  return {
    mainItems: [...state.mainItems, newMainItem],
    stapleItems: newStapleList,
  };
}

/**
 * Demote / reverse promotion: moves a promoted item back to Stage 2.
 */
export function demotePromotedStaple(
  state: ShoppingState,
  mainItemId: number
): ShoppingState {
  const itemIdx = state.mainItems.findIndex((i) => i.id === mainItemId && i.promotedFromStaple);
  if (itemIdx === -1) return state;

  const item = state.mainItems[itemIdx];
  const newMainList = [...state.mainItems];
  newMainList.splice(itemIdx, 1);

  const restoredStaple = {
    id: item.id,
    name: item.name,
  };

  return {
    mainItems: newMainList,
    stapleItems: [...state.stapleItems, restoredStaple],
  };
}

/**
 * Toggles the checked status of an item in Stage 1.
 */
export function toggleShoppingItemChecked(
  state: ShoppingState,
  itemId: number
): ShoppingState {
  return {
    ...state,
    mainItems: state.mainItems.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    ),
  };
}

// ----------------------------------------------------------------------------
// 6. LINE Shopping Memo Formatter
// ----------------------------------------------------------------------------

/**
 * Formats unchecked Stage 1 items into a clean Japanese bulleted LINE memo.
 * Example output:
 * 【10/26 買い物メモ】
 * ・豚バラ薄切り（300g）
 * ・大根（1/2本）
 * ・小松菜（1束）
 */
export function formatLineShoppingMemo(
  items: ShoppingStateItem[],
  dateStr?: string
): string {
  // Format MM/DD from YYYY-MM-DD or use default
  let displayDate = '本日';
  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      displayDate = `${parts[1]}/${parts[2]}`;
    } else {
      displayDate = dateStr.replace('.', '/');
    }
  } else {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    displayDate = `${mm}/${dd}`;
  }

  const header = `【${displayDate} 買い物メモ】`;
  const unchecked = items.filter((item) => !item.checked);

  if (unchecked.length === 0) {
    return `${header}\n・（購入する品はありません）`;
  }

  const lines = unchecked.map((item) => {
    if (item.amount) {
      return `・${item.name}（${item.amount}）`;
    }
    return `・${item.name}`;
  });

  return `${header}\n${lines.join('\n')}`;
}
