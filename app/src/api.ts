// Ironlog data API — runs entirely on-device (SQLite WASM + IndexedDB).
// Same surface as the old HTTP client, so screens are unchanged.
import { initDb, getDb, withTx, exportBytes, importBytes, flush, type Storage } from './db/sqlite';
import { IdbPhotoStore, MemoryPhotoStore, newPhotoKey, type PhotoStore } from './db/photos';
import { migrate, getSetting, setSetting, allSettings, MUSCLES, EQUIPMENT, MEAL_TYPES, EXERCISE_TYPES } from './db/schema';
import * as stats from './db/stats';
import * as nutri from './db/nutrition';
import * as reportsMod from './db/reports';
import { suggestions as suggestionsFn } from './db/suggestions';
import * as garminMod from './db/garmin';
import { fetchSyncSnapshot, REPO_RE, type SyncOutcome } from './lib/remoteSync';
import { pushBackup, pullBackup, REPO_RE as BACKUP_REPO_RE } from './lib/cloudBackup';
import { matchStrongExercise, type StrongWorkout } from './lib/strongParse';
import { fetchOpenFoodFacts, normalizeBarcode, type FoodDraft } from './lib/openfoodfacts';
import { kjFromKcal, dedupeKey } from './db/foods-normalize';
import { rankFoods, prefilterSql } from './db/foods-search';
import { seed as seedDemo } from './db/seed-demo';
import { localISO, localDate } from './db/dates';

// ---------- types (unchanged) ----------
export type Exercise = {
  id: number; name: string; muscle: string; secondary: string;
  equipment: string; exercise_type: string; is_custom: number; archived: number;
};
export type SetRow = {
  id: number; workout_exercise_id: number; position: number;
  set_type: 'warmup' | 'working' | 'dropset' | 'failure';
  weight: number | null; reps: number | null; duration_s: number | null; rpe: number | null;
  completed: number; completed_at: string | null;
};
export type WorkoutExercise = {
  id: number; workout_id: number; exercise_id: number; position: number;
  superset_group: number | null; rest_seconds: number; notes: string;
  exercise_name: string; muscle: string; equipment: string; exercise_type: string;
  sets: SetRow[]; previous: { set_type: string; weight: number; reps: number; duration_s: number | null; rpe: number | null }[];
};
export type Workout = {
  id: number; name: string; template_id: number | null;
  started_at: string; ended_at: string | null; notes: string; source: string;
  exercises: WorkoutExercise[]; new_prs?: PREvent[]; discarded?: boolean;
};
export type WorkoutSummary = {
  id: number; name: string; started_at: string; ended_at: string; notes: string;
  template_id: number | null; sets: number; volume: number; prs: number; exercise_names: string[];
};
export type TemplateExercise = {
  id: number; template_id: number; exercise_id: number; position: number;
  superset_group: number | null; target_sets: number; target_reps: string;
  target_weight: number | null; rest_seconds: number; notes: string;
  exercise_name: string; muscle: string; equipment: string; exercise_type: string;
};
export type Template = {
  id: number; name: string; day_of_week: number | null; position: number;
  notes: string; archived: number; exercises: TemplateExercise[];
};
export type PREvent = {
  exercise_id: number; exercise_name: string; kind: 'weight' | 'e1rm';
  value: number; weight: number; reps: number; day: string; workout_id: number;
};
export type PRRow = {
  exercise_id: number; exercise_name: string;
  max_weight: number | null; max_weight_day: string | null; max_weight_reps: number | null;
  best_e1rm: number | null; best_e1rm_day: string | null; max_reps: number | null;
};
export type Overview = {
  streak_weeks: number; workouts_this_week: number; volume_this_week: number;
  sets_this_week: number; prs_this_month: number; total_workouts: number;
};
export type Settings = { units: 'kg' | 'lb'; default_rest: string; weekly_goal: string };
export type GarminActivity = {
  id: number; activity_type: string; name: string; started_at: string;
  duration_s: number | null; distance_m: number | null; calories: number | null; avg_hr: number | null;
  max_hr: number | null; training_load: number | null; source: string;
};
export type ProgressPhoto = {
  id: number; date: string; note: string; blob_key: string;
  width: number | null; height: number | null; size: number | null; created_at: string;
};
export type GarminDaily = {
  id: number; date: string; steps: number | null; resting_hr: number | null;
  sleep_seconds: number | null; sleep_score: number | null;
  body_battery: number | null; stress: number | null; source: string;
};
export type Report = ReturnType<typeof reportsMod.weeklyReport>;
export type Suggestions = {
  improving: { exercise_id: number; name: string; sessions: number; change: number }[];
  stalled: { exercise_id: number; name: string; sessions: number; e1rm: number; hint: string }[];
  neglected: { muscle: string; volume: number; hint: string }[];
  fatigue: { kind: string; value: number; hint: string }[];
  deload: { regressing_lifts: number; hint: string } | null;
  next_weights: { exercise_id: number; name: string; last: number; suggested: number; reason: string }[];
};
// ---------- nutrition types ----------
export type Food = {
  id: number; name: string; brand: string; serving_desc: string; serving_grams: number | null;
  kcal: number; kj: number | null; protein: number; carbs: number; fat: number;
  fibre: number | null; sugar: number | null; sodium: number | null; barcode: string | null;
  is_custom: number; favourite: number; archived: number;
  source: string; source_ref: string | null;
  verified: number; confidence: 'verified' | 'high' | 'medium' | 'low';
  dedupe_key: string | null; created_at: string; updated_at: string | null;
};
export type BarcodeLookup =
  | { source: 'local'; food: Food }
  | { source: 'off'; draft: FoodDraft }
  | { source: 'notfound' | 'offline' | 'error'; message?: string };
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export type DiaryEntry = {
  id: number; date: string; meal_type: MealType; position: number; food_id: number | null; quantity: number;
  name: string; brand: string; serving_desc: string;
  kcal: number; protein: number; carbs: number; fat: number;
  fibre: number | null; sugar: number | null; sodium: number | null; logged_at: string;
};
export type MealItem = {
  id: number; meal_id: number; food_id: number | null; position: number; quantity: number;
  name: string; kcal: number; protein: number; carbs: number; fat: number;
  fibre: number | null; sugar: number | null; sodium: number | null;
};
export type Meal = {
  id: number; name: string; note: string; servings: number; created_at: string;
  items: MealItem[]; per_serving: nutri.Macros; total: nutri.Macros;
};
export type NutritionGoal = {
  goal_type: 'lose' | 'maintain' | 'gain' | 'performance';
  sex: 'male' | 'female' | null; age: number | null; height_cm: number | null; activity: string | null;
  target_weight: number | null;
  calories: number | null; protein: number | null; carbs: number | null; fat: number | null;
  auto: number; add_burned: number;
};
export type DayView = {
  date: string;
  meals: { meal_type: MealType; entries: DiaryEntry[]; totals: nutri.Macros }[];
  totals: nutri.Macros;
  goal: NutritionGoal | null;
  targets: nutri.Targets | null;
  burned: number; add_burned: boolean; budget: number | null; remaining: number | null;
  weight: number | null; water_ml: number;
  workouts: { id: number; name: string }[]; streak: number;
};
export type NutritionInsight = nutri.Insight;
export type ExerciseStats = {
  trend: { day: string; e1rm: number }[];
  volume: { bucket: string; volume: number; sets: number }[];
  history: { workout_id: number; started_at: string; set_type: string; weight: number; reps: number; duration_s: number | null; rpe: number | null }[];
  pr: PRRow | null;
  last_sets: { set_type: string; weight: number; reps: number; duration_s: number | null; rpe: number | null }[];
};

// ---------- init ----------
let ready: Promise<void> | null = null;
let photoStore: PhotoStore;
export function initData(opts?: { storage?: Storage; wasmUrl?: string; photoStore?: PhotoStore }): Promise<void> {
  if (!ready) {
    photoStore = opts?.photoStore ?? (typeof indexedDB !== 'undefined' ? new IdbPhotoStore() : new MemoryPhotoStore());
    ready = initDb(opts).then(() => {
      migrate();
      reconcileActiveWorkouts();
    });
  }
  return ready;
}
async function ok(): Promise<void> {
  if (!ready) throw new Error('Data layer not initialized — call initData() first');
  await ready;
}

// exported for tests
export const _internal = { reconcile: () => reconcileActiveWorkouts() };

// Crash recovery: at most one in-progress workout. Older strays with completed
// sets get finished (data preserved); empty strays are removed.
function reconcileActiveWorkouts() {
  const db = getDb();
  const actives = db.prepare('SELECT id, started_at FROM workouts WHERE ended_at IS NULL ORDER BY started_at DESC').all();
  for (const w of actives.slice(1)) {
    const done = db.prepare(`
      SELECT COUNT(*) AS n, MAX(s.completed_at) AS last FROM sets s
      JOIN workout_exercises we ON we.id = s.workout_exercise_id
      WHERE we.workout_id = ? AND s.completed = 1
    `).get(w.id)!;
    if ((done.n as number) > 0) {
      db.prepare('UPDATE workouts SET ended_at = ? WHERE id = ?').run(done.last || w.started_at, w.id);
      db.prepare("DELETE FROM sets WHERE completed = 0 AND workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)").run(w.id);
    } else {
      db.prepare('DELETE FROM workouts WHERE id = ?').run(w.id);
    }
  }
}

