// Weekly/monthly reports. Ported from the Node server with local-time fixes.
import { getDb } from './sqlite';
import { getSetting } from './schema';
import * as stats from './stats';
import { addDays, isoWeekStart, todayISO } from './dates';

function periodReport(startISO: string, endISO: string, label: string) {
  const db = getDb();
  const workouts = db.prepare(`
    SELECT id, name, started_at, ended_at, template_id FROM workouts
    WHERE ended_at IS NOT NULL AND substr(started_at, 1, 10) >= ? AND substr(started_at, 1, 10) < ?
    ORDER BY started_at
  `).all(startISO, endISO);

  let totalSets = 0, totalVolume = 0;
  const byExercise = new Map<number, any>();
  for (const s of stats.allWorkingSets()) {
    if (s.day < startISO || s.day >= endISO) continue;
    totalSets += 1;
    totalVolume += s.weight * s.reps;
    let ex = byExercise.get(s.exercise_id);
    if (!ex) { ex = { exercise_id: s.exercise_id, name: s.exercise_name, volume: 0, sets: 0, best: 0, bestReps: 0 }; byExercise.set(s.exercise_id, ex); }
    ex.volume += s.weight * s.reps;
    ex.sets += 1;
    if (s.weight > ex.best) { ex.best = s.weight; ex.bestReps = s.reps; }
  }
  const topLifts = [...byExercise.values()].sort((a, b) => b.volume - a.volume).slice(0, 5)
    .map((x) => ({ ...x, volume: Math.round(x.volume) }));

  const prs = stats.prEventsBetween(startISO, endISO);

  const scheduled = db.prepare('SELECT id, name, day_of_week FROM templates WHERE archived = 0 AND day_of_week IS NOT NULL').all();
  const missed: { date: string; template: string }[] = [];
  let scheduledCount = 0;
  const today = todayISO();
  for (let d = startISO; d < endISO && d < today; d = addDays(d, 1)) {
    const dow = (new Date(d + 'T00:00:00').getDay() + 6) % 7; // 0=Mon
    for (const t of scheduled) {
      if (t.day_of_week !== dow) continue;
      scheduledCount += 1;
      const week = isoWeekStart(d);
      const done = workouts.some((w) => w.template_id === t.id && isoWeekStart(String(w.started_at).slice(0, 10)) === week);
      if (!done) missed.push({ date: d, template: t.name });
    }
  }

  const muscle = stats.muscleVolume(startISO, endISO);
  const muscleTotal = Object.values(muscle).reduce((a, b) => a + b, 0);
  const muscleBalance = Object.entries(muscle)
    .map(([m, v]) => ({ muscle: m, volume: Math.round(v), pct: muscleTotal ? Math.round((v / muscleTotal) * 100) : 0 }))
    .sort((a, b) => b.volume - a.volume);

  const daily = db.prepare('SELECT * FROM garmin_daily WHERE date >= ? AND date < ? ORDER BY date').all(startISO, endISO);
  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  const sleepRows = daily.filter((d) => d.sleep_seconds);
  const recovery = daily.length ? {
    days: daily.length,
    avg_sleep_h: sleepRows.length ? Math.round((sleepRows.reduce((a, d) => a + d.sleep_seconds, 0) / sleepRows.length / 3600) * 10) / 10 : null,
    avg_sleep_score: avg(daily.map((d) => d.sleep_score).filter((x) => x != null)),
    avg_resting_hr: avg(daily.map((d) => d.resting_hr).filter((x) => x != null)),
    avg_stress: avg(daily.map((d) => d.stress).filter((x) => x != null)),
    avg_body_battery: avg(daily.map((d) => d.body_battery).filter((x) => x != null)),
    avg_steps: avg(daily.map((d) => d.steps).filter((x) => x != null)),
  } : null;

  const garminActivities = db.prepare('SELECT COUNT(*) AS n FROM garmin_activities WHERE substr(started_at, 1, 10) >= ? AND substr(started_at, 1, 10) < ?').get(startISO, endISO)!.n as number;

  // running block
  const runs = db.prepare("SELECT * FROM garmin_activities WHERE activity_type = 'running' AND substr(started_at, 1, 10) >= ? AND substr(started_at, 1, 10) < ? ORDER BY started_at").all(startISO, endISO);
  const runDist = runs.reduce((a, r) => a + (r.distance_m || 0), 0);
  const runDur = runs.filter((r) => r.distance_m && r.duration_s).reduce((a, r) => a + (r.duration_s as number), 0);
  const runDistForPace = runs.filter((r) => r.distance_m && r.duration_s).reduce((a, r) => a + (r.distance_m as number), 0);
  const runHrs = runs.map((r) => r.avg_hr).filter((x) => x != null) as number[];
  const running = runs.length ? {
    runs: runs.length,
    distance_m: Math.round(runDist),
    duration_s: runs.reduce((a, r) => a + (r.duration_s || 0), 0),
    avg_pace_s_per_km: runDistForPace > 0 ? Math.round(runDur / (runDistForPace / 1000)) : null,
    avg_hr: runHrs.length ? Math.round(runHrs.reduce((a, b) => a + b, 0) / runHrs.length) : null,
    longest_m: Math.max(0, ...runs.map((r) => (r.distance_m as number) || 0)) || null,
  } : null;

  const notes: string[] = [];
  if (recovery) {
    if (recovery.avg_sleep_h != null && recovery.avg_sleep_h < 7) notes.push(`Average sleep was ${recovery.avg_sleep_h}h — under the 7h floor. Recovery is likely limiting performance.`);
    if (recovery.avg_sleep_h != null && recovery.avg_sleep_h >= 7.5) notes.push(`Sleep averaged ${recovery.avg_sleep_h}h — solid recovery base.`);
    if (recovery.avg_stress != null && recovery.avg_stress > 40) notes.push(`Average stress ${recovery.avg_stress} is elevated; consider spacing hard sessions.`);
    if (recovery.avg_body_battery != null && recovery.avg_body_battery < 50) notes.push(`Body Battery averaged ${recovery.avg_body_battery} — plan training earlier in the day or add a rest day.`);
    if (recovery.avg_resting_hr != null) notes.push(`Resting HR averaged ${recovery.avg_resting_hr} bpm.`);
  }

  const weeklyGoal = Number(getSetting('weekly_goal', '3'));
  const periodDays = Math.round((new Date(endISO + 'T00:00:00').getTime() - new Date(startISO + 'T00:00:00').getTime()) / 86400000);
  const goalForPeriod = Math.round((weeklyGoal * periodDays) / 7);

  const suggestions: string[] = [];
  if (workouts.length < goalForPeriod) suggestions.push(`You completed ${workouts.length}/${goalForPeriod} target sessions. Lock the next period's sessions in the calendar first, then fit life around them.`);
  else suggestions.push(`Session target hit (${workouts.length}/${goalForPeriod}). Keep the same schedule.`);
  if (muscleBalance.length > 0) {
    const weakest = [...muscleBalance].sort((a, b) => a.volume - b.volume).slice(0, 2).filter((m) => m.pct < 8);
    if (weakest.length) suggestions.push(`Lagging volume: ${weakest.map((m) => m.muscle).join(', ')}. Add 3–5 direct sets each next period.`);
  }
  if (prs.length === 0 && workouts.length >= 3) suggestions.push('No PRs this period. If this repeats next period, reduce weight 10% for a week (deload) and rebuild.');
  if (missed.length > 0) suggestions.push(`${missed.length} scheduled session${missed.length > 1 ? 's' : ''} missed. If a slot keeps failing, move it — don't keep missing it.`);

  return {
    label,
    start: startISO,
    end: endISO,
    workouts: workouts.map((w) => ({ id: w.id, name: w.name, date: String(w.started_at).slice(0, 10) })),
    workouts_completed: workouts.length,
    scheduled_count: scheduledCount,
    missed,
    total_sets: totalSets,
    total_volume: Math.round(totalVolume),
    top_lifts: topLifts,
    prs,
    muscle_balance: muscleBalance,
    recovery,
    recovery_notes: notes,
    garmin_activities: garminActivities,
    running,
    suggestions,
  };
}

export function weeklyReport(anyDayISO?: string | null) {
  const start = isoWeekStart(anyDayISO || todayISO());
  const end = addDays(start, 7);
  return periodReport(start, end, `Week of ${start}`);
}

export function monthlyReport(yyyymm?: string | null) {
  const m = yyyymm || todayISO().slice(0, 7);
  const start = m + '-01';
  const d = new Date(start + 'T00:00:00');
  d.setMonth(d.getMonth() + 1);
  const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  return periodReport(start, end, m);
}
