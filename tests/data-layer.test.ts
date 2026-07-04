// Data-layer test suite — runs the full engine (SQLite WASM) in Node.
// Covers: seeding, logging lifecycle, PRs/1RM, volume, streaks, reports,
// suggestions, Garmin import + dedupe, validation, crash recovery, backup round-trip.
import { api, initData, _internal } from '../app/src/api';
import { MemoryStorage, getDb } from '../app/src/db/sqlite';

let passed = 0, failed = 0;
function ok(cond: any, name: string, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}
async function throws(fn: () => Promise<any>, name: string, match?: RegExp) {
  try { await fn(); failed++; console.log(`  ✗ ${name} (no error thrown)`); }
  catch (e: any) {
    if (!match || match.test(e.message)) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name} (wrong error: ${e.message})`); }
  }
}

(async () => {
  const storage = new MemoryStorage();
  await initData({ storage });

  console.log('1. Seed sample PPL routine + workouts');
  const seed = await api.demoSeed();
  ok(seed.templates === 3 && seed.workouts === 9, 'seeded 3 templates + 9 workouts', JSON.stringify(seed));
  ok((await api.demoSeed()).workouts === 0, 'seeding twice is a no-op');

  console.log('2. Exercise library + validation');
  const exs = await api.exercises.list();
  ok(exs.length >= 90, `built-in exercises (${exs.length})`);
  const custom = await api.exercises.create({ name: 'Test Machine Fly', muscle: 'chest', equipment: 'machine' });
  ok(custom.id > 0 && custom.is_custom === 1, 'create custom exercise');
  await throws(() => api.exercises.create({ name: 'test machine fly' }), 'duplicate name rejected (case-insensitive)', /already exists/);
  await throws(() => api.exercises.create({ name: '   ' }), 'blank name rejected', /required/);
  const archCheck = await api.exercises.getOne(exs[0].id);
  ok(archCheck != null && archCheck.name === exs[0].name, 'getOne fetches single exercise');

  console.log('3. Workout history');
  const hist = await api.workouts.list(50);
  ok(hist.length === 9, `history has 9 workouts (${hist.length})`);
  ok(hist.every((w) => w.sets > 0 && w.volume > 0), 'summaries include sets + volume');
  ok(hist.some((w) => w.prs > 0), 'PR badges present');

  console.log('4. Start from template, log, finish');
  const templates = await api.templates.list();
  ok(templates.length === 3 && templates.every((t) => t.exercises.length === 5), '3 templates × 5 exercises');
  ok(templates.some((t) => t.exercises.some((e) => e.superset_group != null)), 'templates include supersets');
  const w = await api.templates.start(templates[0].id);
  ok(w.exercises.length === 5 && w.ended_at == null, 'workout snapshot created');
  ok(w.exercises[0].sets.length === 4, 'target sets materialized');
  ok(w.exercises[0].sets[0].weight != null, 'ghost weights prefilled from last session');
  for (const we of w.exercises.slice(0, 2)) {
    for (const s of we.sets) {
      await api.sets.update(s.id, { weight: (s.weight || 50) + 2.5, reps: s.reps || 8, rpe: 8, completed: true });
    }
  }
  const fin = await api.workouts.finish(w.id, 'e2e test');
  ok(fin.ended_at != null, 'workout finished');
  ok(Array.isArray(fin.new_prs) && fin.new_prs!.length > 0, `new PRs detected (${fin.new_prs!.length})`);
  ok(fin.exercises.length === 2, 'empty exercises dropped on finish');

  console.log('5. Input validation on sets');
  const someSet = fin.exercises[0].sets[0];
  const bad1 = await api.sets.update(someSet.id, { weight: 'abc', reps: 10, completed: true });
  ok(bad1.weight === null, 'non-numeric weight stored as null, not garbage');
  const bad2 = await api.sets.update(someSet.id, { weight: -50, reps: -3, rpe: 25, completed: true });
  ok(bad2.weight === 0 && bad2.reps === 0 && bad2.rpe === 10, `negative/overflow values clamped (${bad2.weight}/${bad2.reps}/${bad2.rpe})`);
  await api.sets.update(someSet.id, { weight: 60, reps: 10, rpe: 7, completed: true });

  console.log('6. Edit completed workout + duplicate');
  const reread = await api.workouts.get(fin.id);
  ok(reread.exercises[0].sets[0].weight === 60, 'completed workout is editable');
  const dup = await api.workouts.duplicate(fin.id);
  ok(dup.id !== fin.id && dup.ended_at == null && dup.exercises.length === fin.exercises.length, 'duplicate creates new in-progress workout');
  await api.workouts.remove(dup.id);

  console.log('7. Template edit does not touch history');
  const before = await api.workouts.get(hist[0].id);
  await api.templates.update(templates[0].id, { name: 'Renamed Day', day_of_week: 5, exercises: [{ exercise_id: exs[0].id, target_sets: 1, target_reps: '5' }] });
  const after = await api.workouts.get(hist[0].id);
  ok(JSON.stringify(before.exercises.map((e) => e.exercise_name)) === JSON.stringify(after.exercises.map((e) => e.exercise_name)), 'logged workouts unchanged after template edit');

  console.log('8. PRs & progress stats');
  const prs = await api.stats.prs();
  const bench = prs.find((p) => p.exercise_name === 'Barbell Bench Press')!;
  ok(bench && bench.max_weight! >= 82.5, `bench PR tracked (${bench?.max_weight}kg)`);
  ok(bench && bench.best_e1rm! > bench.max_weight!, 'e1RM above max weight');
  const vol = await api.stats.volume('bucket=week');
  ok(vol.length >= 3 && vol.every((v) => v.volume > 0), `weekly volume series (${vol.length} weeks)`);
  const mv = await api.stats.muscleVolume();
  ok(Object.keys(mv).length >= 8, `muscle-group volume (${Object.keys(mv).length} groups)`);
  const ov = await api.stats.overview();
  ok(ov.streak_weeks >= 3, `streak = ${ov.streak_weeks} weeks`);
  const est = await api.exercises.stats(bench.exercise_id);
  ok(est.trend.length >= 3, `bench e1RM trend has ${est.trend.length} points`);

  console.log('9. Garmin import + dedupe');
  const ts = new Date().toISOString();
  const imp = await api.garmin.importActivities([
    { activity_type: 'strength_training', name: 'Gym', started_at: ts, duration_s: 3600, calories: 350, avg_hr: 115, max_hr: 160, training_load: 55 },
    { activity_type: 'running', name: 'Run', started_at: new Date(Date.now() - 86400000).toISOString(), duration_s: 1800, calories: 300, avg_hr: 145, max_hr: 172 },
  ]);
  ok(imp.imported === 2, 'activities imported');
  const imp2 = await api.garmin.importActivities([{ activity_type: 'strength_training', name: 'Gym', started_at: ts, duration_s: 3600 }]);
  ok(imp2.imported === 0 && imp2.skipped === 1, 'duplicate activity deduped');
  const acts = await api.garmin.activities();
  ok(!acts[0].started_at.endsWith('Z'), 'activity timestamps normalized to local time');
  const dly = await api.garmin.importDaily([{ date: new Date().toISOString().slice(0, 10), steps: 9000, resting_hr: 52, sleep_seconds: 27000, sleep_score: 82, body_battery: 70, stress: 28 }]);
  ok(dly.imported === 1, 'daily wellness imported');
  const demo = await api.garmin.demo(14);
  ok(demo.daily.imported >= 13, 'demo generator works');

  console.log('10. Reports');
  const wr = await api.reports.weekly();
  ok(wr.workouts_completed >= 3, `weekly report: ${wr.workouts_completed} workouts`);
  ok(wr.total_sets > 0 && wr.total_volume > 0, 'weekly totals');
  ok(wr.top_lifts.length > 0, 'top lifts');
  ok(wr.prs.length > 0, 'PRs in report');
  ok(wr.muscle_balance.length > 0, 'muscle balance');
  ok(wr.recovery != null && wr.recovery.avg_sleep_h != null, 'Garmin recovery in report');
  ok(wr.suggestions.length > 0, 'next-week suggestions');
  ok(wr.missed.length === 0, 'same-week template sessions not marked missed');
  const mr = await api.reports.monthly();
  ok(mr.total_volume > 0 && mr.label.length === 7, `monthly report (${mr.label})`);

  console.log('11. Smart suggestions');
  const sug = await api.suggestions();
  ok(sug.improving.length > 0, `improving lifts (${sug.improving.length})`);
  ok(sug.next_weights.length > 0, `next-weight targets (${sug.next_weights.length})`);
  ok(sug.fatigue.length > 0, 'fatigue detection (seed data is high-RPE)');

  console.log('12. Bodyweight + validation');
  const bw = await api.bodyweight.list();
  ok(bw.length >= 7, `bodyweight entries (${bw.length})`);
  await throws(() => api.bodyweight.add('2026-07-04', 0), 'zero bodyweight rejected', /valid weight/);
  await throws(() => api.bodyweight.add('2026-07-04', NaN as any), 'NaN bodyweight rejected', /valid weight/);
  await throws(() => api.bodyweight.add('bad-date', 70), 'bad date rejected', /valid date/);

  console.log('13. Crash recovery (orphaned in-progress workouts)');
  const stray1 = await api.workouts.create('Stray empty');
  const stray2 = await api.templates.start(templates[1].id);
  const s2set = stray2.exercises[0].sets[0];
  await api.sets.update(s2set.id, { weight: 100, reps: 5, completed: true });
  const stray3 = await api.workouts.create('Newest active');
  _internal.reconcile();
  const activeAfter = await api.workouts.active();
  ok(activeAfter?.id === stray3.id, 'newest in-progress workout kept active');
  const db = getDb();
  const gone = db.prepare('SELECT COUNT(*) AS n FROM workouts WHERE id = ?').get(stray1.id)!.n;
  ok(gone === 0, 'empty stray workout removed');
  const recovered = db.prepare('SELECT ended_at FROM workouts WHERE id = ?').get(stray2.id)!;
  ok(recovered.ended_at != null, 'stray workout with completed sets auto-finished (data preserved)');
  await api.workouts.remove(stray3.id);

  console.log('14. Persistence + backup round-trip');
  ok(storage.bytes != null && storage.bytes.length > 0, `data flushed to storage (${storage.bytes?.length} bytes)`);
  const backup = await api.backup.export();
  const histBefore = (await api.workouts.list(100)).length;
  await api.workouts.create('Throwaway after backup');
  await api.backup.import(backup);
  const histAfter = (await api.workouts.list(100)).length;
  ok(histAfter === histBefore, 'backup import restores exact snapshot');
  const activeGone = await api.workouts.active();
  ok(activeGone == null, 'post-backup workout gone after restore');
  await throws(async () => api.backup.import(new TextEncoder().encode('not a database at all — just text')), 'garbage backup file rejected', /Not an Ironlog backup|file is not a database|database disk image/i);

  console.log('15. Settings validation');
  await throws(() => api.settings.put({ units: 'stone' as any }), 'bad units rejected');
  await throws(() => api.settings.put({ default_rest: '0' }), 'zero rest rejected');
  const s = await api.settings.put({ units: 'lb' });
  ok(s.units === 'lb', 'valid settings saved');
  await api.settings.put({ units: 'kg' });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASHED:', e); process.exit(1); });
