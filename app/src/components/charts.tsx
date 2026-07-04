import React, { useMemo, useState } from 'react';

// Minimal, bespoke SVG charts — no library.
type Pt = { x: string; y: number };

export function LineChart({ data, height = 160, color = '#ff9f0a', unit = '', yFmt }: {
  data: Pt[]; height?: number; color?: string; unit?: string; yFmt?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 340, H = height, PL = 6, PR = 6, PT = 14, PB = 22;
  const fmt = yFmt || ((v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 10) / 10)));
  const { path, area, pts, min, max } = useMemo(() => {
    if (data.length === 0) return { path: '', area: '', pts: [] as { cx: number; cy: number }[], min: 0, max: 0 };
    const ys = data.map((d) => d.y);
    let min = Math.min(...ys), max = Math.max(...ys);
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    min -= span * 0.12; max += span * 0.12;
    const iw = W - PL - PR, ih = H - PT - PB;
    const px = (i: number) => PL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const py = (y: number) => PT + ih - ((y - min) / (max - min)) * ih;
    const pts = data.map((d, i) => ({ cx: px(i), cy: py(d.y) }));
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
    const area = `${path} L${pts[pts.length - 1].cx.toFixed(1)},${H - PB} L${pts[0].cx.toFixed(1)},${H - PB} Z`;
    return { path, area, pts, min, max };
  }, [data, H]);

  if (data.length === 0) return <div className="h-[120px] flex items-center justify-center text-dim text-[13px]">No data yet</div>;
  const h = hover != null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          let best = 0, bd = Infinity;
          pts.forEach((p, i) => { const d = Math.abs(p.cx - x); if (d < bd) { bd = d; best = i; } });
          setHover(best);
        }}
        onTouchMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.touches[0].clientX - r.left) / r.width) * W;
          let best = 0, bd = Infinity;
          pts.forEach((p, i) => { const d = Math.abs(p.cx - x); if (d < bd) { bd = d; best = i; } });
          setHover(best);
        }}>
        <defs>
          <linearGradient id={`g${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#g${color.slice(1)})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={hover === i ? 4.5 : data.length <= 24 ? 2.5 : 0}
            fill={hover === i ? color : '#0a0a0b'} stroke={color} strokeWidth="1.5" />
        ))}
        {h && hover != null && <line x1={pts[hover].cx} y1={PT} x2={pts[hover].cx} y2={H - PB} stroke="#3a3a42" strokeDasharray="3 3" />}
        <text x={PL} y={H - 6} fill="#5b5b63" fontSize="10">{data[0].x}</text>
        <text x={W - PR} y={H - 6} fill="#5b5b63" fontSize="10" textAnchor="end">{data[data.length - 1].x}</text>
      </svg>
      <div className="absolute top-0 right-1 text-right pointer-events-none">
        <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>
          {h ? `${fmt(h.y)}${unit}` : `${fmt(data[data.length - 1].y)}${unit}`}
        </span>
        <span className="text-[11px] text-dim ml-1.5">{h ? h.x : 'latest'}</span>
      </div>
    </div>
  );
}

export function BarChart({ data, height = 150, color = '#ff9f0a', yFmt }: {
  data: Pt[]; height?: number; color?: string; yFmt?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 340, H = height, PB = 22, PT = 16;
  const fmt = yFmt || ((v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))));
  if (data.length === 0) return <div className="h-[120px] flex items-center justify-center text-dim text-[13px]">No data yet</div>;
  const max = Math.max(...data.map((d) => d.y), 1);
  const bw = Math.min(34, (W - 12) / data.length - 6);
  const step = (W - 12) / data.length;
  const h = hover != null ? data[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => {
          const bh = Math.max(2, ((d.y / max) * (H - PB - PT)));
          const x = 6 + i * step + (step - bw) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={x} y={H - PB - bh} width={bw} height={bh} rx={5}
                fill={hover === i ? color : color + 'cc'} opacity={hover == null || hover === i ? 1 : 0.45} />
              {(data.length <= 8 || i === 0 || i === data.length - 1) && (
                <text x={x + bw / 2} y={H - 6} fill="#5b5b63" fontSize="9.5" textAnchor="middle">{d.x}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute top-0 right-1 text-right pointer-events-none">
        <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>{h ? fmt(h.y) : fmt(data[data.length - 1].y)}</span>
        <span className="text-[11px] text-dim ml-1.5">{h ? h.x : 'latest'}</span>
      </div>
    </div>
  );
}

export function HBarList({ items, colors }: { items: { label: string; value: number; pct?: number }[]; colors?: Record<string, string> }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3">
          <div className="w-20 text-[12px] text-mut capitalize truncate shrink-0">{it.label}</div>
          <div className="grow h-4 bg-surface2 rounded-md overflow-hidden">
            <div className="h-full rounded-md transition-all"
              style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, background: (colors && colors[it.label]) || '#ff9f0a' }} />
          </div>
          <div className="w-12 text-right text-[12px] text-mut tabular-nums shrink-0">{it.pct != null ? `${it.pct}%` : Math.round(it.value)}</div>
        </div>
      ))}
    </div>
  );
}
