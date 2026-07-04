// Parses Strong app CSV exports (Date, Workout Name, Duration, Exercise Name,
// Set Order, Weight, Reps, ...) into completed-workout structures, and maps
// Strong exercise names onto Ironlog's library so history, PRs, and ghost
// weights carry over. Unknown movements become custom exercises rather than
// being silently merged into a near-match.
import { csvRows } from './garminParse';

export type StrongSet = { set_type: 'warmup' | 'working'; weight: number | null; reps: number | null; rpe: number | null };
export type StrongExercise = { name: string; rest_seconds: number | null; notes: string; sets: StrongSet[] };
export type StrongWorkout = { name: string; started_at: string; duration_s: number | null; notes: string; exercises: StrongExercise[] };
export type StrongParseResult = { workouts: StrongWorkout[]; warnings: string[] };

// ---------- CSV -> workouts ----------

function num(s: string | undefined): number | null {
  if (s == null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function parseDuration(s: string | undefined): number | null {
  if (!s) return null;
  const h = s.match(/(\d+)\s*h/), m = s.match(/(\d+)\s*m/);
  if (!h && !m) return null;
  return (h ? +h[1] * 3600 : 0) + (m ? +m[1] * 60 : 0);
}

export function parseStrongCsv(text: string): StrongParseResult {
  const rows = csvRows(text);
  const warnings: string[] = [];
  if (rows.length < 2) return { workouts: [], warnings: ['File is empty.'] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col('date'), iWName = col('workout name'), iDur = col('duration'),
    iEx = col('exercise name'), iOrder = col('set order'), iW = col('weight'),
    iReps = col('reps'), iNotes = col('notes'), iWNotes = col('workout notes'), iRpe = col('rpe');
  if (iDate < 0 || iEx < 0 || iOrder < 0 || iW < 0 || iReps < 0) {
    return { workouts: [], warnings: ['Not a Strong export — expected columns: Date, Exercise Name, Set Order, Weight, Reps.'] };
  }

  const byWorkout = new Map<string, StrongWorkout>();
  for (const r of rows.slice(1)) {
    const date = (r[iDate] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(date)) continue;
    const started = date.replace(' ', 'T').slice(0, 19);
    const wname = ((iWName >= 0 && r[iWName]) || 'Workout').trim() || 'Workout';
    const key = `${started}|${wname}`;
    let w = byWorkout.get(key);
    if (!w) {
      w = { name: wname, started_at: started, duration_s: parseDuration(iDur >= 0 ? r[iDur] : undefined), notes: (iWNotes >= 0 && (r[iWNotes] || '').trim()) || '', exercises: [] };
      byWorkout.set(key, w);
    }
    if (!w.notes && iWNotes >= 0 && (r[iWNotes] || '').trim()) w.notes = r[iWNotes].trim();

    const exName = (r[iEx] || '').trim();
    if (!exName) continue;
    let ex = w.exercises.find((e) => e.name === exName);
    if (!ex) { ex = { name: exName, rest_seconds: null, notes: '', sets: [] }; w.exercises.push(ex); }

    const order = (r[iOrder] || '').trim();
    if (/^rest timer$/i.test(order)) {
      // Strong logs the per-exercise rest timer as its own row; Seconds is the reps column + 1? No — it's the column after Distance.
      const secsIdx = col('seconds');
      const secs = secsIdx >= 0 ? num(r[secsIdx]) : null;
      if (secs && secs >= 5 && secs <= 3600) ex.rest_seconds = Math.round(secs);
      continue;
    }
    if (/^note$/i.test(order)) { if (iNotes >= 0 && r[iNotes]) ex.notes = r[iNotes].trim(); continue; }
    const warmup = /^w/i.test(order); // Strong marks warm-up sets as W, W1, ...
    if (!warmup && !/^\d+$/.test(order)) continue;
    const set: StrongSet = {
      set_type: warmup ? 'warmup' : 'working',
      weight: num(r[iW]),
      reps: num(r[iReps]) != null ? Math.round(num(r[iReps])!) : null,
      rpe: iRpe >= 0 ? num(r[iRpe]) : null,
    };
    if (!ex.notes && iNotes >= 0 && (r[iNotes] || '').trim()) ex.notes = r[iNotes].trim();
    ex.sets.push(set);
  }

  const workouts = [...byWorkout.values()]
    .map((w) => ({ ...w, exercises: w.exercises.filter((e) => e.sets.length > 0) }))
    .filter((w) => w.exercises.length > 0)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  if (workouts.length === 0) warnings.push('No workouts found in the file.');
  return { workouts, warnings };
}

// ---------- Strong name -> Ironlog exercise ----------

// Strong's "Exercise (Equipment)" names for movements Ironlog seeds under a
// different name. Only unambiguous mappings — anything else becomes custom.
const EXPLICIT: Record<string, string> = {
  'squat (barbell)': 'Back Squat',
  'front squat (barbell)': 'Front Squat',
  'deadlift (barbell)': 'Deadlift',
  'romanian deadlift (barbell)': 'Romanian Deadlift',
  'sumo deadlift (barbell)': 'Sumo Deadlift',
  'bench press (barbell)': 'Barbell Bench Press',
  'bench press (dumbbell)': 'Dumbbell Bench Press',
  'incline bench press (barbell)': 'Incline Barbell Bench Press',
  'incline bench press (dumbbell)': 'Incline Dumbbell Press',
  'chest press (machine)': 'Machine Chest Press',
  'bent over row (barbell)': 'Barbell Row',
  'seated row (cable)': 'Seated Cable Row',
  'seated row (machine)': 'Machine Row',
  'lat pulldown (cable)': 'Lat Pulldown',
  'lat pulldown (machine)': 'Lat Pulldown',
  'overhead press (barbell)': 'Overhead Press',
  'shoulder press (machine)': 'Machine Shoulder Press',
  'shoulder press (plate loaded)': 'Machine Shoulder Press',
  'shoulder press (dumbbell)': 'Seated Dumbbell Shoulder Press',
  'lateral raise (dumbbell)': 'Lateral Raise',
  'lateral raise (cable)': 'Cable Lateral Raise',
  'face pull (cable)': 'Face Pull',
  'bicep curl (barbell)': 'Barbell Curl',
  'bicep curl (dumbbell)': 'Dumbbell Curl',
  'bicep curl (cable)': 'Cable Curl',
  'hammer curl (dumbbell)': 'Hammer Curl',
  'preacher curl (barbell)': 'Preacher Curl',
  'triceps pushdown (cable - straight bar)': 'Triceps Pushdown',
  'triceps pushdown (cable)': 'Triceps Pushdown',
  'skullcrusher (barbell)': 'Skull Crusher',
  'hip thrust (barbell)': 'Hip Thrust',
  'leg extension (machine)': 'Leg Extension',
  'leg curl (machine)': 'Leg Curl',
  'seated leg curl (machine)': 'Seated Leg Curl',
  'leg press (machine)': 'Leg Press',
  'standing calf raise (machine)': 'Standing Calf Raise',
  'standing calf raise (smith machine)': 'Standing Calf Raise',
  'standing calf raise (barbell)': 'Standing Calf Raise',
  'seated calf raise (machine)': 'Seated Calf Raise',
  'goblet squat (kettlebell)': 'Kettlebell Goblet Squat',
  'goblet squat (dumbbell)': 'Goblet Squat',
};

const MUSCLE_HINTS: [RegExp, string][] = [
  [/calf/, 'calves'],
  [/leg curl|hamstring|nordic|good morning/, 'hamstrings'],
  [/squat|lunge|leg press|leg extension|step.?up/, 'quads'],
  [/thrust|glute|kickback|abduction/, 'glutes'],
  [/deadlift|row|pulldown|pull.?up|chin.?up|shrug|back extension/, 'back'],
  [/pushdown|tricep|skull|kickback/, 'triceps'],
  [/curl/, 'biceps'],
  [/bench|chest|fly|push.?up|dip|pec/, 'chest'],
  [/shoulder|delt|raise(?!.*leg)|press/, 'shoulders'],
  [/plank|crunch|sit.?up|ab |leg raise|core|twist/, 'core'],
];

const EQUIP_HINTS: [RegExp, string][] = [
  [/barbell|smith/, 'barbell'], [/dumbbell/, 'dumbbell'], [/cable/, 'cable'],
  [/machine|plate loaded|assisted|stairmaster|treadmill/, 'machine'],
  [/kettlebell/, 'kettlebell'], [/band/, 'band'], [/bodyweight|weighted/, 'bodyweight'],
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
}

export type ExerciseMatch =
  | { kind: 'existing'; id: number }
  | { kind: 'create'; name: string; muscle: string; equipment: string };

export function matchStrongExercise(
  strongName: string,
  library: { id: number; name: string }[]
): ExerciseMatch {
  const n = norm(strongName);
  const byName = new Map(library.map((e) => [norm(e.name), e.id]));

  const mapped = EXPLICIT[n];
  if (mapped != null && byName.has(norm(mapped))) return { kind: 'existing', id: byName.get(norm(mapped))! };

  // assisted variants have inverted weight semantics — never merge into the base lift
  if (!/assisted/.test(n)) {
    if (byName.has(n)) return { kind: 'existing', id: byName.get(n)! };
    const stripped = norm(n.replace(/\(.*?\)/g, ''));
    if (byName.has(stripped)) return { kind: 'existing', id: byName.get(stripped)! };
  }

  const muscle = MUSCLE_HINTS.find(([re]) => re.test(n))?.[1] || 'other';
  const equipment = EQUIP_HINTS.find(([re]) => re.test(n))?.[1] || 'other';
  return { kind: 'create', name: strongName.trim().slice(0, 120), muscle, equipment };
}