// ---------- validation helpers ----------
class UserError extends Error {}
function numOrNull(v: any, min: number, max: number): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return Math.min(max, Math.max(min, n));
}
function reqName(v: any, what: string): string {
  const s = String(v ?? '').trim();
  if (!s) throw new UserError(`${what} name is required`);
  return s.slice(0, 120);
}

// ---------- internals (ported from the server) ----------
function fullWorkout(id: number): Workout | null {
  const db = getDb();
  const w = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id);
  if (!w) return null;
  const exercises = db.prepare(`
    SELECT we.*, e.name AS exercise_name, e.muscle, e.equipment, e.exercise_type
    FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id
    WHERE we.workout_id = ? ORDER BY we.position
  `).all(id);
  for (const we of exercises) {
    we.sets = db.prepare('SELECT * FROM sets WHERE workout_exercise_id = ? ORDER BY position').all(we.id);
    we.previous = stats.lastSets(we.exercise_id);
  }
  return { ...(w as any), exercises } as Workout;
}

function fullTemplate(id: number): Template | null {
  const db = getDb();
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  if (!t) return null;
  (t as any).exercises = db.prepare(`
    SELECT te.*, e.name AS exercise_name, e.muscle, e.equipment, e.exercise_type
    FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id
    WHERE te.template_id = ? ORDER BY te.position
  `).all(id);
  return t as any;
}

function replaceTemplateExercises(templateId: number, list: any[]) {
  const db = getDb();
  db.prepare('DELETE FROM template_exercises WHERE template_id = ?').run(templateId);
  const ins = db.prepare('INSERT INTO template_exercises (template_id, exercise_id, position, superset_group, target_sets, target_reps, target_weight, rest_seconds, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  list.forEach((te, i) => ins.run(
    templateId, te.exercise_id, i, te.superset_group ?? null,
    Math.max(1, Math.min(20, Number(te.target_sets) || 3)),
    String(te.target_reps || '8').slice(0, 12),
    numOrNull(te.target_weight, 0, 2000),
    numOrNull(te.rest_seconds, 5, 3600) ?? Number(getSetting('default_rest', '120')),
    String(te.notes || '').slice(0, 500)
  ));
}

