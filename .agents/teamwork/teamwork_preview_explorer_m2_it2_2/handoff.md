# Shopping Aggregator & Range Arithmetic Remediation Handoff Report

**Module**: Shopping Aggregator (`src/lib/shopping-aggregator.ts`)  
**Milestone**: M2 - Algorithmic Engines & Business Logic (Iteration 2 Retry)  
**Author**: `teamwork_preview_explorer_m2_it2_2`  
**Parent Orchestrator**: `35a3dc7b-a199-49dc-b838-a1010ac73ac1`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_it2_2`  
**Project Root**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`  
**Date**: 2026-10-26T05:25:00Z  
**Verdict**: **COMPLETE — SYNTHESIS READY FOR IMPLEMENTATION**

---

## 1. Observation

### 1.1 Empirical Baseline & Document Invariants
1. **Authoritative Specification (`ORIGINAL_REQUEST.md`, lines 37–42)**:
   > "### R4. Two-Stage Shopping List & LINE Export  
   > Generate a shopping list scaled to the selected number of servings from the day's menu:  
   > - Separate ingredients into **Stage 1: `買うもの` (Main Shopping List)** for fresh/main ingredients (aggregating duplicate ingredients across dishes) and **Stage 2: `家にあるかも` (Household Staples Check)** for configured staple vegetables and basic seasonings (onion, garlic, ginger, green onion, egg, soy sauce, mirin, sake, sugar, miso, oil, potato starch, dashi, etc.).  
   > - Tapping a staple item in Stage 2 immediately promotes it into Stage 1 (`買うもの`).  
   > - Provide a 1-tap 'LINE用にコピー' / share action that formats unchecked items in Stage 1 into a clean bulleted shopping memo for LINE."

2. **Challenger 2 Observed Defects (`teamwork_preview_challenger_m2_2/handoff.md`, Section 1.2)**:
   - **Finding 1**: Eager `parseFloat` in `src/lib/shopping-aggregator.ts:117–120` & `190–198`:
     ```typescript
     // Current line 118:
     const num = parseFloat(clean);
     return isNaN(num) ? null : num;
     ```
     `parseFloat('2〜3個')` greedily parsed `2`, stripping `〜3` and unit `個`, outputting `numeric: 4, unit: ""` at 2x.  
     `parseFloat('1束(約200g)')` greedily parsed `1`, stripping `束(約200g)`, outputting `numeric: 2, unit: ""` at 2x.
   - **Finding 2**: Uncaught `TypeError` on undefined `ingredients` in `src/lib/shopping-aggregator.ts:313`:
     ```typescript
     for (const item of dish.ingredients) {
     ```
     Calling `consolidateAndPartitionShoppingList([{ role: 'main', ingredients: undefined as any }])` threw verbatim:
     `TypeError: dish.ingredients is not iterable`.

3. **Empirical Reproduction & Validation in Node Runtime**:
   - `parseNumericValue('2〜3個')` with regex `/^\d+(?:\.\d+)?$/` safely returns `null` instead of `2`.
   - `parseJapaneseAmount('2〜3個', 2)` parses range amount $2 \sim 3$ at ratio 2, returning `{ numeric: null, unit: '個', raw: '4〜6個', isQualitative: false, rangeMin: 4, rangeMax: 6 }`.
   - `parseJapaneseAmount('1束(約200g)', 2)` scales main amount to `2束` and inner note to `約400g`, returning `{ numeric: 2, unit: '束', raw: '2束(約400g)', note: '(約400g)', isQualitative: false }`.
   - `consolidateAndPartitionShoppingList` with undefined `dish.ingredients` returns `{ mainItems: [], stapleItems: [] }` without throwing.

---

## 2. Logic Chain

