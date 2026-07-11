// Schema + built-in exercise library + settings. Ported from the Node server.
import { getDb } from './sqlite';
import { FOOD_SEED } from './foods-seed';
import { AU_FOODS } from './foods-au';
// Open Food Facts AU layer (ODbL, attributed via source_ref 'OFF:<barcode>').
// Regenerate with: node scripts/pull-off-au.mjs — see docs/food-data-sources.md.
import OFF_AU_FOODS from './foods-off-au.generated.json';
import { ALCOHOL_FOODS } from './foods-alcohol';
import { normalizeFood, dedupeKey, type RawFood } from './foods-normalize';
import { localISO } from './dates';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  muscle TEXT NOT NULL,
  secondary TEXT DEFAULT '',
  equipment TEXT NOT NULL DEFAULT 'other',
  exercise_type TEXT NOT NULL DEFAULT 'strength',  -- 'strength' | 'dynamic' | 'static'
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
  duration_s INTEGER,          -- hold time / cardio time in seconds (stretches + cardio)
  distance_m REAL,             -- cardio distance in metres
  incline REAL,                -- cardio incline / grade (%)
  speed REAL,                  -- cardio speed (km/h or mph, per user units)
  avg_hr INTEGER,              -- cardio average heart rate (bpm)
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
  kj REAL,                                        -- energy per serving in kJ (AU standard; derivable from kcal)
  barcode TEXT,                                  -- EAN/UPC — enables offline re-scan
  is_custom INTEGER NOT NULL DEFAULT 0,
  favourite INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'seed',            -- seed | au | off | usda | afcd | barcode | custom
  source_ref TEXT,                                -- attribution / external id, e.g. 'AFCD', 'OFF:<code>'
  verified INTEGER NOT NULL DEFAULT 0,            -- 1 = official/manufacturer/API-confirmed
  confidence TEXT NOT NULL DEFAULT 'medium',      -- verified | high | medium | low (search ranks by this)
  dedupe_key TEXT,                                -- normalised name|brand|serving for duplicate detection
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT
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
// NOTE: indexes on foods(brand) and foods(dedupe_key) are created in migrate()
// AFTER the ALTER TABLE that adds those columns — never here in SCHEMA, because
// on an EXISTING database this string runs before the ALTERs and an index on a
// not-yet-added column would throw and abort startup.

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

// Exercise modalities. 'strength' logs weight×reps (the original model);
// 'dynamic' = dynamic/mobility stretch logged as reps; 'static' = static stretch
// held for time (logged as a duration in seconds). Stretches carry a null weight,
// so PRs, volume and e1RM stats — which filter `weight IS NOT NULL` — ignore them.
export const EXERCISE_TYPES = ['strength', 'dynamic', 'static', 'cardio'] as const;
export type ExerciseType = typeof EXERCISE_TYPES[number];
export const EXERCISE_TYPE_LABELS: Record<string, string> = {
  strength: 'Strength', dynamic: 'Dynamic stretch', static: 'Static stretch', cardio: 'Cardio',
};

