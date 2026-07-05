// Migration regression suite — boots from an OLD (pre-food-expansion) database
// and proves migrate() upgrades it in place without throwing. This is the path
// that the fresh-DB suites never exercise: on a real device the foods table
// already exists WITHOUT the new columns, so any SCHEMA statement that referenced
// a not-yet-added column (e.g. an index on dedupe_key) would abort startup.
// Regression for: "no such column: dedupe_key" on existing installs.
import initSqlJs from 'sql.js';
import { MemoryStorage } from '../app/src/db/sqlite';
import { initData, api } from '../app/src/api';

let passed = 0, failed = 0;
function ok(cond: any, name: string, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

(async () => {
  console.log('Migration — upgrade an existing pre-expansion database');

  // 1. Build a database shaped like an old install: foods table WITHOUT kj,
  //    source_ref, verified, confidence, dedupe_key, updated_at. Add a seed food,
  //    a custom food, and a diary entry that references it.
  const SQL = await initSqlJs();
  const old = new SQL.Database();
  old.run(`
    CREATE TABLE foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '',
      serving_desc TEXT NOT NULL DEFAULT 'serving', serving_grams REAL, kcal REAL NOT NULL DEFAULT 0,
      protein REAL NOT NULL DEFAULT 0, carbs REAL NOT NULL DEFAULT 0, fat REAL NOT NULL DEFAULT 0,
      fibre REAL, sugar REAL, sodium REAL, barcode TEXT, is_custom INTEGER NOT NULL DEFAULT 0,
      favourite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'seed', created_at TEXT NOT NULL DEFAULT '');
    CREATE INDEX idx_foods_name ON foods(name);
    INSERT INTO foods (name, brand, serving_desc, serving_grams, kcal, protein, source)
      VALUES ('Old Chicken Breast','','100 g',100,165,31,'seed');
    INSERT INTO foods (name, serving_desc, kcal, protein, is_custom, source)
      VALUES ('My Old Shake','1 scoop',200,40,1,'custom');
    CREATE TABLE nutrition_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, meal_type TEXT NOT NULL DEFAULT 'breakfast',
      position INTEGER NOT NULL DEFAULT 0, food_id INTEGER, quantity REAL NOT NULL DEFAULT 1,
      name TEXT NOT NULL DEFAULT 'Food', brand TEXT NOT NULL DEFAULT '', serving_desc TEXT NOT NULL DEFAULT '',
      kcal REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0, carbs REAL NOT NULL DEFAULT 0,
      fat REAL NOT NULL DEFAULT 0, fibre REAL, sugar REAL, sodium REAL, logged_at TEXT NOT NULL);
    INSERT INTO nutrition_entries (date, meal_type, food_id, quantity, name, serving_desc, kcal, protein, logged_at)
      VALUES ('2026-01-01','lunch',2,2,'My Old Shake','1 scoop',200,40,'2026-01-01T12:00:00');
  `);
  const bytes = old.export();
  old.close();

  // 2. Boot the app on top of that old database.
  const storage = new MemoryStorage();
  storage.bytes = bytes;
  let started = true;
  try { await initData({ storage }); }
  catch (e: any) { started = false; console.log(`  ✗ initData threw: ${e?.message}`); }
  ok(started, 'app starts on an existing pre-expansion database (no "no such column" crash)');

  // 3. New columns exist and old rows are backfilled.
  const { getDb } = await import('../app/src/db/sqlite');
  const cols = (getDb().prepare('PRAGMA table_info(foods)').all() as any[]).map((c) => c.name);
  for (const c of ['kj', 'source_ref', 'verified', 'confidence', 'dedupe_key', 'updated_at']) {
    ok(cols.includes(c), `foods.${c} column added by migration`);
  }
  const oldFood = getDb().prepare("SELECT * FROM foods WHERE name = 'Old Chicken Breast'").get() as any;
  ok(oldFood && oldFood.kj === Math.round(165 * 4.184), `existing food backfilled with kJ (${oldFood?.kj})`);
  ok(oldFood && oldFood.dedupe_key && oldFood.dedupe_key.length > 0, 'existing food backfilled with a dedupe_key');

  // 4. Existing user data survives untouched.
  const shake = getDb().prepare("SELECT * FROM foods WHERE name = 'My Old Shake'").get() as any;
  ok(shake && shake.is_custom === 1, 'existing custom food preserved');
  const entries = getDb().prepare('SELECT COUNT(*) AS n FROM nutrition_entries').get() as any;
  ok(entries.n === 1, 'existing diary entry preserved');

  // 5. The new AU library seeds onto the existing install.
  const au = getDb().prepare("SELECT COUNT(*) AS n FROM foods WHERE source = 'au'").get() as any;
  ok(au.n > 100, `AU library seeded onto existing install (${au.n} foods)`);
  const weetbix = await api.nutrition.foods.search('Weet-Bix', 5);
  ok(weetbix.some((f) => /weet-?bix/i.test(f.name)), 'search works after upgrade (Weet-Bix found)');

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
