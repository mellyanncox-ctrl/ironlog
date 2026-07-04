// Parses Garmin exports in the browser: FIT (binary), TCX/GPX (XML), CSV (Garmin Connect activity list / wellness).
// Everything is normalized to { activities: [...], daily: [...] }.
import FitParser from 'fit-file-parser';

export type NormActivity = {
  activity_type: string; name: string; started_at: string;
  duration_s: number | null; distance_m: number | null; calories: number | null;
  avg_hr: number | null; max_hr: number | null; training_load: number | null;
};
export type NormDaily = {
  date: string; steps?: number | null; resting_hr?: number | null; sleep_seconds?: number | null;
  sleep_score?: number | null; body_battery?: number | null; stress?: number | null;
};
export type ParseResult = { activities: NormActivity[]; daily: NormDaily[]; warnings: string[] };

export async function parseGarminFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.fit')) return parseFit(await file.arrayBuffer());
  if (name.endsWith('.tcx')) return parseTcx(await file.text());
  if (name.endsWith('.gpx')) return parseGpx(await file.text(), file.name);
  if (name.endsWith('.csv')) return parseCsv(await file.text());
  if (name.endsWith('.json')) return parseJson(await file.text());
  return { activities: [], daily: [], warnings: [`Unsupported file type: ${file.name}. Use .fit, .tcx, .gpx, or .csv`] };
}

function parseFit(buf: ArrayBuffer): Promise<ParseResult> {
  return new Promise((resolve) => {
    // handle both CJS and ESM-interop shapes of the fit-file-parser package
    const Ctor = (FitParser as any).default || (FitParser as any);
    const parser = new Ctor({ force: true, mode: 'list' });
    parser.parse(buf, (err: any, data: any) => {
      if (err && !data) return resolve({ activities: [], daily: [], warnings: ['Could not parse FIT file: ' + err] });
      const sessions = data?.sessions?.length ? data.sessions : data?.activity?.sessions || [];
      const acts: NormActivity[] = [];
      for (const s of sessions) {
        const start = s.start_time ? new Date(s.start_time) : null;
        if (!start) continue;
        acts.push({
          activity_type: String(s.sport || 'other'),
          name: s.sport ? cap(String(s.sport)) : 'Activity',
          started_at: start.toISOString(),
          duration_s: num(s.total_timer_time ?? s.total_elapsed_time),
          distance_m: num(s.total_distance),
          calories: num(s.total_calories),
          avg_hr: num(s.avg_heart_rate),
          max_hr: num(s.max_heart_rate),
          training_load: num(s.training_load_peak ?? s.total_training_effect ? (s.training_load_peak ?? null) : null),
        });
      }
      if (acts.length === 0 && data?.records?.length) {
        // fall back: derive one activity from records
        const recs = data.records.filter((r: any) => r.timestamp);
        if (recs.length) {
          const start = new Date(recs[0].timestamp);
          const end = new Date(recs[recs.length - 1].timestamp);
          const hrs = recs.map((r: any) => r.heart_rate).filter((h: any) => h != null);
          const dists = recs.map((r: any) => r.distance).filter((d: any) => d != null);
          acts.push({
            activity_type: 'other', name: 'Activity', started_at: start.toISOString(),
            duration_s: Math.round((end.getTime() - start.getTime()) / 1000),
            distance_m: dists.length ? num(dists[dists.length - 1]) : null,
            calories: null,
            avg_hr: hrs.length ? Math.round(hrs.reduce((a: number, b: number) => a + b, 0) / hrs.length) : null,
            max_hr: hrs.length ? Math.max(...hrs) : null, training_load: null,
          });
        }
      }
      resolve({ activities: acts, daily: [], warnings: acts.length ? [] : ['No sessions found in FIT file'] });
    });
  });
}

