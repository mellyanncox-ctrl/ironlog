// Local-time date handling. All timestamps are stored as LOCAL naive ISO
// ("2026-07-04T18:05:23") so that streaks, weeks, and reports follow the
// user's wall clock — a 11pm Friday workout must never count as Saturday.
const pad = (n: number) => String(n).padStart(2, '0');

export function localISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
}

// bucket: 'week' (Monday of that ISO week) or 'month' (YYYY-MM); input is a plain date string
export function bucketOf(day: string, bucket: 'week' | 'month'): string {
  if (bucket === 'month') return day.slice(0, 7);
  const d = new Date(day + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return localDate(d);
}

export function isoWeekStart(day: string): string { return bucketOf(day, 'week'); }
export function todayISO(): string { return localDate(); }