1. **Premise 1**: Japanese recipes specify ingredient quantities using a rich variety of notations, including single numeric amounts (`300g`), culinary fractions (`1/2本`, `1と1/2本`), range intervals (`2〜3個`, `1〜2本`), compound weight notes (`1束(約200g)`, `2枚(500g)`), and descriptive qualifiers (`1丁(水切り後)`).
2. **Observation Reference 1.2**: In the original `parseNumericValue`, `parseFloat(clean)` was executed on any string that failed fraction matching. Because JavaScript's native `parseFloat` parses leading digits up to the first non-numeric character, `"2〜3個"` evaluated to `2`, and `"1束(約200g)"` evaluated to `1`.
3. **Inference 1**: By enforcing a strict regex `/^\d+(?:\.\d+)?$/` on scalar numeric strings, non-numeric strings safely return `null` and are routed to dedicated range and parenthetical parsers.
4. **Observation Reference 1.2**: When dishes are scaled (e.g. from 2 to 4 servings, ratio = 2), range amounts like `2〜3個` or `1〜2本` must scale both the lower and upper bounds: $(A \sim B) \times R \rightarrow (A \times R) \sim (B \times R)$, yielding `4〜6個` and `2〜4本` while strictly preserving the unit (`個`, `本`).
5. **Observation Reference 1.2**: Parenthetical notes often provide approximate weight references (e.g. `1束(約200g)`) or preparation notes (`1丁(水切り後)`). The outer unit (`束`, `丁`) must scale by portion ratio ($1 \times 2 = 2$), the inner numeric weight must scale ($200 \times 2 = 400$), and non-numeric qualifiers (`約`, `水切り後`) must be preserved without mangling, producing `2束(約400g)` and `2丁(水切り後)`.
6. **Observation Reference 1.2**: In M3 persistence or calendar import pipelines, dish records may have null or undefined ingredients prior to recipe generation or user editing. Iterating `dish.ingredients` without fallback causes unhandled 500 crashes.
7. **Inference 2**: Adding defensive checks `const ingredients = dish.ingredients || [];` and validating `if (!item || !item.name) continue;` guarantees total crash immunity.
8. **Conclusion**: Replacing `src/lib/shopping-aggregator.ts` with the drop-in implementation below fulfills R4, resolves all Challenger 2 objections, and provides flawless mathematical portion scaling.

---

## 3. Caveats

- **Prefix Qualitative Ranges**: As noted in Challenger 2 handoff and Explorer 3 test alignment plan, seasoning ranges such as `大さじ1〜2` or `小さじ1〜2` (which represent "to taste" adjustments rather than physical grocery items) safely fall back to qualitative descriptors (`isQualitative: true`) preserving verbatim text. This ensures complete backward compatibility with `tests/unit/adversarial_m2.test.ts` line 238.
- **Companion Scheduler Fix**: Unhandled TypeError on `dish.steps` (`d.steps.find`) and Phase 1 awkward phrasing (`まずをすべて切る。`) are located in `src/lib/timeline-scheduler.ts` and are handled in parallel by Explorer 1 (`teamwork_preview_explorer_m2_it2_1`).
- **Test Alignment**: Four tests in `tests/unit/adversarial_m2.test.ts` originally asserted buggy behavior (lines 243, 295, 679, 696). Explorer 3 has provided the test alignment plan so the worker updates the test assertions to verify the remediated behavior.

---

## 4. Conclusion: Complete Drop-in Replacement Code

Below is the complete, self-contained drop-in replacement code for `src/lib/shopping-aggregator.ts`:

