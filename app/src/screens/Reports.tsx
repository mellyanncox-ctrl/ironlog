import React, { useEffect, useState } from 'react';
import { api, Report } from '../api';
import { Card, Seg, Spinner, Stat } from '../components/ui';
import { HBarList } from '../components/charts';
import { fmtVolume, fmtWeight, fmtDate, MUSCLE_COLORS, todayISO, fmtDistance, fmtDuration, getUnits } from '../util';

export function Reports({ onNav }: { onNav: (r: string) => void }) {
  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly');
  const [offset, setOffset] = useState(0); // 0 = current, 1 = previous...
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    setReport(null);
    if (mode === 'weekly') {
      const d = new Date(); d.setDate(d.getDate() - offset * 7);
      api.reports.weekly(d.toISOString().slice(0, 10)).then(setReport);
    } else {
      const d = new Date(); d.setMonth(d.getMonth() - offset);
      api.reports.monthly(d.toISOString().slice(0, 7)).then(setReport);
    }
  }, [mode, offset]);

  return (
    <div className="px-4 pt-2 pb-6">
      <Seg className="mb-3" value={mode} onChange={(m) => { setMode(m); setOffset(0); }}
        options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setOffset(offset + 1)} className="px-3 py-1.5 rounded-lg bg-surface border border-edge text-mut text-[13px]">‹ Prev</button>
        <div className="text-[14px] font-semibold">{report ? report.label : '…'}</div>
        <button onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0}
          className="px-3 py-1.5 rounded-lg bg-surface border border-edge text-mut text-[13px] disabled:opacity-30">Next ›</button>
      </div>

      {!report ? <Spinner /> : (
        <div className="space-y-3">
          <Card className="px-4 py-4 flex gap-2">
            <Stat label="workouts" value={report.workouts_completed} sub={report.scheduled_count ? `of ${report.scheduled_count} planned` : ''} />
            <Stat label="sets" value={report.total_sets} />
            <Stat label="volume" value={fmtVolume(report.total_volume)} />
            <Stat label="PRs" value={report.prs.length} accent />
          </Card>

          {report.prs.length > 0 && (
            <Card className="p-4">
              <div className="text-[13px] font-semibold text-accent mb-2">🏆 PRs hit</div>
              {report.prs.map((p, i) => (
                <div key={i} className="flex justify-between py-1 text-[13.5px]">
                  <span>{p.exercise_name}</span>
                  <span className="text-mut tabular-nums">{p.kind === 'weight' ? `${fmtWeight(p.weight)} × ${p.reps}` : `e1RM ${fmtWeight(p.value)}`}</span>
                </div>
              ))}
            </Card>
          )}

          {report.top_lifts.length > 0 && (
            <Card className="p-4">
              <div className="text-[13px] font-semibold text-mut mb-2">Top lifts by volume</div>
              {report.top_lifts.map((t) => (
                <div key={t.exercise_id} className="flex justify-between py-1 text-[13.5px]">
                  <span className="truncate mr-2">{t.name}</span>
                  <span className="text-mut tabular-nums shrink-0">{fmtVolume(t.volume)} · best {fmtWeight(t.best, false)}×{t.bestReps}</span>
                </div>
              ))}
            </Card>
          )}

          {report.muscle_balance.length > 0 && (
            <Card className="p-4">
              <div className="text-[13px] font-semibold text-mut mb-3">Muscle balance</div>
              <HBarList items={report.muscle_balance.map((m) => ({ label: m.muscle, value: m.volume, pct: m.pct }))} colors={MUSCLE_COLORS} />
            </Card>
          )}

          {report.missed.length > 0 && (
            <Card className="p-4">
              <div className="text-[13px] font-semibold text-bad mb-2">Missed sessions</div>
              {report.missed.map((m, i) => (
                <div key={i} className="flex justify-between py-1 text-[13.5px]">
                  <span>{m.template}</span><span className="text-mut">{fmtDate(m.date)}</span>
                </div>
              ))}
            </Card>
          )}

          {(report as any).running && (
            <Card className="p-4">
              <div className="text-[13px] font-semibold text-blue mb-2">🏃 Running</div>
              <div className="grid grid-cols-3 gap-y-3">
                <Mini label="Runs" v={(report as any).running.runs} />
                <Mini label="Distance" v={fmtDistance((report as any).running.distance_m)} />
                <Mini label="Time" v={fmtDuration((report as any).running.duration_s)} />
                <Mini label="Avg pace" v={(report as any).running.avg_pace_s_per_km != null ? paceStr((report as any).running.avg_pace_s_per_km) : '–'} />
                <Mini label="Avg HR" v={(report as any).running.avg_hr ?? '–'} />
                <Mini label="Longest" v={(report as any).running.longest_m ? fmtDistance((report as any).running.longest_m) : '–'} />
              </div>
            </Card>
          )}

          {(report as any).nutrition && (report as any).nutrition.days_logged > 0 && (
            <Card className="p-4">
              <div className="text-[13px] font-semibold text-mut mb-2">🍽 Nutrition <span className="text-dim font-normal">· {(report as any).nutrition.days_logged} days logged</span></div>
              <div className="grid grid-cols-3 gap-y-3">
                <Mini label="Avg calories" v={(report as any).nutrition.avg_calories?.toLocaleString() ?? '–'} />
                <Mini label="Avg protein" v={(report as any).nutrition.avg_protein != null ? `${(report as any).nutrition.avg_protein}g` : '–'} />
                <Mini label="Avg carbs" v={(report as any).nutrition.avg_carbs != null ? `${(report as any).nutrition.avg_carbs}g` : '–'} />
                <Mini label="Avg fat" v={(report as any).nutrition.avg_fat != null ? `${(report as any).nutrition.avg_fat}g` : '–'} />
                {(report as any).nutrition.protein_target != null && (
                  <Mini label="Protein goal" v={`${(report as any).nutrition.protein_hit_days}/${(report as any).nutrition.days_logged} days`} />
                )}
                {(report as any).nutrition.weight_change != null && (
                  <Mini label="Weight change" v={`${(report as any).nutrition.weight_change > 0 ? '+' : ''}${fmtWeight((report as any).nutrition.weight_change)}`} />
                )}
              </div>
            </Card>
          )}

          {report.recovery && (
            <Card className="p-4">
              <div className="text-[13px] font-semibold text-mut mb-2">Recovery <span className="text-dim font-normal">· Garmin · {report.recovery.days} days</span></div>
              <div className="grid grid-cols-3 gap-y-3">
                <Mini label="Avg sleep" v={report.recovery.avg_sleep_h != null ? `${report.recovery.avg_sleep_h}h` : '–'} />
                <Mini label="Sleep score" v={report.recovery.avg_sleep_score ?? '–'} />
                <Mini label="Resting HR" v={report.recovery.avg_resting_hr ?? '–'} />
                <Mini label="Stress" v={report.recovery.avg_stress ?? '–'} />
                <Mini label="Body battery" v={report.recovery.avg_body_battery ?? '–'} />
                <Mini label="Steps" v={report.recovery.avg_steps != null ? report.recovery.avg_steps.toLocaleString() : '–'} />
              </div>
              {report.recovery_notes.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-edge pt-3">
                  {report.recovery_notes.map((n, i) => <li key={i} className="text-[12.5px] text-mut">• {n}</li>)}
                </ul>
              )}
            </Card>
          )}

          {report.suggestions.length > 0 && (
            <Card className="p-4 border-accent/30">
              <div className="text-[13px] font-semibold text-accent mb-2">Next {mode === 'weekly' ? 'week' : 'month'}</div>
              <ul className="space-y-2">
                {report.suggestions.map((s, i) => <li key={i} className="text-[13px] text-mut leading-relaxed">→ {s}</li>)}
              </ul>
            </Card>
          )}

          {report.workouts_completed === 0 && (
            <div className="text-center text-dim text-[13px] py-6">No workouts logged in this period.</div>
          )}
        </div>
      )}
    </div>
  );
}

// report stores pace as s/km; convert for display units
function paceStr(sPerKm: number): string {
  const s = getUnits() === 'lb' ? sPerKm * 1.609344 : sPerKm;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} /${getUnits() === 'lb' ? 'mi' : 'km'}`;
}

function Mini({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[15px] font-bold tabular-nums">{v}</div>
      <div className="text-[11px] text-mut">{label}</div>
    </div>
  );
}
