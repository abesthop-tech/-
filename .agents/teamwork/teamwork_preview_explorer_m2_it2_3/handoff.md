# M2 Test Suite Alignment & Regression Shield Plan

**Module**: Milestone M2 Test Infrastructure (`tests/unit/`)  
**Author**: `teamwork_preview_explorer_m2_it2_3`  
**Parent Orchestrator**: `35a3dc7b-a199-49dc-b838-a1010ac73ac1`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_explorer_m2_it2_3`  
**Project Root**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`  
**Date**: 2026-10-26T05:18:00Z  
**Verdict**: **COMPLETE — READY FOR WORKER EXECUTION**

---

## 1. Observation

### 1.1 Empirical Baseline Test Execution
Executed the full Vitest test suite on current codebase:
- **Command**: `npx vitest run`
- **Output**:
  ```text
  Test Files  12 passed (12)
       Tests  229 passed (229)
    Duration  9.22s
  ```
All 12 test files currently pass, establishing a clean, 100% baseline:
1. `tests/unit/timeline-scheduler.test.ts` (8 tests)
2. `tests/unit/shopping-aggregator.test.ts` (15 tests)
3. `tests/unit/menu-planner.test.ts` (15 tests)
4. `tests/unit/ics-parser.test.ts` (34 tests)
5. `tests/unit/adversarial_m2.test.ts` (27 tests)
6. `tests/unit/adversarial_m2_challenge.test.ts` (16 tests)
7. `tests/unit/adversarial-auditor-m2.test.ts` (11 tests)
8. `tests/unit/adversarial-auth.test.ts` (50 tests)
9. `tests/unit/adversarial_db_stress.test.ts` (17 tests)
10. `tests/unit/adversarial_m1.test.ts` (13 tests)
11. `tests/unit/foundation.test.ts` (17 tests)
12. `tests/unit/db.test.ts` (6 tests)

---

### 1.2 Inspection of `tests/unit/timeline-scheduler.test.ts`
In `tests/unit/timeline-scheduler.test.ts`, lines 59–88 contain assertions specifically coupled to the hardcoded mock branches in `src/lib/timeline-scheduler.ts`:

```typescript
// tests/unit/timeline-scheduler.test.ts:59-88
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
    expect(p1.instruction).toContain('レンジ600Wで5分'); // LINE 71: Couled to hardcoded string

    // Phase 2
    const p2 = result.steps[1];
    expect(p2.phase).toBe('副菜と汁物の火入れ');
    expect(p2.dishTag).toBe('副菜・汁物');
    expect(p2.timeWindow).toBe('7:00〜13:00');
    expect(p2.instruction).toContain('小鍋2つ');
    expect(p2.instruction).toContain('小松菜と油揚げの煮びたし'); // LINE 79: Drops "さっと" from dish name

    // Phase 3
    const p3 = result.steps[2];
    expect(p3.phase).toBe('主菜の仕上げ（熱々で食卓へ）');
    expect(p3.dishTag).toBe('主菜');
    expect(p3.timeWindow).toBe('13:00〜23:00');
    expect(p3.instruction).toContain('豚バラ肉'); // LINE 86: Couled to hardcoded ingredient string
    expect(p3.instruction).toContain('照りが出るまで煮絡めて完成'); // LINE 87: Couled to hardcoded string
  });
```

**Direct Empirical Evidence of Coupling**:
1. **Line 71 (`'レンジ600Wで5分'`)**:
   - `seedDishes[0].steps[0]` actually reads: `'大根は1.5cm厚さのいちょう切りにし、耐熱皿に並べてラップをし電子レンジ(600W)で5分加熱する。'`.
   - The hardcoded branch in `timeline-scheduler.ts:145-146` explicitly synthesized `'レンジ600Wで5分加熱開始'`.
   - A genuine dynamic parser/summarizer extracting microwave parameters from steps will generate `'電子レンジ(600W)で5分'` or include `600W` and `5分`.
2. **Line 79 (`'小松菜と油揚げの煮びたし'`)**:
   - `seedDishes[1].name` is `'小松菜と油揚げのさっと煮びたし'`.
   - The hardcoded branch in `timeline-scheduler.ts:168` dropped `'さっと'` to output `'小松菜と油揚げの煮びたし'`.
   - A genuine dynamic scheduler uses `${sideDish.name}`, outputting `'小松菜と油揚げのさっと煮びたし'`.
