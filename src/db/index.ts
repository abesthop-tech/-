// ============================================================================
// Kazoku-Kondate Database Client & Connection: src/db/index.ts
// Framework: LibSQL Client + Drizzle ORM
// Features: Hot-reload singleton, lazy initialization, auto-migration DDL fallback
// ============================================================================
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { seedDatabase } from './seed';

// ----------------------------------------------------------------------------
// 1. Connection Singleton (Next.js Hot Reload Safe)
// ----------------------------------------------------------------------------

const globalForDb = globalThis as unknown as {
  libsqlClient: Client | undefined;
  drizzleDb: LibSQLDatabase<typeof schema> | undefined;
  dbInitPromise: Promise<void> | undefined;
};

const databaseUrl = process.env.DATABASE_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

export const client: Client =
  globalForDb.libsqlClient ??
  createClient({
    url: databaseUrl,
    authToken: authToken,
  });

export const db: LibSQLDatabase<typeof schema> =
  globalForDb.drizzleDb ??
  drizzle(client, { schema });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.libsqlClient = client;
  globalForDb.drizzleDb = db;
}

// ----------------------------------------------------------------------------
// 2. Automatic Schema Creation & Seed Fallback
// ----------------------------------------------------------------------------

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS dishes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    aliases_json TEXT NOT NULL,
    category TEXT NOT NULL,
    protein_type TEXT,
    source_type TEXT NOT NULL,
    source_label TEXT,
    source_url TEXT,
    recipe_status TEXT NOT NULL,
    base_servings INTEGER NOT NULL DEFAULT 3,
    ingredients_json TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    cook_count INTEGER NOT NULL DEFAULT 0,
    last_cooked_date TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS daily_menus (
    date TEXT PRIMARY KEY,
    servings INTEGER NOT NULL DEFAULT 3,
    context_memo TEXT,
    slots_json TEXT NOT NULL,
    parallel_steps_json TEXT,
    shopping_state_json TEXT,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_dishes_category ON dishes(category);`,
  `CREATE INDEX IF NOT EXISTS idx_dishes_protein ON dishes(protein_type);`,
  `CREATE INDEX IF NOT EXISTS idx_dishes_cook_count ON dishes(cook_count);`,
  `CREATE INDEX IF NOT EXISTS idx_daily_menus_date ON daily_menus(date);`,
];

/**
 * Initializes database tables and applies default seed data if database is empty.
 * Idempotent and concurrency-safe across multiple concurrent API route requests.
 */
export async function ensureDatabaseInitialized(): Promise<void> {
  if (globalForDb.dbInitPromise) {
    return globalForDb.dbInitPromise;
  }

  globalForDb.dbInitPromise = (async () => {
    // Set busy timeout and WAL mode for concurrent access robustness
    try {
      await client.execute('PRAGMA busy_timeout = 5000;');
      await client.execute('PRAGMA journal_mode = WAL;');
    } catch {
      // Ignored if memory or unsupported
    }

    // 1. Create tables and indices
    for (const statement of DDL_STATEMENTS) {
      await client.execute(statement);
    }

    // 2. Check if dishes or daily_menus table needs initial seeding
    const result = await client.execute('SELECT COUNT(*) as count FROM dishes;');
    const menuResult = await client.execute('SELECT COUNT(*) as count FROM daily_menus;');
    const count = Number(result.rows[0]?.count ?? 0);
    const menuCount = Number(menuResult.rows[0]?.count ?? 0);

    // 3. Auto-seed if brand new or incomplete database
    if (count === 0 || menuCount < 14) {
      await seedDatabase(db);
    }
  })();

  return globalForDb.dbInitPromise;
}

export default db;
