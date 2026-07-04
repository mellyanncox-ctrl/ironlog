// Garmin import store: dedupe by hash, upsert daily wellness, demo generator.
// Activity timestamps are normalized to local naive ISO so date grouping
// matches the user's wall clock.
import { getDb, withTx } from './sqlite';
import { localISO, localDate } from './dates';

async function sha1hex(s: string): Promise<string> {
  // crypto.subtle needs a secure context (fine: PWA is HTTPS); fallback for tests
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // simple FNV-1a fallback (dedupe key only, not security)
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

function toLocalNaive(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : localISO(d);
}

export async function importActivities(items: any[], source = 'file') {
  const db = getDb();
  let imported = 0, skipped = 0;
  const rows: any[] = [];
  for (const a of items || []) {
    if (!a || !a.started_at) { skipped++; continue; }
    const started = toLocalNaive(String(a.started_at));
    const type = String(a.activity_type || 'other').toLowerCase();
    const hash = await sha1hex(`${started}|${type}|${Math.round(a.duration_s || 0)}`);
    rows.push({ a, started, type, hash });
  }
  withTx(() => {
    // re-importing a richer file (e.g. FIT after CSV) backfills distance on the existing row
    const ins = db.prepare(`
      INSERT INTO garmin_activities (hash, activity_type, name, started_at, duration_s, distance_m, calories, avg_hr, max_hr, training_load, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(hash) DO UPDATE SET
        distance_m = COALESCE(garmin_activities.distance_m, excluded.distance_m),
        avg_hr = COALESCE(garmin_activities.avg_hr, excluded.avg_hr),
        max_hr = COALESCE(garmin_activities.max_hr, excluded.max_hr),
        calories = COALESCE(garmin_activities.calories, excluded.calories),
        training_load = COALESCE(garmin_activities.training_load, excluded.training_load)
    `);
    const exists = db.prepare('SELECT id FROM garmin_activities WHERE hash = ?');
    for (const { a, started, type, hash } of rows) {
      const already = exists.get(hash);
      ins.run(
        hash, type, String(a.name || ''), started,
        a.duration_s != null ? Math.round(Number(a.duration_s)) : null,
        a.distance_m != null && !Number.isNaN(Number(a.distance_m)) ? Math.round(Number(a.distance_m)) : null,
        a.calories != null ? Math.round(Number(a.calories)) : null,
        a.avg_hr != null ? Math.round(Number(a.avg_hr)) : null,
        a.max_hr != null ? Math.round(Number(a.max_hr)) : null,
        a.training_load != null && !Number.isNaN(Number(a.training_load)) ? Number(a.training_load) : null,
        source
      );
      already ? skipped++ : imported++;
    }
  });
  return { imported, skipped };
}

function n(v: any): number | null {
  return v == null || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v));
}

export function importDaily(items: any[], source = 'file') {
  const db = getDb();
  let imported = 0, skipped = 0;
  withTx(() => {
    const ins = db.prepare(`
      INSERT INTO garmin_daily (date, steps, resting_hr, sleep_seconds, sleep_score, body_battery, stress, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        steps = COALESCE(excluded.steps, steps),
        resting_hr = COALESCE(excluded.resting_hr, resting_hr),
        sleep_seconds = COALESCE(excluded.sleep_seconds, sleep_seconds),
        sleep_score = COALESCE(excluded.sleep_score, sleep_score),
        body_battery = COALESCE(excluded.body_battery, body_battery),
        stress = COALESCE(excluded.stress, stress),
        source = excluded.source
    `);
    for (const d of items || []) {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) { skipped++; continue; }
      ins.run(d.date, n(d.steps), n(d.resting_hr), n(d.sleep_seconds), n(d.sleep_score), n(d.body_battery), n(d.stress), source);
      imported++;
    }
  });
  return { imported, skipped };
}

export async function generateDemo(days = 30) {
  const acts: any[] = [];
  const daily: any[] = [];
  const now = new Date();
  let rng = 42;
  const rand = () => { rng = (rng * 1103515245 + 12345) % 2 ** 31; return rng / 2 ** 31; };
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = localDate(d);
    const dow = d.getDay();
    const trained = dow === 1 || dow === 3 || dow === 5;
    daily.push({
      date,
      steps: Math.round(6000 + rand() * 7000 + (trained ? 1500 : 0)),
      resting_hr: Math.round(52 + rand() * 6),
      sleep_seconds: Math.round((6.4 + rand() * 1.8) * 3600),
      sleep_score: Math.round(65 + rand() * 30),
      body_battery: Math.round(45 + rand() * 45),
      stress: Math.round(20 + rand() * 35),
    });
    if (trained) {
      const start = new Date(d); start.setHours(18, Math.round(rand() * 45), 0, 0);
      acts.push({
        activity_type: 'strength_training', name: 'Strength',
        started_at: localISO(start), duration_s: Math.round(3000 + rand() * 1800),
        calories: Math.round(280 + rand() * 160), avg_hr: Math.round(105 + rand() * 20),
        max_hr: Math.round(150 + rand() * 20), training_load: Math.round(40 + rand() * 60),
      });
    }
    if (dow === 6 && rand() > 0.3) {
      const start = new Date(d); start.setHours(9, 30, 0, 0);
      const dur = Math.round(1800 + rand() * 1500);
      const paceSecPerKm = 310 + rand() * 60; // ~5:10–6:10 /km
      acts.push({
        activity_type: 'running', name: 'Easy run',
        started_at: localISO(start), duration_s: dur,
        distance_m: Math.round((dur / paceSecPerKm) * 1000),
        calories: Math.round(350 + rand() * 200), avg_hr: Math.round(138 + rand() * 15),
        max_hr: Math.round(165 + rand() * 15), training_load: Math.round(60 + rand() * 50),
      });
    }
  }
  const a = await importActivities(acts, 'demo');
  const w = importDaily(daily, 'demo');
  return { activities: a, daily: w };
}