// Curated warm-up (dynamic) and cool-down (static) stretch library. Muscles are
// mapped onto the existing MUSCLES taxonomy (e.g. hip flexors → quads,
// adductors → glutes) so filters, colours and stats need no new categories.
// Tuple: [name, muscle, secondary, equipment, type]
const STRETCH_SEED: [string, string, string, string, ExerciseType][] = [
  // ── Dynamic (warm-up) ──────────────────────────────────────────────
  ['Arm Circles', 'shoulders', '', 'bodyweight', 'dynamic'],
  ['Band Shoulder Dislocate', 'shoulders', 'chest', 'band', 'dynamic'],
  ['Leg Swings (Front-to-Back)', 'hamstrings', 'glutes', 'bodyweight', 'dynamic'],
  ['Leg Swings (Side-to-Side)', 'glutes', 'quads', 'bodyweight', 'dynamic'],
  ['Walking Knee Hug', 'glutes', 'hamstrings', 'bodyweight', 'dynamic'],
  ['Walking Quad Pull', 'quads', '', 'bodyweight', 'dynamic'],
  ['Hip Circles', 'glutes', 'core', 'bodyweight', 'dynamic'],
  ['Cat-Cow', 'back', 'core', 'bodyweight', 'dynamic'],
  ['Spiderman Lunge', 'glutes', 'quads,hamstrings', 'bodyweight', 'dynamic'],
  ["World's Greatest Stretch", 'hamstrings', 'glutes,back,shoulders', 'bodyweight', 'dynamic'],
  ['Inchworm', 'hamstrings', 'shoulders,core', 'bodyweight', 'dynamic'],
  ['Standing Torso Twist', 'core', 'back', 'bodyweight', 'dynamic'],
  ['Lunge with Twist', 'quads', 'glutes,core', 'bodyweight', 'dynamic'],
  ['High Knees', 'quads', 'calves,core', 'bodyweight', 'dynamic'],
  ['Butt Kicks', 'hamstrings', 'quads', 'bodyweight', 'dynamic'],
  ['Ankle Circles', 'calves', '', 'bodyweight', 'dynamic'],
  // ── Static (cool-down) ─────────────────────────────────────────────
  ['Standing Quad Stretch', 'quads', '', 'bodyweight', 'static'],
  ['Kneeling Hip Flexor Stretch', 'quads', 'glutes', 'bodyweight', 'static'],
  ['Seated Hamstring Stretch', 'hamstrings', 'calves', 'bodyweight', 'static'],
  ['Standing Forward Fold', 'hamstrings', 'back', 'bodyweight', 'static'],
  ['Standing Calf Stretch', 'calves', '', 'bodyweight', 'static'],
  ['Downward Dog', 'calves', 'hamstrings,shoulders', 'bodyweight', 'static'],
  ['Figure-Four Glute Stretch', 'glutes', '', 'bodyweight', 'static'],
  ['Pigeon Pose', 'glutes', 'quads', 'bodyweight', 'static'],
  ['Butterfly Stretch', 'glutes', 'quads', 'bodyweight', 'static'],
  ['Frog Stretch', 'glutes', 'quads', 'bodyweight', 'static'],
  ["Child's Pose", 'back', 'shoulders', 'bodyweight', 'static'],
  ['Seated Spinal Twist', 'back', 'glutes', 'bodyweight', 'static'],
  ['Overhead Lat Stretch', 'back', 'shoulders', 'bodyweight', 'static'],
  ['Cobra Stretch', 'core', 'back', 'bodyweight', 'static'],
  ['Doorway Chest Stretch', 'chest', 'shoulders', 'bodyweight', 'static'],
  ['Cross-Body Shoulder Stretch', 'shoulders', '', 'bodyweight', 'static'],
  ['Overhead Triceps Stretch', 'triceps', 'shoulders', 'bodyweight', 'static'],
  ['Biceps Wall Stretch', 'biceps', 'chest', 'bodyweight', 'static'],
  ['Wrist Flexor Stretch', 'forearms', '', 'bodyweight', 'static'],
  ['Neck Side Stretch', 'shoulders', '', 'bodyweight', 'static'],
];

// Built-in cardio / conditioning library. Cardio sets log time, distance, incline,
// speed and average HR (never weight×reps), so PRs, volume and e1RM — which filter
// `weight IS NOT NULL` — ignore them automatically. Muscles are mapped onto the
// existing MUSCLES taxonomy (the primary movers) so the muscle filter still works.
// Tuple: [name, muscle, secondary, equipment]
const CARDIO_SEED: [string, string, string, string][] = [
  ['Treadmill', 'quads', 'calves,hamstrings', 'machine'],
  ['Treadmill Incline Walk', 'glutes', 'quads,calves', 'machine'],
  ['Running (Outdoor)', 'quads', 'calves,hamstrings', 'bodyweight'],
  ['Walking', 'quads', 'calves', 'bodyweight'],
  ['Hiking', 'quads', 'glutes,calves', 'bodyweight'],
  ['Stationary Bike', 'quads', 'glutes,calves', 'machine'],
  ['Cycling (Outdoor)', 'quads', 'glutes,calves', 'other'],
  ['Assault Bike', 'quads', 'shoulders,back', 'machine'],
  ['Rowing Machine', 'back', 'quads,biceps,core', 'machine'],
  ['Elliptical', 'quads', 'glutes,calves', 'machine'],
  ['Stair Climber', 'glutes', 'quads,calves', 'machine'],
  ['Jump Rope', 'calves', 'quads,shoulders', 'bodyweight'],
  ['Swimming', 'back', 'shoulders,core', 'other'],
];

