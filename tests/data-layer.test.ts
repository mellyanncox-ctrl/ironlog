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

  console.log('14. Progress photos');
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5])], { type: 'image/jpeg' });
  const photo = await api.photos.add({ blob: jpeg, date: '2026-07-01', note: 'front relaxed', width: 800, height: 1066 });
  ok(photo.id > 0 && photo.blob_key.length > 0, 'photo metadata stored');
  const gotBlob = await api.photos.blob(photo.blob_key);
  ok(gotBlob != null && gotBlob.size === jpeg.size, 'photo blob stored and retrievable');
  const plist = await api.photos.list();
  ok(plist.length === 1 && plist[0].note === 'front relaxed', 'photo list');
  const nw = await api.photos.nearestWeight('2026-07-01');
  ok(nw != null && nw > 50, `nearest bodyweight found (${nw}kg)`);
  await api.photos.updateNote(photo.id, 'front, morning');
  ok((await api.photos.list())[0].note === 'front, morning', 'note editable');
  await throws(() => api.photos.add({ blob: jpeg, date: 'not-a-date' }), 'bad photo date rejected', /valid date/);
  await throws(() => api.photos.add({ blob: new Blob([]), date: '2026-07-01' }), 'empty image rejected', /No image data/);

  console.log('15. Persistence + backup round-trip (incl. photos)');
  ok(storage.bytes != null && storage.bytes.length > 0, `data flushed to storage (${storage.bytes?.length} bytes)`);
  const backup = await api.backup.export();
  ok(backup instanceof Blob && backup.size > 0, `backup container exported (${backup.size} bytes)`);
  const magic = new TextDecoder().decode(new Uint8Array(await backup.slice(0, 8).arrayBuffer()));
  ok(magic === 'IRONLOG2', 'backup uses v2 container format');
  const histBefore = (await api.workouts.list(100)).length;
  await api.workouts.create('Throwaway after backup');
  await api.photos.remove(photo.id);
  ok((await api.photos.list()).length === 0, 'photo deleted (with blob)');
  const res = await api.backup.import(backup);
  ok((res as any).photos === 1, 'backup import reports photo count');
  const histAfter = (await api.workouts.list(100)).length;
  ok(histAfter === histBefore, 'backup import restores exact snapshot');
  const restoredPhotos = await api.photos.list();
  const restoredBlob = restoredPhotos.length ? await api.photos.blob(restoredPhotos[0].blob_key) : null;
  ok(restoredPhotos.length === 1 && restoredBlob != null && restoredBlob.size === jpeg.size, 'photo restored from backup (metadata + bytes)');
  const activeGone = await api.workouts.active();
  ok(activeGone == null, 'post-backup workout gone after restore');
  // legacy v1 backup = raw SQLite bytes
  const { exportBytes } = await import('../app/src/db/sqlite');
  const legacy = exportBytes();
  await api.backup.import(legacy);
  ok((await api.workouts.list(100)).length === histBefore, 'legacy raw .db backup still imports');
  await throws(async () => api.backup.import(new TextEncoder().encode('not a database at all — just text')), 'garbage backup file rejected', /Not an Ironlog backup|file is not a database|database disk image/i);

  console.log('16. Runs (distance pipeline)');
  const runTs = new Date(Date.now() - 3 * 86400000).toISOString();
  await api.garmin.importActivities([
    { activity_type: 'running', name: '5K', started_at: runTs, duration_s: 1500, distance_m: 5000, avg_hr: 152 },
  ]);
  const runsNow = await api.garmin.runs();
  ok(runsNow.length >= 1 && runsNow.some((r) => r.distance_m === 5000), 'run stored with distance');
  // re-import same activity (same hash) with extra data → backfills, no duplicate
  const runCountBefore = runsNow.length;
  await api.garmin.importActivities([
    { activity_type: 'running', name: '5K', started_at: runTs, duration_s: 1500, distance_m: 5000, calories: 320, max_hr: 175 },
  ]);
  const runsAfter = await api.garmin.runs();
  const enriched = runsAfter.find((r) => r.distance_m === 5000)!;
  ok(runsAfter.length === runCountBefore && enriched.calories === 320 && enriched.max_hr === 175, 'duplicate run deduped + fields backfilled');
  const wr2 = await api.reports.weekly();
  ok((wr2 as any).running != null && (wr2 as any).running.distance_m >= 5000, `running block in weekly report (${(wr2 as any).running?.distance_m}m)`);
  const pace = (wr2 as any).running.avg_pace_s_per_km;
  ok(pace != null && pace >= 250 && pace <= 450, `avg pace computed (${pace}s/km)`);

  console.log('17. Garmin remote auto-sync');
  const snap = {
    version: 1, generated_at: '2026-07-04T10:00:00Z',
    activities: [{ activity_type: 'running', name: 'Synced run', started_at: '2026-07-03T07:00:00', duration_s: 1800, distance_m: 6000, avg_hr: 148 }],
    daily: [{ date: '2026-07-03', steps: 11000, resting_hr: 51, sleep_seconds: 26000, sleep_score: 80, body_battery: 75, stress: 25 }],
  };
  const fakeFetch = (body: any, status = 200) =>
    (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
  ok((await api.garmin.sync.now()).state === 'unconfigured', 'sync unconfigured without repo+token');
  await throws(() => api.garmin.sync.configure('not a repo', 'tok'), 'bad repo format rejected', /owner\/repo/);
  await api.garmin.sync.configure('mel/ironlog-sync', 'tok');
  const cfg = await api.garmin.sync.config();
  ok(cfg.repo === 'mel/ironlog-sync' && cfg.has_token, 'sync config saved');
  const s1 = await api.garmin.sync.now(false, fakeFetch(snap));
  ok(s1.state === 'ok' && (s1 as any).activities === 1 && (s1 as any).daily === 1, `snapshot imported (${JSON.stringify(s1)})`);
  const syncedRun = (await api.garmin.activities()).find((a) => a.name === 'Synced run');
  ok(syncedRun != null && syncedRun.source === 'sync' && syncedRun.distance_m === 6000, 'synced activity stored with source=sync');
  const s2 = await api.garmin.sync.now(false, fakeFetch(snap));
  ok(s2.state === 'nochange', 'same generated_at skips re-import');
  const s3 = await api.garmin.sync.now(true, fakeFetch({ ...snap, generated_at: '2026-07-04T11:00:00Z' }));
  ok(s3.state === 'ok' && (s3 as any).activities === 0, 'forced resync dedupes existing activities');
  const s4 = await api.garmin.sync.now(true, fakeFetch({}, 401));
  ok(s4.state === 'error' && /token/.test((s4 as any).message), 'bad token surfaces clear error');
  const s5 = await api.garmin.sync.now(true, fakeFetch({ hello: 'world' }));
  ok(s5.state === 'error' && /format/.test((s5 as any).message), 'malformed snapshot rejected');
  await api.garmin.sync.configure('', '');
  ok((await api.garmin.sync.now()).state === 'unconfigured', 'clearing repo disables sync');

  console.log('18. Strong CSV history import');
  const { parseStrongCsv, matchStrongExercise } = await import('../app/src/lib/strongParse');
  const strongCsv = [
    'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
    '2025-11-03 07:01:00,"ST Leg Day",55m,"Squat (Barbell)",W,40.0,5.0,0,0.0,"","",',
    '2025-11-03 07:01:00,"ST Leg Day",55m,"Squat (Barbell)",1,80.0,5.0,0,0.0,"felt strong","",8',
    '2025-11-03 07:01:00,"ST Leg Day",55m,"Squat (Barbell)",Rest Timer,0,0.0,0,180.0,,,',
    '2025-11-03 07:01:00,"ST Leg Day",55m,"Squat (Barbell)",2,80.0,5.0,0,0.0,,,9',
    '2025-11-03 07:01:00,"ST Leg Day",55m,"Frog Pumps",1,20.0,15.0,0,0.0,,,',
    '2025-11-04 07:00:00,"ST Push",145h 27m,"Chest Press (Machine)",1,30.0,10.0,0,0.0,,"tired today",',
  ].join('\n');
  const parsed = parseStrongCsv(strongCsv);
  ok(parsed.workouts.length === 2, `parsed 2 workouts (${parsed.workouts.length})`);
  const leg = parsed.workouts[0];
  ok(leg.exercises[0].sets.length === 3 && leg.exercises[0].sets[0].set_type === 'warmup', 'warm-up set flagged, rest-timer rows skipped');
  ok(leg.exercises[0].rest_seconds === 180, 'per-exercise rest timer captured');
  ok(leg.exercises[0].sets[1].rpe === 8, 'RPE carried over');
  const m1 = matchStrongExercise('Squat (Barbell)', await api.exercises.list());
  ok(m1.kind === 'existing', 'Squat (Barbell) maps to library Back Squat');
  const m2 = matchStrongExercise('Pull Up (Assisted)', await api.exercises.list());
  ok(m2.kind === 'create', 'assisted variant never merged into base lift');
  const stBefore = (await api.workouts.list(200)).length;
  const imp1 = await api.importStrong(parsed.workouts);
  ok(imp1.imported === 2 && imp1.skipped === 0, `imported 2 workouts (${JSON.stringify(imp1)})`);
  ok(imp1.exercises_created.includes('Frog Pumps'), 'unknown movement became custom exercise');
  const stAfter = await api.workouts.list(200);
  ok(stAfter.length === stBefore + 2, 'workouts visible in history');
  const legDay = stAfter.find((w) => w.name === 'ST Leg Day')!;
  ok(legDay != null && legDay.sets === 3 && legDay.volume === 80 * 5 * 2 + 20 * 15, `sets + volume computed, warmup excluded (${legDay?.volume})`);
  const push = await api.workouts.get(stAfter.find((w) => w.name === 'ST Push')!.id);
  const pushDurH = (new Date(push.ended_at!).getTime() - new Date(push.started_at).getTime()) / 3600000;
  ok(pushDurH <= 2, `bogus 145h duration replaced with estimate (${pushDurH.toFixed(1)}h)`);
  const reimp = await api.importStrong(parsed.workouts);
  ok(reimp.imported === 0 && reimp.skipped === 2, 're-import is a no-op (idempotent)');

  console.log('19. Settings validation');
  await throws(() => api.settings.put({ units: 'stone' as any }), 'bad units rejected');
  await throws(() => api.settings.put({ default_rest: '0' }), 'zero rest rejected');
  const s = await api.settings.put({ units: 'lb' });
  ok(s.units === 'lb', 'valid settings saved');
  await api.settings.put({ units: 'kg' });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASHED:', e); process.exit(1); });
