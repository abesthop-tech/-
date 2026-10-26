# Handoff Report: M1 Empirical Stress Testing & Concurrency Challenge

**Agent**: `teamwork_preview_challenger_m1_1`  
**Working Directory**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate\.agents\teamwork\teamwork_preview_challenger_m1_1`  
**Project Root**: `C:\Users\HCP4\.gemini\antigravity\scratch\kazoku_kondate`  
**Date**: 2026-10-26T04:03:00Z  
**Parent Conversation ID**: `35a3dc7b-a199-49dc-b838-a1010ac73ac1`  
**Milestone**: M1 - Core Foundation & Database  
**Handoff Type**: Hard Handoff  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Observation

### 1.1 Empirical Concurrency & Locking Test Execution
An adversarial stress harness was implemented in `tests/unit/adversarial_db_stress.test.ts` and `tests/helpers/concurrency-worker.mjs`, exercising SQLite operations, locking behavior, and edge-case inputs:

```powershell
npx vitest run tests/unit/adversarial_db_stress.test.ts
```
**Verbatim Output**:
```
 RUN  v2.1.9 C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate

 ✓ tests/unit/adversarial_db_stress.test.ts (17 tests) 474ms
   ✓ Adversarial SQLite & LibSQL Stress Test Suite > 2. High-Concurrency Stress on LibSQL Client > survives multi-process concurrent write bombardment (4 worker child processes) 302ms

 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  13:00:15
   Duration  1.64s (transform 92ms, setup 0ms, collect 571ms, tests 474ms, environment 0ms, prepare 392ms)
```

Combined suite verification (`foundation.test.ts`, `db.test.ts`, and `adversarial_db_stress.test.ts`):
```powershell
npx vitest run tests/unit/foundation.test.ts tests/unit/db.test.ts tests/unit/adversarial_db_stress.test.ts
```
**Verbatim Output**:
```
 RUN  v2.1.9 C:/Users/HCP4/.gemini/antigravity/scratch/kazoku_kondate

 ✓ tests/unit/adversarial_db_stress.test.ts (17 tests) 455ms
 ✓ tests/unit/foundation.test.ts (17 tests) 37ms
 ✓ tests/unit/db.test.ts (6 tests) 20ms

 Test Files  3 passed (3)
      Tests  40 passed (40)
   Start at  13:00:23
   Duration  3.28s (transform 116ms, setup 0ms, collect 1.54s, tests 512ms, environment 1ms, prepare 348ms)
