// Schema + built-in exercise library + settings. Ported from the Node server.
import { getDb } from './sqlite';

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
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_we_workout ON workout_exercises(workout_id);
CREATE INDEX IF NOT EXISTS idx_sets_we ON sets(workout_exercise_id);
CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(started_at);
`;

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
  const n = db.prepare('SELECT COUNT(*) AS n FROM exercises').get()!.n as number;
  if (n === 0) {
    const ins = db.prepare('INSERT INTO exercises (name, muscle, secondary, equipment) VALUES (?, ?, ?, ?)');
    for (const [name, muscle, secondary, equipment] of SEED) ins.run(name, muscle, secondary, equipment);
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