3. **Line 86 (`'豚バラ肉'`) and Line 87 (`'照りが出るまで煮絡めて完成'`)**:
   - `seedDishes[0].name` is `'豚バラと大根のこっくり照り煮'`.
   - The hardcoded branch in `timeline-scheduler.ts:194-195` outputted verbatim: `'フライパンで豚バラ肉を炒め、レンジ加熱済みの大根を投入。調味料を加えて強めの中火で7〜8分照りが出るまで煮絡めて完成。'`.
   - A genuine dynamic scheduler synthesizes instructions from `mainDish.name` and cooking verbs.

---

### 1.3 Inspection of `tests/unit/adversarial_m2.test.ts`
In `tests/unit/adversarial_m2.test.ts`, Challenger 2 authored 4 tests specifically to **document the presence of bugs**:

1. **Line 243–252**:
   ```typescript
   it('exposes eager parseFloat bug on range expressions (e.g. 2〜3個 drops unit and range)', () => {
     const parsedRange = parseJapaneseAmount('2〜3個', 2);
     expect(parsedRange.numeric).toBe(4);
     expect(parsedRange.unit).toBe(''); // Unit '個' is lost!
     expect(parsedRange.isQualitative).toBe(false);
   });
   ```
2. **Line 295–316**:
   ```typescript
   it('documents uncaught TypeError when dish.ingredients is undefined', () => {
     const malformedDishes = [
       { role: 'main', ingredients: undefined as unknown as DishWithIngredients['ingredients'] },
     ];
     let threw = false;
     let errorMsg = '';
     try {
       consolidateAndPartitionShoppingList(malformedDishes, 3);
     } catch (err: unknown) {
       threw = true;
       errorMsg = (err as Error).message;
     }
     expect(threw).toBe(true);
     expect(errorMsg).toContain('not iterable');
   });
   ```
3. **Line 679–695**:
   ```typescript
   it('documents awkward phrasing when dish has no sliceable ingredients', () => {
     const dishesWithoutIngredients: DishScheduleInput[] = [
       { name: 'インスタントラーメン', role: 'main', steps: ['お湯を沸かして麺を茹でる。'] },
     ];
     const result = scheduleParallelCookingTimeline(dishesWithoutIngredients, 1);
     expect(result).toBeDefined();
     expect(result.steps).toHaveLength(3);
     expect(result.steps[0].instruction).toBe('まな板の衛生順に下ごしらえ：まずをすべて切る。');
   });
   ```
4. **Line 696–720**:
   ```typescript
   it('documents uncaught TypeError when dish.steps is undefined', () => {
     const malformedDish = [
       { name: '謎の料理', role: 'main', steps: undefined as unknown as string[] },
     ];
     let threw = false;
     let errorMsg = '';
     try {
       scheduleParallelCookingTimeline(malformedDish, 2);
     } catch (err: unknown) {
       threw = true;
       errorMsg = (err as Error).message;
     }
     expect(threw).toBe(true);
     expect(errorMsg).toContain("reading 'find'");
   });
   ```

**Direct Empirical Consequence**:
As soon as the worker implements the bug fixes:
- `(dish.ingredients || [])` will prevent throwing -> `threw` becomes `false` -> **FAIL**.
- `(d.steps || [])` will prevent throwing -> `threw` becomes `false` -> **FAIL**.
- Phrasing fallback prevents `"まずをすべて切る。"` -> string mismatch -> **FAIL**.
- Range amount preserves unit `'個'` / ranges -> `unit` is not `''` -> **FAIL**.

Therefore, `adversarial_m2.test.ts` MUST be aligned simultaneously with the implementation.

---

### 1.4 Inspection of All Other Test Suites
Confirmed zero dependencies on hardcoded strings across all other suites:
- `tests/unit/adversarial-auditor-m2.test.ts`:
  - Line 365: `expect(schedule.estimatedMinutes).toBe(23);`
  - In `timeline-scheduler.ts`, default phase durations ($T_1=7, T_2=6, T_3=10$) evaluate to $7 + 6 + 10 = 23$ minutes, ensuring full backward compatibility.
- `tests/unit/shopping-aggregator.test.ts`: Tests standard fraction/decimal scaling, staple partitioning, and LINE formatting. 100% passing.
- `tests/unit/menu-planner.test.ts`: Tests recency scoring, protein alternation, and slot locks. 100% passing.
- `tests/unit/ics-parser.test.ts`: Tests RFC 5545 stream parsing, event classification, and title splitting. 100% passing.
- `tests/unit/adversarial_m2_challenge.test.ts`: Tests pathological ICS streams and menu planner invariants. 100% passing.
- `foundation.test.ts`, `db.test.ts`, `adversarial-auth.test.ts`, `adversarial_db_stress.test.ts`, `adversarial_m1.test.ts`: Completely independent, 100% passing.

