import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Card, Spinner, Button } from '../components/ui';
import { cx } from '../util';

// Brand colour — Triathlon Pink magenta (from their logo palette).
const PINK = '#db2264';

// ── Event facts (Triathlon Pink Perth, Long course) ──────────────────────────
// Source: theeventcrew.com.au/event/triathlon-pink/rounds/perth/
const EVENT = {
  name: 'Triathlon Pink — Perth',
  course: 'Long course',
  dateISO: '2026-11-08',
  dateLabel: 'Sunday 8 November 2026',
  venue: 'WA Athletics Stadium',
  startTime: '8:00am',
  swim: '300 m pool swim',
  bike: '8 km closed-road ride',
  run: '5 km run',
};

type Task = { id: string; icon: string; label: string };
type Week = { n: number; start: string; phase: string; focus: string; tasks: Task[] };

// ── The plan ─────────────────────────────────────────────────────────────────
// Tailored for a strong runner who is a near-beginner at swimming and cycling,
// with 2 dedicated swim/bike sessions a week (1 swim + 1 ride) plus easy runs.
// Goal: finish the Long feeling strong — not race it. 16 weeks, Jul 20 → race.
const WEEKS: Week[] = [
  { n: 1, start: '2026-07-20', phase: 'Foundation', focus: 'Get comfortable in the water and on the bike.', tasks: [
    { id: 'w1-swim', icon: '🏊', label: 'Swim: 6 × 25 m easy freestyle — rest as needed, focus on slow exhale underwater' },
    { id: 'w1-bike', icon: '🚴', label: 'Ride: 30 min easy — practise gears & braking, get used to the saddle' },
    { id: 'w1-run', icon: '🏃', label: 'Run: 3–4 km easy (your strong leg — keep it relaxed)' },
    { id: 'w1-str', icon: '🧰', label: '10 min post-session stretch: hips, calves, shoulders' },
  ] },
  { n: 2, start: '2026-07-27', phase: 'Foundation', focus: 'Build water confidence and time in the saddle.', tasks: [
    { id: 'w2-swim', icon: '🏊', label: 'Swim: 8 × 25 m — breathe every 3rd stroke on 2 of the lengths' },
    { id: 'w2-bike', icon: '🚴', label: 'Ride: 40 min easy — include a few gentle hills, stay seated' },
    { id: 'w2-run', icon: '🏃', label: 'Run: 4–5 km easy' },
  ] },
  { n: 3, start: '2026-08-03', phase: 'Foundation', focus: 'Longer swims, steadier riding.', tasks: [
    { id: 'w3-swim', icon: '🏊', label: 'Swim: 4 × 50 m + 4 × 25 m, short rests' },
    { id: 'w3-bike', icon: '🚴', label: 'Ride: 45 min / ~12 km steady' },
    { id: 'w3-run', icon: '🏃', label: 'Run: 5 km easy' },
    { id: 'w3-skill', icon: '🧰', label: 'Skills: practise mounting & dismounting the bike smoothly' },
  ] },
  { n: 4, start: '2026-08-10', phase: 'Foundation', focus: 'First continuous swim — then ease back a touch.', tasks: [
    { id: 'w4-swim', icon: '🏊', label: 'Swim: 100 m continuous, then 4 × 25 m easy' },
    { id: 'w4-bike', icon: '🚴', label: 'Ride: 40 min relaxed' },
    { id: 'w4-run', icon: '🏃', label: 'Run: 4 km easy' },
    { id: 'w4-mile', icon: '🏅', label: 'Milestone: swim 100 m without stopping' },
  ] },
  { n: 5, start: '2026-08-17', phase: 'Build', focus: 'Stretch the swim distance out.', tasks: [
    { id: 'w5-swim', icon: '🏊', label: 'Swim: 150 m continuous + 4 × 25 m drills' },
    { id: 'w5-bike', icon: '🚴', label: 'Ride: 50 min / ~14 km' },
    { id: 'w5-run', icon: '🏃', label: 'Run: 5 km easy' },
  ] },
  { n: 6, start: '2026-08-24', phase: 'Build', focus: 'Meet the brick — running straight off the bike.', tasks: [
    { id: 'w6-swim', icon: '🏊', label: 'Swim: 2 × 100 m + 2 × 50 m' },
    { id: 'w6-brick', icon: '🔁', label: 'Brick: 45 min ride → 10 min easy run immediately after' },
    { id: 'w6-run', icon: '🏃', label: 'Run: 5 km easy (separate day)' },
  ] },
  { n: 7, start: '2026-08-31', phase: 'Build', focus: 'Distance up in the water.', tasks: [
    { id: 'w7-swim', icon: '🏊', label: 'Swim: 200 m continuous' },
    { id: 'w7-bike', icon: '🚴', label: 'Ride: 55 min / ~16 km with 3 × 3 min at a firmer effort' },
    { id: 'w7-run', icon: '🏃', label: 'Run: 5–6 km easy' },
  ] },
  { n: 8, start: '2026-09-07', phase: 'Build', focus: 'Consolidate — everything a bit more relaxed.', tasks: [
    { id: 'w8-swim', icon: '🏊', label: 'Swim: 3 × 100 m' },
    { id: 'w8-brick', icon: '🔁', label: 'Brick: 50 min steady ride → 10 min run off the bike' },
    { id: 'w8-run', icon: '🏃', label: 'Run: 5 km easy' },
  ] },
  { n: 9, start: '2026-09-14', phase: 'Build', focus: 'Recovery week + a distance check.', tasks: [
    { id: 'w9-swim', icon: '🏊', label: 'Swim: 250 m continuous, easy pace' },
    { id: 'w9-bike', icon: '🚴', label: 'Ride: 40 min easy' },
    { id: 'w9-run', icon: '🏃', label: 'Run: 4 km easy' },
    { id: 'w9-mile', icon: '🏅', label: 'Milestone: swim 250 m without stopping' },
  ] },
  { n: 10, start: '2026-09-21', phase: 'Race-specific', focus: 'Hit the race swim distance.', tasks: [
    { id: 'w10-swim', icon: '🏊', label: 'Swim: 300 m continuous — race distance! then 2 × 25 m easy' },
    { id: 'w10-bike', icon: '🚴', label: 'Ride: 8 km at steady race effort' },
    { id: 'w10-run', icon: '🏃', label: 'Run: 5 km easy' },
    { id: 'w10-mile', icon: '🏅', label: 'Milestone: swim the full 300 m' },
  ] },
  { n: 11, start: '2026-09-28', phase: 'Race-specific', focus: 'Rehearse the sequence and transitions.', tasks: [
    { id: 'w11-swim', icon: '🏊', label: 'Swim: 300 m + short cooldown' },
    { id: 'w11-brick', icon: '🔁', label: 'Brick: 10 km ride → 2 km run' },
    { id: 'w11-skill', icon: '🧰', label: 'Transitions: set up a mock transition at home, practise swim→bike→run changeovers' },
  ] },
  { n: 12, start: '2026-10-05', phase: 'Race-specific', focus: 'Race-effort brick.', tasks: [
    { id: 'w12-swim', icon: '🏊', label: 'Swim: 300 m at steady effort' },
    { id: 'w12-brick', icon: '🔁', label: 'Brick: 8 km ride at race effort → 3 km run' },
    { id: 'w12-run', icon: '🏃', label: 'Run: 5 km easy (separate day)' },
  ] },
  { n: 13, start: '2026-10-12', phase: 'Race-specific', focus: 'Full dress rehearsal.', tasks: [
    { id: 'w13-swim', icon: '🏊', label: 'Swim: 300 m' },
    { id: 'w13-brick', icon: '🔁', label: 'Full brick: 8 km ride + 5 km run back-to-back at easy race pace' },
    { id: 'w13-skill', icon: '🧰', label: 'Rehearse race-morning routine: gear, breakfast, warm-up' },
    { id: 'w13-mile', icon: '🏅', label: 'Milestone: complete a full-distance brick' },
  ] },
  { n: 14, start: '2026-10-19', phase: 'Sharpen', focus: 'Sharpen — a little faster, still fresh.', tasks: [
    { id: 'w14-swim', icon: '🏊', label: 'Swim: 300 m with a few faster 25 m efforts' },
    { id: 'w14-bike', icon: '🚴', label: 'Ride: 8 km with 4 × 2 min at effort' },
    { id: 'w14-run', icon: '🏃', label: 'Run: 4 km with a few strides' },
  ] },
  { n: 15, start: '2026-10-26', phase: 'Taper', focus: 'Ease off — bank the rest, not more fitness.', tasks: [
    { id: 'w15-swim', icon: '🏊', label: 'Swim: 200 m relaxed' },
    { id: 'w15-bike', icon: '🚴', label: 'Ride: 6 km easy' },
    { id: 'w15-run', icon: '🏃', label: 'Run: 3–4 km easy' },
    { id: 'w15-skill', icon: '🧰', label: 'Check the bike, pump the tyres, start your race-day kit list' },
  ] },
  { n: 16, start: '2026-11-02', phase: 'Race week', focus: 'Stay loose, stay rested — trust the work.', tasks: [
    { id: 'w16-swim', icon: '🏊', label: 'Mon–Wed: one short easy swim (100–150 m)' },
    { id: 'w16-spin', icon: '🚴', label: 'Mon–Wed: one 20 min spin + one easy 2–3 km jog' },
    { id: 'w16-rest', icon: '😴', label: 'Thu–Fri: rest & light stretch, hydrate, lay out your gear' },
    { id: 'w16-loose', icon: '🧰', label: 'Sat: 10–15 min easy loosener, early night' },
    { id: 'w16-race', icon: '🏁', label: 'SUN 8 NOV — RACE DAY: 300 m swim · 8 km bike · 5 km run. You’ve got this 💗' },
  ] },
];

