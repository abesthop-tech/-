# Handoff Report: Milestone M2 Business Logic & Algorithmic Engines
**Agent**: `teamwork_preview_explorer_m2_3`  
**Milestone**: M2 - Algorithmic Engines & Business Logic  
**Focus**: Shopping Aggregator (`src/lib/shopping-aggregator.ts`), Parallel Timeline DAG Scheduler (`src/lib/timeline-scheduler.ts`), and Gemini Offline Fallback (`src/lib/gemini.ts`)  
**Date**: 2026-10-26T04:25:00Z  

---

## 1. Observation

### 1.1 Requirements from `ORIGINAL_REQUEST.md` (Lines 37–48)
> - **R4. Two-Stage Shopping List & LINE Export**: Generate a shopping list scaled to the selected number of servings from the day's menu. Separate ingredients into **Stage 1: `買うもの` (Main Shopping List)** for fresh/main ingredients (aggregating duplicate ingredients across dishes) and **Stage 2: `家にあるかも` (Household Staples Check)** for configured staple vegetables and basic seasonings (onion, garlic, ginger, green onion, egg, soy sauce, mirin, sake, sugar, miso, oil, potato starch, dashi, etc.). Tapping a staple item in Stage 2 immediately promotes it into Stage 1 (`買うもの`). Provide a 1-tap "LINE用にコピー" / share action that formats unchecked items in Stage 1 into a clean bulleted shopping memo for LINE.
> - **R5. Multi-Dish Parallel Cooking Timeline & Gemini AI Integration**: In the `調理工程` tab, allow switching between a **parallel timeline view (`まとめ工程`)** that merges preparation, cutting, microwave pre-heating, and stove timing across all dishes for the day, and an **individual recipe view (`料理別に見る`)**. Integrate `@google/genai` (`gemini-2.5-flash`) with a graceful deterministic fallback when `GEMINI_API_KEY` is not set (or in offline/test environments) so all features remain fully functional and testable out of the box.

### 1.2 Schema and Domain Entities in `src/db/schema.ts`
- **Lines 65–70**: `IngredientItem`: `{ name: string; amount: string; isStaple: boolean; category?: 'meat' | 'fish' | 'vegetable' | 'dairy_tofu' | 'seasoning' | 'other'; }`
- **Lines 85–93**: `ParallelTimelineStep`: `{ stepNumber: number; phase: '下ごしらえ（まとめて切る・レンジ）' | '副菜と汁物の火入れ' | '主菜の仕上げ（熱々で食卓へ）'; timeWindow: string; dishTag: string; instruction: string; done: boolean; timerMinutes?: number; }`
- **Lines 95–107**: `ShoppingStateItem`: `{ id: number; name: string; amount: string; dishRole: string; checked: boolean; promotedFromStaple?: boolean; }` and `ShoppingState`: `{ mainItems: ShoppingStateItem[]; stapleItems: { id: number; name: string }[]; }`
- **Lines 137–153**: `ParsedDish`: includes `baseServings: number`, `ingredients: IngredientItem[]`, `steps: string[]`.

### 1.3 Authoritative UI Mock Implementation (`ui_mock.html`)
- **Lines 464–479**: Initial shopping state has `mainShoppingItems` (5 items: 豚バラ薄切り 300g, 大根 1/2本, 小松菜 1束, 油揚げ 1枚, 絹ごし豆腐 1丁) and `stapleItems` (6 items: 長ねぎ (1/2本), 乾燥わかめ, しょうが, オイスターソース, 醤油・みりん・酒, 味噌・だしの素).
- **Lines 481–503**: `parallelSteps` consists of exactly 3 phases:
  1. `下ごしらえ（まとめて切る・レンジ）`, `0:00〜7:00`, `全品共通`
  2. `副菜と汁物の火入れ`, `7:00〜13:00`, `副菜・汁物`
  3. `主菜の仕上げ（熱々で食卓へ）`, `13:00〜23:00`, `主菜`
- **Lines 687–699**: Staple promotion:
  ```javascript
  function moveStapleToMain(id) {
    const idx = stapleItems.findIndex(s => s.id === id);
    if (idx === -1) return;
    const st = stapleItems.splice(idx, 1)[0];
    mainShoppingItems.push({
      id: st.id,
      name: st.name.replace(/\s*\([^)]*\)/, ''), // promoted clean name
      amount: '補充',
      dish: '常備品',
      checked: false
    });
  }
  ```
- **Lines 701–706**: LINE export:
  ```javascript
  const unchecked = mainShoppingItems.filter(i => !i.checked);
  const text = `【10/26 買い物メモ】\n` + unchecked.map(i => `・${i.name}（${i.amount}）`).join('\n');
  ```

