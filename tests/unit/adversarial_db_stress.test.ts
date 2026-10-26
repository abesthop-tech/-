import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, client, ensureDatabaseInitialized } from '@/db';
import {
  dishes,
  dailyMenus,
  appSettings,
  parseDish,
  parseDailyMenu,
  dishToInsert,
  dailyMenuToInsert,
  type ParsedDish,
  type ParsedDailyMenu,
} from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import { spawn } from 'child_process';
import path from 'path';

describe('Adversarial SQLite & LibSQL Stress Test Suite', () => {
  const RUN_PREFIX = `stress_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const TEST_CLEANUP_IDS: string[] = [];
  const TEST_CLEANUP_DATES: string[] = [];

  const cleanupRecords = async () => {
    try {
      await client.execute({
        sql: `DELETE FROM dishes WHERE id LIKE 'adv_%' OR id LIKE 'stress_%' OR id LIKE 'proc_%'`,
        args: [],
      });
      await client.execute({
        sql: `DELETE FROM daily_menus WHERE date LIKE '2099-%' OR date LIKE 'stress_%'`,
        args: [],
      });
    } catch {
      // Ignore cleanup error
    }
  };

  beforeAll(async () => {
    await ensureDatabaseInitialized();
    await cleanupRecords();
  });

  afterAll(async () => {
    await cleanupRecords();
  });

  // ==========================================================================
  // Section 1: SQLite Pragma & Client Engine Lock Verification
  // ==========================================================================
  describe('1. Pragma & Engine Resilience', () => {
    it('verifies WAL mode and busy_timeout are active on local.db', async () => {
      const journalModeRes = await client.execute('PRAGMA journal_mode;');
      const busyTimeoutRes = await client.execute('PRAGMA busy_timeout;');

      const journalMode = String(journalModeRes.rows[0]?.journal_mode || '').toLowerCase();
      const busyTimeout = Number(busyTimeoutRes.rows[0]?.timeout ?? 0);

      expect(journalMode).toBe('wal');
      expect(busyTimeout).toBeGreaterThanOrEqual(5000);
    });

    it('verifies WAL persistence across new client connections', async () => {
      const newClient = createClient({ url: 'file:local.db' });
      try {
        const jm = await newClient.execute('PRAGMA journal_mode;');
        expect(String(jm.rows[0]?.journal_mode || '').toLowerCase()).toBe('wal');
      } finally {
        newClient.close();
      }
    });
  });

  // ==========================================================================
  // Section 2: Rapid Concurrent Read/Write LibSQL Queries & Multi-Process
  // ==========================================================================
  describe('2. High-Concurrency Stress on LibSQL Client', () => {
    it('executes 100 concurrent asynchronous SELECT queries without errors', async () => {
      const startTime = Date.now();
      const concurrency = 100;

      const promises = Array.from({ length: concurrency }, async () => {
        const res = await client.execute('SELECT count(*) as cnt FROM dishes;');
        return Number(res.rows[0]?.cnt);
      });

      const results = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      expect(results.length).toBe(concurrency);
      expect(results.every((cnt) => cnt >= 13)).toBe(true);
      expect(elapsed).toBeLessThan(10000);
    });

    it('executes 50 concurrent asynchronous writes (INSERT) on single client', async () => {
      const concurrency = 50;
      const ids: string[] = [];

      for (let i = 0; i < concurrency; i++) {
        const id = `adv_concurrent_wr_${RUN_PREFIX}_${i}`;
        ids.push(id);
        TEST_CLEANUP_IDS.push(id);
      }

      const startTime = Date.now();
      const promises = ids.map(async (id, idx) => {
        await db.insert(dishes).values({
          id,
          name: `並行書き込みテスト料理 ${idx}`,
          aliasesJson: JSON.stringify([`並行_${idx}`]),
          category: 'main',
          proteinType: 'pork',
          sourceType: 'ai_generated',
          recipeStatus: 'ai_provisional',
          baseServings: 3,
          ingredientsJson: JSON.stringify([{ name: '豚肉', amount: '100g', isStaple: false }]),
          stepsJson: JSON.stringify(['炒める']),
          cookCount: idx,
          createdAt: new Date().toISOString(),
        });
      });

      await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      const insertedCount = await client.execute({
        sql: `SELECT count(*) as cnt FROM dishes WHERE id LIKE 'adv_concurrent_wr_${RUN_PREFIX}_%'`,
        args: [],
      });
      expect(Number(insertedCount.rows[0]?.cnt)).toBe(concurrency);
      expect(elapsed).toBeLessThan(10000);
    });

    it('executes simultaneous mixed concurrent readers (50) and writers (50)', async () => {
      const writeIds: string[] = [];
      const writePromises = Array.from({ length: 50 }, async (_, i) => {
        const id = `adv_mixed_${RUN_PREFIX}_${i}`;
        writeIds.push(id);
        TEST_CLEANUP_IDS.push(id);

        return db.insert(dishes).values({
          id,
          name: `同時混合テスト ${i}`,
          aliasesJson: '[]',
          category: 'side',
          sourceType: 'wishlist',
          recipeStatus: 'confirmed',
          baseServings: 3,
          ingredientsJson: '[]',
          stepsJson: '[]',
          createdAt: new Date().toISOString(),
        });
      });

      const readPromises = Array.from({ length: 50 }, async () => {
        const res = await db.select().from(dishes).limit(5);
        return res.length;
      });

      const results = await Promise.all([...writePromises, ...readPromises]);
      expect(results.length).toBe(100);
    });

    it('handles concurrent writes across 10 independent Client instances without lock errors', async () => {
      const clientCount = 10;
      const clients = Array.from({ length: clientCount }, () =>
        createClient({ url: 'file:local.db' })
      );

      try {
        await Promise.all(clients.map((c) => c.execute('PRAGMA busy_timeout = 5000;')));

        const multiIds: string[] = [];
        const writePromises = clients.map(async (c, i) => {
          const id = `adv_multi_client_${RUN_PREFIX}_${i}`;
          multiIds.push(id);
          TEST_CLEANUP_IDS.push(id);

          await c.execute({
            sql: `INSERT INTO dishes (id, name, aliases_json, category, source_type, recipe_status, base_servings, ingredients_json, steps_json, cook_count, created_at)
                  VALUES (?, ?, '[]', 'soup', 'classic_book', 'confirmed', 3, '[]', '[]', 0, ?)`,
            args: [id, `マルチクライアント_${i}`, new Date().toISOString()],
          });
        });

        await Promise.all(writePromises);

        for (const id of multiIds) {
          const check = await client.execute({
            sql: 'SELECT id FROM dishes WHERE id = ?',
            args: [id],
          });
          expect(check.rows.length).toBe(1);
        }
      } finally {
        for (const c of clients) {
          c.close();
        }
      }
    });

    it('survives multi-process concurrent write bombardment (4 worker child processes)', async () => {
      const workerScript = path.resolve(process.cwd(), 'tests/helpers/concurrency-worker.mjs');
      const processCount = 4;
      const writesPerProcess = 25;

      const procs = Array.from({ length: processCount }, (_, i) =>
        spawn('node', [workerScript, `${RUN_PREFIX}_p${i}`, String(writesPerProcess)])
      );

      const exitCodes = await Promise.all(
        procs.map(
          (p) =>
            new Promise<number>((resolve) => {
              p.on('close', (code) => resolve(code ?? -1));
            })
        )
      );

      // All 4 worker processes must exit with 0 (no unhandled SQLITE_BUSY exceptions)
      expect(exitCodes).toEqual([0, 0, 0, 0]);

      // Verify total inserted rows = 4 * 25 = 100
      const totalWorkerRows = await client.execute({
        sql: `SELECT count(*) as cnt FROM dishes WHERE id LIKE 'proc_${RUN_PREFIX}_%'`,
        args: [],
      });
      expect(Number(totalWorkerRows.rows[0]?.cnt)).toBe(100);
    });
  });

  // ==========================================================================
  // Section 3: Auto-Initialization Idempotence & Race Conditions
  // ==========================================================================
  describe('3. Auto-Initialization Race Resilience', () => {
    it('handles 50 concurrent calls to ensureDatabaseInitialized() idempotently', async () => {
      const calls = Array.from({ length: 50 }, () => ensureDatabaseInitialized());
      const results = await Promise.allSettled(calls);

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

      const countRes = await client.execute('SELECT COUNT(*) as cnt FROM dishes;');
      expect(Number(countRes.rows[0]?.cnt)).toBeGreaterThanOrEqual(13);
    });

    it('simulates concurrent initialization on an in-memory SQLite database instance', async () => {
      const tempClient = createClient({ url: ':memory:' });
      try {
        const DDL = [
          `CREATE TABLE IF NOT EXISTS dishes (id TEXT PRIMARY KEY, name TEXT NOT NULL);`,
          `CREATE TABLE IF NOT EXISTS daily_menus (date TEXT PRIMARY KEY);`,
        ];

        const initPromises = Array.from({ length: 10 }, async () => {
          await tempClient.execute('PRAGMA busy_timeout = 5000;');
          for (const ddl of DDL) {
            await tempClient.execute(ddl);
          }
        });

        await Promise.all(initPromises);

        const checkRes = await tempClient.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('dishes', 'daily_menus');"
        );
        expect(checkRes.rows.length).toBe(2);
      } finally {
        tempClient.close();
      }
    });
  });

  // ==========================================================================
  // Section 4: SQL Injection, Edge-Case Strings, Extreme Unicode
  // ==========================================================================
  describe('4. Edge-Case Strings, Unicode & Injection Resilience', () => {
    it('safely handles SQL Injection attack strings in ID, name, and notes', async () => {
      const injectionPayloads = [
        "dish'; DROP TABLE dishes; --",
        "dish' OR '1'='1",
        "dish' UNION SELECT name, sql, '', '', '', '', '', '', '', 0, '', '', 0, '', '' FROM sqlite_master; --",
        'dish" OR ""="',
        "dish'/*comment*/--",
      ];

      for (let i = 0; i < injectionPayloads.length; i++) {
        const payload = injectionPayloads[i];
        const id = `adv_inject_${RUN_PREFIX}_${i}`;
        TEST_CLEANUP_IDS.push(id);

        await db.insert(dishes).values({
          id,
          name: payload,
          aliasesJson: JSON.stringify([payload]),
          category: 'main',
          proteinType: 'beef',
          sourceType: 'trusted_web',
          sourceLabel: payload,
          sourceUrl: `https://example.com/test?q=${encodeURIComponent(payload)}`,
          recipeStatus: 'confirmed',
          baseServings: 3,
          ingredientsJson: JSON.stringify([{ name: payload, amount: '1個', isStaple: false }]),
          stepsJson: JSON.stringify([payload]),
          cookCount: 1,
          createdAt: new Date().toISOString(),
        });

        const row = await db.select().from(dishes).where(eq(dishes.id, id));
        expect(row.length).toBe(1);
        expect(row[0].name).toBe(payload);
      }

      const checkTable = await client.execute('SELECT COUNT(*) as cnt FROM dishes;');
      expect(Number(checkTable.rows[0]?.cnt)).toBeGreaterThanOrEqual(13);
    });

    it('safely handles extreme Unicode, rare Japanese Kanji, Emojis, and BiDi overrides', async () => {
      const extremeStrings = [
        '𠮷野家の牛丼＆𩸽（ほっけ）の塩焼き',
        '🍲🥟🍛 特製カレー＆餃子定食 👨‍🍳🔥',
        '\u202Ereversed_text_test\u202C',
        'テスト\u200Bゼロ幅\u200Cスペース\uFEFF',
        'タブ\t改行\n復帰\rテスト',
        'ｶﾀｶﾅ半角と全角カタカナ混合ﾊﾝｶｸ',
      ];

      for (let i = 0; i < extremeStrings.length; i++) {
        const str = extremeStrings[i];
        const id = `adv_unicode_${RUN_PREFIX}_${i}`;
        TEST_CLEANUP_IDS.push(id);

        await db.insert(dishes).values({
          id,
          name: str,
          aliasesJson: JSON.stringify([str]),
          category: 'main',
          sourceType: 'ai_generated',
          recipeStatus: 'ai_provisional',
          baseServings: 3,
          ingredientsJson: JSON.stringify([{ name: str, amount: '100g', isStaple: false }]),
          stepsJson: JSON.stringify([str]),
          createdAt: new Date().toISOString(),
        });

        const row = await db.select().from(dishes).where(eq(dishes.id, id));
        expect(row.length).toBe(1);
        expect(row[0].name).toBe(str);

        const parsed = parseDish(row[0]);
        expect(parsed.aliases[0]).toBe(str);
        expect(parsed.ingredients[0].name).toBe(str);
      }
    });

    it('verifies numeric boundary handling and identifies falsy coercion bug in dishToInsert', async () => {
      // 1. Direct DB insertion: SQLite correctly accepts baseServings: 0
      const directDishId = `adv_direct_num_${RUN_PREFIX}`;
      TEST_CLEANUP_IDS.push(directDishId);

      await db.insert(dishes).values({
        id: directDishId,
        name: '直接挿入ゼロ人前料理',
        aliasesJson: '[]',
        category: 'main',
        sourceType: 'classic_book',
        recipeStatus: 'confirmed',
        baseServings: 0,
        ingredientsJson: '[]',
        stepsJson: '[]',
        cookCount: 2147483647,
        createdAt: new Date().toISOString(),
      });

      const directRows = await db.select().from(dishes).where(eq(dishes.id, directDishId));
      expect(directRows[0].baseServings).toBe(0);
      expect(directRows[0].cookCount).toBe(2147483647);

      // 2. DISCOVERY: dishToInsert uses `dish.baseServings || 3` which coerces 0 into 3!
      const parsedWithZero: ParsedDish = {
        id: `adv_helper_num_${RUN_PREFIX}`,
        name: 'ヘルパー経由ゼロ人前料理',
        aliases: [],
        category: 'main',
        proteinType: null,
        sourceType: 'classic_book',
        recipeStatus: 'confirmed',
        baseServings: 0,
        ingredients: [],
        steps: [],
        cookCount: 0,
        createdAt: new Date().toISOString(),
      };

      const converted = dishToInsert(parsedWithZero);
      // VERIFIED FIX: Falsy zero is preserved (0 instead of coerced 3)
      expect(converted.baseServings).toBe(0);
    });

    it('safely handles very large string fields (10,000+ characters)', async () => {
      const largeName = 'あ'.repeat(10000);
      const largeId = `adv_large_str_${RUN_PREFIX}`;
      TEST_CLEANUP_IDS.push(largeId);

      await db.insert(dishes).values({
        id: largeId,
        name: largeName,
        aliasesJson: '[]',
        category: 'side',
        sourceType: 'wishlist',
        recipeStatus: 'confirmed',
        baseServings: 3,
        ingredientsJson: '[]',
        stepsJson: '[]',
        createdAt: new Date().toISOString(),
      });

      const rows = await db.select().from(dishes).where(eq(dishes.id, largeId));
      expect(rows.length).toBe(1);
      expect(rows[0].name.length).toBe(10000);
    });
  });

  // ==========================================================================
  // Section 5: Large & Corrupted JSON Payload Resilience
  // ==========================================================================
  describe('5. Large & Corrupted JSON Payload Handling', () => {
    it('persists and deserializes massive JSON arrays (1,000 ingredients & steps)', async () => {
      const massiveIngredients = Array.from({ length: 1000 }, (_, i) => ({
        name: `材料_${i}`,
        amount: `${i + 1}g`,
        isStaple: i % 2 === 0,
      }));

      const massiveSteps = Array.from({ length: 1000 }, (_, i) => `工程 ${i + 1}: 調理を実施する。`);

      const largeDishId = `adv_massive_json_${RUN_PREFIX}`;
      TEST_CLEANUP_IDS.push(largeDishId);

      await db.insert(dishes).values({
        id: largeDishId,
        name: '超巨大JSON料理',
        aliasesJson: JSON.stringify(['巨大料理']),
        category: 'main',
        sourceType: 'classic_book',
        recipeStatus: 'confirmed',
        baseServings: 3,
        ingredientsJson: JSON.stringify(massiveIngredients),
        stepsJson: JSON.stringify(massiveSteps),
        createdAt: new Date().toISOString(),
      });

      const rows = await db.select().from(dishes).where(eq(dishes.id, largeDishId));
      expect(rows.length).toBe(1);

      const parsed = parseDish(rows[0]);
      expect(parsed.ingredients.length).toBe(1000);
      expect(parsed.steps.length).toBe(1000);
      expect(parsed.ingredients[999].name).toBe('材料_999');
    });

    it('empirically demonstrates parser fragility when encountering corrupted JSON in DB', async () => {
      const corruptDishId = `adv_corrupt_json_${RUN_PREFIX}`;
      TEST_CLEANUP_IDS.push(corruptDishId);

      // Inject intentionally malformed JSON into the table
      await client.execute({
        sql: `INSERT INTO dishes (id, name, aliases_json, category, source_type, recipe_status, base_servings, ingredients_json, steps_json, cook_count, created_at)
              VALUES (?, '破損JSON料理', 'INVALID_JSON{', 'main', 'classic_book', 'confirmed', 3, 'NOT_JSON[', '{bad_json', 0, ?)`,
        args: [corruptDishId, new Date().toISOString()],
      });

      const rows = await db.select().from(dishes).where(eq(dishes.id, corruptDishId));
      expect(rows.length).toBe(1);

      // VERIFIED FIX: parseDish safely falls back to defaults without throwing SyntaxError
      const parsed = parseDish(rows[0]);
      expect(parsed.aliases).toEqual([]);
      expect(parsed.ingredients).toEqual([]);
      expect(parsed.steps).toEqual([]);
    });

    it('verifies parseDailyMenu behavior on null and empty string JSON fields', async () => {
      const testDate = `2099-12-${Math.floor(Math.random() * 28 + 1).toString().padStart(2, '0')}`;
      TEST_CLEANUP_DATES.push(testDate);

      await client.execute({
        sql: `INSERT INTO daily_menus (date, servings, context_memo, slots_json, parallel_steps_json, shopping_state_json, updated_at)
              VALUES (?, 3, NULL, '[]', NULL, NULL, ?)`,
        args: [testDate, new Date().toISOString()],
      });

      const rows = await db.select().from(dailyMenus).where(eq(dailyMenus.date, testDate));
      expect(rows.length).toBe(1);

      const parsed = parseDailyMenu(rows[0]);
      expect(parsed.date).toBe(testDate);
      expect(parsed.slots).toEqual([]);
      expect(parsed.parallelSteps).toBeNull();
      expect(parsed.shoppingState).toBeNull();
    });
  });

  // ==========================================================================
  // Section 6: Transaction Atomicity & Rollback Verification
  // ==========================================================================
  describe('6. Transaction Atomicity & Integrity', () => {
    it('rolls back atomic batch transaction when an error occurs', async () => {
      const rollbackId1 = `adv_rollback_01_${RUN_PREFIX}`;
      const rollbackId2 = `adv_rollback_02_${RUN_PREFIX}`;
      TEST_CLEANUP_IDS.push(rollbackId1, rollbackId2);

      const txnPromise = client.batch(
        [
          {
            sql: `INSERT INTO dishes (id, name, aliases_json, category, source_type, recipe_status, base_servings, ingredients_json, steps_json, cook_count, created_at)
                  VALUES (?, 'ロールバック対象1', '[]', 'main', 'classic_book', 'confirmed', 3, '[]', '[]', 0, ?)`,
            args: [rollbackId1, new Date().toISOString()],
          },
          {
            sql: `INSERT INTO non_existent_table (foo) VALUES ('bar')`,
            args: [],
          },
        ],
        'write'
      );

      await expect(txnPromise).rejects.toThrow();

      const checkRow = await db.select().from(dishes).where(eq(dishes.id, rollbackId1));
      expect(checkRow.length).toBe(0);
    });
  });
});
