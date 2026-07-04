import React from 'react';
import { cx } from '../util';

// Macro palette — matches the reference (calories read on the blue accent).
export const MACRO = {
  protein: '#f5a623', // amber
  carbs: '#2dd4bf',   // teal
  fat: '#b57cf6',     // purple
};
export const CAL = '#4b93f8'; // calorie / primary blue
const OVER = '#ff5a52';

// A progress bar that fills toward a target and shows a diagonally-hatched cap
// once it goes over — the little striped overshoot from the reference.
export function TrackBar({ value, target, color, height = 10 }: {
  value: number; target: number | null; color: string; height?: number;
}) {
  const pct = target && target > 0 ? value / target : 0;
  const over = pct > 1;
  const fillW = target ? Math.min(100, pct * 100) : (value > 0 ? 100 : 0);
  return (
    <div className="w-full rounded-full bg-surface2 overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full flex justify-end" style={{ width: `${Math.max(target ? 3 : 0, fillW)}%`, background: color, transition: 'width 0.5s cubic-bezier(0.2,0.8,0.2,1)' }}>
        {over && (
          <div style={{ width: 16, borderTopRightRadius: 999, borderBottomRightRadius: 999, backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 3px, rgba(255,255,255,0) 3px 6px)' }} />
        )}
      </div>
    </div>
  );
}

// Calories block: label, big eaten/target, over|left, full-width bar.
export function CalorieBlock({ eaten, target, remaining }: { eaten: number; target: number | null; remaining: number | null }) {
  const over = remaining != null && remaining < 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[15px] font-semibold">Calories</span>
        {target != null && (
          <span className="text-right tabular-nums">
            <span className={cx('text-[17px] font-bold', over ? 'text-bad' : 'text-ink')}>{Math.abs(remaining ?? 0).toLocaleString()}</span>
            <span className="text-[13px] text-mut ml-1">{over ? 'over' : 'left'}</span>
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 mb-3 tabular-nums">
        <span className="text-[30px] font-bold leading-none">{Math.round(eaten).toLocaleString()}</span>
        <span className="text-[15px] text-mut">{target != null ? `cal / ${target.toLocaleString()}` : 'cal'}</span>
      </div>
      <TrackBar value={eaten} target={target} color={over ? OVER : CAL} height={11} />
    </div>
  );
}

// One macro column for the macros card.
export function MacroCol({ label, value, target, color, remaining }: {
  label: string; value: number; target: number | null; color: string; remaining?: boolean;
}) {
  const shown = remaining && target != null ? Math.max(0, Math.round(target - value)) : Math.round(value);
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[13px] text-mut mb-0.5">{label}</div>
      <div className="mb-2 tabular-nums">
        <span className="text-[19px] font-bold">{shown}</span>
        <span className="text-[12px] text-dim"> g</span>
        {target != null && <span className="text-[12px] text-dim"> / {Math.round(target)}</span>}
      </div>
      <TrackBar value={value} target={target} color={color} />
    </div>
  );
}

export function MacroRow({ p, c, f, tp, tc, tf }: { p: number; c: number; f: number; tp: number | null; tc: number | null; tf: number | null }) {
  return (
    <div className="flex gap-4">
      <MacroCol label="Carbs" value={c} target={tc} color={MACRO.carbs} />
      <MacroCol label="Fat" value={f} target={tf} color={MACRO.fat} />
      <MacroCol label="Protein" value={p} target={tp} color={MACRO.protein} />
    </div>
  );
}

// Weekday check strip — one week, logged days show a tick, today gets a dot.
export function WeekStrip({ days, selected, onSelect }: {
  days: { iso: string; letter: string; logged: boolean; today: boolean }[];
  selected: string; onSelect: (iso: string) => void;
}) {
  return (
    <div className="flex justify-between">
      {days.map((d) => {
        const isSel = d.iso === selected;
        return (
          <button key={d.iso} onClick={() => onSelect(d.iso)} className="flex flex-col items-center gap-1.5 w-9">
            <span className={cx('text-[12px] font-medium', d.today ? 'text-accent' : 'text-mut')}>
              {d.today && <span className="block h-1 w-1 rounded-full bg-accent mx-auto -mb-0.5" />}
              {d.letter}
            </span>
            <span className={cx('w-8 h-8 rounded-full flex items-center justify-center text-[13px] transition-colors',
              d.logged ? 'bg-surface2 text-ink' : 'border border-edge text-dim',
              isSel && 'ring-2 ring-accent ring-offset-2 ring-offset-bg')}>
              {d.logged ? '✓' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Minimal line icons per meal — matches the reference's outline style.
export function MealIcon({ type, className }: { type: string; className?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const p = {
    breakfast: (<><path d="M4 8h13v5.5a4.5 4.5 0 0 1-4.5 4.5H8.5A4.5 4.5 0 0 1 4 13.5V8Z" /><path d="M17 9.5h2.2a2.3 2.3 0 0 1 0 4.6H17" /><path d="M8 3.2v1.6M12 3.2v1.6" /></>),
    lunch: (<><path d="M3.6 10.2c1.4-3 4.9-4.7 8.4-4.7s7 1.7 8.4 4.7" /><path d="M4 13.4h16" /><path d="M4.5 16.4c.4 1.7 1.9 2.6 3.5 2.6h8c1.6 0 3.1-.9 3.5-2.6" /></>),
    dinner: (<><path d="M7.5 3v7.5M5.3 3v4a2.2 2.2 0 0 0 4.4 0V3M7.5 10.5V21" /><path d="M17 3c-1.6 0-2.6 2.2-2.6 5.2s1 4.3 2.6 4.3ZM17 12.5V21" /></>),
    snacks: (<><path d="M12 7.4c-3 0-5.2 2.1-5.2 6 0 3.1 2.2 6.2 5.2 6.2s5.2-3.1 5.2-6.2c0-3.9-2.2-6-5.2-6Z" /><path d="M12 7.4c0-2 1.1-3.1 3.1-3.1" /></>),
  }[type] || null;
  return <svg viewBox="0 0 24 24" width="22" height="22" className={className} {...common}>{p}</svg>;
}
