import React, { useEffect, useMemo, useState } from 'react';
import { api, GarminActivity } from '../api';
import { Card, Empty, Spinner, Stat, Button } from '../components/ui';
import { BarChart } from '../components/charts';
import { fmtDate, fmtTime, fmtDuration, fmtSwimDistance, fmtSwimPace, isoWeekStartLocal, todayISO } from '../util';

export function Swims({ onNav }: { onNav: (r: string) => void }) {
  const [swims, setSwims] = useState<GarminActivity[] | null>(null);
  useEffect(() => { api.garmin.swims(300).then(setSwims); }, []);

  const stats = useMemo(() => {
    if (!swims || swims.length === 0) return null;
    const monthStart = todayISO().slice(0, 7) + '-01';
    const thisMonth = swims.filter((s) => s.started_at.slice(0, 10) >= monthStart);
    const mDist = thisMonth.reduce((a, s) => a + (s.distance_m || 0), 0);
    const withDist = swims.filter((s) => s.distance_m && s.duration_s);
    const longest = withDist.length ? withDist.reduce((a, b) => ((a.distance_m || 0) > (b.distance_m || 0) ? a : b)) : null;
    // best pace over a meaningful distance (≥ 400 m)
    const paced = withDist.filter((s) => (s.distance_m || 0) >= 400);
    const fastest = paced.length ? paced.reduce((a, b) =>
      (a.duration_s! / a.distance_m!) < (b.duration_s! / b.distance_m!) ? a : b) : null;
    // weekly distance, last 12 weeks
    const weeks = new Map<string, number>();
    for (const s of swims) {
      const wk = isoWeekStartLocal(s.started_at.slice(0, 10));
      weeks.set(wk, (weeks.get(wk) || 0) + (s.distance_m || 0));
    }
    const weekly = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    return { thisMonthSwims: thisMonth.length, mDist, longest, fastest, weekly };
  }, [swims]);

  if (!swims) return <Spinner />;
  if (swims.length === 0) {
    return <Empty icon="🏊" title="No swims yet"
      sub="Import Garmin activities (FIT, TCX, GPX, or the activities CSV) and your swims appear here with distance, pace per 100 m, and heart rate."
      action={<Button small kind="ghost" onClick={() => onNav('garmin')}>Go to Garmin import</Button>} />;
  }

  return (
    <div className="px-4 pt-2 pb-6 space-y-3">
      {stats && (
        <Card className="px-4 py-4 flex gap-2">
          <Stat label="swims this month" value={stats.thisMonthSwims} />
          <Stat label="distance" value={fmtSwimDistance(stats.mDist)} sub="this month" />
          <Stat label="longest" value={stats.longest ? fmtSwimDistance(stats.longest.distance_m) : '–'} accent />
        </Card>
      )}

      {stats && stats.fastest && (
        <Card className="px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[13px] text-mut">Best pace (swims ≥ 400 m)</div>
            <div className="text-[17px] font-bold text-accent tabular-nums">{fmtSwimPace(stats.fastest.duration_s, stats.fastest.distance_m)}</div>
          </div>
          <div className="text-right text-[12px] text-mut">
            {fmtSwimDistance(stats.fastest.distance_m)}<br />{fmtDate(stats.fastest.started_at)}
          </div>
        </Card>
      )}

      {stats && stats.weekly.length > 1 && (
        <Card className="p-4">
          <div className="text-[13px] font-semibold text-mut mb-2">Weekly distance <span className="text-dim font-normal">· m</span></div>
          <BarChart color="#0a84ff" data={stats.weekly.map(([wk, m]) => ({ x: wk.slice(5), y: Math.round(m) }))}
            yFmt={(v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v))} />
        </Card>
      )}

      <h2 className="text-[13px] font-semibold text-mut uppercase tracking-wide pt-1">All swims</h2>
      <div className="space-y-1.5">
        {swims.map((s) => (
          <Card key={s.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[14px] font-semibold">{s.name || 'Swim'}</div>
              <div className="text-[13px] font-semibold text-accent tabular-nums">{fmtSwimDistance(s.distance_m)}</div>
            </div>
            <div className="flex justify-between text-[12px] text-mut tabular-nums">
              <span>{fmtDate(s.started_at)} · {fmtTime(s.started_at)}</span>
              <span>{fmtDuration(s.duration_s)} · {fmtSwimPace(s.duration_s, s.distance_m)}{s.avg_hr ? ` · ♥ ${s.avg_hr}` : ''}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
