// Nutrition engine — TDEE/macros, diary aggregation, streaks, insights, report
// blocks. Pure functions over the on-device DB, in the style of stats.ts.
import { getDb } from './sqlite';
import { ACTIVITY_LEVELS } from './schema';
import { addDays, todayISO } from './dates';

const ACT_MULT: Record<string, number> = Object.fromEntries(ACTIVITY_LEVELS.map(([k, , m]) => [k, m]));

export type Macros = { kcal: number; protein: number; carbs: number; fat: number; fibre: number; sugar: number; sodium: number };
export type Targets = { calories: number; protein: number; carbs: number; fat: number };

const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sugar: 0, sodium: 0 };

// A logged entry (or recipe item) stores nutrition PER ONE SERVING; multiply by
// quantity to get the amount actually consumed.
export function scale(row: { kcal: number; protein: number; carbs: number; fat: number; fibre: number | null; sugar: number | null; sodium: number | null }, quantity: number): Macros {
  const q = quantity || 0;
  return {
    kcal: (row.kcal || 0) * q,
    protein: (row.protein || 0) * q,
    carbs: (row.carbs || 0) * q,
    fat: (row.fat || 0) * q,
    fibre: (row.fibre || 0) * q,
    sugar: (row.sugar || 0) * q,
    sodium: (row.sodium || 0) * q,
  };
}
export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat, fibre: a.fibre + b.fibre, sugar: a.sugar + b.sugar, sodium: a.sodium + b.sodium,
  };
}
export function roundMacros(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs),
    fat: Math.round(m.fat), fibre: Math.round(m.fibre * 10) / 10, sugar: Math.round(m.sugar * 10) / 10, sodium: Math.round(m.sodium),
  };
}

