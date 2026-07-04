// Schema + built-in exercise library + settings. Ported from the Node server.
import { getDb } from './sqlite';
import { FOOD_SEED } from './foods-seed';
import { localISO } from './dates';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  muscle TEXT NOT NULL,
  secondary TEXT DEFAULT '',
  equipment TEXT NOT NULL DEFAULT 'other',
  is_custom INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  day_of_week INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS template_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL DEFAULT 0,
  superset_group INTEGER,
  target_sets INTEGER NOT NULL DEFAULT 3,
  target_reps TEXT NOT NULL DEFAULT '8',
  target_weight REAL,
  rest_seconds INTEGER NOT NULL DEFAULT 120,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Workout',
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  notes TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual'
);
CREATE TABLE IF NOT EXISTS workout_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL DEFAULT 0,
  superset_group INTEGER,
  rest_seconds INTEGER NOT NULL DEFAULT 120,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  set_type TEXT NOT NULL DEFAULT 'working',
  weight REAL,
  reps INTEGER,
  rpe REAL,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS body_weight (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  weight REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS garmin_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL UNIQUE,
  activity_type TEXT NOT NULL,
  name TEXT DEFAULT '',
  started_at TEXT NOT NULL,
  duration_s INTEGER,
  distance_m INTEGER,
  calories INTEGER,
  avg_hr INTEGER,
  max_hr INTEGER,
  training_load REAL,
  source TEXT NOT NULL DEFAULT 'file'
);
CREATE TABLE IF NOT EXISTS garmin_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  steps INTEGER,
  resting_hr INTEGER,
  sleep_seconds INTEGER,
  sleep_score INTEGER,
  body_battery INTEGER,
  stress INTEGER,
  source TEXT NOT NULL DEFAULT 'file'
);
CREATE TABLE IF NOT EXISTS progress_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- YYYY-MM-DD
  note TEXT DEFAULT '',
  blob_key TEXT NOT NULL UNIQUE,   -- key into the photo blob store
  width INTEGER,
  height INTEGER,
  size INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- ── Nutrition module (additive; extends the training engine) ─────────────────