---

## 2. Logic Chain

1. **Premise 1**: Unit tests should verify behavioral contracts, invariants, and dynamic properties rather than exact verbatim hardcoded strings embedded to pass tests.
2. **Observation Reference 1.2**: In `tests/unit/timeline-scheduler.test.ts`, lines 71, 79, 86, and 87 check exact hardcoded substrings (`レンジ600Wで5分`, `小松菜と油揚げの煮びたし`, `豚バラ肉`, `照りが出るまで煮絡めて完成`) which directly mirror the mock branches in `timeline-scheduler.ts:140-195`.
3. **Inference 1**: When the hardcoded branches are removed to fulfill Reviewer 2's integrity mandate, `timeline-scheduler.test.ts` will fail unless updated to assert dynamic features (microwave keyword/duration detection, dynamic dish names from input, and natural completion phrases).
4. **Observation Reference 1.3**: Challenger 2 wrote 4 tests in `tests/unit/adversarial_m2.test.ts` asserting error throws (`threw = true`) and malformed output (`まずをすべて切る。`, unit-less `4`).
5. **Inference 2**: When the worker fixes these defects, `adversarial_m2.test.ts` will fail unless updated to assert the fixed behavior (graceful null-safety without throwing, natural Japanese phrasing, and preserved units/ranges).
6. **Observation Reference 1.4**: All other 10 test suites do not depend on the hardcoded strings or the 4 documented bugs.
7. **Conclusion**: By applying targeted test updates to `tests/unit/timeline-scheduler.test.ts` and `tests/unit/adversarial_m2.test.ts`, 100% of the project's 229+ tests will pass cleanly with zero regressions.

---

## 3. Caveats

- **Time Calculation Compatibility**: In `adversarial-auditor-m2.test.ts` (line 365) and `adversarial_m2.test.ts` (lines 445 & 592), tests assert `expect(result.estimatedMinutes).toBe(23);`. The dynamic DAG scheduler should calculate $T_{\text{total}} = T_1 + T_2 + T_3$, where default durations are $T_1 = 7, T_2 = 6, T_3 = 10$, yielding 23 minutes for typical multi-dish menus. Empty inputs yield 0.
- **Range Amount Behavior**: Explorer 2 may either support full range arithmetic (e.g. `2〜3個` at 2x becomes `4〜6個`) or treat ranges safely as qualitative strings (e.g. `2〜3個` at 2x remains `2〜3個`). The test update designed below supports both approaches robustly.

---

## 4. Conclusion & Actionable Test Alignment Plan

### 4.1 Drop-in Replacement for `tests/unit/timeline-scheduler.test.ts` (Lines 59–88)

Update Test 1 in `tests/unit/timeline-scheduler.test.ts` and add Test 2 for genuine dynamic DAG verification:

