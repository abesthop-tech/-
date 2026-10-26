# M2 Algorithmic Engines Adversarial Review Report

**Module**: Shopping Aggregator (`src/lib/shopping-aggregator.ts`) & Parallel Timeline Scheduler (`src/lib/timeline-scheduler.ts`)  
**Milestone**: M2 - Algorithmic Engines & Business Logic  
**Author**: `teamwork_preview_challenger_m2_2`  
**Date**: 2026-10-26T04:53:00Z  
**Verdict**: **REQUEST_CHANGES** (3 pinpointed defects with exact code remediations)

---

## 1. Observation

### 1.1 Empirical Test Suite Execution
An adversarial test suite was authored and executed in `tests/unit/adversarial_m2.test.ts` (27 test cases):
- **Command**: `npx vitest run tests/unit/adversarial_m2.test.ts`
- **Output**:
  ```text
  Test Files  1 passed (1)
       Tests  27 passed (27)
    Duration  1.11s
  ```
- **Full Project Test Suite**: `npm test`
  ```text
  Test Files  12 passed (12)
       Tests  229 passed (229)
    Duration  9.32s
  ```
- **Production Build**: `npm run build`
  ```text
  ✓ Compiled successfully
  Linting and checking validity of types ...
  ✓ Generating static pages (5/5)
  Finalizing page optimization ...
  Exit Code: 0
  ```

---

### 1.2 Observed Defects & Empirical Evidence

#### Finding 1: Eager `parseFloat` Drops Units and Ranges in `parseNumericValue`
- **File**: `src/lib/shopping-aggregator.ts`, lines 117–120 & 190–198:
  ```typescript
  // Line 118:
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
  ```
- **Direct Empirical Observation**:
  Executing `parseJapaneseAmount('2〜3個', 2)` returns:
  ```json
  { "numeric": 4, "unit": "", "raw": "2〜3個", "isQualitative": false }
  ```
  Executing `parseJapaneseAmount('1束(約200g)', 2)` returns:
  ```json
  { "numeric": 2, "unit": "", "raw": "1束(約200g)", "isQualitative": false }
  ```
- **Mechanism**:
  Because `suffixMatch` does not match strings containing `〜` (wave dash) or `(約...)`, execution falls through to line 190:
  `const justNum = parseNumericValue(normalized);`
  JavaScript's built-in `parseFloat` greedily parses leading digits (e.g. `parseFloat("2〜3個") === 2`, `parseFloat("1束(約200g)") === 1`).
  Consequently, `unit` is set to `""` (empty string) and `isQualitative` is set to `false`.
  The original unit (`個`, `束`) and range (`〜3`, `約200g`) are silently discarded, outputting dimensionless quantities like `"4"` on the shopping list or leading to disjointed consolidation (`"2束 + 2"`).

---

#### Finding 2: Uncaught `TypeError` on Undefined `steps` and `ingredients`
- **Files**:
  1. `src/lib/timeline-scheduler.ts`, line 94:
     ```typescript
     for (const d of dishes) {
       const mwStep = d.steps.find((s) => MICROWAVE_PATTERNS.some((pat) => pat.test(s)));
     ```
  2. `src/lib/shopping-aggregator.ts`, line 313:
     ```typescript
     for (const item of dish.ingredients) {
     ```
- **Direct Empirical Observation**:
  - Calling `scheduleParallelCookingTimeline([{ name: '料理', role: 'main', steps: undefined as any }])` throws verbatim:
    ```text
    TypeError: Cannot read properties of undefined (reading 'find')
        at scheduleParallelCookingTimeline (src/lib/timeline-scheduler.ts:94:20)
    ```
  - Calling `consolidateAndPartitionShoppingList([{ role: 'main', ingredients: undefined as any }])` throws verbatim:
    ```text
    TypeError: dish.ingredients is not iterable
        at consolidateAndPartitionShoppingList (src/lib/shopping-aggregator.ts:313:29)
    ```
- **Mechanism**:
  While TypeScript types suggest `steps` and `ingredients` are always present, calendar-imported dishes or user-created dishes before OCR/generation may have `undefined` or `null` for these properties at runtime, causing unhandled 500 crashes.

---

#### Finding 3: Awkward Japanese Phrasing in Timeline Phase 1 When No Cuttable Items Exist
- **File**: `src/lib/timeline-scheduler.ts`, lines 131–137:
  ```typescript
  const cutSequence: string[] = [];
  if (cutVegetables.length > 0) cutSequence.push(`野菜（${cutVegetables.join('・')}）`);
  if (cutTofuProcessed.length > 0) cutSequence.push(`豆腐・加工品（${cutTofuProcessed.join('・')}）`);
  if (cutMeatsSeafood.length > 0) cutSequence.push(`肉・魚（${cutMeatsSeafood.join('・')}）`);

  p1Instruction = `まな板の衛生順に下ごしらえ：まず${cutSequence.join('、次に')}をすべて切る。`;
  ```
