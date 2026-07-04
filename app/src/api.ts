// Ironlog data API — runs entirely on-device (SQLite WASM + IndexedDB).
// Same surface as the old HTTP client, so screens are unchanged.
import { initDb, getDb, withTx, exportBytes, importBytes, flush, type Storage } from './db/sqlite';
import { migrate, getSetting, setSetting, allSettings, MUSCLES, EQUIPMENT } from './db/schema';
import * as stats from './db/stats';
import * as reportsMod from './db/reports';
import { suggestions as suggestionsFn } from './db/suggestions';
import * as garminMod from './db/garmin';
import { seed as seedDemo } from './db/seed-demo';
import { localISO, localDate } from './db/dates';

// ---------- types (unchanged) ----------
export type Exercise = {
  id: number; name: string; muscle: string; secondary: string;
  equipment: string; is_custom: number; archived: number;
};
export type SetRow = {
  id: number; workout_exercise_id: number; position: number;
  set_type: 'warmup' | 'working' | 'dropset' | 'failure';
  weight: number | null; reps: number | null; rpe: number | null;
  completed: number; completed_at: string | null;
};
export type WorkoutExercise = {
  id: number; workout_id: number; exercise_id: number; position: number;
  superset_group: number | null; rest_seconds: number; notes: string;
  exercise_name: string; muscle: string; equipment: string;
  sets: SetRow[]; previous: { set_type: string; weight: number; reps: number; rpe: number | null }[];
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
  exercise_name: string; muscle: string; equipment: string;
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
  duration_s: number | null; calories: number | null; avg_hr: number | null;
  max_hr: number | null; training_load: number | null; source: string;
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
export type ExerciseStats = {
  trend: { day: string; e1rm: number }[];
  volume: { bucket: string; volume: number; sets: number }[];
  history: { workout_id: number; started_at: string; set_type: string; weight: number; reps: number; rpe: number | null }[];
  pr: PRRow | null;
  last_sets: { set_type: string; weight: number; reps: number; rpe: number | null }[];
};

// ---------- init ----------
let ready: Promise<void> | null = null;
export function initData(opts?: { storage?: Storage; wasmUrl?: string }): Promise<void> {
  if (!ready) {
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
    SELECT we.*, e.name AS exercise_name, e.muscle, e.equipment
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
    SELECT te.*, e.name AS exercise_name, e.muscle, e.equipment
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
      const info = getDb().prepare('INSERT INTO exercises (name, muscle, secondary, equipment, is_custom) VALUES (?, ?, ?, ?, 1)')
        .run(name, e.muscle || 'other', e.secondary || '', e.equipment || 'other');
      return getDb().prepare('SELECT * FROM exercises WHERE id = ?').get(info.lastInsertRowid) as Exercise;
    },
    update: async (id: number, e: Partial<Exercise>): Promise<Exercise> => {
      await ok();
      if (e.name !== undefined) {
        const name = reqName(e.name, 'Exercise');
        const dup = getDb().prepare('SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id);
        if (dup) throw new UserError(`“${name}” already exists in your library`);
      }
      getDb().prepare('UPDATE exercises SET name = COALESCE(?, name), muscle = COALESCE(?, muscle), secondary = COALESCE(?, secondary), equipment = COALESCE(?, equipment) WHERE id = ?')
        .run(e.name != null ? String(e.name).trim() : null, e.muscle ?? null, e.secondary ?? null, e.equipment ?? null, id);
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
        SELECT w.id AS workout_id, w.started_at, s.set_type, s.weight, s.reps, s.rpe
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
      const sid = db.prepare('INSERT INTO sets (workout_exercise_id, position, set_type, weight, reps) VALUES (?, ?, ?, ?, ?)')
        .run(id, pos, last ? (last.set_type === 'warmup' ? 'working' : last.set_type) : 'working', last ? last.weight : null, last ? last.reps : null).lastInsertRowid;
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
      db.prepare('UPDATE sets SET set_type = COALESCE(?, set_type), weight = ?, reps = ?, rpe = ?, completed = ?, completed_at = ? WHERE id = ?')
        .run(setType,
          body.weight !== undefined ? numOrNull(body.weight, 0, 2000) : cur.weight,
          body.reps !== undefined ? (numOrNull(body.reps, 0, 1000) != null ? Math.round(numOrNull(body.reps, 0, 1000)!) : null) : cur.reps,
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
    weekly: async (date?: string) => { await ok(); return reportsMod.weeklyReport(date); },
    monthly: async (month?: string) => { await ok(); return reportsMod.monthlyReport(month); },
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
  },

  demoSeed: async () => { await ok(); const r = seedDemo(); await flush(); return r; },

  backup: {
    export: async (): Promise<Uint8Array> => { await ok(); await flush(); return exportBytes(); },
    import: async (bytes: Uint8Array) => { await ok(); await importBytes(bytes); return { ok: true }; },
  },
};
