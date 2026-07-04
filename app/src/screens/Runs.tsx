import React, { useEffect, useMemo, useState } from 'react';
import { api, GarminActivity } from '../api';
import { Card, Empty, Spinner, Stat, Button } from '../components/ui';
import { BarChart } from '../components/charts';
import { fmtDate, fmtTime, fmtDuration, fmtDistance, fmtPace, getUnits, isoWeekStartLocal, todayISO } from '../util';

export function Runs({ onNav }: { onNav: (r: string) => void }) {
  const [runs, setRuns] = useState<GarminActivity[] | null>(null);
  useEffect(() => { api.garmin.runs(300).then(setRuns); }, []);

  const stats = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    const monthStart = todayISO().slice(0, 7) + '-01';
    const thisMonth = runs.filter((r) => r.started_at.slice(0, 10) >= monthStart);
    const mDist = thisMonth.reduce((a, r) => a + (r.distance_m || 0), 0);
    const withDist = runs.filter((r) => r.distance_m && r.duration_s);
    const longest = withDist.length ? withDist.reduce((a, b) => ((a.distance_m || 0) > (b.distance_m || 0) ? a : b)) : null;
    // best pace over meaningful distance (≥3 km)
    const paced = withDist.filter((r) => (r.distance_m || 0) >= 3000);
    const fastest = paced.length ? paced.reduce((a, b) =>
      (a.duration_s! / a.distance_m!) < (b.duration_s! / b.distance_m!) ? a : b) : null;
    // weekly distance, last 12 weeks
    const weeks = new Map<string, number>();
    for (const r of runs) {
      const wk = isoWeekStartLocal(r.started_at.slice(0, 10));
      weeks.set(wk, (weeks.get(wk) || 0) + (r.distance_m || 0));
    }
    const weekly = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    return { thisMonthRuns: thisMonth.length, mDist, longest, fastest, weekly };
  }, [runs]);

  if (!runs) return <Spinner />;
  if (runs.length === 0) {
    return <Empty icon="🏃" title="No runs yet"
      sub="Import Garmin activities (FIT, TCX, GPX, or the activities CSV) and your runs appear here with distance, pace, and heart rate."
      action={<Button small kind="ghost" onClick={() => onNav('garmin')}>Go to Garmin import</Button>} />;
  }
  const unitDiv = getUnits() === 'lb' ? 1609.344 : 1000;

  return (
    <div className="px-4 pt-2 pb-6 space-y-3">
      {stats && (
        <Card className="px-4 py-4 flex gap-2">
          <Stat label="runs this month" value={stats.thisMonthRuns} />
          <Stat label="distance" value={fmtDistance(stats.mDist)} sub="this month" />
          <Stat label="longest" value={stats.longest ? fmtDistance(stats.longest.distance_m) : '–'} accent />
        </Card>
      )}

      {stats && stats.fastest && (
        <Card className="px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[13px] text-mut">Best pace (runs ≥ 3 km)</div>
            <div className="text-[17px] font-bold text-accent tabular-nums">{fmtPace(stats.fastest.duration_s, stats.fastest.distance_m)}</div>
          </div>
          <div className="text-right text-[12px] text-mut">
            {fmtDistance(stats.fastest.distance_m)}<br />{fmtDate(stats.fastest.started_at)}
          </div>
        </Card>
      )}

      {stats && stats.weekly.length > 1 && (
        <Card className="p-4">
          <div className="text-[13px] font-semibold text-mut mb-2">Weekly distance <span className="text-dim font-normal">· {getUnits() === 'lb' ? 'mi' : 'km'}</span></div>
          <BarChart color="#0a84ff" data={stats.weekly.map(([wk, m]) => ({ x: wk.slice(5), y: Math.round((m / unitDiv) * 10) / 10 }))}
            yFmt={(v) => v.toFixed(1)} />
        </Card>
      )}

      <h2 className="text-[13px] font-semibold text-mut uppercase tracking-wide pt-1">All runs</h2>
      <div className="space-y-1.5">
        {runs.map((r) => (
          <Card key={r.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[14px] font-semibold">{r.name || 'Run'}</div>
              <div className="text-[13px] font-semibold text-accent tabular-nums">{fmtDistance(r.distance_m)}</div>
            </div>
            <div className="flex justify-between text-[12px] text-mut tabular-nums">
              <span>{fmtDate(r.started_at)} · {fmtTime(r.started_at)}</span>
              <span>{fmtDuration(r.duration_s)} · {fmtPace(r.duration_s, r.distance_m)}{r.avg_hr ? ` · ♥ ${r.avg_hr}` : ''}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