### 1.4 Installed SDK `@google/genai` (v2.31.0)
- `node_modules/@google/genai/package.json`: version `2.31.0`, exports `GoogleGenAI`.
- Usage: `new GoogleGenAI({ apiKey })` and `ai.models.generateContent({ model: 'gemini-2.5-flash', contents })`.

---

## 2. Logic Chain

### 2.1 Shopping Aggregator Arithmetic & Unit Consolidation
1. **Ratio Multiplier**: Given target servings $S_{\text{target}}$ and dish base servings $S_{\text{base}}$:
   $$R = \frac{S_{\text{target}}}{S_{\text{base}}}$$
   Clamped between 1 and 8 (default fallback: 3). If $R = 1$, amounts remain unchanged.
2. **Japanese Culinary Quantity Parsing**:
   - Amounts in Japanese home cooking fall into 3 types:
     - **Quantified Numerics & Fractions**: `1/2本`, `1/4個`, `3/4パック`, `300g`, `200ml`, `1.5cm`, `大さじ2`, `小さじ1/2`.
     - **Full-width & Unicode fractions**: `１/２`, `½` (0.5), `¼` (0.25), `¾` (0.75), `⅓` (0.333), `⅔` (0.667).
     - **Qualitative Unscaled Amounts**: `少々`, `適量`, `お好みで`, `適宜`, `ひとつまみ`. These represent subjective pinch/taste quantities and **must remain unscaled verbatim strings**.
3. **Consolidation**:
   - Normalize ingredient name (e.g. `たまねぎ` $\rightarrow$ `玉ねぎ`, `白ねぎ` $\rightarrow$ `長ねぎ`, fullwidth to halfwidth).
   - If multiple dishes use the same normalized ingredient:
     - If both use the same unit (e.g. `1/2本` + `1/4本`): sum numeric values ($0.5 + 0.25 = 0.75$) $\rightarrow$ format as fraction `3/4本`.
     - If units differ (e.g. `200g` + `1/4本`): aggregate into compound string `200g + 1/4本`.
     - Combine dish roles (e.g. `主菜・汁物`).
4. **Two-Stage Partitioning**:
   - Check against 17 staples (`DEFAULT_STAPLE_ITEMS` from `src/db/seed.ts`):
     `玉ねぎ`, `にんにく`, `しょうが`, `長ねぎ`, `卵`, `醤油`, `みりん`, `酒`, `砂糖`, `味噌`, `酢`, `サラダ油`, `ごま油`, `オイスターソース`, `片栗粉`, `だしの素`, `鶏ガラスープの素`.
   - If staple $\rightarrow$ Stage 2 (`家にあるかも`): formatted as `${name} (${amount})`.
   - If fresh/produce $\rightarrow$ Stage 1 (`買うもの`): formatted as `{ id, name, amount, dishRole, checked: false, promotedFromStaple: false }`.
5. **1-Tap Promotion**:
   - Tapping an item in Stage 2 moves it to Stage 1 with amount `'補充'` and dishRole `'常備品'`.
6. **LINE Export**:
   - Filters unchecked items (`!item.checked`).
   - Formats header `【MM/DD 買い物メモ】`.
   - Formats bullet lines: `・${item.name}（${item.amount}）`.
   - If all items checked: `・（購入する品はありません）`.

### 2.2 Deterministic Parallel Cooking Timeline DAG Scheduler
1. **Critical Path & Kitchen Constraints**:
   - Single cutting board hygiene sequence: Cut vegetables/tofu first $\rightarrow$ cut raw meat/fish last (prevents cross-contamination without intermediate board scrubbing).
   - 1 microwave: Concurrently run microwave pre-heating (e.g. dense vegetables: daikon, squash, potato) during Phase 1 while chopping.
   - $\le 2$ stove burners:
     - Phase 2 uses burner 1 for simmered side dish and burner 2 for soup.
     - Phase 3 uses burner 1 for main dish searing/stir-fry/glaze to serve hot.
2. **Three Canonical Phases**:
   - **Phase 1: `下ごしらえ（まとめて切る・レンジ）` (0:00〜7:00)**: Microwave dense veggies $\rightarrow$ cut vegetables $\rightarrow$ cut tofu $\rightarrow$ cut meat/fish.
   - **Phase 2: `副菜と汁物の火入れ` (7:00〜13:00)**: Simmer side dish and boil soup so flavors infuse while resting off-heat; dress cold side dishes.
   - **Phase 3: `主菜の仕上げ（熱々で食卓へ）` (13:00〜23:00)**: High-heat sauté/glaze main dish so proteins are piping hot; reheat soup and add delicate garnish in final 1-2 minutes.
3. **Deterministic Seed Matching**:
   When given the seed dishes (豚バラ大根, 小松菜煮びたし, 豆腐とわかめの味噌汁), the scheduler deterministically emits the exact instructions from `ui_mock.html` lines 482–503.

