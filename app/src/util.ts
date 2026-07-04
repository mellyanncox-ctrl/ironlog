// Units: DB stores kg. Display converts per setting.
let currentUnits: 'kg' | 'lb' = 'kg';
export function setUnits(u: 'kg' | 'lb') { currentUnits = u; }
export function getUnits() { return currentUnits; }

export function kgOut(kg: number | null | undefined): number | null {
  if (kg == null) return null;
  const v = currentUnits === 'lb' ? kg * 2.2046226 : kg;
  return Math.round(v * 10) / 10;
}
export function inKg(display: number | null | undefined): number | null {
  if (display == null || Number.isNaN(display)) return null;
  return currentUnits === 'lb' ? display / 2.2046226 : display;
}
export function fmtWeight(kg: number | null | undefined, withUnit = true): string {
  const v = kgOut(kg);
  if (v == null) return '—';
  const s = v % 1 === 0 ? String(v) : v.toFixed(1);
  return withUnit ? `${s} ${currentUnits}` : s;
}
export function fmtVolume(kg: number): string {
  const v = currentUnits === 'lb' ? kg * 2.2046226 : kg;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k ${currentUnits}`;
  return `${Math.round(v)} ${currentUnits}`;
}
export function e1rm(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || reps < 1 || reps > 12) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}
export function fmtDuration(s: number | null | undefined): string {
  if (s == null) return '—';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
export function fmtClock(s: number): string {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
// Date-only strings ("2026-07-04") must be parsed as LOCAL midnight, not UTC —
// otherwise users west of Greenwich see every date shifted one day back.
function parseLocal(iso: string): Date {
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
}
export function fmtDate(iso: string): string {
  return parseLocal(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
export function fmtDateLong(iso: string): string {
  return parseLocal(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
export function fmtTime(iso: string): string {
  return parseLocal(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function todayDow(): number { return (new Date().getDay() + 6) % 7; }
export function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }
export function cx(...parts: (string | false | null | undefined)[]): string { return parts.filter(Boolean).join(' '); }

// Distance in km or miles per unit setting; pace as min/km or min/mi.
export function fmtDistance(m: number | null | undefined): string {
  if (m == null) return '—';
  const v = getUnits() === 'lb' ? m / 1609.344 : m / 1000;
  return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${getUnits() === 'lb' ? 'mi' : 'km'}`;
}
export function fmtPace(durationS: number | null | undefined, distanceM: number | null | undefined): string {
  if (!durationS || !distanceM || distanceM <= 0) return '—';
  const unitM = getUnits() === 'lb' ? 1609.344 : 1000;
  const secPerUnit = durationS / (distanceM / unitM);
  const min = Math.floor(secPerUnit / 60), sec = Math.round(secPerUnit % 60);
  return `${min}:${String(sec).padStart(2, '0')} /${getUnits() === 'lb' ? 'mi' : 'km'}`;
}
export function isoWeekStartLocal(dateISO: string): string {
  const d = new Date(dateISO.length === 10 ? dateISO + 'T00:00:00' : dateISO);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const MUSCLE_COLORS: Record<string, string> = {
  chest: '#ff9f0a', back: '#0a84ff', shoulders: '#ffd60a', biceps: '#bf5af2',
  triceps: '#5e5ce6', forearms: '#64d2ff', quads: '#30d158', hamstrings: '#66d4cf',
  glutes: '#ff6482', calves: '#ac8e68', core: '#ff453a',
};