export function migrate(): void {
  const db = getDb();
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // additive migrations for databases created before these columns existed
  try { db.exec('ALTER TABLE garmin_activities ADD COLUMN distance_m INTEGER'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE foods ADD COLUMN barcode TEXT'); } catch { /* already there / table new */ }
  // Food-library expansion (July 2026): energy in kJ, source attribution + a
  // verification/confidence system, and a dedupe key. All additive — existing
  // rows keep working and default to medium confidence.
  for (const col of [
    'kj REAL',
    "source_ref TEXT",
    'verified INTEGER NOT NULL DEFAULT 0',
    "confidence TEXT NOT NULL DEFAULT 'medium'",
    'dedupe_key TEXT',
    'updated_at TEXT',
  ]) {
    try { db.exec(`ALTER TABLE foods ADD COLUMN ${col}`); } catch { /* already there / table new */ }
  }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_foods_brand ON foods(brand)'); } catch { /* noop */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_foods_dedupe ON foods(dedupe_key)'); } catch { /* noop */ }
  try { db.exec("ALTER TABLE exercises ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'strength'"); } catch { /* already there */ }
  try { db.exec('ALTER TABLE sets ADD COLUMN duration_s INTEGER'); } catch { /* already there */ }
  // Cardio (July 2026): additive set columns for treadmill/bike/row/etc.
  for (const col of ['distance_m REAL', 'incline REAL', 'speed REAL', 'avg_hr INTEGER']) {
    try { db.exec(`ALTER TABLE sets ADD COLUMN ${col}`); } catch { /* already there */ }
  }
  const n = db.prepare('SELECT COUNT(*) AS n FROM exercises').get()!.n as number;
  if (n === 0) {
    const ins = db.prepare('INSERT INTO exercises (name, muscle, secondary, equipment) VALUES (?, ?, ?, ?)');
    for (const [name, muscle, secondary, equipment] of SEED) ins.run(name, muscle, secondary, equipment);
  }
  seedStretches();
  seedCardio();
  backfillFoods();
  seedFoods();
}

// Seed the built-in cardio library once. Idempotent: only inserts when no cardio
// exercises exist yet, so existing databases pick these up on their next
// migrate() and custom exercises are never touched. INSERT OR IGNORE skips any
// name that collides with a user's custom exercise.
export function seedCardio(): void {
  const db = getDb();
  const have = db.prepare("SELECT COUNT(*) AS n FROM exercises WHERE exercise_type = 'cardio'").get()!.n as number;
  if (have > 0) return;
  const ins = db.prepare('INSERT OR IGNORE INTO exercises (name, muscle, secondary, equipment, exercise_type) VALUES (?, ?, ?, ?, ?)');
  for (const [name, muscle, secondary, equipment] of CARDIO_SEED) ins.run(name, muscle, secondary, equipment, 'cardio');
}

// Seed the built-in stretch library once. Idempotent: only inserts when no
// stretches exist yet, so existing databases (which already have the 90 strength
// seeds) still pick up stretches on their next migrate(), and custom exercises
// are never touched. Uses INSERT OR IGNORE so a name that collides with a
// user's custom exercise is skipped rather than throwing.
export function seedStretches(): void {
  const db = getDb();
  const have = db.prepare("SELECT COUNT(*) AS n FROM exercises WHERE exercise_type IN ('dynamic','static')").get()!.n as number;
  if (have > 0) return;
  const ins = db.prepare('INSERT OR IGNORE INTO exercises (name, muscle, secondary, equipment, exercise_type) VALUES (?, ?, ?, ?, ?)');
  for (const [name, muscle, secondary, equipment, type] of STRETCH_SEED) ins.run(name, muscle, secondary, equipment, type);
}