-- A food stores nutrition PER ONE SERVING. Diary entries and recipe items keep
-- a snapshot of that nutrition, so editing/deleting a food never rewrites logged
-- history — the same "logged data is a snapshot" rule the workout tables follow.
CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  serving_desc TEXT NOT NULL DEFAULT 'serving',  -- e.g. "100 g", "1 medium (118 g)"
  serving_grams REAL,                            -- grams in one serving (nullable)
  kcal REAL NOT NULL DEFAULT 0,                  -- per one serving
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  fibre REAL, sugar REAL, sodium REAL,           -- fibre/sugar in g, sodium in mg
  barcode TEXT,                                  -- EAN/UPC — enables offline re-scan
  is_custom INTEGER NOT NULL DEFAULT 0,
  favourite INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'seed',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS meals (               -- saved meals + recipes
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  servings REAL NOT NULL DEFAULT 1,              -- recipe yield (total makes N servings)
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS meal_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 1,              -- servings of the food
  name TEXT NOT NULL DEFAULT '',                 -- snapshot (per one serving of the food)
  kcal REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0, fat REAL NOT NULL DEFAULT 0,
  fibre REAL, sugar REAL, sodium REAL
);
CREATE TABLE IF NOT EXISTS nutrition_entries (   -- the food diary
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                            -- YYYY-MM-DD (local)
  meal_type TEXT NOT NULL DEFAULT 'breakfast',   -- breakfast|lunch|dinner|snacks
  position INTEGER NOT NULL DEFAULT 0,
  food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,
  quantity REAL NOT NULL DEFAULT 1,              -- number of servings logged
  name TEXT NOT NULL DEFAULT 'Food',             -- snapshot per one serving ↓
  brand TEXT NOT NULL DEFAULT '',
  serving_desc TEXT NOT NULL DEFAULT '',
  kcal REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0, fat REAL NOT NULL DEFAULT 0,
  fibre REAL, sugar REAL, sodium REAL,
  logged_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nutrition_goals (     -- single active row (id = 1)
  id INTEGER PRIMARY KEY CHECK (id = 1),
  goal_type TEXT NOT NULL DEFAULT 'maintain',    -- lose|maintain|gain|performance
  sex TEXT, age INTEGER, height_cm REAL, activity TEXT,  -- BMR/TDEE inputs
  target_weight REAL,
  calories REAL, protein REAL, carbs REAL, fat REAL,     -- effective targets
  auto INTEGER NOT NULL DEFAULT 1,               -- 1 = keep macros synced to calculator
  add_burned INTEGER NOT NULL DEFAULT 0,         -- eat-back toggle
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS water_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  ml REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_we_workout ON workout_exercises(workout_id);
CREATE INDEX IF NOT EXISTS idx_sets_we ON sets(workout_exercise_id);
CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(started_at);
CREATE INDEX IF NOT EXISTS idx_nutrition_date ON nutrition_entries(date);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items(meal_id);
CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode);
`;

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export const ACTIVITY_LEVELS: [string, string, number][] = [
  // key, label, TDEE multiplier
  ['sedentary', 'Sedentary — desk job, little exercise', 1.2],
  ['light', 'Light — 1–3 workouts/week', 1.375],
  ['moderate', 'Moderate — 3–5 workouts/week', 1.55],
  ['very', 'Very active — 6–7 workouts/week', 1.725],
  ['athlete', 'Athlete — hard training / physical job', 1.9],
];

const SEED: [string, string, string, string][] = [
  ['Barbell Bench Press', 'chest', 'triceps,shoulders', 'barbell'],
  ['Incline Barbell Bench Press', 'chest', 'shoulders,triceps', 'barbell'],
  ['Dumbbell Bench Press', 'chest', 'triceps,shoulders', 'dumbbell'],
  ['Incline Dumbbell Press', 'chest', 'shoulders,triceps', 'dumbbell'],
  ['Dumbbell Fly', 'chest', '', 'dumbbell'],
  ['Cable Fly', 'chest', '', 'cable'],
  ['Machine Chest Press', 'chest', 'triceps', 'machine'],
  ['Pec Deck', 'chest', '', 'machine'],
  ['Push-Up', 'chest', 'triceps,shoulders,core', 'bodyweight'],
  ['Dip', 'chest', 'triceps,shoulders', 'bodyweight'],
  ['Deadlift', 'back', 'hamstrings,glutes,forearms', 'barbell'],
  ['Romanian Deadlift', 'hamstrings', 'glutes,back', 'barbell'],
  ['Barbell Row', 'back', 'biceps,forearms', 'barbell'],
  ['Pendlay Row', 'back', 'biceps', 'barbell'],
  ['Dumbbell Row', 'back', 'biceps,forearms', 'dumbbell'],
  ['Seated Cable Row', 'back', 'biceps', 'cable'],
  ['Lat Pulldown', 'back', 'biceps', 'cable'],
  ['Pull-Up', 'back', 'biceps,forearms', 'bodyweight'],
  ['Chin-Up', 'back', 'biceps', 'bodyweight'],
  ['T-Bar Row', 'back', 'biceps', 'barbell'],
  ['Machine Row', 'back', 'biceps', 'machine'],
  ['Straight-Arm Pulldown', 'back', '', 'cable'],
  ['Rack Pull', 'back', 'glutes,forearms', 'barbell'],
  ['Overhead Press', 'shoulders', 'triceps,core', 'barbell'],
  ['Seated Dumbbell Shoulder Press', 'shoulders', 'triceps', 'dumbbell'],
  ['Arnold Press', 'shoulders', 'triceps', 'dumbbell'],
  ['Machine Shoulder Press', 'shoulders', 'triceps', 'machine'],
  ['Lateral Raise', 'shoulders', '', 'dumbbell'],
  ['Cable Lateral Raise', 'shoulders', '', 'cable'],
  ['Front Raise', 'shoulders', '', 'dumbbell'],
  ['Rear Delt Fly', 'shoulders', 'back', 'dumbbell'],
  ['Face Pull', 'shoulders', 'back', 'cable'],
  ['Upright Row', 'shoulders', 'biceps', 'barbell'],
  ['Barbell Shrug', 'back', 'forearms', 'barbell'],
  ['Barbell Curl', 'biceps', 'forearms', 'barbell'],
  ['EZ-Bar Curl', 'biceps', 'forearms', 'barbell'],
  ['Dumbbell Curl', 'biceps', 'forearms', 'dumbbell'],
  ['Hammer Curl', 'biceps', 'forearms', 'dumbbell'],
  ['Incline Dumbbell Curl', 'biceps', '', 'dumbbell'],
  ['Preacher Curl', 'biceps', '', 'barbell'],
  ['Cable Curl', 'biceps', '', 'cable'],
  ['Concentration Curl', 'biceps', '', 'dumbbell'],
  ['Close-Grip Bench Press', 'triceps', 'chest,shoulders', 'barbell'],
  ['Skull Crusher', 'triceps', '', 'barbell'],
  ['Triceps Pushdown', 'triceps', '', 'cable'],
  ['Overhead Triceps Extension', 'triceps', '', 'dumbbell'],
  ['Cable Overhead Extension', 'triceps', '', 'cable'],
  ['Triceps Kickback', 'triceps', '', 'dumbbell'],
  ['Bench Dip', 'triceps', 'chest', 'bodyweight'],
  ['Wrist Curl', 'forearms', '', 'dumbbell'],
  ['Reverse Curl', 'forearms', 'biceps', 'barbell'],
  ["Farmer's Carry", 'forearms', 'core,back', 'dumbbell'],
  ['Back Squat', 'quads', 'glutes,hamstrings,core', 'barbell'],
  ['Front Squat', 'quads', 'glutes,core', 'barbell'],
  ['Goblet Squat', 'quads', 'glutes', 'dumbbell'],
  ['Leg Press', 'quads', 'glutes', 'machine'],
  ['Hack Squat', 'quads', 'glutes', 'machine'],
  ['Bulgarian Split Squat', 'quads', 'glutes,hamstrings', 'dumbbell'],
  ['Walking Lunge', 'quads', 'glutes,hamstrings', 'dumbbell'],
  ['Leg Extension', 'quads', '', 'machine'],
  ['Step-Up', 'quads', 'glutes', 'dumbbell'],
  ['Leg Curl', 'hamstrings', '', 'machine'],
  ['Seated Leg Curl', 'hamstrings', '', 'machine'],
  ['Stiff-Leg Deadlift', 'hamstrings', 'glutes,back', 'barbell'],
  ['Good Morning', 'hamstrings', 'glutes,back', 'barbell'],
  ['Nordic Curl', 'hamstrings', '', 'bodyweight'],
  ['Hip Thrust', 'glutes', 'hamstrings', 'barbell'],
  ['Glute Bridge', 'glutes', 'hamstrings', 'bodyweight'],
  ['Cable Kickback', 'glutes', '', 'cable'],
  ['Hip Abduction', 'glutes', '', 'machine'],
  ['Sumo Deadlift', 'glutes', 'quads,hamstrings,back', 'barbell'],
  ['Standing Calf Raise', 'calves', '', 'machine'],
  ['Seated Calf Raise', 'calves', '', 'machine'],
  ['Single-Leg Calf Raise', 'calves', '', 'bodyweight'],
  ['Plank', 'core', 'shoulders', 'bodyweight'],
  ['Hanging Leg Raise', 'core', 'forearms', 'bodyweight'],
  ['Cable Crunch', 'core', '', 'cable'],
  ['Ab Wheel Rollout', 'core', 'shoulders', 'other'],
  ['Russian Twist', 'core', '', 'other'],
  ['Sit-Up', 'core', '', 'bodyweight'],
  ['Side Plank', 'core', '', 'bodyweight'],
  ['Dead Bug', 'core', '', 'bodyweight'],
  ['Kettlebell Swing', 'glutes', 'hamstrings,back,core', 'kettlebell'],
  ['Kettlebell Goblet Squat', 'quads', 'glutes,core', 'kettlebell'],
  ['Turkish Get-Up', 'core', 'shoulders,glutes', 'kettlebell'],
  ['Clean and Press', 'shoulders', 'quads,glutes,back', 'barbell'],
  ['Power Clean', 'back', 'quads,glutes', 'barbell'],
  ['Push Press', 'shoulders', 'triceps,quads', 'barbell'],
  ['Band Pull-Apart', 'shoulders', 'back', 'band'],
  ['Band Curl', 'biceps', '', 'band'],
];

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'];

export function migrate(): void {
  const db = getDb();
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // additive migrations for databases created before these columns existed
  try { db.exec('ALTER TABLE garmin_activities ADD COLUMN distance_m INTEGER'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE foods ADD COLUMN barcode TEXT'); } catch { /* already there / table new */ }
  const n = db.prepare('SELECT COUNT(*) AS n FROM exercises').get()!.n as number;
  if (n === 0) {
    const ins = db.prepare('INSERT INTO exercises (name, muscle, secondary, equipment) VALUES (?, ?, ?, ?)');
    for (const [name, muscle, secondary, equipment] of SEED) ins.run(name, muscle, secondary, equipment);
  }
  seedFoods();
}

// Seed the built-in food library once. Idempotent: only runs when no seed foods
// exist, so a user's custom foods and diary are never touched. Runs on every
// migrate() (incl. after importing an older backup) so libraries stay populated.
export function seedFoods(): void {
  const db = getDb();
  const have = db.prepare("SELECT COUNT(*) AS n FROM foods WHERE source = 'seed'").get()!.n as number;
  if (have > 0) return;
  const now = localISO();
  const ins = db.prepare(`INSERT INTO foods
    (name, brand, serving_desc, serving_grams, kcal, protein, carbs, fat, fibre, sugar, sodium, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?)`);
  for (const f of FOOD_SEED) {
    ins.run(f.name, f.brand ?? '', f.serving, f.grams ?? null, f.kcal, f.protein, f.carbs, f.fat,
      f.fibre ?? null, f.sugar ?? null, f.sodium ?? null, now);
  }
}

export function getSetting(key: string, fallback: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? String(row.value) : fallback;
}
export function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}
export function allSettings(): Record<string, string> {
  const out: Record<string, string> = { units: 'kg', default_rest: '120', weekly_goal: '3' };
  for (const row of getDb().prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}