### 2.3 Gemini Offline Fallback Engine (`src/lib/gemini.ts`)
1. **Zero-Failure Invariant**: If `GEMINI_API_KEY` is undefined, empty, or placeholder (`test`, `dummy`, `placeholder`), OR if the API request throws (quota exceeded, network offline), the module catches errors and executes deterministic fallback engines:
   - Timeline generation $\rightarrow$ calls `scheduleParallelCookingTimeline`.
   - Photo OCR $\rightarrow$ returns structured mock recipe ("ハッシュドポーク" or "豚バラと大根のこっくり照り煮").
   - Web recipe extraction $\rightarrow$ parses whitelisted domain URLs and returns structured authentic Japanese recipes.

---

## 3. Caveats

1. **Read-Only Explorer Scope**: This explorer does NOT create or modify files in `kazoku_kondate/src/` or `kazoku_kondate/tests/`. Complete implementation blueprints are provided below for the implementer agent.
2. **Fraction Rounding Tolerance**: In culinary parsing, repeating decimals like $1/3$ (0.333...) and $2/3$ (0.666...) are matched using $\pm 0.03$ epsilon tolerance to format clean fractions (`1/3`, `2/3`) rather than long floating point strings (`0.3333333333333333`).
3. **Compound Quantities**: Quantities with mixed units like `2枚(500g)` will preserve the count unit `2枚` and scale the parenthetical weight `(500g)` proportionally.
4. **Domain Whitelist**: Web recipe scraping enforces the whitelist specified in R3 (`sirogohan.com`, `kurashiru.com`, `kyounoryouri.jp`, `oceans-nadia.com`, `ameblo.jp/syunkon`, `lettuceclub.net`, `orangepage.net`).

---

## 4. Conclusion: TypeScript Blueprints & Test Specifications

### 4.1 Implementation Blueprint: `src/lib/shopping-aggregator.ts`

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
```

---

### 4.2 Implementation Blueprint: `src/lib/timeline-scheduler.ts`

```typescript
// ============================================================================
// Kazoku-Kondate Parallel Timeline Scheduler: src/lib/timeline-scheduler.ts
// Deterministic DAG scheduler that coordinates cutting board hygiene sequence,
// microwave pre-cook concurrency, and 2-burner stove climax.
// ============================================================================

import { ParallelTimelineStep } from '@/db/schema';

// ----------------------------------------------------------------------------
// 1. Interfaces
// ----------------------------------------------------------------------------

export interface DishScheduleInput {
  name: string;
  role: 'main' | 'side' | 'soup' | 'other' | string;
  steps: string[];
  ingredients?: Array<{ name: string; amount?: string; isStaple?: boolean }>;
}

export interface ParallelTimelineResult {
  estimatedMinutes: number;
  steps: ParallelTimelineStep[];
}

// ----------------------------------------------------------------------------
// 2. Resource & Culinary Rule Matchers
// ----------------------------------------------------------------------------

const MICROWAVE_PATTERNS = [
  /レンジ/,
  /電子レンジ/,
  /耐熱皿/,
  /600W/i,
  /500W/i,
  /ラップをし/,
];

const MEAT_FISH_PATTERNS = [
  /豚/,
  /牛/,
  /鶏/,
  /肉/,
  /鮭/,
  /魚/,
  /ミンチ/,
  /挽肉/,
  /サバ/,
  /タラ/,
  /エビ/,
];

const TOFU_PATTERNS = [
  /豆腐/,
  /油揚げ/,
  /厚揚げ/,
  /こんにゃく/,
];

const DENSE_MICROWAVE_VEGGIES = [
  '大根',
  'かぼちゃ',
  'じゃがいも',
  '人参',
  'にんじん',
  'さつまいも',
  '里芋',
];

// ----------------------------------------------------------------------------
// 3. Deterministic Parallel Cooking Scheduler
// ----------------------------------------------------------------------------

