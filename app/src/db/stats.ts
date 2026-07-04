// PRs, e1RM, volume, streaks. Ported from the Node server with local-time date fixes.
import { getDb } from './sqlite';
import { bucketOf, isoWeekStart, todayISO, addDays } from './dates';

export function e1rm(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || reps < 1) return null;
  if (reps === 1) return weight;
  if (reps > 12) return null;
  return weight * (1 + reps / 30);
}

const WORKING_SETS_SQL = `
  SELECT s.id, s.weight, s.reps, s.rpe, s.set_type, s.position,
         we.exercise_id, e.name AS exercise_name, e.muscle, e.secondary,
         w.id AS workout_id, w.started_at, substr(w.started_at, 1, 10) AS day
  FROM sets s
  JOIN workout_exercises we ON we.id = s.workout_exercise_id
  JOIN workouts w ON w.id = we.workout_id
  JOIN exercises e ON e.id = we.exercise_id
  WHERE s.completed = 1 AND s.weight IS NOT NULL AND s.reps IS NOT NULL
    AND s.set_type != 'warmup' AND w.ended_at IS NOT NULL
  ORDER BY w.started_at ASC, we.position ASC, s.position ASC
`;
export type WS = { id: number; weight: number; reps: number; rpe: number | null; set_type: string; position: number; exercise_id: number; exercise_name: string; muscle: string; secondary: string; workout_id: number; started_at: string; day: string };
export function allWorkingSets(): WS[] { return getDb().prepare(WORKING_SETS_SQL).all() as WS[]; }

export function computePRs() {
  const best = new Map<number, { name: string; maxWeight: number; bestE1rm: number; maxReps: number }>();
  const events: any[] = [];
  for (const s of allWorkingSets()) {
    let b = best.get(s.exercise_id);
    if (!b) { b = { name: s.exercise_name, maxWeight: 0, bestE1rm: 0, maxReps: 0 }; best.set(s.exercise_id, b); }
    const est = e1rm(s.weight, s.reps);
    if (s.weight > b.maxWeight) {
      b.maxWeight = s.weight;
      events.push({ exercise_id: s.exercise_id, exercise_name: s.exercise_name, kind: 'weight', value: s.weight, weight: s.weight, reps: s.reps, day: s.day, workout_id: s.workout_id, set_id: s.id });
    }
    if (est && est > b.bestE1rm + 1e-9) {
      b.bestE1rm = est;
      events.push({ exercise_id: s.exercise_id, exercise_name: s.exercise_name, kind: 'e1rm', value: Math.round(est * 10) / 10, weight: s.weight, reps: s.reps, day: s.day, workout_id: s.workout_id, set_id: s.id });
    }
    if (s.reps > b.maxReps) b.maxReps = s.reps;
  }
  return { best, events };
}

export function prSummary() {
  const { best, events } = computePRs();
  const latest = new Map<number, any>();
  for (const ev of events) {
    let l = latest.get(ev.exercise_id);
    if (!l) { l = {}; latest.set(ev.exercise_id, l); }
    if (ev.kind === 'weight') l.weightPR = ev;
    if (ev.kind === 'e1rm') l.e1rmPR = ev;
  }
  const rows: any[] = [];
  for (const [exercise_id, b] of best) {
    const l = latest.get(exercise_id) || {};
    rows.push({
      exercise_id,
      exercise_name: b.name,
      max_weight: b.maxWeight || null,
      max_weight_day: l.weightPR ? l.weightPR.day : null,
      max_weight_reps: l.weightPR ? l.weightPR.reps : null,
      best_e1rm: b.bestE1rm ? Math.round(b.bestE1rm * 10) / 10 : null,
      best_e1rm_day: l.e1rmPR ? l.e1rmPR.day : null,
      max_reps: b.maxReps || null,
    });
  }
  rows.sort((a, b) => (b.best_e1rm || 0) - (a.best_e1rm || 0));
  return rows;
}

export function prEventsBetween(startISO: string, endISO: string) {
  return computePRs().events.filter((ev) => ev.day >= startISO && ev.day < endISO);
}

