import React from 'react';
import { cx } from '../util';

// Macro palette — distinct from the calorie accent (amber) for instant reads.
export const MACRO = {
  protein: '#0a84ff', // blue
  carbs: '#30d158',   // green
  fat: '#bf5af2',     // purple
};

// Calorie progress ring — the centrepiece of the dashboard. Shows a big
// "remaining" number, fills as you log, and turns red once over budget.
export function CalorieRing({ eaten, target, remaining, size = 168 }: {
  eaten: number; target: number | null; remaining: number | null; size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target && target > 0 ? Math.min(1.15, eaten / target) : 0;
  const over = remaining != null && remaining < 0;
  const color = over ? '#ff453a' : '#ff9f0a';
  const dash = Math.min(1, pct) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1c1c21" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
          style={{ transition: 'stroke-dasharray 0.5s cubic-bezier(0.2,0.8,0.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {target == null ? (
          <>
            <span className="text-[30px] font-bold tabular-nums leading-none">{Math.round(eaten)}</span>
            <span className="text-[12px] text-mut mt-1">kcal eaten</span>
          </>
        ) : (
          <>
            <span className={cx('text-[34px] font-bold tabular-nums leading-none', over && 'text-bad')}>{Math.abs(remaining ?? 0)}</span>
            <span className="text-[12px] text-mut mt-1">{over ? 'kcal over' : 'kcal left'}</span>
          </>
        )}
      </div>
    </div>
  );
}

// A single macro bar: label, grams (of target), fill %.
export function MacroBar({ label, value, target, color }: {
  label: string; value: number; target: number | null; color: string;
}) {
  const pct = target && target > 0 ? Math.min(1, value / target) : 0;
  const over = target != null && value > target * 1.05;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] text-mut">{label}</span>
        <span className="text-[12px] tabular-nums">
          <span className={cx('font-semibold', over ? 'text-bad' : 'text-ink')}>{Math.round(value)}</span>
          {target != null && <span className="text-dim">/{Math.round(target)}g</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(target ? 2 : 0, pct * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

export function MacroRow({ p, c, f, tp, tc, tf }: { p: number; c: number; f: number; tp: number | null; tc: number | null; tf: number | null }) {
  return (
    <div className="flex gap-4">
      <MacroBar label="Protein" value={p} target={tp} color={MACRO.protein} />
      <MacroBar label="Carbs" value={c} target={tc} color={MACRO.carbs} />
      <MacroBar label="Fat" value={f} target={tf} color={MACRO.fat} />
    </div>
  );
}