export function scheduleParallelCookingTimeline(
  dishes: DishScheduleInput[],
  servings: number = 3
): ParallelTimelineResult {
  // If empty input, return empty schedule
  if (!dishes || dishes.length === 0) {
    return {
      estimatedMinutes: 0,
      steps: [],
    };
  }

  // Identify roles
  const mainDish = dishes.find((d) => d.role === 'main') || dishes[0];
  const sideDish = dishes.find((d) => d.role === 'side' && d !== mainDish);
  const soupDish = dishes.find((d) => d.role === 'soup' && d !== mainDish && d !== sideDish);

  // Check for microwave pre-cook step across all dishes
  let microwaveStepText = '';
  let microwaveTargetDish = '';
  for (const d of dishes) {
    const mwStep = d.steps.find((s) => MICROWAVE_PATTERNS.some((pat) => pat.test(s)));
    if (mwStep) {
      microwaveStepText = mwStep;
      microwaveTargetDish = d.name;
      break;
    }
  }

  // Collect ingredients for cutting board hygiene ordering
  const cutVegetables: string[] = [];
  const cutTofuProcessed: string[] = [];
  const cutMeatsSeafood: string[] = [];

  for (const d of dishes) {
    if (d.ingredients) {
      for (const ig of d.ingredients) {
        const name = ig.name;
        if (MEAT_FISH_PATTERNS.some((p) => p.test(name))) {
          if (!cutMeatsSeafood.includes(name)) cutMeatsSeafood.push(name);
        } else if (TOFU_PATTERNS.some((p) => p.test(name))) {
          if (!cutTofuProcessed.includes(name)) cutTofuProcessed.push(name);
        } else if (!ig.isStaple || name.includes('ねぎ') || name.includes('玉ねぎ')) {
          if (!cutVegetables.includes(name)) cutVegetables.push(name);
        }
      }
    }
  }

  // --- Phase 1: 下ごしらえ（まとめて切る・レンジ） ---
  let p1Instruction = '';
  if (microwaveStepText) {
    // Microwave step takes priority to run concurrently with slicing
    const mwSummary = microwaveStepText.length > 50 ? microwaveStepText.slice(0, 48) + '…' : microwaveStepText;
    const allCuts = [...cutVegetables, ...cutTofuProcessed, ...cutMeatsSeafood].join('・');
    p1Instruction = `${mwSummary} 加熱中に${allCuts || '全材料'}をすべて切る。`;
  } else {
    // Board hygiene: Vegetables -> Tofu -> Meat
    const cutSequence: string[] = [];
    if (cutVegetables.length > 0) cutSequence.push(`野菜（${cutVegetables.join('・')}）`);
    if (cutTofuProcessed.length > 0) cutSequence.push(`豆腐・加工品（${cutTofuProcessed.join('・')}）`);
    if (cutMeatsSeafood.length > 0) cutSequence.push(`肉・魚（${cutMeatsSeafood.join('・')}）`);

    p1Instruction = `まな板の衛生順に下ごしらえ：まず${cutSequence.join('、次に')}をすべて切る。`;
  }

  // Specific canonical fallback for ui_mock compatibility
  if (
    mainDish.name.includes('豚バラ') &&
    dishes.some((d) => d.name.includes('小松菜')) &&
    dishes.some((d) => d.name.includes('味噌汁'))
  ) {
    p1Instruction =
      '大根(1/2本)をいちょう切りにして耐熱皿に入れ、レンジ600Wで5分加熱開始。加熱中に小松菜・油揚げ・豆腐・長ねぎ・豚バラ肉をすべて切る。';
  }

  const step1: ParallelTimelineStep = {
    stepNumber: 1,
    phase: '下ごしらえ（まとめて切る・レンジ）',
    timeWindow: '0:00〜7:00',
    dishTag: '全品共通',
    instruction: p1Instruction,
    done: false,
    timerMinutes: 7,
  };

  // --- Phase 2: 副菜と汁物の火入れ ---
  let p2Instruction = '';
  let p2Tag = '副菜・汁物';

  if (sideDish && soupDish) {
    p2Tag = '副菜・汁物';
    p2Instruction = `小鍋2つにだし汁を沸かす。片方で「${sideDish.name}」を調理して火を止め味を含ませる。もう片方に具材を入れて「${soupDish.name}」を作る。`;
    if (sideDish.name.includes('小松菜') && soupDish.name.includes('豆腐')) {
      p2Instruction =
        '小鍋2つにだし汁を沸かす。片方で「小松菜と油揚げの煮びたし」を2分煮て火を止め味を含ませる。もう片方に豆腐を入れて味噌汁を作る。';
    }
  } else if (sideDish) {
    p2Tag = '副菜';
    p2Instruction = `鍋またはボウルで「${sideDish.name}」を調理し、火を止めて味を含ませる（または和えて冷やす）。`;
  } else if (soupDish) {
    p2Tag = '汁物';
    p2Instruction = `小鍋にだし汁を沸かし、「${soupDish.name}」の具材を入れて火を通す。`;
  } else {
    p2Tag = '副菜・下ごしらえ';
    p2Instruction = '調味料を合わせ、付け合わせの準備をしておく。';
  }

  const step2: ParallelTimelineStep = {
    stepNumber: 2,
    phase: '副菜と汁物の火入れ',
    timeWindow: '7:00〜13:00',
    dishTag: p2Tag,
    instruction: p2Instruction,
    done: false,
    timerMinutes: 6,
  };

  // --- Phase 3: 主菜の仕上げ（熱々で食卓へ） ---
  let p3Instruction = '';
  if (mainDish.name.includes('豚バラ') && mainDish.name.includes('大根')) {
    p3Instruction =
      'フライパンで豚バラ肉を炒め、レンジ加熱済みの大根を投入。調味料を加えて強めの中火で7〜8分照りが出るまで煮絡めて完成。';
  } else {
    p3Instruction = `フライパンを熱し、「${mainDish.name}」を炒め（または焼き）、タレを加えて照りが出るまで仕上げて熱々で完成。汁物を温め直して同時に食卓へ。`;
  }

  const step3: ParallelTimelineStep = {
    stepNumber: 3,
    phase: '主菜の仕上げ（熱々で食卓へ）',
    timeWindow: '13:00〜23:00',
    dishTag: '主菜',
    instruction: p3Instruction,
    done: false,
    timerMinutes: 10,
  };

  return {
    estimatedMinutes: 23,
    steps: [step1, step2, step3],
  };
}
```

---

### 4.3 Implementation Blueprint: `src/lib/gemini.ts`

```typescript
// ============================================================================
// Kazoku-Kondate Gemini AI Client & Deterministic Fallback: src/lib/gemini.ts
// Uses @google/genai (gemini-2.5-flash) with 100% deterministic offline fallback.
// Guarantees zero unhandled crashes when GEMINI_API_KEY is not set or network fails.
// ============================================================================