export function volumeSeries({ bucket = 'week', exercise_id = null, muscle = null, since = null }: { bucket?: 'week' | 'month'; exercise_id?: number | string | null; muscle?: string | null; since?: string | null } = {}) {
  const buckets = new Map<string, { bucket: string; volume: number; sets: number }>();
  for (const s of allWorkingSets()) {
    if (since && s.day < since) continue;
    if (exercise_id && s.exercise_id !== Number(exercise_id)) continue;
    if (muscle && s.muscle !== muscle) continue;
    const key = bucketOf(s.day, bucket);
    let row = buckets.get(key);
    if (!row) { row = { bucket: key, volume: 0, sets: 0 }; buckets.set(key, row); }
    row.volume += s.weight * s.reps;
    row.sets += 1;
  }
  return [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((r) => ({ ...r, volume: Math.round(r.volume) }));
}

export function muscleVolume(sinceISO: string, untilISO = '9999'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of allWorkingSets()) {
    if (s.day < sinceISO || s.day >= untilISO) continue;
    const v = s.weight * s.reps;
    out[s.muscle] = (out[s.muscle] || 0) + v;
    for (const m of (s.secondary || '').split(',').filter(Boolean)) {
      out[m] = (out[m] || 0) + v * 0.5;
    }
  }
  return out;
}

export function e1rmTrend(exercise_id: number | string, since: string | null = null) {
  const byDay = new Map<string, number>();
  for (const s of allWorkingSets()) {
    if (s.exercise_id !== Number(exercise_id)) continue;
    if (since && s.day < since) continue;
    const est = e1rm(s.weight, s.reps);
    if (!est) continue;
    const cur = byDay.get(s.day);
    if (!cur || est > cur) byDay.set(s.day, est);
  }
  return [...byDay.entries()].map(([day, v]) => ({ day, e1rm: Math.round(v * 10) / 10 })).sort((a, b) => a.day.localeCompare(b.day));
}

export function streakWeeks(): number {
  const days = getDb().prepare("SELECT DISTINCT substr(started_at, 1, 10) AS day FROM workouts WHERE ended_at IS NOT NULL ORDER BY day DESC").all().map((r) => r.day as string);
  if (days.length === 0) return 0;
  const weeks = new Set(days.map((d) => isoWeekStart(d)));
  let streak = 0;
  let cursor = isoWeekStart(todayISO());
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export function overview() {
  const db = getDb();
  const weekStart = isoWeekStart(todayISO());
  const monthStart = todayISO().slice(0, 7) + '-01';
  const workoutsThisWeek = db.prepare("SELECT COUNT(*) AS n FROM workouts WHERE ended_at IS NOT NULL AND substr(started_at, 1, 10) >= ?").get(weekStart)!.n as number;
  let volumeThisWeek = 0, setsThisWeek = 0;
  for (const s of allWorkingSets()) {
    if (s.day >= weekStart) { volumeThisWeek += s.weight * s.reps; setsThisWeek += 1; }
  }
  const prsThisMonth = prEventsBetween(monthStart, '9999').length;
  const totalWorkouts = db.prepare('SELECT COUNT(*) AS n FROM workouts WHERE ended_at IS NOT NULL').get()!.n as number;
  return {
    streak_weeks: streakWeeks(),
    workouts_this_week: workoutsThisWeek,
    volume_this_week: Math.round(volumeThisWeek),
    sets_this_week: setsThisWeek,
    prs_this_month: prsThisMonth,
    total_workouts: totalWorkouts,
  };
}

export function lastSets(exercise_id: number | string) {
  const db = getDb();
  const row = db.prepare(`
    SELECT we.id FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.exercise_id = ? AND w.ended_at IS NOT NULL
    ORDER BY w.started_at DESC LIMIT 1
  `).get(Number(exercise_id));
  if (!row) return [];
  return db.prepare('SELECT set_type, weight, reps, rpe FROM sets WHERE workout_exercise_id = ? AND completed = 1 ORDER BY position').all(row.id);
}