// Insert one normalised food. Skips when an active food already shares its
// dedupe_key, so re-running migrate (or seeding the AU set onto an existing
// library) never creates duplicates. When the duplicate lacks a barcode and
// the incoming row has one, the barcode is attached to the existing row —
// that's how curated foods become scannable. Returns 1 if inserted, 0 if not.
function insertFood(db: any, raw: RawFood, now: string): 0 | 1 {
  const f = normalizeFood(raw);
  const dup = db.prepare('SELECT id, barcode FROM foods WHERE dedupe_key = ? AND archived = 0 LIMIT 1').get(f.dedupe_key) as { id: number; barcode: string | null } | undefined;
  if (dup) {
    if (f.barcode && !dup.barcode) db.prepare('UPDATE foods SET barcode = ?, updated_at = ? WHERE id = ?').run(f.barcode, now, dup.id);
    return 0;
  }
  db.prepare(`INSERT INTO foods
    (name, brand, serving_desc, serving_grams, kcal, kj, protein, carbs, fat, fibre, sugar, sodium,
     barcode, source, source_ref, verified, confidence, dedupe_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    f.name, f.brand, f.serving_desc, f.serving_grams, f.kcal, f.kj, f.protein, f.carbs, f.fat,
    f.fibre, f.sugar, f.sodium, f.barcode, f.source, f.source_ref, f.verified, f.confidence, f.dedupe_key, now, now);
  return 1;
}

// Seed the built-in food library. Idempotent PER SOURCE: the British generic
// seed and the Australian library seed independently, each guarded by a count,
// so (a) a user's custom foods and diary are never touched, and (b) existing
// users who already have the British seed still receive the new AU library on
// their next migrate(). Duplicates are prevented by dedupe_key in insertFood().
export function seedFoods(): void {
  const db = getDb();
  const now = localISO();
  const haveSeed = db.prepare("SELECT COUNT(*) AS n FROM foods WHERE source = 'seed'").get()!.n as number;
  if (haveSeed === 0) {
    for (const f of FOOD_SEED) insertFood(db, { ...(f as any), source: 'seed', confidence: 'high' }, now);
  }
  const haveAu = db.prepare("SELECT COUNT(*) AS n FROM foods WHERE source = 'au'").get()!.n as number;
  if (haveAu === 0) {
    for (const f of AU_FOODS) insertFood(db, f, now);
  }
  const haveAlc = db.prepare("SELECT COUNT(*) AS n FROM foods WHERE source = 'alc'").get()!.n as number;
  if (haveAlc === 0) {
    for (const f of ALCOHOL_FOODS) insertFood(db, f, now);
  }
  // OFF AU layer: seeded by VERSION rather than count so a regenerated pull
  // (more products) reaches existing users on their next migrate(). insertFood
  // dedupes and attaches barcodes to existing curated rows, so re-seeding is
  // safe and makes previously bundled foods scannable.
  const offVersion = String((OFF_AU_FOODS as any[]).length);
  if (offVersion !== '0' && getSetting('off_au_seed_version', '') !== offVersion) {
    for (const f of OFF_AU_FOODS as RawFood[]) insertFood(db, { ...f, source: 'off' }, now);
    setSetting('off_au_seed_version', offVersion);
  }
}

// Backfill rows created before the kj/confidence/dedupe_key columns existed so
// old libraries rank and de-duplicate like fresh ones. Runs before seedFoods so
// dedupe_key is populated when the AU set checks for duplicates.
export function backfillFoods(): void {
  const db = getDb();
  db.prepare('UPDATE foods SET kj = ROUND(kcal * 4.184) WHERE kj IS NULL AND kcal IS NOT NULL').run();
  const rows = db.prepare("SELECT id, name, brand, serving_desc FROM foods WHERE dedupe_key IS NULL OR dedupe_key = ''").all() as any[];
  const upd = db.prepare('UPDATE foods SET dedupe_key = ? WHERE id = ?');
  for (const r of rows) upd.run(dedupeKey(r.name, r.brand || '', r.serving_desc || ''), r.id);
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