function parseTcx(xml: string): ParseResult {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const acts: NormActivity[] = [];
  for (const el of Array.from(doc.getElementsByTagName('Activity'))) {
    const sport = el.getAttribute('Sport') || 'other';
    const laps = Array.from(el.getElementsByTagName('Lap'));
    if (laps.length === 0) continue;
    const start = laps[0].getAttribute('StartTime');
    let dur = 0, cal = 0, dist = 0;
    const hrs: number[] = []; let maxHr = 0;
    for (const lap of laps) {
      dur += Number(text(lap, 'TotalTimeSeconds')) || 0;
      cal += Number(text(lap, 'Calories')) || 0;
      dist += Number(text(lap, 'DistanceMeters')) || 0;
      const avg = lap.getElementsByTagName('AverageHeartRateBpm')[0];
      if (avg) hrs.push(Number(text(avg, 'Value')) || 0);
      const mx = lap.getElementsByTagName('MaximumHeartRateBpm')[0];
      if (mx) maxHr = Math.max(maxHr, Number(text(mx, 'Value')) || 0);
    }
    if (!start) continue;
    acts.push({
      activity_type: normType(sport), name: sport, started_at: new Date(start).toISOString(),
      duration_s: Math.round(dur), distance_m: dist ? Math.round(dist) : null, calories: cal || null,
      avg_hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      max_hr: maxHr || null, training_load: null,
    });
  }
  return { activities: acts, daily: [], warnings: acts.length ? [] : ['No activities found in TCX'] };
}

function parseGpx(xml: string, filename: string): ParseResult {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const times = Array.from(doc.getElementsByTagName('time')).map((t) => t.textContent).filter(Boolean) as string[];
  if (times.length === 0) return { activities: [], daily: [], warnings: ['No timestamps in GPX'] };
  const start = new Date(times[0]), end = new Date(times[times.length - 1]);
  const typeEl = doc.getElementsByTagName('type')[0];
  const nameEl = doc.getElementsByTagName('name')[0];
  const hrs = Array.from(doc.getElementsByTagName('gpxtpx:hr')).concat(Array.from(doc.getElementsByTagName('hr')))
    .map((el) => Number(el.textContent)).filter((n) => n > 0);
  // distance from trackpoints (haversine)
  const pts = Array.from(doc.getElementsByTagName('trkpt'))
    .map((p) => ({ lat: Number(p.getAttribute('lat')), lon: Number(p.getAttribute('lon')) }))
    .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lon));
  let dist = 0;
  for (let i = 1; i < pts.length; i++) dist += haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
  return {
    activities: [{
      activity_type: normType(typeEl?.textContent || 'other'),
      name: nameEl?.textContent || filename,
      started_at: start.toISOString(),
      duration_s: Math.round((end.getTime() - start.getTime()) / 1000),
      distance_m: dist > 0 ? Math.round(dist) : null,
      calories: null,
      avg_hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      max_hr: hrs.length ? Math.max(...hrs) : null, training_load: null,
    }], daily: [], warnings: [],
  };
}

// Garmin Connect CSVs: activity list export, or wellness exports (sleep/steps).
function parseCsv(textContent: string): ParseResult {
  const rows = csvRows(textContent);
  if (rows.length < 2) return { activities: [], daily: [], warnings: ['Empty CSV'] };
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));

  const iType = idx('activity type'), iDate = idx('date'), iTitle = idx('title', 'name'),
    iDur = idx('time', 'duration'), iCal = idx('calories'), iAvgHr = idx('avg hr', 'average hr', 'avg. hr'),
    iMaxHr = idx('max hr', 'max. hr'), iLoad = idx('training load', 'load'), iDist = idx('distance');

  // wellness columns
  const iSteps = idx('steps'), iRhr = idx('resting heart rate', 'resting hr'),
    iSleep = idx('sleep duration', 'sleep time'), iSleepScore = idx('sleep score'),
    iBB = idx('body battery'), iStress = idx('stress');

  const activities: NormActivity[] = [];
  const daily: NormDaily[] = [];
  const warnings: string[] = [];
  const isActivityCsv = iType >= 0 && iDate >= 0;
  const isWellnessCsv = !isActivityCsv && iDate >= 0 && (iSteps >= 0 || iSleep >= 0 || iRhr >= 0 || iStress >= 0);

  for (const r of rows.slice(1)) {
    if (r.length < 2) continue;
    if (isActivityCsv) {
      const dt = parseDate(r[iDate]);
      if (!dt) continue;
      // Garmin's activities CSV reports distance in the account's unit (km for
      // metric accounts). Values are treated as km; sub-metre GPS noise (<1) is kept as-is in km too.
      const distRaw = iDist >= 0 ? numStr(r[iDist]) : null;
      activities.push({
        activity_type: normType(r[iType] || 'other'),
        name: iTitle >= 0 ? r[iTitle] : r[iType],
        started_at: dt.toISOString(),
        duration_s: iDur >= 0 ? parseDuration(r[iDur]) : null,
        distance_m: distRaw != null && distRaw > 0 ? Math.round(distRaw * 1000) : null,
        calories: iCal >= 0 ? numStr(r[iCal]) : null,
        avg_hr: iAvgHr >= 0 ? numStr(r[iAvgHr]) : null,
        max_hr: iMaxHr >= 0 ? numStr(r[iMaxHr]) : null,
        training_load: iLoad >= 0 ? numStr(r[iLoad]) : null,
      });
    } else if (isWellnessCsv) {
      const dt = parseDate(r[iDate]);
      if (!dt) continue;
      daily.push({
        date: dt.toISOString().slice(0, 10),
        steps: iSteps >= 0 ? numStr(r[iSteps]) : null,
        resting_hr: iRhr >= 0 ? numStr(r[iRhr]) : null,
        sleep_seconds: iSleep >= 0 ? parseDuration(r[iSleep]) : null,
        sleep_score: iSleepScore >= 0 ? numStr(r[iSleepScore]) : null,
        body_battery: iBB >= 0 ? numStr(r[iBB]) : null,
        stress: iStress >= 0 ? numStr(r[iStress]) : null,
      });
    }
  }
  if (!isActivityCsv && !isWellnessCsv) warnings.push('CSV not recognized. Expected a Garmin Connect activities export (Activity Type + Date columns) or a wellness export (Date + Steps/Sleep/Stress).');
  return { activities, daily, warnings };
}