const ALL_TASK_IDS = WEEKS.flatMap((w) => w.tasks.map((t) => t.id));

// ── date helpers ─────────────────────────────────────────────────────────────
function addDays(iso: string, days: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + days);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function rangeLabel(start: string): string {
  const a = addDays(start, 0), b = addDays(start, 6);
  const am = MONTHS[a.getMonth()], bm = MONTHS[b.getMonth()];
  return am === bm ? `${am} ${a.getDate()} – ${b.getDate()}` : `${am} ${a.getDate()} – ${bm} ${b.getDate()}`;
}
function currentWeekIndex(): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let idx = -1;
  for (let i = 0; i < WEEKS.length; i++) {
    const start = addDays(WEEKS[i].start, 0);
    if (today >= start) idx = i;
  }
  // Before the plan starts, treat week 1 as current so it opens by default.
  return idx < 0 ? 0 : idx;
}
function daysUntilRace(): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const race = addDays(EVENT.dateISO, 0);
  return Math.round((race.getTime() - today.getTime()) / 86400000);
}

export function TriathlonPink() {
  const [done, setDone] = useState<Set<string> | null>(null);
  const curIdx = useMemo(currentWeekIndex, []);
  const [open, setOpen] = useState<number>(curIdx);

  useEffect(() => { api.tripink.get().then((ids) => setDone(new Set(ids))); }, []);

  async function toggle(id: string) {
    if (!done) return;
    // optimistic
    const next = new Set(done);
    if (next.has(id)) next.delete(id); else next.add(id);
    setDone(next);
    const server = await api.tripink.toggle(id);
    setDone(new Set(server));
  }
  async function reset() {
    if (!window.confirm('Clear every tick and start the plan fresh?')) return;
    await api.tripink.reset();
    setDone(new Set());
  }

  if (!done) return <Spinner />;

  const total = ALL_TASK_IDS.length;
  const completed = ALL_TASK_IDS.filter((id) => done.has(id)).length;
  const pct = Math.round((completed / total) * 100);
  const days = daysUntilRace();

  return (
    <div className="px-4 pt-2 pb-8 space-y-3">
      {/* Hero */}
      <div className="rounded-3xl overflow-hidden border border-edge"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, ${PINK}22 0%, transparent 60%), var(--color-surface)` }}>
        <div className="px-5 pt-6 pb-5 flex flex-col items-center text-center">
          <TriPinkLogo className="w-[220px] h-auto" />
          <div className="mt-4 text-[15px] font-semibold text-ink">{EVENT.course} · {EVENT.venue}</div>
          <div className="text-[13px] text-mut">{EVENT.dateLabel} · {EVENT.startTime} start</div>
          <div className="mt-4 flex gap-2 flex-wrap justify-center">
            <Chip>🏊 {EVENT.swim}</Chip>
            <Chip>🚴 {EVENT.bike}</Chip>
            <Chip>🏃 {EVENT.run}</Chip>
          </div>
        </div>
      </div>

      {/* Countdown + overall progress */}
      <Card className="px-4 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-[26px] font-bold tracking-tight" style={{ color: PINK }}>
              {days > 0 ? `${days} days` : days === 0 ? 'Race day!' : 'Done 🎉'}
            </div>
            <div className="text-[12px] text-mut">{days > 0 ? 'until race day' : ''}</div>
          </div>
          <div className="text-right">
            <div className="text-[22px] font-bold tabular-nums">{completed}<span className="text-mut text-[15px]">/{total}</span></div>
            <div className="text-[12px] text-mut">sessions ticked</div>
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: PINK }} />
        </div>
      </Card>

      {/* Weeks */}
      <div className="space-y-2">
        {WEEKS.map((w, i) => {
          const wDone = w.tasks.filter((t) => done.has(t.id)).length;
          const allDone = wDone === w.tasks.length;
          const isCurrent = i === curIdx;
          const isOpen = open === w.n;
          return (
            <Card key={w.n} className="overflow-hidden">
              <button onClick={() => setOpen(isOpen ? -1 : w.n)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-surface2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[15px] shrink-0"
                  style={{ background: allDone ? PINK : 'var(--color-surface2)', color: allDone ? '#fff' : PINK, border: `1px solid ${allDone ? PINK : 'var(--color-edge)'}` }}>
                  {allDone ? '✓' : w.n}
                </div>
                <div className="grow min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">Week {w.n}</span>
                    {isCurrent && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ background: `${PINK}22`, color: PINK }}>This week</span>}
                  </div>
                  <div className="text-[12px] text-mut truncate">{rangeLabel(w.start)} · {w.phase}</div>
                </div>
                <div className="text-[12px] text-mut tabular-nums shrink-0">{wDone}/{w.tasks.length}</div>
                <span className={cx('text-dim transition-transform', isOpen && 'rotate-90')}>›</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-3 pt-1">
                  <div className="text-[12px] text-mut italic mb-2 px-1">{w.focus}</div>
                  <div className="space-y-1">
                    {w.tasks.map((t) => {
                      const checked = done.has(t.id);
                      return (
                        <button key={t.id} onClick={() => toggle(t.id)}
                          className="w-full flex items-start gap-3 px-2.5 py-2.5 rounded-xl text-left active:bg-surface2 transition-colors">
                          <span className="w-5 h-5 rounded-md flex items-center justify-center text-[12px] shrink-0 mt-0.5"
                            style={{ background: checked ? PINK : 'transparent', border: `1.5px solid ${checked ? PINK : 'var(--color-edge)'}`, color: '#fff' }}>
                            {checked ? '✓' : ''}
                          </span>
                          <span className="text-[15px] leading-snug shrink-0">{t.icon}</span>
                          <span className={cx('text-[14px] leading-snug', checked ? 'text-dim line-through' : 'text-ink')}>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="pt-2 flex justify-center">
        <Button kind="danger" small onClick={reset}>Reset all progress</Button>
      </div>
      <div className="text-center text-[11px] text-dim px-6">
        A guide, not gospel — shuffle sessions to fit your week. The two things that matter: keep swimming, keep riding.
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-surface2 border border-edge text-ink">
      {children}
    </span>
  );
}

// Triathlon Pink wordmark, reproduced as a scalable inline SVG so it renders
// crisply and works fully offline (white script "triathlon" over heavy magenta
// "PINK"). Apple script/heavy faces first, with graceful fallbacks.
export function TriPinkLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 128" className={className} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Triathlon Pink">
      <text x="152" y="52" textAnchor="middle" fill="#ffffff"
        style={{ fontFamily: "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive", fontSize: '46px', fontStyle: 'italic', fontWeight: 700 }}>
        triathlon
      </text>
      <text x="150" y="120" textAnchor="middle" fill={PINK}
        style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Arial Black', Impact, sans-serif", fontSize: '76px', fontWeight: 900, letterSpacing: '-3px' }}>
        PINK
      </text>
    </svg>
  );
}