// ── Mifflin-St Jeor BMR → activity → goal-adjusted calories + macro split ─────
export function computeTargets(p: { sex?: string | null; age?: number | null; height_cm?: number | null; weight_kg?: number | null; activity?: string | null; goal_type?: string | null }): Targets | null {
  const { sex, age, height_cm, weight_kg } = p;
  if (!sex || !age || !height_cm || !weight_kg) return null;
  if (age < 13 || age > 100 || height_cm < 100 || height_cm > 230 || weight_kg < 30 || weight_kg > 400) return null;
  const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + (sex === 'male' ? 5 : -161);
  const mult = ACT_MULT[p.activity || 'moderate'] ?? 1.55;
  const goal = p.goal_type || 'maintain';
  let cals = bmr * mult;
  if (goal === 'lose') cals -= 500;        // ~0.45 kg/week deficit
  else if (goal === 'gain') cals += 350;   // lean surplus
  const calories = Math.max(1200, Math.round(cals / 10) * 10);
  const proteinPerKg = goal === 'lose' ? 2.2 : goal === 'performance' ? 2.0 : 1.8;
  const fatPct = goal === 'gain' ? 0.25 : 0.28;
  const protein = Math.round(proteinPerKg * weight_kg);
  const fat = Math.round((calories * fatPct) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

// ── Diary aggregation ─────────────────────────────────────────────────────────
export function dayEntries(date: string) {
  return getDb().prepare('SELECT * FROM nutrition_entries WHERE date = ? ORDER BY meal_type, position, id').all(date) as any[];
}
export function dayTotals(date: string): Macros {
  let t = { ...EMPTY };
  for (const e of dayEntries(date)) t = addMacros(t, scale(e, e.quantity));
  return t;
}
// Calories burned from Garmin activities on a date (used for the eat-back toggle / context).
export function burnedOn(date: string): number {
  const row = getDb().prepare("SELECT COALESCE(SUM(calories), 0) AS c FROM garmin_activities WHERE substr(started_at, 1, 10) = ?").get(date);
  return Math.round((row?.c as number) || 0);
}
export function weightOn(date: string): number | null {
  const row = getDb().prepare('SELECT weight FROM body_weight WHERE date <= ? ORDER BY date DESC LIMIT 1').get(date);
  return row ? (row.weight as number) : null;
}

// Distinct recently-logged foods (most-recent first) — the fast-logging backbone.
export function recentFoods(limit = 25) {
  return getDb().prepare(`
    SELECT f.* FROM foods f
    JOIN (SELECT food_id, MAX(logged_at) AS last FROM nutrition_entries WHERE food_id IS NOT NULL GROUP BY food_id) r
      ON r.food_id = f.id
    WHERE f.archived = 0
    ORDER BY r.last DESC LIMIT ?
  `).all(limit) as any[];
}

// Consecutive days ending today (or yesterday) that have at least one diary entry.
export function loggingStreak(): number {
  const days = new Set((getDb().prepare('SELECT DISTINCT date FROM nutrition_entries').all() as any[]).map((r) => r.date as string));
  if (days.size === 0) return 0;
  let cursor = todayISO();
  if (!days.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (days.has(cursor)) { streak += 1; cursor = addDays(cursor, -1); }
  return streak;
}

export function goalRow(): any | null {
  return getDb().prepare('SELECT * FROM nutrition_goals WHERE id = 1').get() || null;
}

// ── Period aggregation for reports ────────────────────────────────────────────
export function nutritionPeriod(startISO: string, endISO: string) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM nutrition_entries WHERE date >= ? AND date < ?').all(startISO, endISO) as any[];
  const byDay = new Map<string, Macros>();
  for (const e of rows) byDay.set(e.date, addMacros(byDay.get(e.date) || { ...EMPTY }, scale(e, e.quantity)));
  const days = [...byDay.values()];
  const n = days.length;
  const goal = goalRow();
  const proteinTarget = goal?.protein || null;
  const proteinHitDays = proteinTarget ? days.filter((d) => d.protein >= proteinTarget * 0.9).length : 0;
  const sum = days.reduce((a, d) => addMacros(a, d), { ...EMPTY });
  const bw = db.prepare('SELECT date, weight FROM body_weight WHERE date >= ? AND date < ? ORDER BY date').all(startISO, endISO) as any[];
  const weightChange = bw.length >= 2 ? Math.round((bw[bw.length - 1].weight - bw[0].weight) * 10) / 10 : null;
  return {
    days_logged: n,
    avg_calories: n ? Math.round(sum.kcal / n) : null,
    avg_protein: n ? Math.round(sum.protein / n) : null,
    avg_carbs: n ? Math.round(sum.carbs / n) : null,
    avg_fat: n ? Math.round(sum.fat / n) : null,
    protein_target: proteinTarget,
    protein_hit_days: proteinHitDays,
    calorie_target: goal?.calories || null,
    weight_change: weightChange,
    weight_start: bw.length ? bw[0].weight : null,
    weight_end: bw.length ? bw[bw.length - 1].weight : null,
  };
}

// ── Smart insights — helpful, practical, non-judgemental ──────────────────────
export type Insight = { icon: string; text: string; tone: 'good' | 'info' | 'warn' };

export function insights(): Insight[] {
  const db = getDb();
  const out: Insight[] = [];
  const today = todayISO();
  const goal = goalRow();

  // last 7 & 14 days of daily totals
  const since14 = addDays(today, -13);
  const rows = db.prepare('SELECT * FROM nutrition_entries WHERE date >= ?').all(since14) as any[];
  const byDay = new Map<string, Macros>();
  for (const e of rows) byDay.set(e.date, addMacros(byDay.get(e.date) || { ...EMPTY }, scale(e, e.quantity)));
  const last7Days: { date: string; m: Macros }[] = [];
  for (let i = 6; i >= 0; i--) { const d = addDays(today, -i); if (byDay.has(d)) last7Days.push({ date: d, m: byDay.get(d)! }); }

  // 1) protein consistency vs goal
  if (goal?.protein && last7Days.length >= 3) {
    const hit = last7Days.filter((d) => d.m.protein >= goal.protein * 0.9).length;
    out.push({ icon: '🥩', tone: hit >= 5 ? 'good' : 'info', text: `You hit your protein goal ${hit}/${last7Days.length} logged days this week.` });
  }
  // 2) average calories vs target
  if (goal?.calories && last7Days.length >= 3) {
    const avg = Math.round(last7Days.reduce((a, d) => a + d.m.kcal, 0) / last7Days.length);
    const diff = avg - goal.calories;
    const pct = Math.round((Math.abs(diff) / goal.calories) * 100);
    if (pct <= 7) out.push({ icon: '🎯', tone: 'good', text: `Calories averaged ${avg} — right on your ${goal.calories} target.` });
    else out.push({ icon: '📊', tone: 'info', text: `Calories averaged ${avg}, ${diff > 0 ? 'above' : 'below'} your ${goal.calories} target by ${Math.abs(diff)}/day.` });
  }
  // 3) weekend vs weekday calories
  {
    const wk: number[] = [], we: number[] = [];
    for (const [date, m] of byDay) {
      const dow = new Date(date + 'T00:00:00').getDay(); // 0 Sun, 6 Sat
      (dow === 0 || dow === 6 ? we : wk).push(m.kcal);
    }
    if (wk.length >= 3 && we.length >= 1) {
      const avgWk = wk.reduce((a, b) => a + b, 0) / wk.length;
      const avgWe = we.reduce((a, b) => a + b, 0) / we.length;
      if (avgWk > 0) {
        const pct = Math.round(((avgWe - avgWk) / avgWk) * 100);
        if (pct >= 12) out.push({ icon: '📅', tone: 'info', text: `Calories run about ${pct}% higher at weekends than on weekdays.` });
      }
    }
  }
  // 4) weight trend over the last 3 weeks
  {
    const since = addDays(today, -21);
    const bw = db.prepare('SELECT date, weight FROM body_weight WHERE date >= ? ORDER BY date').all(since) as any[];
    if (bw.length >= 3) {
      const change = bw[bw.length - 1].weight - bw[0].weight;
      const abs = Math.abs(change);
      if (abs < 0.5) out.push({ icon: '⚖️', tone: 'info', text: `Weight has been stable (±${abs.toFixed(1)}) for about 3 weeks.` });
      else out.push({ icon: change < 0 ? '📉' : '📈', tone: 'info', text: `Weight is trending ${change < 0 ? 'down' : 'up'} ${abs.toFixed(1)} over 3 weeks.` });
    }
  }
  // 5) protein on training days vs rest days (training ↔ food connection)
  {
    const since = addDays(today, -27);
    const trainDays = new Set((db.prepare("SELECT DISTINCT substr(started_at,1,10) AS d FROM workouts WHERE ended_at IS NOT NULL AND substr(started_at,1,10) >= ?").all(since) as any[]).map((r) => r.d as string));
    const onT: number[] = [], offT: number[] = [];
    for (let i = 0; i < 28; i++) {
      const d = addDays(today, -i);
      if (!byDay.has(d)) continue;
      (trainDays.has(d) ? onT : offT).push(byDay.get(d)!.protein);
    }
    if (onT.length >= 2 && offT.length >= 2) {
      const a = Math.round(onT.reduce((x, y) => x + y, 0) / onT.length);
      const b = Math.round(offT.reduce((x, y) => x + y, 0) / offT.length);
      if (Math.abs(a - b) >= 12) out.push({ icon: '🏋️', tone: a > b ? 'good' : 'warn', text: `You average ${a}g protein on training days vs ${b}g on rest days.${a < b ? ' Fuelling training harder could help recovery.' : ''}` });
    }
  }
  // 6) recovery ↔ intake: rising training volume
  {
    const thisWk = weekVolume(today);
    const lastWk = weekVolume(addDays(today, -7));
    if (lastWk > 0 && thisWk > lastWk * 1.2 && last7Days.length >= 2) {
      out.push({ icon: '🔥', tone: 'warn', text: `Training volume jumped ${Math.round(((thisWk - lastWk) / lastWk) * 100)}% this week — make sure calories and protein keep up with recovery.` });
    }
  }
  return out;
}

function weekVolume(anyDay: string): number {
  const d = new Date(anyDay + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const end = addDays(start, 7);
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(s.weight * s.reps), 0) AS v FROM sets s
    JOIN workout_exercises we ON we.id = s.workout_exercise_id
    JOIN workouts w ON w.id = we.workout_id
    WHERE s.completed = 1 AND s.set_type != 'warmup' AND w.ended_at IS NOT NULL
      AND substr(w.started_at,1,10) >= ? AND substr(w.started_at,1,10) < ?
  `).get(start, end);
  return (row?.v as number) || 0;
}