```

Direct multi-process bombardment (8 worker processes simultaneously performing 400 total writes to `local.db`):
```powershell
node -e "const { spawn } = require('child_process'); const procs = Array.from({length: 8}, (_, i) => spawn('node', ['./tests/helpers/concurrency-worker.mjs', String(i+1), '50'])); Promise.all(procs.map(p => new Promise((res) => { p.stdout.on('data', d => console.log(d.toString().trim())); p.stderr.on('data', d => console.error(d.toString().trim())); p.on('close', code => res(code)); }))).then(codes => console.log('All 8 workers finished with exit codes:', codes));"
```
**Verbatim Output**:
```
{"workerId":"2","success":true,"count":50}
{"workerId":"5","success":true,"count":50}
{"workerId":"7","success":true,"count":50}
{"workerId":"3","success":true,"count":50}
{"workerId":"8","success":true,"count":50}
{"workerId":"6","success":true,"count":50}
{"workerId":"1","success":true,"count":50}
{"workerId":"4","success":true,"count":50}
All 8 workers finished with exit codes: [ 0, 0, 0, 0, 0, 0, 0, 0 ]
```

### 1.2 Observed Bugs & Code Vulnerabilities

#### Bug A: Falsy Value Coercion in `dishToInsert` and `dailyMenuToInsert`
- **Location**: `src/db/schema.ts:193` and `src/db/schema.ts:217`
- **Verbatim Code**:
  ```typescript
  // Line 193:
  baseServings: dish.baseServings || 3,

  // Line 217:
  servings: menu.servings || 3,
  ```
- **Observed Behavior**:
  When `baseServings: 0` or `servings: 0` is supplied, `0 || 3` evaluates to `3`. Zero portions are coerced into `3` because `0` is falsy in JavaScript.
- **Empirical Test Verification**:
  ```typescript
  const converted = dishToInsert({ ...parsedWithZero, baseServings: 0 });
  expect(converted.baseServings).toBe(3); // Demonstrates unintended coercion
  ```

#### Bug B: Unshielded `JSON.parse()` in Entity Deserializers
- **Location**: `src/db/schema.ts:176-178` and `src/db/schema.ts:207-209`
- **Verbatim Code**:
  ```typescript
  export function parseDish(row: Dish): ParsedDish {
    return {
      ...row,
      category: row.category as DishCategory,
      proteinType: (row.proteinType as ProteinType) || null,
      sourceType: row.sourceType as SourceType,
      recipeStatus: row.recipeStatus as RecipeStatus,
      aliases: JSON.parse(row.aliasesJson || '[]'),
      ingredients: JSON.parse(row.ingredientsJson || '[]'),
      steps: JSON.parse(row.stepsJson || '[]'),
    };
  }
  ```
- **Observed Behavior**:
  When corrupted or truncated JSON strings exist in SQLite text columns (`aliases_json`, `ingredients_json`, `steps_json`, `slots_json`, `parallel_steps_json`, `shopping_state_json`), `parseDish()` and `parseDailyMenu()` throw an unhandled `SyntaxError: Unexpected token ... in JSON`, crashing caller API endpoints without a recovery boundary.
- **Empirical Test Verification**:
  ```typescript
  // Injects invalid JSON: 'INVALID_JSON{'
  expect(() => parseDish(rows[0])).toThrow(SyntaxError);
  ```

#### Bug C: Flawed Auto-Seed Condition Re-Seeding Sample Menus
- **Location**: `src/db/index.ts:105-113`
- **Verbatim Code**:
  ```typescript
  const result = await client.execute('SELECT COUNT(*) as count FROM dishes;');
  const menuResult = await client.execute('SELECT COUNT(*) as count FROM daily_menus;');
  const count = Number(result.rows[0]?.count ?? 0);
  const menuCount = Number(menuResult.rows[0]?.count ?? 0);

  // 3. Auto-seed if brand new or incomplete database
  if (count === 0 || menuCount < 14) {
    await seedDatabase(db);
  }
  ```
- **Observed Behavior**:
  Whenever a user creates a new database or starts the server with fewer than 14 daily menus (e.g. on days 1 through 13 of using the app), `menuCount < 14` evaluates to `true`. On every cold start, `seedDatabase(db)` re-executes, attempting to insert the 14 historical sample menus ending on `2026-10-26`.

---

## 2. Logic Chain

1. **SQLite Concurrency & Locking Verification**:
   - The worker claimed in `handoff.md` that `PRAGMA busy_timeout = 5000;` and `PRAGMA journal_mode = WAL;` ensure locking resilience.
   - We verified via Observation 1.1:
     - `PRAGMA journal_mode` returns `wal`.
     - `PRAGMA busy_timeout` returns `5000`.
     - 100 concurrent async SELECTs executed in under 100ms with zero errors.
     - 50 concurrent async INSERTs executed with zero errors.
     - 10 independent LibSQL clients writing concurrently had zero lock timeouts.
     - 8 independent child worker processes performing 400 total writes simultaneously succeeded with exit codes `[0, 0, 0, 0, 0, 0, 0, 0]`.
     - 50 concurrent calls to `ensureDatabaseInitialized()` executed idempotently without race conditions.
     - LibSQL batch transactions rolled back atomically upon syntax failure without leaving orphan rows.
     - SQL injection payloads (`'; DROP TABLE dishes; --`) and extreme Unicode (surrogate pairs `𠮷`, `𩸽`, emojis `🍲`, BiDi overrides `\u202E`, control characters) were stored and retrieved safely.
   - *Inference*: The core LibSQL SQLite database engine, WAL configuration, and busy timeout are resilient and handle high concurrency well.

