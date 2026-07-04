// UI smoke test: mounts every screen in jsdom against the real on-device engine.
import { JSDOM } from 'jsdom';

let passed = 0, failed = 0;
const errors: string[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Node's File implements .text()/.arrayBuffer() like real browsers; jsdom's doesn't.
  const NodeFile = globalThis.File;
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://ironlog.test/', pretendToBeVisual: true,
  });
  const g: any = globalThis;
  g.window = dom.window; g.document = dom.window.document;
  g.location = dom.window.location; g.HTMLElement = dom.window.HTMLElement; g.Element = dom.window.Element;
  g.Node = dom.window.Node; g.SVGElement = dom.window.SVGElement; g.DOMParser = dom.window.DOMParser;
  g.getComputedStyle = dom.window.getComputedStyle; g.requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
  g.File = dom.window.File; g.confirm = () => true; g.prompt = () => null;
  dom.window.addEventListener('error', (e: any) => errors.push('window error: ' + e.message));

  const { initData, api } = await import('../app/src/api');
  const { MemoryStorage } = await import('../app/src/db/sqlite');
  await initData({ storage: new MemoryStorage() });
  await api.demoSeed();
  await api.garmin.demo(21);

  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const App = (await import('../app/src/App')).default;

  async function mountRoute(route: string, expects: string[]) {
    errors.length = 0;
    dom.window.location.hash = '#/' + route;
    const el = dom.window.document.getElementById('root')!;
    el.innerHTML = '';
    const root = createRoot(el);
    try {
      root.render(React.createElement(App));
      await wait(700);
      const text = el.textContent || '';
      const missing = expects.filter((s) => !text.includes(s));
      if (errors.length === 0 && missing.length === 0) { passed++; console.log(`  ✓ #/${route}`); }
      else { failed++; console.log(`  ✗ #/${route} missing=[${missing}] errors=[${errors.slice(0, 2)}] text=${JSON.stringify(text.slice(0, 120))}`); }
    } catch (e: any) {
      failed++; console.log(`  ✗ #/${route} threw: ${e.message}`);
    }
    root.unmount();
  }

  await mountRoute('', ['Ironlog', 'week streak']);
  await mountRoute('food', ['Today', 'Breakfast', 'Snacks', 'Copy yesterday']);
  await mountRoute('history', ['Push Day', 'Leg Day']);
  await mountRoute('routines', ['Pull Day', 'Start workout']);
  await mountRoute('library', ['Bench Press', 'Deadlift']);
  await mountRoute('progress', ['Training volume', 'Muscle group volume']);
  await mountRoute('reports', ['workouts', 'volume']);
  await mountRoute('garmin', ['Import Garmin data']);
  await mountRoute('runs', ['runs this month', 'All runs']);
  await mountRoute('photos', ['No progress shots yet']);
  await mountRoute('more', ['Exercise library', 'Progress photos', 'Runs', 'Settings']);
  await mountRoute('settings', ['Units', 'Backup', 'Export backup']);

  const w = await api.workouts.list(1);
  await mountRoute(`history/${w[0].id}`, ['Repeat workout', 'Edit']);
  const prs = await api.stats.prs();
  await mountRoute(`library/${prs[0].exercise_id}`, ['Estimated 1RM', 'History']);

  // Active workout screen (the mid-workout logging UI)
  {
    errors.length = 0;
    const tpls = await api.templates.list();
    const active = await api.templates.start(tpls[0].id);
    const { WorkoutScreen } = await import('../app/src/screens/Workout');
    const el = dom.window.document.getElementById('root')!;
    el.innerHTML = '';
    const root = createRoot(el);
    root.render(React.createElement(WorkoutScreen, { workoutId: active.id, onDone: () => {}, muscles: [], equipment: [] }));
    await wait(700);
    const text = el.textContent || '';
    const need = ['Finish', 'Add exercise', 'Add set', 'Discard'];
    const missing = need.filter((s) => !text.includes(s));
    if (missing.length === 0 && errors.length === 0) { passed++; console.log('  ✓ active WorkoutScreen'); }
    else { failed++; console.log(`  ✗ active WorkoutScreen missing=[${missing}] errors=[${errors}]`); }
    root.unmount();
    await api.workouts.remove(active.id);
  }

  // Garmin file parsers in a DOM environment (TCX needs DOMParser)
  {
    const { parseGarminFile } = await import('../app/src/lib/garminParse');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sample = (f: string) => path.join(process.cwd(), 'sample-data', f);
    const tcx = fs.readFileSync(sample('sample-strength.tcx'), 'utf8');
    const res = await parseGarminFile(new NodeFile([tcx], 'sample-strength.tcx') as any);
    const a = res.activities[0];
    if (a && a.duration_s === 3541 && a.avg_hr === 111 && a.calories === 318) { passed++; console.log('  ✓ TCX parser'); }
    else { failed++; console.log(`  ✗ TCX parser ${JSON.stringify(res)}`); }

    const csv = fs.readFileSync(sample('sample-activities.csv'), 'utf8');
    const res2 = await parseGarminFile(new NodeFile([csv], 'activities.csv') as any);
    if (res2.activities.length === 5 && res2.activities[0].activity_type === 'strength_training') { passed++; console.log('  ✓ activities CSV parser'); }
    else { failed++; console.log(`  ✗ activities CSV parser ${JSON.stringify(res2).slice(0, 200)}`); }
    const runRow = res2.activities.find((a: any) => a.activity_type === 'running');
    if (runRow && runRow.distance_m === 5200) { passed++; console.log('  ✓ CSV run distance (5.2 km → 5200 m)'); }
    else { failed++; console.log(`  ✗ CSV run distance ${JSON.stringify(runRow)}`); }

    const wcsv = fs.readFileSync(sample('sample-wellness.csv'), 'utf8');
    const res3 = await parseGarminFile(new NodeFile([wcsv], 'wellness.csv') as any);
    if (res3.daily.length === 6 && res3.daily[0].sleep_seconds === 26640) { passed++; console.log('  ✓ wellness CSV parser'); }
    else { failed++; console.log(`  ✗ wellness CSV parser ${JSON.stringify(res3).slice(0, 200)}`); }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASHED:', e); process.exit(1); });