// Garmin account data export JSON (DI_CONNECT wellness summaries) — best effort.
function parseJson(textContent: string): ParseResult {
  try {
    const data = JSON.parse(textContent);
    const arr = Array.isArray(data) ? data : data.items || [];
    const daily: NormDaily[] = [];
    for (const d of arr) {
      const date = d.calendarDate || d.date;
      if (!date) continue;
      daily.push({
        date: String(date).slice(0, 10),
        steps: d.totalSteps ?? d.steps ?? null,
        resting_hr: d.restingHeartRate ?? null,
        sleep_seconds: d.sleepingSeconds ?? d.sleepTimeSeconds ?? null,
        sleep_score: d.sleepScore ?? null,
        body_battery: d.bodyBatteryHighestValue ?? d.bodyBattery ?? null,
        stress: d.averageStressLevel ?? d.avgStress ?? null,
      });
    }
    return { activities: [], daily, warnings: daily.length ? [] : ['No daily wellness entries recognized in JSON'] };
  } catch {
    return { activities: [], daily: [], warnings: ['Invalid JSON file'] };
  }
}

// ---- helpers ----
function text(parent: Element, tag: string): string {
  const el = parent.getElementsByTagName(tag)[0];
  return el && el.textContent ? el.textContent.trim() : '';
}
export function csvRows(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}
function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseDuration(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  const m = t.match(/^(\d+):(\d{2})(?::(\d{2}))?/);
  if (m) return m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
  const h = t.match(/(\d+(?:\.\d+)?)\s*h/); const min = t.match(/(\d+(?:\.\d+)?)\s*m/);
  if (h || min) return Math.round((h ? +h[1] * 3600 : 0) + (min ? +min[1] * 60 : 0));
  const n = Number(t.replace(/[^\d.]/g, ''));
  return Number.isNaN(n) ? null : Math.round(n);
}
function numStr(s: string | undefined): number | null {
  if (s == null) return null;
  const n = Number(String(s).replace(/[",]/g, '').trim());
  return Number.isNaN(n) || s === '--' ? null : n;
}
function num(v: any): number | null { const n = Number(v); return Number.isNaN(n) ? null : Math.round(n); }
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function normType(t: string): string {
  const s = t.toLowerCase().trim().replace(/\s+/g, '_');
  if (s.includes('strength')) return 'strength_training';
  if (s.includes('run')) return 'running';
  if (s.includes('cycl') || s.includes('bik')) return 'cycling';
  if (s.includes('walk')) return 'walking';
  if (s.includes('swim')) return 'swimming';
  if (s.includes('yoga')) return 'yoga';
  if (s.includes('cardio')) return 'cardio';
  if (s.includes('hik')) return 'hiking';
  return s || 'other';
}
