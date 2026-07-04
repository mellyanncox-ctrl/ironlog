// Local training heuristics. Ported from the Node server; weight increments
// now respect the user's display units (2.5 kg vs 5 lb plates).
import { getDb } from './sqlite';
import { getSetting, MUSCLES } from './schema';
import * as stats from './stats';
import { daysAgo } from './dates';

function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  values.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
  return den ? num / den : 0;
}

const LB = 2.2046226;

export function suggestions() {
  const out: any = { improving: [], stalled: [], neglected: [], fatigue: [], deload: null, next_weights: [] };
  const since = daysAgo(56);
  const units = getSetting('units', 'kg');

  const byExercise = new Map<number, { name: string; sets: stats.WS[] }>();
  for (const s of stats.allWorkingSets()) {
    if (s.day < since) continue;
    let g = byExercise.get(s.exercise_id);
    if (!g) { g = { name: s.exercise_name, sets: [] }; byExercise.set(s.exercise_id, g); }
    g.sets.push(s);
  }

  let regressing = 0;
  for (const [exId, g] of byExercise) {
    const trend = stats.e1rmTrend(exId, since);
    if (trend.length < 3) continue;
    const vals = trend.map((t) => t.e1rm);
    const s = slope(vals);
    const rel = s / vals[vals.length - 1];
    if (rel > 0.004) {
      out.improving.push({ exercise_id: exId, name: g.name, sessions: trend.length, change: Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10 });
    } else if (Math.abs(rel) <= 0.004 && trend.length >= 3) {
      out.stalled.push({ exercise_id: exId, name: g.name, sessions: trend.length, e1rm: vals[vals.length - 1], hint: 'Same est. 1RM for 3+ sessions — change rep range, add a back-off set, or swap variation.' });
    } else if (rel < -0.004) {
      regressing += 1;
    }
  }

  const mv = stats.muscleVolume(daysAgo(28));
  const vols = Object.values(mv);
  if (vols.length >= 3) {
    const sorted = [...vols].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const m of MUSCLES) {
      const v = mv[m] || 0;
      if (v < median * 0.25) out.neglected.push({ muscle: m, volume: Math.round(v), hint: 'Under 25% of your median group volume in the last 4 weeks.' });
    }
  }

  const recent = stats.allWorkingSets().filter((s) => s.day >= daysAgo(14) && s.rpe != null);
  if (recent.length >= 8) {
    const avgRpe = recent.reduce((a, s) => a + (s.rpe as number), 0) / recent.length;
    const hardDays = new Set(recent.filter((s) => (s.rpe as number) >= 9).map((s) => s.day));
    if (avgRpe >= 8.5) out.fatigue.push({ kind: 'avg_rpe', value: Math.round(avgRpe * 10) / 10, hint: `Average RPE ${avgRpe.toFixed(1)} over 2 weeks — you're living too close to failure. Leave 1–2 reps in reserve on most sets.` });
    if (hardDays.size >= 4) out.fatigue.push({ kind: 'hard_days', value: hardDays.size, hint: `${hardDays.size} days with RPE ≥ 9 in 2 weeks. Cap all-out days at 2/week.` });
  }

  if (regressing >= 2) {
    out.deload = { regressing_lifts: regressing, hint: `${regressing} lifts trending down. Take a deload week: same movements, 60–70% of normal weight, half the sets. Then rebuild.` };
  }

  for (const [exId, g] of byExercise) {
    const lastDay = g.sets[g.sets.length - 1].day;
    const lastSets = g.sets.filter((s) => s.day === lastDay);
    if (lastSets.length === 0) continue;
    const allDone = lastSets.every((s) => s.reps >= 5);
    const easy = lastSets.every((s) => s.rpe == null || s.rpe <= 8);
    const top = Math.max(...lastSets.map((s) => s.weight));
    if (top <= 0) continue;
    const ex = getDb().prepare('SELECT equipment FROM exercises WHERE id = ?').get(exId);
    const small = ex && ['dumbbell', 'cable', 'machine'].includes(ex.equipment as string);
    // increment in the user's units so suggestions land on real plate/pin jumps
    const inc = units === 'lb' ? (small ? 5 / LB : 5 / LB) : (small ? 2 : 2.5);
    if (allDone && easy) {
      const suggestedKg = top + inc;
      // round to a clean number in display units
      const rounded = units === 'lb' ? Math.round(suggestedKg * LB / 2.5) * 2.5 / LB : Math.round(suggestedKg * 2) / 2;
      out.next_weights.push({ exercise_id: exId, name: g.name, last: top, suggested: rounded, reason: `All sets completed${lastSets.some((s) => s.rpe != null) ? ' at RPE ≤ 8' : ''} last session.` });
    } else {
      out.next_weights.push({ exercise_id: exId, name: g.name, last: top, suggested: top, reason: 'Repeat this weight — earn the jump by finishing all sets first.' });
    }
  }
  out.next_weights.sort((a: any, b: any) => b.last - a.last);
  out.next_weights = out.next_weights.slice(0, 10);

  return out;
}
