import { createClient } from '@libsql/client';

const workerId = process.argv[2] || '0';
const writeCount = parseInt(process.argv[3] || '20', 10);
const dbUrl = process.argv[4] || 'file:local.db';

async function run() {
  const client = createClient({ url: dbUrl });
  try {
    await client.execute('PRAGMA busy_timeout = 5000;');

    for (let i = 0; i < writeCount; i++) {
      const id = `proc_${workerId}_${Date.now()}_${i}`;
      await client.execute({
        sql: `INSERT INTO dishes (id, name, aliases_json, category, source_type, recipe_status, base_servings, ingredients_json, steps_json, cook_count, created_at)
              VALUES (?, ?, '[]', 'main', 'ai_generated', 'ai_provisional', 3, '[]', '[]', 0, ?)`,
        args: [id, `ワーカー_${workerId}_${i}`, new Date().toISOString()],
      });
    }
    console.log(JSON.stringify({ workerId, success: true, count: writeCount }));
  } catch (err) {
    console.error(JSON.stringify({ workerId, success: false, error: err.message, code: err.code }));
    process.exit(1);
  } finally {
    client.close();
  }
}

run();
