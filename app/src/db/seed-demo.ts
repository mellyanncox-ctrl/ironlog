// Sample Push/Pull/Legs routine + three weeks of logged workouts + bodyweight.
import { getDb, withTx } from './sqlite';
import { localISO, localDate } from './dates';

function exId(name: string): number {
  const r = getDb().prepare('SELECT id FROM exercises WHERE name = ?').get(name);
  if (!r) throw new Error('missing exercise: ' + name);
  return r.id as number;
}

function makeTemplate(name: string, dow: number, list: [string, number, string, number, number?][]): number {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM templates WHERE name = ? AND archived = 0').get(name);
  if (existing) return existing.id as number;
  const id = db.prepare('INSERT INTO templates (name, day_of_week) VALUES (?, ?)').run(name, dow).lastInsertRowid;
  const ins = db.prepare('INSERT INTO template_exercises (template_id, exercise_id, position, superset_group, target_sets, target_reps, rest_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)');
  list.forEach(([exName, sets, reps, rest, ss], i) => ins.run(id, exId(exName), i, ss ?? null, sets, reps, rest));
  return id;
}

type SetSpec = [string, number, number, number?];
function logWorkout(name: string, templateId: number, dayOffset: number, hour: number, exercises: [string, SetSpec[]][]) {
  const db = getDb();
  const start = new Date();
  start.setDate(start.getDate() - dayOffset);
  start.setHours(hour, 5, 0, 0);
  const end = new Date(start.getTime() + 62 * 60000);
  const wid = db.prepare('INSERT INTO workouts (name, template_id, started_at, ended_at) VALUES (?, ?, ?, ?)')
    .run(name, templateId, localISO(start), localISO(end)).lastInsertRowid;
  exercises.forEach(([exName, sets], pos) => {
    const weId = db.prepare('INSERT INTO workout_exercises (workout_id, exercise_id, position, rest_seconds) VALUES (?, ?, ?, 150)')
      .run(wid, exId(exName), pos).lastInsertRowid;
    sets.forEach(([type, kg, reps, rpe], i) => {
      db.prepare('INSERT INTO sets (workout_exercise_id, position, set_type, weight, reps, rpe, completed, completed_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
        .run(weId, i, type, kg, reps, rpe ?? null, localISO(new Date(start.getTime() + (i + 1) * 4 * 60000)));
    });
  });
  return wid;
}

export function seed() {
  return withTx(() => {
    const db = getDb();
    const already = db.prepare("SELECT COUNT(*) AS n FROM templates WHERE name IN ('Push Day','Pull Day','Leg Day') AND archived = 0").get()!.n as number;
    const push = makeTemplate('Push Day', 0, [
      ['Barbell Bench Press', 4, '5-8', 180],
      ['Overhead Press', 3, '8', 150],
      ['Incline Dumbbell Press', 3, '8-12', 120],
      ['Lateral Raise', 3, '12-15', 90, 1],
      ['Triceps Pushdown', 3, '10-12', 90, 1],
    ]);
    const pull = makeTemplate('Pull Day', 2, [
      ['Deadlift', 3, '5', 210],
      ['Pull-Up', 3, '6-10', 150],
      ['Barbell Row', 3, '8', 150],
      ['Face Pull', 3, '15', 90, 1],
      ['EZ-Bar Curl', 3, '10-12', 90, 1],
    ]);
    const legs = makeTemplate('Leg Day', 4, [
      ['Back Squat', 4, '5-8', 210],
      ['Romanian Deadlift', 3, '8-10', 150],
      ['Leg Press', 3, '10-12', 120],
      ['Leg Curl', 3, '12', 90, 1],
      ['Standing Calf Raise', 4, '12-15', 60, 1],
    ]);

    let workouts = 0;
    if (already === 0) {
      logWorkout('Push Day', push, 18, 18, [
        ['Barbell Bench Press', [['warmup', 40, 10], ['warmup', 60, 5], ['working', 77.5, 6, 8], ['working', 77.5, 6, 8.5], ['working', 77.5, 5, 9]]],
        ['Overhead Press', [['warmup', 30, 8], ['working', 45, 8, 8], ['working', 45, 8, 8.5], ['working', 45, 7, 9]]],
        ['Incline Dumbbell Press', [['working', 24, 11, 8], ['working', 24, 10, 8.5], ['working', 24, 9, 9]]],
        ['Lateral Raise', [['working', 9, 15, 8], ['working', 9, 13, 8.5], ['working', 9, 12, 9]]],
        ['Triceps Pushdown', [['working', 22.5, 12, 8], ['working', 22.5, 12, 8.5], ['working', 22.5, 10, 9]]],
      ]);
      logWorkout('Pull Day', pull, 16, 18, [
        ['Deadlift', [['warmup', 60, 5], ['warmup', 100, 3], ['working', 135, 5, 8], ['working', 135, 5, 8.5], ['working', 135, 5, 9]]],
        ['Pull-Up', [['working', 0, 7, 8], ['working', 0, 6, 9], ['working', 0, 6, 9]]],
        ['Barbell Row', [['working', 67.5, 8, 8], ['working', 67.5, 8, 8.5], ['working', 67.5, 8, 9]]],
        ['Face Pull', [['working', 20, 15, 7], ['working', 20, 14, 7.5], ['working', 20, 13, 8]]],
        ['EZ-Bar Curl', [['working', 27.5, 12, 8], ['working', 27.5, 11, 8.5], ['working', 27.5, 10, 9]]],
      ]);
      logWorkout('Leg Day', legs, 14, 18, [
        ['Back Squat', [['warmup', 40, 8], ['warmup', 70, 5], ['working', 97.5, 6, 8], ['working', 97.5, 6, 8.5], ['working', 97.5, 6, 9], ['working', 97.5, 5, 9]]],
        ['Romanian Deadlift', [['working', 85, 10, 8], ['working', 85, 9, 8.5], ['working', 85, 8, 9]]],
        ['Leg Press', [['working', 150, 12, 8], ['working', 150, 12, 8.5], ['working', 150, 11, 9]]],
        ['Leg Curl', [['working', 42.5, 12, 8], ['working', 42.5, 12, 8.5], ['working', 42.5, 12, 9]]],
        ['Standing Calf Raise', [['working', 75, 15, 8], ['working', 75, 15, 8], ['working', 75, 14, 8.5], ['working', 75, 13, 9]]],
      ]);
      logWorkout('Push Day', push, 11, 18, [
        ['Barbell Bench Press', [['warmup', 40, 10], ['warmup', 60, 5], ['working', 80, 6, 8], ['working', 80, 6, 8.5], ['working', 80, 5, 9]]],
        ['Overhead Press', [['warmup', 30, 8], ['working', 47.5, 8, 8], ['working', 47.5, 7, 9], ['working', 47.5, 6, 9]]],
        ['Incline Dumbbell Press', [['working', 26, 10, 8], ['working', 26, 9, 8.5], ['working', 26, 8, 9]]],
        ['Lateral Raise', [['working', 10, 14, 8], ['working', 10, 12, 9], ['working', 10, 12, 9]]],
        ['Triceps Pushdown', [['working', 25, 12, 8], ['working', 25, 11, 8.5], ['working', 25, 10, 9]]],
      ]);
      logWorkout('Pull Day', pull, 9, 18, [
        ['Deadlift', [['warmup', 60, 5], ['warmup', 100, 3], ['working', 140, 5, 8.5], ['working', 140, 5, 9], ['working', 140, 4, 9.5]]],
        ['Pull-Up', [['working', 0, 8, 8], ['working', 0, 7, 9], ['working', 0, 6, 9]]],
        ['Barbell Row', [['working', 70, 8, 8], ['working', 70, 8, 8.5], ['working', 70, 7, 9]]],
        ['Face Pull', [['working', 20, 15, 7], ['working', 20, 15, 7.5], ['working', 20, 14, 8]]],
        ['EZ-Bar Curl', [['working', 30, 11, 8], ['working', 30, 10, 9], ['working', 30, 9, 9]]],
      ]);
      logWorkout('Leg Day', legs, 7, 18, [
        ['Back Squat', [['warmup', 40, 8], ['warmup', 70, 5], ['working', 100, 6, 8], ['working', 100, 6, 8.5], ['working', 100, 5, 9], ['working', 100, 5, 9]]],
        ['Romanian Deadlift', [['working', 90, 9, 8], ['working', 90, 8, 8.5], ['working', 90, 8, 9]]],
        ['Leg Press', [['working', 160, 12, 8], ['working', 160, 11, 8.5], ['working', 160, 10, 9]]],
        ['Leg Curl', [['working', 45, 12, 8], ['working', 45, 12, 8.5], ['working', 45, 11, 9]]],
        ['Standing Calf Raise', [['working', 80, 15, 8], ['working', 80, 14, 8], ['working', 80, 13, 8.5], ['working', 80, 12, 9]]],
      ]);
      logWorkout('Push Day', push, 4, 18, [
        ['Barbell Bench Press', [['warmup', 40, 10], ['warmup', 60, 5], ['working', 82.5, 6, 8], ['working', 82.5, 6, 8.5], ['working', 82.5, 5, 9]]],
        ['Overhead Press', [['warmup', 30, 8], ['working', 50, 8, 8.5], ['working', 50, 7, 9], ['working', 50, 6, 9.5]]],
        ['Incline Dumbbell Press', [['working', 28, 10, 8.5], ['working', 28, 8, 9], ['working', 28, 8, 9]]],
        ['Lateral Raise', [['working', 10, 15, 8], ['working', 10, 13, 8.5], ['working', 10, 12, 9]]],
        ['Triceps Pushdown', [['working', 27.5, 12, 8.5], ['working', 27.5, 10, 9], ['working', 27.5, 9, 9]]],
      ]);
      logWorkout('Pull Day', pull, 2, 18, [
        ['Deadlift', [['warmup', 60, 5], ['warmup', 100, 3], ['working', 145, 5, 8.5], ['working', 145, 4, 9], ['working', 145, 4, 9.5]]],
        ['Pull-Up', [['working', 0, 9, 8], ['working', 0, 8, 8.5], ['working', 0, 7, 9]]],
        ['Barbell Row', [['working', 72.5, 8, 8], ['working', 72.5, 8, 8.5], ['working', 72.5, 7, 9]]],
        ['Face Pull', [['working', 22.5, 15, 7.5], ['working', 22.5, 14, 8], ['working', 22.5, 13, 8]]],
        ['EZ-Bar Curl', [['working', 32.5, 10, 8.5], ['working', 32.5, 9, 9], ['working', 32.5, 8, 9.5]]],
      ]);
      logWorkout('Leg Day', legs, 0, 10, [
        ['Back Squat', [['warmup', 40, 8], ['warmup', 70, 5], ['working', 105, 6, 8.5], ['working', 105, 5, 9], ['working', 105, 5, 9], ['working', 105, 4, 9.5]]],
        ['Romanian Deadlift', [['working', 95, 8, 8.5], ['working', 95, 8, 9], ['working', 95, 7, 9]]],
        ['Leg Press', [['working', 170, 12, 8.5], ['working', 170, 10, 9], ['working', 170, 10, 9]]],
        ['Leg Curl', [['working', 47.5, 12, 8.5], ['working', 47.5, 11, 9], ['working', 47.5, 10, 9]]],
        ['Standing Calf Raise', [['working', 85, 14, 8], ['working', 85, 13, 8.5], ['working', 85, 12, 9], ['working', 85, 12, 9]]],
      ]);
      workouts = 9;

      const bw = db.prepare('INSERT INTO body_weight (date, weight) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET weight = excluded.weight');
      for (let i = 14; i >= 0; i -= 2) {
        const d = new Date(); d.setDate(d.getDate() - i);
        bw.run(localDate(d), Math.round((78.5 - i * 0.05 + (i % 4) * 0.1) * 10) / 10);
      }

      seedNutrition(db);
    }
    return { templates: 3, workouts, note: workouts ? `Seeded PPL routine + ${workouts} workouts + bodyweight.` : 'Demo data already present — skipped.' };
  });
}

// A maintenance nutrition goal + ~12 days of a realistic diary + one saved meal,
// so the Food tab, reports, and insights are populated on "Load sample data".
function seedNutrition(db: any) {
  if ((db.prepare('SELECT COUNT(*) AS n FROM nutrition_entries').get()!.n as number) > 0) return;
  db.prepare(`INSERT INTO nutrition_goals (id, goal_type, sex, age, height_cm, activity, target_weight, calories, protein, carbs, fat, auto, add_burned, updated_at)
    VALUES (1, 'maintain', 'male', 30, 180, 'moderate', 77, 2300, 165, 230, 70, 1, 0, ?)
    ON CONFLICT(id) DO NOTHING`).run(localISO());

  const foodByName = (name: string) => db.prepare('SELECT * FROM foods WHERE name = ? LIMIT 1').get(name);
  const log = (date: string, meal: string, name: string, qty: number, hour: number) => {
    const f = foodByName(name);
    if (!f) return;
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM nutrition_entries WHERE date = ? AND meal_type = ?').get(date, meal)!.p as number;
    const at = new Date(date + 'T00:00:00'); at.setHours(hour, 0, 0, 0);
    db.prepare(`INSERT INTO nutrition_entries (date, meal_type, position, food_id, quantity, name, brand, serving_desc, kcal, protein, carbs, fat, fibre, sugar, sodium, logged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(date, meal, pos, f.id, qty, f.name, f.brand, f.serving_desc, f.kcal, f.protein, f.carbs, f.fat, f.fibre, f.sugar, f.sodium, localISO(at));
  };

  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const date = localDate(d);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    log(date, 'breakfast', 'Porridge Oats, dry', 1, 7);
    log(date, 'breakfast', 'Semi-Skimmed Milk', 1, 7);
    log(date, 'breakfast', 'Banana', 1, 7);
    log(date, 'breakfast', 'Whey Protein Powder', 1, 7);
    log(date, 'lunch', 'Chicken Breast, grilled', 2, 13);
    log(date, 'lunch', 'White Rice, cooked', 2, 13);
    log(date, 'lunch', 'Broccoli, steamed', 1, 13);
    log(date, 'dinner', 'Salmon Fillet, cooked', 1.5, 19);
    log(date, 'dinner', 'Sweet Potato, baked', 2, 19);
    log(date, 'dinner', 'Mixed Salad', 1, 19);
    log(date, 'snacks', 'Greek Yogurt, 0% fat', 1, 16);
    log(date, 'snacks', 'Almonds', 1, 16);
    if (weekend) { log(date, 'snacks', 'Milk Chocolate', 2, 21); log(date, 'dinner', 'Beer, lager', 2, 20); }
  }

  // one saved meal (recipe) — the classic breakfast smoothie
  const mid = db.prepare("INSERT INTO meals (name, note, servings, created_at) VALUES ('Breakfast smoothie', 'Post-workout go-to', 1, ?)").run(localISO()).lastInsertRowid as number;
  const items: [string, number][] = [['Banana', 1], ['Whey Protein Powder', 1], ['Semi-Skimmed Milk', 1.5], ['Peanut Butter', 1]];
  items.forEach(([name, qty], i) => {
    const f = foodByName(name); if (!f) return;
    db.prepare(`INSERT INTO meal_items (meal_id, food_id, position, quantity, name, kcal, protein, carbs, fat, fibre, sugar, sodium)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(mid, f.id, i, qty, f.name, f.kcal, f.protein, f.carbs, f.fat, f.fibre, f.sugar, f.sodium);
  });
}