// Snapshot each recipe item's per-serving nutrition from its source food (or
// from inline values for ad-hoc items), so a later edit/delete of a food can't
// silently change a saved recipe.
function replaceMealItems(mealId: number, list: any[]) {
  const db = getDb();
  db.prepare('DELETE FROM meal_items WHERE meal_id = ?').run(mealId);
  const ins = db.prepare(`INSERT INTO meal_items (meal_id, food_id, position, quantity, name, kcal, protein, carbs, fat, fibre, sugar, sodium)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  list.forEach((it, i) => {
    let snap: any, food_id: number | null = null;
    if (it.food_id) {
      const f = getFood(Number(it.food_id));
      food_id = f.id;
      snap = { name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fibre: f.fibre, sugar: f.sugar, sodium: f.sodium };
    } else {
      const f = foodInput(it);
      snap = { name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fibre: f.fibre, sugar: f.sugar, sodium: f.sodium };
    }
    ins.run(mealId, food_id, i, nn(it.quantity ?? 1, 0.01, 100, 1), snap.name, snap.kcal, snap.protein, snap.carbs, snap.fat, snap.fibre, snap.sugar, snap.sodium);
  });
}

// ---------- nutrition internals ----------
const MT = new Set(MEAL_TYPES as readonly string[]);
function mealType(v: any, fallback = 'breakfast'): MealType {
  return (MT.has(v) ? v : fallback) as MealType;
}
function nn(v: any, min: number, max: number, def = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function nnOrNull(v: any, min: number, max: number): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}
function reqDate(v: any): string {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new UserError('Enter a valid date');
  return s;
}
// Normalize any food-shaped input into stored per-serving nutrition.
function foodInput(e: any) {
  const name = reqName(e.name, 'Food');
  const brand = String(e.brand || '').slice(0, 80);
  const serving_desc = String(e.serving_desc || 'serving').trim().slice(0, 60) || 'serving';
  const kcal = nn(e.kcal, 0, 10000);
  // kJ is the AU-standard energy: accept it if given, else derive from kcal.
  const kj = e.kj != null && Number.isFinite(Number(e.kj)) ? Math.round(Number(e.kj)) : kjFromKcal(kcal);
  return {
    name, brand, serving_desc,
    serving_grams: nnOrNull(e.serving_grams, 0, 5000),
    kcal, kj,
    protein: nn(e.protein, 0, 1000),
    carbs: nn(e.carbs, 0, 1000),
    fat: nn(e.fat, 0, 1000),
    fibre: nnOrNull(e.fibre, 0, 1000),
    sugar: nnOrNull(e.sugar, 0, 1000),
    sodium: nnOrNull(e.sodium, 0, 100000),
    barcode: e.barcode !== undefined ? normalizeBarcode(e.barcode) : undefined,
    dedupe_key: dedupeKey(name, brand, serving_desc),
  };
}
function getFood(id: number): Food {
  const f = getDb().prepare('SELECT * FROM foods WHERE id = ?').get(id) as Food | undefined;
  if (!f) throw new UserError('Food not found');
  return f;
}
function fullMeal(id: number): Meal | null {
  const db = getDb();
  const m = db.prepare('SELECT * FROM meals WHERE id = ?').get(id) as any;
  if (!m) return null;
  const items = db.prepare('SELECT * FROM meal_items WHERE meal_id = ? ORDER BY position, id').all(id) as MealItem[];
  let total = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sugar: 0, sodium: 0 };
  for (const it of items) total = nutri.addMacros(total, nutri.scale(it, it.quantity));
  const servings = m.servings || 1;
  const per = { kcal: total.kcal / servings, protein: total.protein / servings, carbs: total.carbs / servings, fat: total.fat / servings, fibre: total.fibre / servings, sugar: total.sugar / servings, sodium: total.sodium / servings };
  return { ...m, items, total: nutri.roundMacros(total), per_serving: nutri.roundMacros(per) };
}

// ---------- api ----------
export const api = {
  bootstrap: async () => {
    await ok();
    return {
      settings: allSettings() as unknown as Settings,
      muscles: MUSCLES,
      equipment: EQUIPMENT,
      active_workout: (getDb().prepare('SELECT id FROM workouts WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get() as { id: number } | undefined) || null,
    };
  },

  settings: {
    get: async () => { await ok(); return allSettings() as unknown as Settings; },
    put: async (s: Partial<Settings>) => {
      await ok();
      if (s.units && !['kg', 'lb'].includes(s.units)) throw new UserError('Units must be kg or lb');
      if (s.default_rest != null && !(Number(s.default_rest) >= 5 && Number(s.default_rest) <= 3600)) throw new UserError('Rest must be 5–3600 seconds');
      if (s.weekly_goal != null && !(Number(s.weekly_goal) >= 1 && Number(s.weekly_goal) <= 14)) throw new UserError('Weekly goal must be 1–14');
      for (const [k, v] of Object.entries(s)) setSetting(k, String(v));
      return allSettings() as unknown as Settings;
    },
  },

  exercises: {
    list: async (): Promise<Exercise[]> => { await ok(); return getDb().prepare('SELECT * FROM exercises WHERE archived = 0 ORDER BY name').all() as Exercise[]; },
    getOne: async (id: number): Promise<Exercise | null> => { await ok(); return (getDb().prepare('SELECT * FROM exercises WHERE id = ?').get(id) as Exercise) || null; },
    create: async (e: Partial<Exercise>): Promise<Exercise> => {
      await ok();
      const name = reqName(e.name, 'Exercise');
      const dup = getDb().prepare('SELECT id FROM exercises WHERE name = ? COLLATE NOCASE').get(name);
      if (dup) throw new UserError(`“${name}” already exists in your library`);
      const type = EXERCISE_TYPES.includes(e.exercise_type as any) ? e.exercise_type : 'strength';
      const info = getDb().prepare('INSERT INTO exercises (name, muscle, secondary, equipment, exercise_type, is_custom) VALUES (?, ?, ?, ?, ?, 1)')
        .run(name, e.muscle || 'other', e.secondary || '', e.equipment || 'other', type);
      return getDb().prepare('SELECT * FROM exercises WHERE id = ?').get(info.lastInsertRowid) as Exercise;
    },
    update: async (id: number, e: Partial<Exercise>): Promise<Exercise> => {
      await ok();
      if (e.name !== undefined) {
        const name = reqName(e.name, 'Exercise');
        const dup = getDb().prepare('SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id);
        if (dup) throw new UserError(`“${name}” already exists in your library`);
      }
      const type = EXERCISE_TYPES.includes(e.exercise_type as any) ? e.exercise_type : null;
      getDb().prepare('UPDATE exercises SET name = COALESCE(?, name), muscle = COALESCE(?, muscle), secondary = COALESCE(?, secondary), equipment = COALESCE(?, equipment), exercise_type = COALESCE(?, exercise_type) WHERE id = ?')
        .run(e.name != null ? String(e.name).trim() : null, e.muscle ?? null, e.secondary ?? null, e.equipment ?? null, type, id);
      return getDb().prepare('SELECT * FROM exercises WHERE id = ?').get(id) as Exercise;
    },
    remove: async (id: number) => {
      await ok();
      const db = getDb();
      const used = (db.prepare('SELECT COUNT(*) AS n FROM workout_exercises WHERE exercise_id = ?').get(id)!.n as number)
        + (db.prepare('SELECT COUNT(*) AS n FROM template_exercises WHERE exercise_id = ?').get(id)!.n as number);
      if (used > 0) { db.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(id); return { archived: true }; }
      db.prepare('DELETE FROM exercises WHERE id = ?').run(id);
      return { deleted: true };
    },
    stats: async (id: number): Promise<ExerciseStats> => {
      await ok();
      const trend = stats.e1rmTrend(id);
      const volume = stats.volumeSeries({ bucket: 'week', exercise_id: id });
      const history = getDb().prepare(`
        SELECT w.id AS workout_id, w.started_at, s.set_type, s.weight, s.reps, s.duration_s, s.rpe
        FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
        JOIN workouts w ON w.id = we.workout_id
        WHERE we.exercise_id = ? AND s.completed = 1 AND w.ended_at IS NOT NULL
        ORDER BY w.started_at DESC, s.position LIMIT 120
      `).all(id) as ExerciseStats['history'];
      const pr = (stats.prSummary().find((r: any) => r.exercise_id === Number(id)) as PRRow) || null;
      return { trend, volume, history, pr, last_sets: stats.lastSets(id) as ExerciseStats['last_sets'] };
    },
  },

  templates: {
    list: async (): Promise<Template[]> => {
      await ok();
      return getDb().prepare('SELECT id FROM templates WHERE archived = 0 ORDER BY position, id').all().map((r) => fullTemplate(r.id as number)!) as Template[];
    },
    create: async (t: any): Promise<Template> => {
      await ok();
      return withTx(() => {
        const id = getDb().prepare('INSERT INTO templates (name, day_of_week, notes) VALUES (?, ?, ?)')
          .run(reqName(t.name || 'Routine', 'Routine'), t.day_of_week ?? null, String(t.notes || '')).lastInsertRowid;
        replaceTemplateExercises(id, t.exercises || []);
        return fullTemplate(id)!;
      });
    },
    update: async (id: number, t: any): Promise<Template> => {
      await ok();
      return withTx(() => {
        getDb().prepare('UPDATE templates SET name = COALESCE(?, name), day_of_week = ?, notes = COALESCE(?, notes) WHERE id = ?')
          .run(t.name != null ? reqName(t.name, 'Routine') : null, t.day_of_week ?? null, t.notes ?? null, id);
        if (t.exercises) replaceTemplateExercises(id, t.exercises);
        return fullTemplate(id)!;
      });
    },
    remove: async (id: number) => { await ok(); getDb().prepare('UPDATE templates SET archived = 1 WHERE id = ?').run(id); return { deleted: true }; },
    start: async (id: number): Promise<Workout> => {
      await ok();
      return withTx(() => {
        const db = getDb();
        const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
        if (!t) throw new UserError('Routine not found');
        const wid = db.prepare('INSERT INTO workouts (name, template_id, started_at) VALUES (?, ?, ?)').run(t.name, t.id, localISO()).lastInsertRowid;
        const tex = db.prepare('SELECT * FROM template_exercises WHERE template_id = ? ORDER BY position').all(t.id);
        for (const te of tex) {
          const weId = db.prepare('INSERT INTO workout_exercises (workout_id, exercise_id, position, superset_group, rest_seconds, notes) VALUES (?, ?, ?, ?, ?, ?)')
            .run(wid, te.exercise_id, te.position, te.superset_group, te.rest_seconds, te.notes || '').lastInsertRowid;
          const prev = stats.lastSets(te.exercise_id as number).filter((s: any) => s.set_type !== 'warmup');
          for (let i = 0; i < (te.target_sets as number); i++) {
            const ghost: any = prev[Math.min(i, prev.length - 1)];
            db.prepare('INSERT INTO sets (workout_exercise_id, position, set_type, weight, reps) VALUES (?, ?, ?, ?, ?)')
              .run(weId, i, 'working', ghost ? ghost.weight : te.target_weight, ghost ? ghost.reps : null);
          }
        }
        return fullWorkout(wid)!;
      });
    },
  },

  workouts: {
    list: async (limit = 50, offset = 0): Promise<WorkoutSummary[]> => {
      await ok();
      const rows = getDb().prepare(`
        SELECT w.id, w.name, w.started_at, w.ended_at, w.notes, w.template_id,
          (SELECT COUNT(*) FROM workout_exercises we JOIN sets s ON s.workout_exercise_id = we.id
            WHERE we.workout_id = w.id AND s.completed = 1 AND s.set_type != 'warmup') AS sets,
          (SELECT COALESCE(SUM(s.weight * s.reps), 0) FROM workout_exercises we JOIN sets s ON s.workout_exercise_id = we.id
            WHERE we.workout_id = w.id AND s.completed = 1 AND s.set_type != 'warmup') AS volume,
          (SELECT GROUP_CONCAT(e.name, '|') FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id
            WHERE we.workout_id = w.id) AS exercise_names
        FROM workouts w WHERE w.ended_at IS NOT NULL
        ORDER BY w.started_at DESC LIMIT ? OFFSET ?
      `).all(limit, offset);
      const events = stats.computePRs().events;
      const prByWorkout = new Map<number, number>();
      for (const ev of events) prByWorkout.set(ev.workout_id, (prByWorkout.get(ev.workout_id) || 0) + 1);
      return rows.map((r) => ({ ...(r as any), volume: Math.round(r.volume as number), prs: prByWorkout.get(r.id as number) || 0, exercise_names: String(r.exercise_names || '').split('|').filter(Boolean) })) as WorkoutSummary[];
    },
    get: async (id: number): Promise<Workout> => {
      await ok();
      const w = fullWorkout(Number(id));
      if (!w) throw new UserError('Workout not found');
      return w;
    },
    active: async (): Promise<Workout | null> => {
      await ok();
      const row = getDb().prepare('SELECT id FROM workouts WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get();
      return row ? fullWorkout(row.id as number) : null;
    },
    create: async (name?: string): Promise<Workout> => {
      await ok();
      const id = getDb().prepare('INSERT INTO workouts (name, started_at) VALUES (?, ?)').run(String(name || 'Workout').slice(0, 120), localISO()).lastInsertRowid;
      return fullWorkout(id)!;
    },
    duplicate: async (id: number): Promise<Workout> => {
      await ok();
      return withTx(() => {
        const db = getDb();
        const src = fullWorkout(Number(id));
        if (!src) throw new UserError('Workout not found');
        const wid = db.prepare('INSERT INTO workouts (name, template_id, started_at) VALUES (?, ?, ?)').run(src.name, src.template_id, localISO()).lastInsertRowid;
        for (const we of src.exercises) {
          const weId = db.prepare('INSERT INTO workout_exercises (workout_id, exercise_id, position, superset_group, rest_seconds, notes) VALUES (?, ?, ?, ?, ?, ?)')
            .run(wid, we.exercise_id, we.position, we.superset_group, we.rest_seconds, we.notes || '').lastInsertRowid;
          for (const s of we.sets) {
            db.prepare('INSERT INTO sets (workout_exercise_id, position, set_type, weight, reps, rpe) VALUES (?, ?, ?, ?, ?, ?)')
              .run(weId, s.position, s.set_type, s.weight, s.reps, s.rpe);
          }
        }
        return fullWorkout(wid)!;
      });
    },
    finish: async (id: number, notes?: string): Promise<Workout> => {
      await ok();
      const done = withTx(() => {
        const db = getDb();
        const w = fullWorkout(Number(id));
        if (!w) throw new UserError('Workout not found');
        for (const we of w.exercises) {
          db.prepare('DELETE FROM sets WHERE workout_exercise_id = ? AND completed = 0').run(we.id);
          const left = db.prepare('SELECT COUNT(*) AS n FROM sets WHERE workout_exercise_id = ?').get(we.id)!.n as number;
          if (left === 0) db.prepare('DELETE FROM workout_exercises WHERE id = ?').run(we.id);
        }
        const remaining = db.prepare('SELECT COUNT(*) AS n FROM workout_exercises WHERE workout_id = ?').get(w.id)!.n as number;
        if (remaining === 0) { db.prepare('DELETE FROM workouts WHERE id = ?').run(w.id); return { discarded: true } as unknown as Workout; }
        db.prepare('UPDATE workouts SET ended_at = ?, notes = COALESCE(?, notes) WHERE id = ?').run(localISO(), notes != null ? String(notes).slice(0, 2000) : null, w.id);
        return fullWorkout(w.id)!;
      });
      if ((done as any).discarded) return done;
      const day = done.started_at.slice(0, 10);
      const prs = stats.computePRs().events.filter((e: any) => e.workout_id === done.id && e.day === day);
      await flush();
      return { ...done, new_prs: prs };
    },
    update: async (id: number, body: any): Promise<Workout> => {
      await ok();
      getDb().prepare('UPDATE workouts SET name = COALESCE(?, name), notes = COALESCE(?, notes) WHERE id = ?')
        .run(body.name != null ? String(body.name).slice(0, 120) : null, body.notes != null ? String(body.notes).slice(0, 2000) : null, id);
      return fullWorkout(Number(id))!;
    },
    remove: async (id: number) => { await ok(); getDb().prepare('DELETE FROM workouts WHERE id = ?').run(id); await flush(); return { deleted: true }; },
    addExercise: async (id: number, exercise_id: number): Promise<Workout> => {
      await ok();
      return withTx(() => {
        const db = getDb();
        const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM workout_exercises WHERE workout_id = ?').get(id)!.p as number;
        const weId = db.prepare('INSERT INTO workout_exercises (workout_id, exercise_id, position, rest_seconds) VALUES (?, ?, ?, ?)')
          .run(id, exercise_id, pos, Number(getSetting('default_rest', '120'))).lastInsertRowid;
        const prev = stats.lastSets(exercise_id).filter((s: any) => s.set_type !== 'warmup');
        for (let i = 0; i < 3; i++) {
          const ghost: any = prev[Math.min(i, prev.length - 1)];
          db.prepare('INSERT INTO sets (workout_exercise_id, position, set_type, weight, reps) VALUES (?, ?, ?, ?, ?)')
            .run(weId, i, 'working', ghost ? ghost.weight : null, ghost ? ghost.reps : null);
        }
        return fullWorkout(Number(id))!;
      });
    },
  },

  workoutExercises: {
    update: async (id: number, body: any) => {
      await ok();
      const db = getDb();
      const cur = db.prepare('SELECT * FROM workout_exercises WHERE id = ?').get(id);
      if (!cur) throw new UserError('Exercise not found');
      db.prepare('UPDATE workout_exercises SET superset_group = ?, rest_seconds = COALESCE(?, rest_seconds), notes = COALESCE(?, notes), position = COALESCE(?, position) WHERE id = ?')
        .run(body.superset_group !== undefined ? body.superset_group : cur.superset_group ?? null,
          numOrNull(body.rest_seconds, 5, 3600), body.notes != null ? String(body.notes).slice(0, 500) : null, body.position ?? null, id);
      return db.prepare('SELECT * FROM workout_exercises WHERE id = ?').get(id);
    },
    remove: async (id: number) => { await ok(); getDb().prepare('DELETE FROM workout_exercises WHERE id = ?').run(id); return { deleted: true }; },
    addSet: async (id: number): Promise<SetRow> => {
      await ok();
      const db = getDb();
      const last = db.prepare('SELECT * FROM sets WHERE workout_exercise_id = ? ORDER BY position DESC LIMIT 1').get(id);
      const pos = last ? (last.position as number) + 1 : 0;
      const sid = db.prepare('INSERT INTO sets (workout_exercise_id, position, set_type, weight, reps, duration_s) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, pos, last ? (last.set_type === 'warmup' ? 'working' : last.set_type) : 'working', last ? last.weight : null, last ? last.reps : null, last ? last.duration_s : null).lastInsertRowid;
      return db.prepare('SELECT * FROM sets WHERE id = ?').get(sid) as SetRow;
    },
  },

  sets: {
    update: async (id: number, body: any): Promise<SetRow> => {
      await ok();
      const db = getDb();
      const cur = db.prepare('SELECT * FROM sets WHERE id = ?').get(id);
      if (!cur) throw new UserError('Set not found');
      const completed = body.completed !== undefined ? (body.completed ? 1 : 0) : (cur.completed as number);
      const setType = body.set_type != null && ['warmup', 'working', 'dropset', 'failure'].includes(body.set_type) ? body.set_type : null;
      db.prepare('UPDATE sets SET set_type = COALESCE(?, set_type), weight = ?, reps = ?, duration_s = ?, rpe = ?, completed = ?, completed_at = ? WHERE id = ?')
        .run(setType,
          body.weight !== undefined ? numOrNull(body.weight, 0, 2000) : cur.weight,
          body.reps !== undefined ? (numOrNull(body.reps, 0, 1000) != null ? Math.round(numOrNull(body.reps, 0, 1000)!) : null) : cur.reps,
          body.duration_s !== undefined ? (numOrNull(body.duration_s, 0, 36000) != null ? Math.round(numOrNull(body.duration_s, 0, 36000)!) : null) : cur.duration_s,
          body.rpe !== undefined ? numOrNull(body.rpe, 1, 10) : cur.rpe,
          completed, completed ? (cur.completed_at || localISO()) : null, id);
      return db.prepare('SELECT * FROM sets WHERE id = ?').get(id) as SetRow;
    },
    remove: async (id: number) => { await ok(); getDb().prepare('DELETE FROM sets WHERE id = ?').run(id); return { deleted: true }; },
  },

  stats: {
    overview: async (): Promise<Overview> => { await ok(); return stats.overview(); },
    prs: async (): Promise<PRRow[]> => { await ok(); return stats.prSummary() as PRRow[]; },
    volume: async (q: string) => {
      await ok();
      const p = new URLSearchParams(q);
      return stats.volumeSeries({
        bucket: (p.get('bucket') as 'week' | 'month') || 'week',
        exercise_id: p.get('exercise_id') || null,
        muscle: p.get('muscle') || null,
        since: p.get('since') || null,
      });
    },
    muscleVolume: async (since?: string): Promise<Record<string, number>> => {
      await ok();
      const s = since || localDate(new Date(Date.now() - 28 * 86400000));
      return stats.muscleVolume(s);
    },
  },

  bodyweight: {
    list: async () => { await ok(); return getDb().prepare('SELECT * FROM body_weight ORDER BY date').all() as { id: number; date: string; weight: number }[]; },
    add: async (date: string, weight: number) => {
      await ok();
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0 || w > 700) throw new UserError('Enter a valid weight');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new UserError('Enter a valid date');
      getDb().prepare('INSERT INTO body_weight (date, weight) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET weight = excluded.weight').run(date, w);
      return getDb().prepare('SELECT * FROM body_weight ORDER BY date').all() as { id: number; date: string; weight: number }[];
    },
  },

  reports: {
    weekly: async (date?: string) => {
      await ok();
      const r = reportsMod.weeklyReport(date);
      return { ...r, nutrition: nutri.nutritionPeriod(r.start, r.end) };
    },
    monthly: async (month?: string) => {
      await ok();
      const r = reportsMod.monthlyReport(month);
      return { ...r, nutrition: nutri.nutritionPeriod(r.start, r.end) };
    },
  },

  suggestions: async (): Promise<Suggestions> => { await ok(); return suggestionsFn(); },

  garmin: {
    importActivities: async (items: any[], source = 'file') => { await ok(); const r = await garminMod.importActivities(items, source); await flush(); return r; },
    importDaily: async (items: any[], source = 'file') => { await ok(); const r = garminMod.importDaily(items, source); await flush(); return r; },
    activities: async (limit = 60): Promise<GarminActivity[]> => { await ok(); return getDb().prepare('SELECT * FROM garmin_activities ORDER BY started_at DESC LIMIT ?').all(limit) as GarminActivity[]; },
    daily: async (from?: string): Promise<GarminDaily[]> => {
      await ok();
      const f = from || localDate(new Date(Date.now() - 30 * 86400000));
      return getDb().prepare('SELECT * FROM garmin_daily WHERE date >= ? ORDER BY date').all(f) as GarminDaily[];
    },
    demo: async (days = 30) => { await ok(); const r = await garminMod.generateDemo(days); await flush(); return r; },
    clear: async () => { await ok(); getDb().exec('DELETE FROM garmin_activities; DELETE FROM garmin_daily;'); await flush(); return { cleared: true }; },
    runs: async (limit = 200): Promise<GarminActivity[]> => {
      await ok();
      return getDb().prepare("SELECT * FROM garmin_activities WHERE activity_type = 'running' ORDER BY started_at DESC LIMIT ?").all(limit) as GarminActivity[];
    },

    // Auto-sync: pulls the snapshot published by the /sync job from a private
    // GitHub repo. Config (incl. the read-only token) lives in the on-device
    // settings table and never leaves the device except in user-made backups.
    sync: {
      config: async () => {
        await ok();
        return {
          repo: getSetting('garmin_sync_repo', ''),
          has_token: !!getSetting('garmin_sync_token', ''),
          last_sync_at: getSetting('garmin_sync_at', '') || null,
        };
      },
      configure: async (repo: string, token: string) => {
        await ok();
        const r = String(repo || '').trim();
        const t = String(token || '').trim();
        if (r && !REPO_RE.test(r)) throw new UserError('Repo must look like owner/repo');
        setSetting('garmin_sync_repo', r);
        // blank token + existing repo = keep the stored token; clearing the repo clears everything
        if (t || !r) { setSetting('garmin_sync_token', t); }
        if (!r) { setSetting('garmin_sync_generated', ''); setSetting('garmin_sync_at', ''); }
        await flush();
        return { repo: r, has_token: !!getSetting('garmin_sync_token', '') };
      },
      now: async (force = false, fetchFn?: typeof fetch): Promise<SyncOutcome> => {
        await ok();
        const repo = getSetting('garmin_sync_repo', '');
        const token = getSetting('garmin_sync_token', '');
        if (!repo || !token) return { state: 'unconfigured' };
        try {
          const snap = await fetchSyncSnapshot(repo, token, fetchFn ?? fetch);
          if (!force && snap.generated_at && snap.generated_at === getSetting('garmin_sync_generated', '')) {
            setSetting('garmin_sync_at', localISO());
            await flush();
            return { state: 'nochange' };
          }
          const a = await garminMod.importActivities(snap.activities, 'sync');
          const d = garminMod.importDaily(snap.daily, 'sync');
          setSetting('garmin_sync_generated', snap.generated_at || '');
          setSetting('garmin_sync_at', localISO());
          await flush();
          return { state: 'ok', activities: a.imported, daily: d.imported };
        } catch (e: any) {
          return { state: 'error', message: e?.message || 'Sync failed' };
        }
      },
    },
  },

  photos: {
    list: async (): Promise<ProgressPhoto[]> => {
      await ok();
      return getDb().prepare('SELECT * FROM progress_photos ORDER BY date DESC, id DESC').all() as ProgressPhoto[];
    },
    add: async (p: { blob: Blob; date: string; note?: string; width?: number; height?: number }): Promise<ProgressPhoto> => {
      await ok();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) throw new UserError('Enter a valid date');
      if (!p.blob || p.blob.size === 0) throw new UserError('No image data');
      if (p.blob.size > 8_000_000) throw new UserError('Image too large after processing');
      const key = newPhotoKey();
      await photoStore.put(key, p.blob);
      try {
        const id = getDb().prepare('INSERT INTO progress_photos (date, note, blob_key, width, height, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(p.date, String(p.note || '').slice(0, 300), key, p.width ?? null, p.height ?? null, p.blob.size, localISO()).lastInsertRowid;
        await flush();
        return getDb().prepare('SELECT * FROM progress_photos WHERE id = ?').get(id) as ProgressPhoto;
      } catch (e) {
        await photoStore.remove(key); // don't leak orphaned blobs
        throw e;
      }
    },
    blob: async (blob_key: string): Promise<Blob | null> => { await ok(); return photoStore.get(blob_key); },
    updateNote: async (id: number, note: string) => {
      await ok();
      getDb().prepare('UPDATE progress_photos SET note = ? WHERE id = ?').run(String(note || '').slice(0, 300), id);
      return getDb().prepare('SELECT * FROM progress_photos WHERE id = ?').get(id) as ProgressPhoto;
    },
    remove: async (id: number) => {
      await ok();
      const row = getDb().prepare('SELECT blob_key FROM progress_photos WHERE id = ?').get(id);
      getDb().prepare('DELETE FROM progress_photos WHERE id = ?').run(id);
      if (row) await photoStore.remove(row.blob_key as string);
      await flush();
      return { deleted: true };
    },
    // bodyweight logged nearest (on or before) a date — shown next to photos
    nearestWeight: async (date: string): Promise<number | null> => {
      await ok();
      const row = getDb().prepare('SELECT weight FROM body_weight WHERE date <= ? ORDER BY date DESC LIMIT 1').get(date);
      return row ? (row.weight as number) : null;
    },
  },

  // ---------- Nutrition module ----------
  nutrition: {
    foods: {
      search: async (q: string, limit = 40): Promise<Food[]> => {
        await ok();
        const term = String(q || '').trim();
        if (!term) {
          // no query → favourites, then verified/high-confidence, then alphabetical
          return getDb().prepare(`
            SELECT * FROM foods WHERE archived = 0
            ORDER BY favourite DESC,
              CASE confidence WHEN 'verified' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
              name LIMIT ?`).all(limit) as Food[];
        }
        // Broad SQL prefilter → precise JS ranking (multi-token, brand aliases,
        // typo tolerance, confidence/favourite weighting). See db/foods-search.ts.
        const { where, params } = prefilterSql(term);
        const candidates = getDb().prepare(`SELECT * FROM foods WHERE ${where} LIMIT 600`).all(...params) as Food[];
        const ranked = rankFoods(candidates as any, term, limit) as unknown as Food[];
        // Fallback: if the prefilter was too tight (rare typo cases), rank a wider set.
        if (ranked.length === 0) {
          const wide = getDb().prepare('SELECT * FROM foods WHERE archived = 0 LIMIT 2000').all() as Food[];
          return rankFoods(wide as any, term, limit) as unknown as Food[];
        }
        return ranked;
      },
      recent: async (limit = 25): Promise<Food[]> => { await ok(); return nutri.recentFoods(limit) as Food[]; },
      favourites: async (): Promise<Food[]> => { await ok(); return getDb().prepare('SELECT * FROM foods WHERE archived = 0 AND favourite = 1 ORDER BY name').all() as Food[]; },
      custom: async (): Promise<Food[]> => { await ok(); return getDb().prepare('SELECT * FROM foods WHERE archived = 0 AND is_custom = 1 ORDER BY created_at DESC, name').all() as Food[]; },
      get: async (id: number): Promise<Food> => { await ok(); return getFood(Number(id)); },
      create: async (e: any): Promise<Food> => {
        await ok();
        const f = foodInput(e);
        // Confidence tier: a barcode-matched food (saved from Open Food Facts or a
        // scanned code) is 'high'; a plain user-entered food is 'low'. Never
        // 'verified' — that is reserved for official/manufacturer/API sources.
        const fromBarcode = !!e.barcode;
        const source = e.source ? String(e.source) : (fromBarcode ? 'barcode' : 'custom');
        const confidence = e.confidence ? String(e.confidence) : (fromBarcode ? 'high' : 'low');
        const source_ref = e.source_ref ? String(e.source_ref).slice(0, 120) : (fromBarcode && f.barcode ? `OFF:${f.barcode}` : null);
        const now = localISO();
        const id = getDb().prepare(`INSERT INTO foods (name, brand, serving_desc, serving_grams, kcal, kj, protein, carbs, fat, fibre, sugar, sodium, barcode, is_custom, favourite, source, source_ref, verified, confidence, dedupe_key, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0, ?, ?, ?, ?)`)
          .run(f.name, f.brand, f.serving_desc, f.serving_grams, f.kcal, f.kj, f.protein, f.carbs, f.fat, f.fibre, f.sugar, f.sodium, f.barcode ?? null, e.favourite ? 1 : 0, source, source_ref, confidence, f.dedupe_key, now, now).lastInsertRowid;
        await flush();
        return getFood(id as number);
      },
      update: async (id: number, e: any): Promise<Food> => {
        await ok();
        const f = foodInput(e);
        const now = localISO();
        // only touch barcode when the caller supplied one, so edits don't wipe it
        if (f.barcode !== undefined) {
          getDb().prepare(`UPDATE foods SET name=?, brand=?, serving_desc=?, serving_grams=?, kcal=?, kj=?, protein=?, carbs=?, fat=?, fibre=?, sugar=?, sodium=?, barcode=?, dedupe_key=?, updated_at=? WHERE id=?`)
            .run(f.name, f.brand, f.serving_desc, f.serving_grams, f.kcal, f.kj, f.protein, f.carbs, f.fat, f.fibre, f.sugar, f.sodium, f.barcode ?? null, f.dedupe_key, now, id);
        } else {
          getDb().prepare(`UPDATE foods SET name=?, brand=?, serving_desc=?, serving_grams=?, kcal=?, kj=?, protein=?, carbs=?, fat=?, fibre=?, sugar=?, sodium=?, dedupe_key=?, updated_at=? WHERE id=?`)
            .run(f.name, f.brand, f.serving_desc, f.serving_grams, f.kcal, f.kj, f.protein, f.carbs, f.fat, f.fibre, f.sugar, f.sodium, f.dedupe_key, now, id);
        }
        await flush();
        return getFood(Number(id));
      },
      // Local barcode hit — works fully offline once a product has been saved.
      byBarcode: async (code: string): Promise<Food | null> => {
        await ok();
        const c = normalizeBarcode(code);
        if (!c) return null;
        return (getDb().prepare('SELECT * FROM foods WHERE barcode = ? AND archived = 0 ORDER BY is_custom DESC, id DESC LIMIT 1').get(c) as Food) || null;
      },
      // Scan resolver: local first (offline), then Open Food Facts. Never throws
      // on network trouble — returns a tagged outcome the UI can act on.
      lookupBarcode: async (code: string, fetchFn?: typeof fetch): Promise<BarcodeLookup> => {
        await ok();
        const c = normalizeBarcode(code);
        if (!c) return { source: 'notfound', message: 'That barcode doesn’t look valid' };
        const local = (getDb().prepare('SELECT * FROM foods WHERE barcode = ? AND archived = 0 ORDER BY is_custom DESC, id DESC LIMIT 1').get(c) as Food) || null;
        if (local) return { source: 'local', food: local };
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return { source: 'offline' };
        try {
          const draft = await fetchOpenFoodFacts(c, fetchFn ?? fetch);
          return draft ? { source: 'off', draft } : { source: 'notfound' };
        } catch (e: any) {
          return { source: 'error', message: e?.message || 'Lookup failed' };
        }
      },
      remove: async (id: number) => {
        await ok();
        const db = getDb();
        const used = (db.prepare('SELECT COUNT(*) AS n FROM nutrition_entries WHERE food_id = ?').get(id)!.n as number)
          + (db.prepare('SELECT COUNT(*) AS n FROM meal_items WHERE food_id = ?').get(id)!.n as number);
        if (used > 0) { db.prepare('UPDATE foods SET archived = 1, favourite = 0 WHERE id = ?').run(id); await flush(); return { archived: true }; }
        db.prepare('DELETE FROM foods WHERE id = ?').run(id);
        await flush();
        return { deleted: true };
      },
      toggleFavourite: async (id: number): Promise<Food> => {
        await ok();
        getDb().prepare('UPDATE foods SET favourite = 1 - favourite WHERE id = ?').run(id);
        await flush();
        return getFood(Number(id));
      },
    },

    diary: {
      day: async (date: string): Promise<DayView> => {
        await ok();
        const d = reqDate(date);
        const db = getDb();
        const rows = nutri.dayEntries(d) as DiaryEntry[];
        const meals = (MEAL_TYPES as readonly MealType[]).map((mt) => {
          const entries = rows.filter((r) => r.meal_type === mt);
          let totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sugar: 0, sodium: 0 };
          for (const e of entries) totals = nutri.addMacros(totals, nutri.scale(e, e.quantity));
          return { meal_type: mt, entries, totals: nutri.roundMacros(totals) };
        });
        const totalsRaw = nutri.dayTotals(d);
        const goal = api.nutrition.goals._read();
        const targets = goal ? { calories: goal.calories || 0, protein: goal.protein || 0, carbs: goal.carbs || 0, fat: goal.fat || 0 } : null;
        const burned = nutri.burnedOn(d);
        const add_burned = !!(goal && goal.add_burned);
        const budget = targets && targets.calories ? targets.calories + (add_burned ? burned : 0) : null;
        const remaining = budget != null ? Math.round(budget - totalsRaw.kcal) : null;
        const workouts = db.prepare("SELECT id, name FROM workouts WHERE ended_at IS NOT NULL AND substr(started_at,1,10) = ? ORDER BY started_at").all(d) as { id: number; name: string }[];
        const water = db.prepare('SELECT ml FROM water_tracking WHERE date = ?').get(d) as { ml: number } | undefined;
        return {
          date: d, meals, totals: nutri.roundMacros(totalsRaw), goal, targets,
          burned, add_burned, budget: budget != null ? Math.round(budget) : null, remaining,
          weight: nutri.weightOn(d), water_ml: water?.ml || 0, workouts, streak: nutri.loggingStreak(),
        };
      },
      add: async (body: any): Promise<DiaryEntry> => {
        await ok();
        const date = reqDate(body.date);
        const mt = mealType(body.meal_type);
        const db = getDb();
        const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM nutrition_entries WHERE date = ? AND meal_type = ?').get(date, mt)!.p as number;
        let snap: any, food_id: number | null, quantity: number;
        if (body.food_id) {
          const f = getFood(Number(body.food_id));
          food_id = f.id; quantity = nn(body.quantity ?? 1, 0.01, 100, 1);
          snap = { name: f.name, brand: f.brand, serving_desc: f.serving_desc, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fibre: f.fibre, sugar: f.sugar, sodium: f.sodium };
        } else {
          // quick add — free-form nutrition, no food record
          food_id = null; quantity = 1;
          const f = foodInput({ ...body, name: body.name || 'Quick add', serving_desc: body.serving_desc || 'entry' });
          snap = { name: f.name, brand: f.brand, serving_desc: f.serving_desc, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fibre: f.fibre, sugar: f.sugar, sodium: f.sodium };
        }
        const id = db.prepare(`INSERT INTO nutrition_entries (date, meal_type, position, food_id, quantity, name, brand, serving_desc, kcal, protein, carbs, fat, fibre, sugar, sodium, logged_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(date, mt, pos, food_id, quantity, snap.name, snap.brand, snap.serving_desc, snap.kcal, snap.protein, snap.carbs, snap.fat, snap.fibre, snap.sugar, snap.sodium, localISO()).lastInsertRowid;
        await flush();
        return db.prepare('SELECT * FROM nutrition_entries WHERE id = ?').get(id) as DiaryEntry;
      },
      update: async (id: number, body: any): Promise<DiaryEntry> => {
        await ok();
        const db = getDb();
        const cur = db.prepare('SELECT * FROM nutrition_entries WHERE id = ?').get(id) as DiaryEntry | undefined;
        if (!cur) throw new UserError('Diary entry not found');
        const quantity = body.quantity !== undefined ? nn(body.quantity, 0.01, 100, cur.quantity) : cur.quantity;
        const mt = body.meal_type !== undefined ? mealType(body.meal_type, cur.meal_type) : cur.meal_type;
        // editable nutrition only for quick-add / detached entries (keeps food-linked snapshots faithful)
        const editNutrition = cur.food_id == null && (body.kcal !== undefined || body.name !== undefined);
        if (editNutrition) {
          const f = foodInput({ name: body.name ?? cur.name, brand: body.brand ?? cur.brand, serving_desc: body.serving_desc ?? cur.serving_desc, kcal: body.kcal ?? cur.kcal, protein: body.protein ?? cur.protein, carbs: body.carbs ?? cur.carbs, fat: body.fat ?? cur.fat, fibre: body.fibre ?? cur.fibre, sugar: body.sugar ?? cur.sugar, sodium: body.sodium ?? cur.sodium });
          db.prepare('UPDATE nutrition_entries SET quantity=?, meal_type=?, name=?, brand=?, serving_desc=?, kcal=?, protein=?, carbs=?, fat=?, fibre=?, sugar=?, sodium=? WHERE id=?')
            .run(quantity, mt, f.name, f.brand, f.serving_desc, f.kcal, f.protein, f.carbs, f.fat, f.fibre, f.sugar, f.sodium, id);
        } else {
          db.prepare('UPDATE nutrition_entries SET quantity=?, meal_type=? WHERE id=?').run(quantity, mt, id);
        }
        await flush();
        return db.prepare('SELECT * FROM nutrition_entries WHERE id = ?').get(id) as DiaryEntry;
      },
      remove: async (id: number) => { await ok(); getDb().prepare('DELETE FROM nutrition_entries WHERE id = ?').run(id); await flush(); return { deleted: true }; },
      // Dates with at least one entry in [startISO, endISO] — powers the weekday strip.
      loggedDates: async (startISO: string, endISO: string): Promise<string[]> => {
        await ok();
        const s = reqDate(startISO), e = reqDate(endISO);
        return (getDb().prepare('SELECT DISTINCT date FROM nutrition_entries WHERE date >= ? AND date <= ? ORDER BY date').all(s, e) as any[]).map((r) => r.date as string);
      },
      // Copy every entry from the most recent prior day that has any logs into `date`.
      duplicateYesterday: async (date: string) => {
        await ok();
        const to = reqDate(date);
        const db = getDb();
        const src = db.prepare('SELECT DISTINCT date FROM nutrition_entries WHERE date < ? ORDER BY date DESC LIMIT 1').get(to) as { date: string } | undefined;
        if (!src) return { copied: 0 };
        return withTx(() => {
          const rows = db.prepare('SELECT * FROM nutrition_entries WHERE date = ? ORDER BY meal_type, position').all(src.date) as DiaryEntry[];
          let copied = 0;
          for (const r of rows) {
            const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM nutrition_entries WHERE date = ? AND meal_type = ?').get(to, r.meal_type)!.p as number;
            db.prepare(`INSERT INTO nutrition_entries (date, meal_type, position, food_id, quantity, name, brand, serving_desc, kcal, protein, carbs, fat, fibre, sugar, sodium, logged_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(to, r.meal_type, pos, r.food_id, r.quantity, r.name, r.brand, r.serving_desc, r.kcal, r.protein, r.carbs, r.fat, r.fibre, r.sugar, r.sodium, localISO());
            copied++;
          }
          return { copied, from: src.date };
        });
      },
      // Copy one meal section from another day into a (possibly different) meal on `date`.
      copyMeal: async (body: { from_date: string; from_meal: MealType; date: string; meal_type?: MealType }) => {
        await ok();
        const from = reqDate(body.from_date); const to = reqDate(body.date);
        const fromMt = mealType(body.from_meal); const toMt = mealType(body.meal_type, fromMt);
        const db = getDb();
        return withTx(() => {
          const rows = db.prepare('SELECT * FROM nutrition_entries WHERE date = ? AND meal_type = ? ORDER BY position').all(from, fromMt) as DiaryEntry[];
          let copied = 0;
          for (const r of rows) {
            const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM nutrition_entries WHERE date = ? AND meal_type = ?').get(to, toMt)!.p as number;
            db.prepare(`INSERT INTO nutrition_entries (date, meal_type, position, food_id, quantity, name, brand, serving_desc, kcal, protein, carbs, fat, fibre, sugar, sodium, logged_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(to, toMt, pos, r.food_id, r.quantity, r.name, r.brand, r.serving_desc, r.kcal, r.protein, r.carbs, r.fat, r.fibre, r.sugar, r.sodium, localISO());
            copied++;
          }
          return { copied };
        });
      },
      // One-click log a saved meal/recipe (default one serving) into the diary.
      logMeal: async (body: { meal_id: number; date: string; meal_type?: MealType; servings?: number }) => {
        await ok();
        const to = reqDate(body.date); const mt = mealType(body.meal_type);
        const meal = fullMeal(Number(body.meal_id));
        if (!meal) throw new UserError('Meal not found');
        const portions = nn(body.servings ?? 1, 0.01, 50, 1);
        const db = getDb();
        return withTx(() => {
          let logged = 0;
          for (const it of meal.items) {
            const qty = (it.quantity * portions) / (meal.servings || 1);
            const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM nutrition_entries WHERE date = ? AND meal_type = ?').get(to, mt)!.p as number;
            db.prepare(`INSERT INTO nutrition_entries (date, meal_type, position, food_id, quantity, name, brand, serving_desc, kcal, protein, carbs, fat, fibre, sugar, sodium, logged_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(to, mt, pos, it.food_id, qty, it.name, '', meal.name, it.kcal, it.protein, it.carbs, it.fat, it.fibre, it.sugar, it.sodium, localISO());
            logged++;
          }
          return { logged, meal: meal.name };
        });
      },
    },

    meals: {
      list: async (): Promise<Meal[]> => {
        await ok();
        return (getDb().prepare('SELECT id FROM meals WHERE archived = 0 ORDER BY created_at DESC, id DESC').all() as any[]).map((r) => fullMeal(r.id)!);
      },
      get: async (id: number): Promise<Meal> => { await ok(); const m = fullMeal(Number(id)); if (!m) throw new UserError('Meal not found'); return m; },
      create: async (body: any): Promise<Meal> => {
        await ok();
        return withTx(() => {
          const id = getDb().prepare('INSERT INTO meals (name, note, servings, created_at) VALUES (?, ?, ?, ?)')
            .run(reqName(body.name, 'Meal'), String(body.note || '').slice(0, 500), nn(body.servings ?? 1, 0.1, 100, 1), localISO()).lastInsertRowid as number;
          replaceMealItems(id, body.items || []);
          return fullMeal(id)!;
        });
      },
      update: async (id: number, body: any): Promise<Meal> => {
        await ok();
        return withTx(() => {
          getDb().prepare('UPDATE meals SET name = COALESCE(?, name), note = COALESCE(?, note), servings = COALESCE(?, servings) WHERE id = ?')
            .run(body.name != null ? reqName(body.name, 'Meal') : null, body.note != null ? String(body.note).slice(0, 500) : null, body.servings != null ? nn(body.servings, 0.1, 100, 1) : null, id);
          if (body.items) replaceMealItems(Number(id), body.items);
          return fullMeal(Number(id))!;
        });
      },
      remove: async (id: number) => {
        await ok();
        const db = getDb();
        // meal_items cascade-delete; keep it simple and hard-delete the saved meal
        db.prepare('DELETE FROM meals WHERE id = ?').run(id);
        await flush();
        return { deleted: true };
      },
    },

    goals: {
      _read: (): NutritionGoal | null => (getDb().prepare('SELECT * FROM nutrition_goals WHERE id = 1').get() as NutritionGoal) || null,
      get: async (): Promise<NutritionGoal | null> => { await ok(); return api.nutrition.goals._read(); },
      // Compute target calories/macros from a profile without saving (live calculator preview).
      preview: async (profile: any): Promise<nutri.Targets | null> => {
        await ok();
        const weight_kg = profile.weight_kg != null ? Number(profile.weight_kg) : (nutri.weightOn(localDate()) ?? null);
        return nutri.computeTargets({ sex: profile.sex, age: profile.age != null ? Number(profile.age) : null, height_cm: profile.height_cm != null ? Number(profile.height_cm) : null, weight_kg, activity: profile.activity, goal_type: profile.goal_type });
      },
      put: async (body: any): Promise<NutritionGoal> => {
        await ok();
        const db = getDb();
        const cur = api.nutrition.goals._read();
        const goal_type = ['lose', 'maintain', 'gain', 'performance'].includes(body.goal_type) ? body.goal_type : (cur?.goal_type || 'maintain');
        const sex = body.sex === 'male' || body.sex === 'female' ? body.sex : (body.sex === null ? null : cur?.sex ?? null);
        const age = body.age !== undefined ? nnOrNull(body.age, 13, 100) : cur?.age ?? null;
        const height_cm = body.height_cm !== undefined ? nnOrNull(body.height_cm, 100, 230) : cur?.height_cm ?? null;
        const activity = body.activity !== undefined ? String(body.activity || '') || null : cur?.activity ?? null;
        const target_weight = body.target_weight !== undefined ? nnOrNull(body.target_weight, 30, 400) : cur?.target_weight ?? null;
        const add_burned = body.add_burned !== undefined ? (body.add_burned ? 1 : 0) : (cur?.add_burned ?? 0);
        const auto = body.auto !== undefined ? (body.auto ? 1 : 0) : (cur?.auto ?? 1);
        // start from current effective targets
        let calories = cur?.calories ?? null, protein = cur?.protein ?? null, carbs = cur?.carbs ?? null, fat = cur?.fat ?? null;
        // recompute from profile when in auto mode and we have enough data
        if (auto) {
          const weight_kg = body.weight_kg != null ? Number(body.weight_kg) : nutri.weightOn(localDate());
          const t = nutri.computeTargets({ sex, age, height_cm, weight_kg, activity, goal_type });
          if (t) { calories = t.calories; protein = t.protein; carbs = t.carbs; fat = t.fat; }
        }
        // explicit manual overrides always win
        if (body.calories !== undefined) calories = nnOrNull(body.calories, 800, 10000);
        if (body.protein !== undefined) protein = nnOrNull(body.protein, 0, 1000);
        if (body.carbs !== undefined) carbs = nnOrNull(body.carbs, 0, 2000);
        if (body.fat !== undefined) fat = nnOrNull(body.fat, 0, 1000);
        db.prepare(`INSERT INTO nutrition_goals (id, goal_type, sex, age, height_cm, activity, target_weight, calories, protein, carbs, fat, auto, add_burned, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET goal_type=excluded.goal_type, sex=excluded.sex, age=excluded.age, height_cm=excluded.height_cm, activity=excluded.activity, target_weight=excluded.target_weight, calories=excluded.calories, protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat, auto=excluded.auto, add_burned=excluded.add_burned, updated_at=excluded.updated_at`)
          .run(goal_type, sex, age, height_cm, activity, target_weight, calories, protein, carbs, fat, auto, add_burned, localISO());
        await flush();
        return api.nutrition.goals._read()!;
      },
    },

    water: {
      get: async (date: string): Promise<number> => { await ok(); const r = getDb().prepare('SELECT ml FROM water_tracking WHERE date = ?').get(reqDate(date)) as { ml: number } | undefined; return r?.ml || 0; },
      set: async (date: string, ml: number): Promise<number> => {
        await ok();
        const d = reqDate(date); const v = nn(ml, 0, 20000, 0);
        getDb().prepare('INSERT INTO water_tracking (date, ml) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET ml = excluded.ml').run(d, v);
        await flush();
        return v;
      },
      add: async (date: string, delta: number): Promise<number> => {
        await ok();
        const d = reqDate(date);
        const cur = (getDb().prepare('SELECT ml FROM water_tracking WHERE date = ?').get(d) as { ml: number } | undefined)?.ml || 0;
        return api.nutrition.water.set(d, Math.max(0, cur + Number(delta || 0)));
      },
    },

    insights: async (): Promise<NutritionInsight[]> => { await ok(); return nutri.insights(); },
    report: async (range: 'week' | 'month' = 'week', anchor?: string) => {
      await ok();
      if (range === 'month') {
        const m = anchor || localDate().slice(0, 7);
        const start = m + '-01';
        const d = new Date(start + 'T00:00:00'); d.setMonth(d.getMonth() + 1);
        const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        return nutri.nutritionPeriod(start, end);
      }
      const anyDay = anchor || localDate();
      const dd = new Date(anyDay + 'T00:00:00'); const dow = (dd.getDay() + 6) % 7; dd.setDate(dd.getDate() - dow);
      const start = localDate(dd);
      const endD = new Date(start + 'T00:00:00'); endD.setDate(endD.getDate() + 7);
      return nutri.nutritionPeriod(start, localDate(endD));
    },
  },

  demoSeed: async () => { await ok(); const r = seedDemo(); await flush(); return r; },

  // Import completed workout history from a Strong app CSV export (parsed by
  // lib/strongParse). Idempotent: a workout with the same started_at that was
  // previously imported from Strong is skipped, so re-importing the same or a
  // newer export is always safe.
  importStrong: async (parsed: StrongWorkout[]) => {
    await ok();
    const result = withTx(() => {
      const db = getDb();
      let imported = 0, skipped = 0;
      const created: string[] = [];
      const cache = new Map<string, number>();
      const resolveExercise = (strongName: string): number => {
        const hit = cache.get(strongName);
        if (hit != null) return hit;
        const lib = db.prepare('SELECT id, name FROM exercises').all() as { id: number; name: string }[];
        const m = matchStrongExercise(strongName, lib);
        let id: number;
        if (m.kind === 'existing') id = m.id;
        else {
          id = db.prepare('INSERT INTO exercises (name, muscle, secondary, equipment, is_custom) VALUES (?, ?, ?, ?, 1)')
            .run(m.name, m.muscle, '', m.equipment).lastInsertRowid as number;
          created.push(m.name);
        }
        cache.set(strongName, id);
        return id;
      };

      const exists = db.prepare("SELECT id FROM workouts WHERE started_at = ? AND source = 'strong'");
      for (const w of parsed || []) {
        if (!w?.started_at || !Array.isArray(w.exercises) || w.exercises.length === 0) { skipped++; continue; }
        if (exists.get(w.started_at)) { skipped++; continue; }
        const start = new Date(w.started_at);
        if (Number.isNaN(start.getTime())) { skipped++; continue; }
        const totalSets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
        // guard against left-running timers (e.g. "145h 27m") with a sets-based estimate
        const dur = w.duration_s != null && w.duration_s >= 60 && w.duration_s <= 6 * 3600
          ? w.duration_s
          : Math.min(7200, Math.max(1200, totalSets * 180));
        const ended = new Date(start.getTime() + dur * 1000);
        const wid = db.prepare("INSERT INTO workouts (name, started_at, ended_at, notes, source) VALUES (?, ?, ?, ?, 'strong')")
          .run(String(w.name || 'Workout').slice(0, 120), localISO(start), localISO(ended), String(w.notes || '').slice(0, 2000)).lastInsertRowid;
        let setIdx = 0;
        w.exercises.forEach((e, pos) => {
          const weId = db.prepare('INSERT INTO workout_exercises (workout_id, exercise_id, position, rest_seconds, notes) VALUES (?, ?, ?, ?, ?)')
            .run(wid, resolveExercise(e.name), pos, e.rest_seconds ?? Number(getSetting('default_rest', '120')), String(e.notes || '').slice(0, 500)).lastInsertRowid;
          e.sets.forEach((s, i) => {
            setIdx++;
            const at = new Date(start.getTime() + (dur * 1000 * setIdx) / (totalSets + 1));
            db.prepare('INSERT INTO sets (workout_exercise_id, position, set_type, weight, reps, rpe, completed, completed_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
              .run(weId, i, s.set_type === 'warmup' ? 'warmup' : 'working',
                numOrNull(s.weight, 0, 2000), s.reps != null ? Math.min(1000, Math.max(0, Math.round(s.reps))) : null,
                numOrNull(s.rpe, 1, 10), localISO(at));
          });
        });
        imported++;
      }
      return { imported, skipped, exercises_created: created };
    });
    await flush();
    return result;
  },

  // Backup container v2 (.ironlog): SQLite db + all progress photos in one file.
  // Legacy raw .db files (v1 backups) still import.
  backup: {
    export: async (): Promise<Blob> => {
      await ok();
      await flush();
      const db = exportBytes();
      const rows = getDb().prepare('SELECT blob_key FROM progress_photos ORDER BY id').all();
      const photos: { key: string; size: number; type: string }[] = [];
      const parts: BlobPart[] = [];
      for (const r of rows) {
        const b = await photoStore.get(r.blob_key as string);
        if (!b) continue; // metadata without blob — skip rather than fail
        photos.push({ key: r.blob_key as string, size: b.size, type: b.type || 'image/jpeg' });
        parts.push(b);
      }
      const index = new TextEncoder().encode(JSON.stringify({ version: 2, db_len: db.length, photos }));
      const head = new Uint8Array(12);
      head.set(new TextEncoder().encode('IRONLOG2'), 0);
      new DataView(head.buffer).setUint32(8, index.length, true);
      return new Blob([head, index, db as BlobPart, ...parts], { type: 'application/octet-stream' });
    },
    import: async (input: Blob | Uint8Array) => {
      await ok();
      const blob = input instanceof Uint8Array ? new Blob([input as BlobPart]) : input;
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const magic = new TextDecoder().decode(head.slice(0, 8));
      if (magic === 'IRONLOG2') {
        const indexLen = new DataView(head.buffer).getUint32(8, true);
        if (indexLen > 10_000_000) throw new UserError('Not an Ironlog backup file');
        let index: any;
        try { index = JSON.parse(new TextDecoder().decode(await blob.slice(12, 12 + indexLen).arrayBuffer())); }
        catch { throw new UserError('Not an Ironlog backup file'); }
        const dbStart = 12 + indexLen;
        const dbBytes = new Uint8Array(await blob.slice(dbStart, dbStart + index.db_len).arrayBuffer());
        await importBytes(dbBytes); // validates it's an Ironlog SQLite db
        migrate(); // backups from older versions gain new tables/columns
        await photoStore.clear();
        let offset = dbStart + index.db_len;
        for (const p of index.photos || []) {
          const b = blob.slice(offset, offset + p.size, p.type);
          await photoStore.put(p.key, b);
          offset += p.size;
        }
        return { ok: true, photos: (index.photos || []).length };
      }
      // legacy: raw SQLite file
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await importBytes(bytes);
      migrate(); // older schema gains new tables/columns
      await photoStore.clear(); // legacy backups carry no photos
      getDb().exec('DELETE FROM progress_photos'); // keep metadata consistent with empty blob store
      return { ok: true, photos: 0 };
    },

    // Automatic off-device backup to a private GitHub repo the user owns.
    // Same on-device token model as Garmin sync (settings table, never leaves
    // the device except in user-made backups). This is what protects data
    // against a lost phone without the user remembering to export a file.
    cloud: {
      config: async () => {
        await ok();
        return {
          repo: getSetting('backup_repo', ''),
          has_token: !!getSetting('backup_token', ''),
          last_backup_at: getSetting('backup_at', '') || null,
        };
      },
      configure: async (repo: string, token: string) => {
        await ok();
        const r = String(repo || '').trim();
        const t = String(token || '').trim();
        if (r && !BACKUP_REPO_RE.test(r)) throw new UserError('Repo must look like owner/repo');
        setSetting('backup_repo', r);
        if (t || !r) setSetting('backup_token', t); // blank token keeps the stored one; clearing repo clears all
        if (!r) setSetting('backup_at', '');
        await flush();
        return { repo: r, has_token: !!getSetting('backup_token', '') };
      },
      now: async (force = false, fetchFn?: typeof fetch): Promise<{ state: 'unconfigured' | 'skipped' | 'ok' | 'error'; bytes?: number; at?: string; message?: string }> => {
        await ok();
        const repo = getSetting('backup_repo', '');
        const token = getSetting('backup_token', '');
        if (!repo || !token) return { state: 'unconfigured' };
        const last = getSetting('backup_at', '');
        if (!force && last && Date.now() - new Date(last).getTime() < 6 * 3600 * 1000) return { state: 'skipped' };
        try {
          const blob = await api.backup.export();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          await pushBackup(repo, token, bytes, fetchFn ?? fetch);
          const at = localISO();
          setSetting('backup_at', at);
          await flush();
          return { state: 'ok', bytes: bytes.length, at };
        } catch (e: any) {
          return { state: 'error', message: e?.message || 'Backup failed' };
        }
      },
      restore: async (fetchFn?: typeof fetch) => {
        await ok();
        const repo = getSetting('backup_repo', '');
        const token = getSetting('backup_token', '');
        if (!repo || !token) throw new UserError('Set up cloud backup first');
        const bytes = await pullBackup(repo, token, fetchFn ?? fetch);
        await api.backup.import(bytes);
        return { ok: true };
      },
    },
  },
};