```typescript
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
  ingredients?: Array<IngredientItem | { name: string; amount: string; isStaple?: boolean }>;
  steps?: string[];
}

export interface ParsedAmount {
  numeric: number | null;
  unit: string;
  raw: string;
  isQualitative: boolean;
  note?: string;
  rangeMin?: number | null;
  rangeMax?: number | null;
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
    .replace(/[～~]/g, '〜')
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
 * Parses numeric fractions or decimals strictly from strings like "1/2", "0.5", "1と1/2".
 * Returns null if the string contains non-numeric suffix characters or wave dashes.
 */
export function parseNumericValue(valStr: string): number | null {
  if (!valStr) return null;
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

  // Strict integer or float: "300", "1.5", "0.25"
  if (/^\d+(?:\.\d+)?$/.test(clean)) {
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  }

  return null;
}

/**
 * Parses a Japanese culinary amount string and scales it by the given ratio.
 * Handles prefix units, suffix units, ranges (e.g. 2〜3個 -> 4〜6個),
 * and parenthetical notes (e.g. 1束(約200g) -> 2束(約400g)).
 */
export function parseJapaneseAmount(rawAmount: string, ratio: number = 1): ParsedAmount {
  if (!rawAmount || !rawAmount.trim()) {
    return {
      numeric: null,
      unit: '',
      raw: '',
      isQualitative: true,
    };
  }
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

  // Parenthetical note preservation: e.g. "1束(約200g)", "2枚(500g)", "1丁(水切り後)"
  const parenMatch = normalized.match(/^([^\(]+)\s*\(([^\)]+)\)$/);
  if (parenMatch) {
    const mainPart = parenMatch[1].trim();
    const notePart = parenMatch[2].trim();

    // Recursively parse the main outer portion
    const mainParsed = parseJapaneseAmount(mainPart, ratio);

    // Scale inner note if it represents a quantity (e.g. "約200g", "500g", "正味200g")
    let innerScaled = notePart;
    const innerQtyMatch = notePart.match(
      /^(約|正味|各)?\s*([\d\/\.と\s]+)\s*(g|ml|cc|kg|本|個|cm|切れ)(.*)$/i
    );
    if (innerQtyMatch) {
      const prefix = innerQtyMatch[1] || '';
      const subVal = parseNumericValue(innerQtyMatch[2]);
      const subUnit = innerQtyMatch[3];
      const extra = innerQtyMatch[4] || '';
      if (subVal !== null) {
        const scaledSub = subVal * ratio;
        const formattedSub = formatNumericAmount(scaledSub);
        innerScaled = `${prefix}${formattedSub}${subUnit}${extra}`;
      }
    }

    const noteStr = `(${innerScaled})`;
    const mainStr =
      mainParsed.numeric !== null
        ? `${formatNumericAmount(mainParsed.numeric)}${mainParsed.unit}`
        : mainParsed.raw;

    return {
      numeric: mainParsed.numeric,
      unit: mainParsed.unit,
      raw: `${mainStr}${noteStr}`,
      note: noteStr,
      isQualitative: mainParsed.isQualitative,
      rangeMin: mainParsed.rangeMin,
      rangeMax: mainParsed.rangeMax,
    };
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

  // Handle range with suffix unit: "2〜3個", "1〜2本", "100〜150g", "1/2〜1個"
  const rangeWithUnitMatch = normalized.match(
    /^([\d\/\.と\s]+)\s*[〜\-]\s*([\d\/\.と\s]+)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)$/
  );
  if (rangeWithUnitMatch) {
    const minVal = parseNumericValue(rangeWithUnitMatch[1]);
    const maxVal = parseNumericValue(rangeWithUnitMatch[2]);
    const unit = rangeWithUnitMatch[3].trim();
    if (minVal !== null && maxVal !== null) {
      const scaledMin = minVal * ratio;
      const scaledMax = maxVal * ratio;
      const formattedMin = formatNumericAmount(scaledMin);
      const formattedMax = formatNumericAmount(scaledMax);
      return {
        numeric: null,
        unit: unit,
        raw: `${formattedMin}〜${formattedMax}${unit}`,
        isQualitative: false,
        rangeMin: scaledMin,
        rangeMax: scaledMax,
      };
    }
  }

  // Handle range without unit: "2〜3", "1〜2"
  const rangeWithoutUnitMatch = normalized.match(/^([\d\/\.と\s]+)\s*[〜\-]\s*([\d\/\.と\s]+)$/);
  if (rangeWithoutUnitMatch) {
    const minVal = parseNumericValue(rangeWithoutUnitMatch[1]);
    const maxVal = parseNumericValue(rangeWithoutUnitMatch[2]);
    if (minVal !== null && maxVal !== null) {
      const scaledMin = minVal * ratio;
      const scaledMax = maxVal * ratio;
      const formattedMin = formatNumericAmount(scaledMin);
      const formattedMax = formatNumericAmount(scaledMax);
      return {
        numeric: null,
        unit: '',
        raw: `${formattedMin}〜${formattedMax}`,
        isQualitative: false,
        rangeMin: scaledMin,
        rangeMax: scaledMax,
      };
    }
  }

  // Handle standard suffix units: "300g", "1/2本", "1個", "1枚", "1丁", "1束", "3切れ", "1パック"
  const suffixMatch = normalized.match(
    /^([\d\/\.と\s]+)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)$/
  );
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

  // Just numeric without unit: "3", "1.5"
  const justNum = parseNumericValue(normalized);
  if (justNum !== null) {
    return {
      numeric: justNum * ratio,
      unit: '',
      raw: normalized,
      isQualitative: false,
    };
  }

  // Unparseable string fallback (treated safely as qualitative descriptor)
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
 * Combines parsed totals into a consolidated amount string, preserving parenthetical notes.
 */
export function formatConsolidatedAmount(
  totalUnits: Map<string, number>,
  rawStrings: string[],
  unitNotes?: Map<string, string[]>
): string {
  const parts: string[] = [];

  totalUnits.forEach((amount, unit) => {
    const formattedNum = formatNumericAmount(amount);
    let partStr = '';
    if (unit === '大さじ' || unit === '小さじ' || unit === 'カップ') {
      partStr = `${unit}${formattedNum}`;
    } else if (unit) {
      partStr = `${formattedNum}${unit}`;
    } else {
      partStr = formattedNum;
    }

    if (unitNotes && unitNotes.has(unit)) {
      const notes = unitNotes.get(unit)!;
      if (notes.length > 0) {
        partStr += notes.join('');
      }
    }

    parts.push(partStr);
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
 * Resilient against undefined/null dishes or dish.ingredients arrays.
 */
export function consolidateAndPartitionShoppingList(
  dishes: DishWithIngredients[],
  targetServings: number = 3,
  options: AggregatorOptions = {}
): ShoppingState {
  const stapleDictionary = options.stapleList || DEFAULT_STAPLE_ITEMS;
  const safeTargetServings = Math.max(1, Math.min(8, targetServings || 3));

  if (!dishes || !Array.isArray(dishes) || dishes.length === 0) {
    return { mainItems: [], stapleItems: [] };
  }

  interface AggregatedEntry {
    name: string;
    totalUnits: Map<string, number>;
    unitNotes: Map<string, string[]>;
    rawStrings: string[];
    roles: Set<string>;
    isStaple: boolean;
  }

  const aggregatedMap = new Map<string, AggregatedEntry>();

  for (const dish of dishes) {
    if (!dish) continue;
    const baseServings = Math.max(1, dish.baseServings || 3);
    const ratio = safeTargetServings / baseServings;
    const roleLabel =
      dish.role === 'main'
        ? '主菜'
        : dish.role === 'side'
        ? '副菜'
        : dish.role === 'soup'
        ? '汁物'
        : dish.role || '主菜';

    const ingredients = dish.ingredients || [];
    for (const item of ingredients) {
      if (!item || !item.name) continue;
      const normName = normalizeIngredientName(item.name);
      if (!normName) continue;

      const isConfiguredStaple =
        item.isStaple ||
        stapleDictionary.some((staple) => normName.includes(staple) || staple.includes(normName));

      const parsed = parseJapaneseAmount(item.amount || '', ratio);

      if (!aggregatedMap.has(normName)) {
        aggregatedMap.set(normName, {
          name: normName,
          totalUnits: new Map(),
          unitNotes: new Map(),
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
        if (parsed.note) {
          const notes = entry.unitNotes.get(parsed.unit) || [];
          if (!notes.includes(parsed.note)) {
            notes.push(parsed.note);
          }
          entry.unitNotes.set(parsed.unit, notes);
        }
      } else {
        if (parsed.raw) {
          entry.rawStrings.push(parsed.raw);
        }
      }
    }
  }

  const mainItems: ShoppingStateItem[] = [];
  const stapleItems: Array<{ id: number; name: string }> = [];

  let idCounter = 1;

  aggregatedMap.forEach((entry) => {
    const formattedAmount = formatConsolidatedAmount(
      entry.totalUnits,
      entry.rawStrings,
      entry.unitNotes
    );
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
  if (!state || !state.stapleItems) return state;
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
    mainItems: [...(state.mainItems || []), newMainItem],
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
  if (!state || !state.mainItems) return state;
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
    stapleItems: [...(state.stapleItems || []), restoredStaple],
  };
}

/**
 * Toggles the checked status of an item in Stage 1.
 */
export function toggleShoppingItemChecked(
  state: ShoppingState,
  itemId: number
): ShoppingState {
  if (!state || !state.mainItems) return state;
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
 * ・小松菜（2束(約400g)）
 */
export function formatLineShoppingMemo(
  items: ShoppingStateItem[],
  dateStr?: string
): string {
  const safeItems = items || [];
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
  const unchecked = safeItems.filter((item) => !item.checked);

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
```

---

## 5. Verification Method

To verify the implementation once applied by the worker:

### 5.1 Verification Commands
```powershell
# 1. Run shopping aggregator unit tests
npx vitest run tests/unit/shopping-aggregator.test.ts

# 2. Run adversarial stress test suite
npx vitest run tests/unit/adversarial_m2.test.ts

# 3. Run full project test suite
npm test

# 4. Run Next.js production build check
npm run build
```

### 5.2 Pass / Invalidation Criteria
- `parseJapaneseAmount('2〜3個', 2)` returns `raw: '4〜6個'`, `unit: '個'`, `numeric: null`, `isQualitative: false`.
- `parseJapaneseAmount('1束(約200g)', 2)` returns `raw: '2束(約400g)'`, `unit: '束'`, `numeric: 2`, `isQualitative: false`.
- `consolidateAndPartitionShoppingList([{ role: 'main', ingredients: undefined as any }])` returns `{ mainItems: [], stapleItems: [] }` without throwing.
- All 15 tests in `tests/unit/shopping-aggregator.test.ts` pass 100%.
- Full test suite `npm test` passes 100% (230 tests across 12 files).
- Production build `npm run build` exits with code 0.
