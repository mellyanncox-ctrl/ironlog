import React, { useEffect, useRef, useState } from 'react';
import { api, GarminActivity, GarminDaily } from '../api';
import { Card, Button, Spinner, Empty, confirmDialog } from '../components/ui';
import { parseGarminFile } from '../lib/garminParse';
import { fmtDate, fmtTime, fmtDuration, fmtDistance, cap } from '../util';

const TYPE_ICON: Record<string, string> = {
  strength_training: '🏋️', running: '🏃', cycling: '🚴', walking: '🚶',
  swimming: '🏊', yoga: '🧘', hiking: '🥾', cardio: '💓', other: '⚡',
};

export function Garmin() {
  const [activities, setActivities] = useState<GarminActivity[] | null>(null);
  const [daily, setDaily] = useState<GarminDaily[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    api.garmin.activities().then(setActivities);
    api.garmin.daily().then(setDaily);
  };
  useEffect(reload, []);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true); setMsg(null);
    let acts = 0, days = 0; const warnings: string[] = [];
    try {
      for (const f of Array.from(files)) {
        const res = await parseGarminFile(f);
        warnings.push(...res.warnings);
        if (res.activities.length) {
          const r = await api.garmin.importActivities(res.activities);
          acts += r.imported;
        }
        if (res.daily.length) {
          const r = await api.garmin.importDaily(res.daily);
          days += r.imported;
        }
      }
      if (acts || days) setMsg({ kind: 'ok', text: `Imported ${acts} activities and ${days} daily wellness entries.${warnings.length ? ' ' + warnings[0] : ''}` });
      else setMsg({ kind: 'warn', text: warnings[0] || 'Nothing new to import (duplicates are skipped automatically).' });
      reload();
    } catch (e: any) {
      setMsg({ kind: 'warn', text: 'Import failed: ' + e.message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (!activities) return <Spinner />;

  return (
    <div className="px-4 pt-2 pb-6 space-y-4">
      <Card className="p-4">
        <div className="text-[15px] font-semibold mb-1">Import Garmin data</div>
        <p className="text-[12.5px] text-mut leading-relaxed mb-3">
          Export from Garmin Connect (activity page → ⚙ → Export to TCX / Original FIT, or the activities list → CSV) and drop the files here.
          Sleep, steps, stress and Body Battery import from wellness CSV/JSON exports.
        </p>
        <input ref={fileRef} type="file" multiple accept=".fit,.tcx,.gpx,.csv,.json" className="hidden"
          onChange={(e) => onFiles(e.target.files)} />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className="border border-dashed border-edge rounded-xl py-8 text-center cursor-pointer active:bg-surface2">
          {busy ? <span className="text-mut text-[14px]">Parsing…</span> : (
            <>
              <div className="text-2xl mb-1">📥</div>
              <div className="text-[14px] font-medium text-accent">Choose files or drag &amp; drop</div>
              <div className="text-[12px] text-dim mt-0.5">.fit · .tcx · .gpx · .csv · .json</div>
            </>
          )}
        </div>
        {msg && <div className={`text-[13px] mt-3 ${msg.kind === 'ok' ? 'text-good' : 'text-accent'}`}>{msg.text}</div>}
        <div className="flex gap-2 mt-3">
          <Button small kind="ghost" onClick={async () => { setBusy(true); await api.garmin.demo(30); setBusy(false); reload(); setMsg({ kind: 'ok', text: 'Generated 30 days of demo Garmin data.' }); }}>Generate demo data</Button>
          {(activities.length > 0 || daily.length > 0) && (
            <Button small kind="danger" onClick={async () => {
              if (!confirmDialog('Remove all imported Garmin data?')) return;
              await api.garmin.clear(); reload();
            }}>Clear all</Button>
          )}
        </div>
        <p className="text-[11.5px] text-dim mt-3 leading-relaxed">
          Note: Garmin's official Connect API (OAuth) is approved for business use only, so Ironlog uses file import.
          The import pipeline is normalized — an official API source can be added later without schema changes.
        </p>
      </Card>

      {daily.length > 0 && (
        <div>
          <h2 className="text-[13px] font-semibold text-mut uppercase tracking-wide mb-2">Daily wellness <span className="text-dim normal-case font-normal">· last {daily.length} days</span></h2>
          <Card className="divide-y divide-edge/60">
            {daily.slice(-7).reverse().map((d) => (
              <div key={d.id} className="px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
                <span className="w-16 text-mut shrink-0">{fmtDate(d.date)}</span>
                <span className="tabular-nums">😴 {d.sleep_seconds ? fmtDuration(d.sleep_seconds) : '–'}</span>
                <span className="tabular-nums">🔋 {d.body_battery ?? '–'}</span>
                <span className="tabular-nums">😰 {d.stress ?? '–'}</span>
                <span className="tabular-nums ml-auto text-mut">{d.steps ? d.steps.toLocaleString() + ' steps' : ''}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {activities.length > 0 ? (
        <div>
          <h2 className="text-[13px] font-semibold text-mut uppercase tracking-wide mb-2">Activities</h2>
          <div className="space-y-1.5">
            {activities.map((a) => (
              <Card key={a.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{TYPE_ICON[a.activity_type] || TYPE_ICON.other}</span>
                  <div className="grow min-w-0">
                    <div className="text-[14px] font-medium truncate">{a.name || cap(a.activity_type.replace(/_/g, ' '))}</div>
                    <div className="text-[12px] text-mut">{fmtDate(a.started_at)} · {fmtTime(a.started_at)}</div>
                  </div>
                  <div className="text-right text-[12px] text-mut tabular-nums shrink-0">
                    <div>{a.distance_m ? `${fmtDistance(a.distance_m)} · ` : ''}{fmtDuration(a.duration_s)}{a.calories ? ` · ${a.calories} kcal` : ''}</div>
                    <div>{a.avg_hr ? `♥ ${a.avg_hr}${a.max_hr ? `/${a.max_hr}` : ''} bpm` : ''}{a.training_load ? ` · load ${Math.round(a.training_load)}` : ''}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Empty icon="⌚" title="No Garmin data yet" sub="Import an export file above, or generate demo data to see how activities and recovery flow into your reports." />
      )}
    </div>
  );
}