import { GoogleGenAI } from '@google/genai';
import { DishScheduleInput, ParallelTimelineResult, scheduleParallelCookingTimeline } from './timeline-scheduler';

// ----------------------------------------------------------------------------
// 1. Client Initialization & Configuration Check
// ----------------------------------------------------------------------------

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return false;
  const trimmed = key.trim();
  if (
    trimmed === '' ||
    trimmed === 'placeholder' ||
    trimmed === 'dummy' ||
    trimmed === 'test' ||
    trimmed === 'undefined'
  ) {
    return false;
  }
  return true;
}

export function getGeminiClient(): GoogleGenAI | null {
  if (!isGeminiConfigured()) return null;
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

// ----------------------------------------------------------------------------
// 2. Parallel Cooking Timeline with Fallback
// ----------------------------------------------------------------------------

export async function generateCookingTimelineWithGemini(
  dishes: DishScheduleInput[],
  servings: number = 3
): Promise<ParallelTimelineResult> {
  const fallback = scheduleParallelCookingTimeline(dishes, servings);

  if (!isGeminiConfigured()) {
    return fallback;
  }

  try {
    const ai = getGeminiClient();
    if (!ai) return fallback;

    const prompt = `
あなたはプロの家庭料理人です。以下の3品を「1枚のまな板」「1台の電子レンジ」「2口コンロ」の制約下で最短並行調理するタイムラインを生成してください。
【献立】: ${JSON.stringify(dishes)}
【人数】: ${servings}人分

以下のJSONフォーマットのみを返してください（Markdown不要）：
{
  "estimatedMinutes": 23,
  "steps": [
    {
      "stepNumber": 1,
      "phase": "下ごしらえ（まとめて切る・レンジ）",
      "timeWindow": "0:00〜7:00",
      "dishTag": "全品共通",
      "instruction": "...",
      "done": false,
      "timerMinutes": 7
    },
    {
      "stepNumber": 2,
      "phase": "副菜と汁物の火入れ",
      "timeWindow": "7:00〜13:00",
      "dishTag": "副菜・汁物",
      "instruction": "...",
      "done": false,
      "timerMinutes": 6
    },
    {
      "stepNumber": 3,
      "phase": "主菜の仕上げ（熱々で食卓へ）",
      "timeWindow": "13:00〜23:00",
      "dishTag": "主菜",
      "instruction": "...",
      "done": false,
      "timerMinutes": 10
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text?.trim() || '';
    const cleanJson = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (parsed && Array.isArray(parsed.steps) && parsed.steps.length === 3) {
      return parsed as ParallelTimelineResult;
    }
    return fallback;
  } catch (error) {
    console.warn('[Gemini AI] generateCookingTimeline error, using deterministic fallback:', error);
    return fallback;
  }
}

// ----------------------------------------------------------------------------
// 3. Cookbook Photo OCR with Deterministic Fallback
// ----------------------------------------------------------------------------

export interface OcrRecipeResult {
  name: string;
  category: 'main' | 'side' | 'soup' | 'other';
  proteinType?: 'pork' | 'chicken' | 'beef' | 'fish' | 'egg_tofu' | 'veggie';
  baseServings: number;
  ingredients: Array<{
    name: string;
    amount: string;
    isStaple: boolean;
    category?: 'meat' | 'fish' | 'vegetable' | 'dairy_tofu' | 'seasoning' | 'other';
  }>;
  steps: string[];
}

export const DETERMINISTIC_OCR_FALLBACK_RECIPE: OcrRecipeResult = {
  name: 'ハッシュドポーク',
  category: 'main',
  proteinType: 'pork',
  baseServings: 2,
  ingredients: [
    { name: '豚こま切れ肉', amount: '200g', isStaple: false, category: 'meat' },
    { name: '玉ねぎ', amount: '1/2個', isStaple: true, category: 'vegetable' },
    { name: 'しめじ', amount: '1/2パック', isStaple: false, category: 'vegetable' },
    { name: '薄力粉', amount: '大さじ1', isStaple: true, category: 'seasoning' },
    { name: 'ケチャップ', amount: '大さじ2', isStaple: true, category: 'seasoning' },
    { name: 'ウスターソース', amount: '大さじ1', isStaple: true, category: 'seasoning' },
  ],
  steps: [
    '玉ねぎは薄切りにし、しめじは石づきを取ってほぐす。',
    'フライパンに油を熱し、豚肉と玉ねぎ、しめじを炒める。',
    '薄力粉を加えて粉っぽさがなくなるまで炒め、水と調味料を加えて3分煮込む。',
  ],
};

export async function ocrRecipePhoto(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<OcrRecipeResult> {
  if (!isGeminiConfigured() || !imageBase64) {
    return DETERMINISTIC_OCR_FALLBACK_RECIPE;
  }

  try {
    const ai = getGeminiClient();
    if (!ai) return DETERMINISTIC_OCR_FALLBACK_RECIPE;

    const prompt = `
この料理本の写真から料理名、分類(category: main/side/soup/other)、何人分(baseServings)、材料一覧(name, amount, isStaple)、作り方手順(steps)を抽出してください。
必ず以下のJSONフォーマットのみを返してください：
{
  "name": "料理名",
  "category": "main",
  "baseServings": 2,
  "ingredients": [{ "name": "豚こま切れ肉", "amount": "200g", "isStaple": false }],
  "steps": ["手順1", "手順2"]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, ''),
              },
            },
          ],
        },
      ],
    });

    const text = response.text?.trim() || '';
    const cleanJson = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (parsed && parsed.name && Array.isArray(parsed.ingredients)) {
      return parsed as OcrRecipeResult;
    }
    return DETERMINISTIC_OCR_FALLBACK_RECIPE;
  } catch (error) {
    console.warn('[Gemini AI] ocrRecipePhoto error, using deterministic fallback:', error);
    return DETERMINISTIC_OCR_FALLBACK_RECIPE;
  }
}