- **Direct Empirical Observation**:
  When dishes do not contain any ingredients matching meat/tofu/vegetable keywords (e.g. instant soup, simple noodle dish, or empty ingredients array), `cutSequence` is empty (`[]`).
  `cutSequence.join('、次に')` evaluates to `""`.
  `p1Instruction` becomes verbatim:
  ```text
  "まな板の衛生順に下ごしらえ：まずをすべて切る。"
  ```
  Notice the malformed sentence: "まず" followed directly by "をすべて切る。".

---

## 2. Logic Chain

1. **Premise 1**: Japanese recipes frequently specify quantities with ranges (e.g. `2〜3個`, `1〜2本`), approximate weight notes (e.g. `1束(約200g)`), or unquantified terms (`少々`, `適量`).
2. **Premise 2**: In `parseNumericValue`, using `parseFloat(clean)` without verifying that `clean` contains exclusively numeric characters allows any string with a leading digit to be parsed as a plain number.
3. **Inference 1**: Strings like `2〜3個` lose their unit and range qualifier, resulting in corrupted shopping quantities (e.g. `4` without `個`).
4. **Premise 3**: In M3, API routes (`/api/cooking/timeline` and `/api/menu`) will accept persisted dishes from SQLite, including AI provisional dishes or calendar items where steps or ingredients may initially be missing or null.
5. **Inference 2**: Without defensive null/undefined checks (`(d.steps || [])` and `(dish.ingredients || [])`), API endpoints will crash with unhandled 500 TypeErrors.
6. **Premise 4**: The Human-Crafted UI standard mandates editorial craftsmanship in Japanese typography and phrasing. Sentences like `"まずをすべて切る。"` violate this aesthetic standard.
7. **Conclusion**: The worker must apply small defensive patches to harden both modules before proceeding to M3.

---

## 3. Caveats

- **No Caveats on Core Algorithms**: The mathematical portion scaling, 2-stage partitioning against the 17 default pantry staples, 1-tap promotion and demotion, LINE text memo generation, 20-dish consolidation performance (<10ms), and 3-phase DAG timeline generation with hygiene constraints are sound and robust.
- **Scope Limit**: As an empirical challenger operating under review-only constraints, these fixes must be implemented by the worker agent.

---

## 4. Conclusion

Verdict: **REQUEST_CHANGES**

The core algorithms are well architected, but three discrete defects require remediation:

### Exact Remediation Instructions for Worker:

#### 1. Fix `src/lib/shopping-aggregator.ts`:
- **Line 117–120**: Replace loose `parseFloat` with strict regex check:
  ```typescript
  // Before:
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;

  // After:
  if (/^\d+(?:\.\d+)?$/.test(clean)) {
    return parseFloat(clean);
  }
  return null;
  ```
- **Line 313**: Add defensive check for undefined/null ingredients:
  ```typescript
  // Before:
  for (const item of dish.ingredients) {

  // After:
  for (const item of (dish.ingredients || [])) {
  ```

#### 2. Fix `src/lib/timeline-scheduler.ts`:
- **Line 93–94**: Add defensive check for undefined/null steps:
  ```typescript
  // Before:
  const mwStep = d.steps.find((s) => MICROWAVE_PATTERNS.some((pat) => pat.test(s)));

  // After:
  const mwStep = (d.steps || []).find((s) => MICROWAVE_PATTERNS.some((pat) => pat.test(s)));
  ```
- **Line 136**: Add empty-sequence fallback for Phase 1 instruction:
  ```typescript
  // Before:
  p1Instruction = `まな板の衛生順に下ごしらえ：まず${cutSequence.join('、次に')}をすべて切る。`;

  // After:
  p1Instruction = cutSequence.length > 0
    ? `まな板の衛生順に下ごしらえ：まず${cutSequence.join('、次に')}をすべて切る。`
    : '下ごしらえを行い、材料を適宜準備する。';
  ```

---

## 5. Verification Method

To independently verify these fixes once implemented:

```powershell
# 1. Run the dedicated M2 adversarial stress test suite
npx vitest run tests/unit/adversarial_m2.test.ts

# 2. Run the entire project test suite
npm test

# 3. Verify production compilation
npm run build
```

Expected Invalidation Conditions:
- If `parseJapaneseAmount('2〜3個', 2)` returns `isQualitative: true` and preserves `"2〜3個"`.
- If `scheduleParallelCookingTimeline([{ name: '料理', role: 'main', steps: undefined as any }])` completes without throwing.
- If `consolidateAndPartitionShoppingList([{ role: 'main', ingredients: undefined as any }])` completes without throwing.
- If dishes with no cuttable ingredients receive `"下ごしらえを行い、材料を適宜準備する。"`.