```typescript
  it('generates a 3-phase timeline matching UI mock specifications dynamically', () => {
    const result = scheduleParallelCookingTimeline(seedDishes, 3);

    expect(result.estimatedMinutes).toBe(23);
    expect(result.steps).toHaveLength(3);

    // Phase 1: Dynamic microwave extraction & cutting board hygiene
    const p1 = result.steps[0];
    expect(p1.phase).toBe('下ごしらえ（まとめて切る・レンジ）');
    expect(p1.dishTag).toBe('全品共通');
    expect(p1.timeWindow).toBe('0:00〜7:00');
    expect(p1.instruction).toContain('大根');
    expect(p1.instruction).toMatch(/(?:電子レンジ|レンジ).*600W.*5分/);

    // Phase 2: Dynamic 2-burner stovetop allocation using actual dish names
    const p2 = result.steps[1];
    expect(p2.phase).toBe('副菜と汁物の火入れ');
    expect(p2.dishTag).toBe('副菜・汁物');
    expect(p2.timeWindow).toBe('7:00〜13:00');
    expect(p2.instruction).toContain('小鍋2つ');
    expect(p2.instruction).toContain(seedDishes[1].name); // '小松菜と油揚げのさっと煮びたし'
    expect(p2.instruction).toContain(seedDishes[2].name); // '豆腐とわかめの味噌汁'

    // Phase 3: Dynamic main dish finishing
    const p3 = result.steps[2];
    expect(p3.phase).toBe('主菜の仕上げ（熱々で食卓へ）');
    expect(p3.dishTag).toBe('主菜');
    expect(p3.timeWindow).toBe('13:00〜23:00');
    expect(p3.instruction).toContain('豚バラ');
    expect(p3.instruction).toContain('完成');
  });

  it('dynamically schedules arbitrary dishes without hardcoded mock branches', () => {
    const arbitraryDishes: DishScheduleInput[] = [
      {
        name: '鶏むね肉とブロッコリーの塩炒め',
        role: 'main',
        ingredients: [
          { name: '鶏むね肉', amount: '300g' },
          { name: 'ブロッコリー', amount: '1株' },
        ],
        steps: ['ブロッコリーをレンジで2分加熱。', '鶏肉を炒める。'],
      },
      {
        name: '茄子の煮浸し',
        role: 'side',
        ingredients: [{ name: 'なす', amount: '2本' }],
        steps: ['茄子を煮る。'],
      },
      {
        name: '玉ねぎと卵のスープ',
        role: 'soup',
        ingredients: [
          { name: '玉ねぎ', amount: '1/2個' },
          { name: '卵', amount: '1個' },
        ],
        steps: ['スープを作る。'],
      },
    ];

    const result = scheduleParallelCookingTimeline(arbitraryDishes, 3);
    expect(result.steps).toHaveLength(3);
    expect(result.estimatedMinutes).toBeGreaterThan(0);

    // Dynamic Phase 1: Ingredients & Microwave
    expect(result.steps[0].instruction).toContain('ブロッコリー');
    expect(result.steps[0].instruction).toMatch(/レンジ/);
    expect(result.steps[0].instruction).toContain('鶏むね肉');

    // Dynamic Phase 2: Side & Soup
    expect(result.steps[1].instruction).toContain('茄子の煮浸し');
    expect(result.steps[1].instruction).toContain('玉ねぎと卵のスープ');

    // Dynamic Phase 3: Main
    expect(result.steps[2].instruction).toContain('鶏むね肉とブロッコリーの塩炒め');
  });
```

---

### 4.2 Drop-in Replacement for 4 Tests in `tests/unit/adversarial_m2.test.ts`

#### 1. Range Amount Parsing (Lines 243–253):
```typescript
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
```

#### 2. Defensive Undefined Ingredients (Lines 295–316):
```typescript
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
```

#### 3. Empty Cuttable Ingredients Natural Phrasing (Lines 679–695):
```typescript
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
```

#### 4. Defensive Undefined Steps (Lines 696–720):
```typescript
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
```

---

## 5. Verification Method

Once the worker agent applies the remediations in `src/lib/` and the aligned tests in `tests/unit/`:

### 5.1 Verification Commands

```powershell
# Step 1: Run timeline scheduler unit tests
npx vitest run tests/unit/timeline-scheduler.test.ts

# Step 2: Run shopping aggregator unit tests
npx vitest run tests/unit/shopping-aggregator.test.ts

# Step 3: Run adversarial stress test suite
npx vitest run tests/unit/adversarial_m2.test.ts

# Step 4: Run challenge test suite
npx vitest run tests/unit/adversarial_m2_challenge.test.ts

# Step 5: Run forensic auditor suite
npx vitest run tests/unit/adversarial-auditor-m2.test.ts

# Step 6: Run full project test suite (Regression Shield)
npm test

# Step 7: Clean and verify production Next.js build
npm run build
```

### 5.2 Pass / Invalidation Criteria

| Test Suite | Target | Pass Condition |
|---|---|---|
| `timeline-scheduler.test.ts` | 9 tests | 100% pass; dynamic DAG generation verifies input dish names and cutting hygiene |
| `adversarial_m2.test.ts` | 27 tests | 100% pass; 4 defect documentation tests converted to regression shield assertions |
| `shopping-aggregator.test.ts` | 15 tests | 100% pass |
| `menu-planner.test.ts` | 15 tests | 100% pass |
| `ics-parser.test.ts` | 34 tests | 100% pass |
| `adversarial_m2_challenge.test.ts` | 16 tests | 100% pass |
| `adversarial-auditor-m2.test.ts` | 11 tests | 100% pass |
| **Full Project Suite (`npm test`)** | **230 tests** | **12/12 test files passed, 0 failed, 100% pass rate** |
| **Next.js Production Build (`npm run build`)** | App Router | Exit code 0, 0 TypeScript errors |