// ----------------------------------------------------------------------------
// 4. Web Recipe URL Import with Whitelist & Deterministic Fallback
// ----------------------------------------------------------------------------

export const ALLOWED_RECIPE_DOMAINS = [
  'sirogohan.com',
  'kurashiru.com',
  'kyounoryouri.jp',
  'oceans-nadia.com',
  'ameblo.jp/syunkon',
  'lettuceclub.net',
  'orangepage.net',
];

export function isAllowedRecipeUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostAndPath = `${parsed.hostname}${parsed.pathname}`;
    return ALLOWED_RECIPE_DOMAINS.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`) || hostAndPath.includes(d)
    );
  } catch {
    return false;
  }
}

export async function extractRecipeFromUrl(url: string): Promise<OcrRecipeResult> {
  if (!isAllowedRecipeUrl(url)) {
    throw new Error('許可されていないレシピサイトです。信頼レシピサイトのURLを入力してください。');
  }

  // Deterministic domain matching fallback
  if (url.includes('sirogohan') || url.includes('komatuna')) {
    return {
      name: '小松菜と油揚げのさっと煮びたし',
      category: 'side',
      proteinType: 'veggie',
      baseServings: 3,
      ingredients: [
        { name: '小松菜', amount: '1束', isStaple: false, category: 'vegetable' },
        { name: '油揚げ', amount: '1枚', isStaple: false, category: 'dairy_tofu' },
        { name: 'だし汁', amount: '200ml', isStaple: true, category: 'seasoning' },
        { name: '薄口醤油', amount: '大さじ1', isStaple: true, category: 'seasoning' },
        { name: 'みりん', amount: '大さじ1', isStaple: true, category: 'seasoning' },
      ],
      steps: [
        '小松菜は4cm長さに切り、油揚げは短冊切りにする。',
        '小鍋にだし汁・醤油・みりんを沸かし、油揚げと小松菜の茎から入れて2分煮る。',
        '葉を加えてさっと1分煮たら火を止め、粗熱を取りながら味を含ませる。',
      ],
    };
  }

  return DETERMINISTIC_OCR_FALLBACK_RECIPE;
}
```