2. **Drizzle Schema & Helper Logic Chain**:
   - In Observation 1.2 (Bug A), `dishToInsert` uses logical OR: `dish.baseServings || 3`.
   - In JavaScript, `0` is falsy (`0 || 3 === 3`).
   - If an algorithm or user sets servings to `0` (e.g. calculating leftovers or zero servings for an unused dish slot), the value is mutated to `3`.
   - *Inference*: Logical OR must be replaced with nullish coalescing `dish.baseServings ?? 3`.

3. **Data Integrity & Robustness Logic Chain**:
   - In Observation 1.2 (Bug B), `parseDish` and `parseDailyMenu` parse SQLite strings using bare `JSON.parse()`.
   - SQLite text fields can contain corrupted data (from partial writes, imported calendar titles with special formatting, OCR JSON anomalies, or manual DB edits).
   - Unhandled `SyntaxError` crashes the entire request pipeline.
   - *Inference*: Deserialization requires a safe JSON parsing helper (`safeJsonParse(val, fallback)`).

4. **Auto-Seed Life Cycle Logic Chain**:
   - In Observation 1.2 (Bug C), `if (count === 0 || menuCount < 14)` treats `menuCount < 14` as a trigger for re-seeding.
   - In production or normal use, a real user begins with 0 or 1 daily menus. As they use the app during their first two weeks, their menu count is strictly `< 14`.
   - Under this condition, every server reboot or route invocation calling `ensureDatabaseInitialized()` runs `seedDatabase(db)` again.
   - *Inference*: Seeding should only occur if the database is uninitialized (`count === 0 && menuCount === 0`) or based on an explicit configuration flag `db_seeded` in `app_settings`.

---

## 3. Caveats

- Long-term multi-gigabyte WAL file size checkpoints and vacuuming under continuous writes for months were not simulated, as M1 focuses on local personal usage.
- Tests were executed on Windows 11 Node `v24.18.0`.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

While the underlying SQLite WAL engine and LibSQL client exhibit exemplary concurrency and locking performance under heavy multi-process load, the following 3 defects must be remediated in the database layer:

1. **Fix Falsy Coercion in `src/db/schema.ts`**:
   - Change `dish.baseServings || 3` $\rightarrow$ `dish.baseServings ?? 3`
   - Change `menu.servings || 3` $\rightarrow$ `menu.servings ?? 3`
2. **Add Safe JSON Parsing Boundary in `src/db/schema.ts`**:
   - Wrap `JSON.parse()` in a safe helper:
     ```typescript
     function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
       if (!raw) return fallback;
       try { return JSON.parse(raw); } catch { return fallback; }
     }
     ```
3. **Refine Auto-Seed Condition in `src/db/index.ts`**:
   - Change `if (count === 0 || menuCount < 14)` to check `if (count === 0 && menuCount === 0)` or check `app_settings` key `db_initialized`.

---

## 5. Verification Method

To independently reproduce all tests:

1. **Run Adversarial DB Stress Test Suite**:
   ```powershell
   npx vitest run tests/unit/adversarial_db_stress.test.ts
   ```
   *Expected Result*: 17 tests pass in < 2 seconds, verifying WAL mode, 100 concurrent SELECTs, 50 concurrent INSERTs, 10-client contention, 4-worker child process bombardment, SQL injection immunity, and extreme Unicode storage.

2. **Run Multi-Process Stress Worker (400 Concurrent Writes)**:
   ```powershell
   node -e "const { spawn } = require('child_process'); const procs = Array.from({length: 8}, (_, i) => spawn('node', ['./tests/helpers/concurrency-worker.mjs', String(i+1), '50'])); Promise.all(procs.map(p => new Promise((res) => { p.stdout.on('data', d => console.log(d.toString().trim())); p.stderr.on('data', d => console.error(d.toString().trim())); p.on('close', code => res(code)); }))).then(codes => console.log('All 8 workers finished with exit codes:', codes));"
   ```
   *Expected Result*: All 8 processes exit with code `0`.

3. **Inspect Falsy Coercion Bug in `src/db/schema.ts`**:
   - View line 193 and 217. Test with `dishToInsert({ baseServings: 0 })`.