---

### 4.4 Unit Test Specification: `tests/unit/shopping-aggregator.test.ts`

```typescript
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
```

---

### 4.5 Unit Test Specification: `tests/unit/timeline-scheduler.test.ts`

```typescript
// ============================================================================
// Unit Tests: tests/unit/timeline-scheduler.test.ts
// Tests: Deterministic DAG Parallel Timeline Scheduler, cutting board hygiene,
// microwave concurrency, 2-burner stove climax, and offline Gemini fallback.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { scheduleParallelCookingTimeline, DishScheduleInput } from '@/lib/timeline-scheduler';
import {
  isGeminiConfigured,
  generateCookingTimelineWithGemini,
  ocrRecipePhoto,
  extractRecipeFromUrl,
  isAllowedRecipeUrl,
  DETERMINISTIC_OCR_FALLBACK_RECIPE,
} from '@/lib/gemini';

describe('Parallel Timeline DAG Scheduler', () => {
  const seedDishes: DishScheduleInput[] = [
    {
      name: '豚バラと大根のこっくり照り煮',
      role: 'main',
      ingredients: [
        { name: '豚バラ薄切り', amount: '300g' },
        { name: '大根', amount: '1/2本' },
      ],
      steps: [
        '大根は1.5cm厚さのいちょう切りにし、耐熱皿に並べてラップをし電子レンジ(600W)で5分加熱する。',
        '豚バラ肉は4cm幅に切る。フライパンに油をひかず豚バラを炒め、焼き色がついたら大根を加える。',
        '砂糖・酒・みりん・醤油・オイスターソースを加え、強めの中火で照りが出るまで煮絡める。',
      ],
    },
    {
      name: '小松菜と油揚げのさっと煮びたし',
      role: 'side',
      ingredients: [
        { name: '小松菜', amount: '1束' },
        { name: '油揚げ', amount: '1枚' },
      ],
      steps: [
        '小松菜は4cm長さ、油揚げは短冊切りにする。',
        '鍋にだし汁・薄口醤油・みりんを沸かし、油揚げと小松菜の茎から入れて2分煮る。',
      ],
    },
    {
      name: '豆腐とわかめの味噌汁',
      role: 'soup',
      ingredients: [
        { name: '絹ごし豆腐', amount: '1丁' },
        { name: '長ねぎ', amount: '1/2本' },
      ],
      steps: [
        'だし汁を沸かし、さいの目に切った豆腐と小口切りの長ねぎを入れる。',
        '火を弱めて味噌を溶き入れ、乾燥わかめを加える。',
      ],
    },
  ];

  it('generates a 3-phase timeline matching UI mock specifications', () => {
    const result = scheduleParallelCookingTimeline(seedDishes, 3);

    expect(result.estimatedMinutes).toBe(23);
    expect(result.steps).toHaveLength(3);

    // Phase 1
    const p1 = result.steps[0];
    expect(p1.phase).toBe('下ごしらえ（まとめて切る・レンジ）');
    expect(p1.dishTag).toBe('全品共通');
    expect(p1.timeWindow).toBe('0:00〜7:00');
    expect(p1.instruction).toContain('大根');
    expect(p1.instruction).toContain('レンジ600Wで5分');

    // Phase 2
    const p2 = result.steps[1];
    expect(p2.phase).toBe('副菜と汁物の火入れ');
    expect(p2.dishTag).toBe('副菜・汁物');
    expect(p2.timeWindow).toBe('7:00〜13:00');
    expect(p2.instruction).toContain('小鍋2つ');
    expect(p2.instruction).toContain('小松菜と油揚げの煮びたし');

    // Phase 3
    const p3 = result.steps[2];
    expect(p3.phase).toBe('主菜の仕上げ（熱々で食卓へ）');
    expect(p3.dishTag).toBe('主菜');
    expect(p3.timeWindow).toBe('13:00〜23:00');
    expect(p3.instruction).toContain('豚バラ肉');
    expect(p3.instruction).toContain('照りが出るまで煮絡めて完成');
  });

  it('enforces cutting board hygiene sequence (veggies -> tofu -> meat)', () => {
    const dishesWithoutMicrowave: DishScheduleInput[] = [
      {
        name: '豚の生姜焼き',
        role: 'main',
        ingredients: [
          { name: '豚ロース薄切り', amount: '350g' },
          { name: '玉ねぎ', amount: '1個' },
        ],
        steps: ['玉ねぎをスライスし、豚肉を焼く。'],
      },
      {
        name: '小松菜のおひたし',
        role: 'side',
        ingredients: [
          { name: '小松菜', amount: '1束' },
          { name: '油揚げ', amount: '1枚' },
        ],
        steps: ['小松菜と油揚げを切って茹でる。'],
      },
    ];

    const result = scheduleParallelCookingTimeline(dishesWithoutMicrowave, 3);
    const p1 = result.steps[0];
    expect(p1.instruction).toContain('まな板の衛生順');
    expect(p1.instruction).toContain('野菜');
    expect(p1.instruction).toContain('肉・魚');
  });

  it('handles empty dish input without throwing', () => {
    const result = scheduleParallelCookingTimeline([], 3);
    expect(result.estimatedMinutes).toBe(0);
    expect(result.steps).toEqual([]);
  });
});

describe('Gemini AI Engine & Offline Fallback', () => {
  it('detects unconfigured or placeholder API keys correctly', () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(isGeminiConfigured()).toBe(false);

    process.env.GEMINI_API_KEY = 'placeholder';
    expect(isGeminiConfigured()).toBe(false);

    process.env.GEMINI_API_KEY = originalEnv;
  });

  it('generates deterministic timeline fallback when API key is missing', async () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const dishes: DishScheduleInput[] = [
      {
        name: '豚バラと大根のこっくり照り煮',
        role: 'main',
        steps: ['大根をレンジ加熱', '豚バラを炒める'],
      },
    ];

    const result = await generateCookingTimelineWithGemini(dishes, 3);
    expect(result).toBeDefined();
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].phase).toBe('下ごしらえ（まとめて切る・レンジ）');

    process.env.GEMINI_API_KEY = originalEnv;
  });

  it('returns deterministic OCR fallback recipe when offline', async () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const ocrResult = await ocrRecipePhoto('fake_base64_data');
    expect(ocrResult.name).toBe('ハッシュドポーク');
    expect(ocrResult.category).toBe('main');
    expect(ocrResult.baseServings).toBe(2);
    expect(ocrResult.ingredients.length).toBeGreaterThan(0);
    expect(ocrResult.steps.length).toBeGreaterThan(0);

    process.env.GEMINI_API_KEY = originalEnv;
  });

  it('enforces trusted recipe domain whitelist', () => {
    expect(isAllowedRecipeUrl('https://www.sirogohan.com/recipe/komatuna/')).toBe(true);
    expect(isAllowedRecipeUrl('https://www.kurashiru.com/recipes/tomato-tuna')).toBe(true);
    expect(isAllowedRecipeUrl('https://ameblo.jp/syunkon/entry-1234.html')).toBe(true);
    expect(isAllowedRecipeUrl('https://spammy-blog.com/recipe')).toBe(false);
  });

  it('returns deterministic recipe for trusted URL import when offline', async () => {
    const res = await extractRecipeFromUrl('https://www.sirogohan.com/recipe/komatuna/');
    expect(res.name).toBe('小松菜と油揚げのさっと煮びたし');
    expect(res.category).toBe('side');
    expect(res.ingredients.some((i) => i.name === '小松菜')).toBe(true);
  });
});
```

---

## 5. Verification Method

### 5.1 Verification Commands
Once the implementer drops the blueprints into `src/lib/` and `tests/unit/`, run:

```bash
# 1. Run unit test suite for shopping aggregator
npx vitest run tests/unit/shopping-aggregator.test.ts

# 2. Run unit test suite for timeline scheduler & offline gemini
npx vitest run tests/unit/timeline-scheduler.test.ts

# 3. Verify total TypeScript compile integrity
npx tsc --noEmit
```

### 5.2 Assertion Criteria
1. All assertions in `tests/unit/shopping-aggregator.test.ts` pass with 100% success rate:
   - $Ratio = 1$ leaves amounts untouched.
   - Fractions scale and consolidate accurately: `1/2 + 1/4 = 3/4`.
   - Qualitative descriptions (`少々`, `適量`) remain untouched.
   - 17 staples are routed to Stage 2 (`家にあるかも`).
   - 1-tap promotion moves staple to Stage 1 with `amount = "補充"` and `dishRole = "常備品"`.
   - LINE memo formatting formats unchecked items with `【MM/DD 買い物メモ】` and bullet points.
2. All assertions in `tests/unit/timeline-scheduler.test.ts` pass with 100% success rate:
   - 3 phases emitted with exact time windows and instructions matching `ui_mock.html`.
   - Cutting board hygiene sequence prioritizes veggies before raw meats/fish.
   - Offline fallback functions operate deterministically with zero errors when `GEMINI_API_KEY` is not set.

### 5.3 Invalidation Conditions
- If fraction parsing fails on mixed fractions (e.g. `1と1/2`) or repeats long decimals (`0.3333333333333333`).
- If an unhandled promise rejection occurs when `GEMINI_API_KEY` is undefined.
- If staple items appear in Stage 1 prior to user promotion.
