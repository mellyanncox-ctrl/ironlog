import React, { useEffect, useState } from 'react';
import { api, PRRow, Suggestions, Exercise } from '../api';
import { Card, Seg, Spinner, Empty, Button, Sheet, Field, TextInput, Select } from '../components/ui';
import { LineChart, BarChart, HBarList } from '../components/charts';
import { fmtDate, fmtWeight, fmtVolume, todayISO, MUSCLE_COLORS, cap, kgOut, inKg, getUnits, cx } from '../util';

type Tab = 'charts' | 'prs' | 'coach';

export function Progress({ onNav }: { onNav: (r: string) => void }) {
  const [tab, setTab] = useState<Tab>('charts');
  return (
    <div className="px-4 pt-2 pb-4">
      <Seg className="mb-4" value={tab} onChange={setTab}
        options={[{ value: 'charts', label: 'Charts' }, { value: 'prs', label: 'Records' }, { value: 'coach', label: 'Coach' }]} />
      {tab === 'charts' && <Charts />}
      {tab === 'prs' && <PRs onNav={onNav} />}
      {tab === 'coach' && <Coach onNav={onNav} />}
    </div>
  );
}

function Charts() {
  const [bucket, setBucket] = useState<'week' | 'month'>('week');
  const [volume, setVolume] = useState<{ bucket: string; volume: number; sets: number }[] | null>(null);
  const [muscle, setMuscle] = useState<Record<string, number> | null>(null);
  const [bw, setBw] = useState<{ id: number; date: string; weight: number }[] | null>(null);
  const [exs, setExs] = useState<Exercise[]>([]);
  const [exId, setExId] = useState<string>('');
  const [trend, setTrend] = useState<{ day: string; e1rm: number }[]>([]);
  const [addBw, setAddBw] = useState(false);

  useEffect(() => { api.stats.volume(`bucket=${bucket}`).then(setVolume); }, [bucket]);
  useEffect(() => {
    api.stats.muscleVolume().then(setMuscle);
    api.bodyweight.list().then(setBw);
    api.exercises.list().then((l) => {
      setExs(l);
      // default to the biggest lift with data
      api.stats.prs().then((prs) => { if (prs.length && !exId) setExId(String(prs[0].exercise_id)); });
    });
  }, []);
  useEffect(() => { if (exId) api.exercises.stats(Number(exId)).then((s) => setTrend(s.trend)); }, [exId]);

  if (!volume) return <Spinner />;
  const muscleItems = muscle ? Object.entries(muscle).sort((a, b) => b[1] - a[1]).map(([m, v]) => ({ label: m, value: v })) : [];

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] font-semibold text-mut">Training volume</div>
          <Seg value={bucket} onChange={setBucket} options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} className="w-44" />
        </div>
        <BarChart data={volume.slice(-16).map((v) => ({ x: bucket === 'week' ? v.bucket.slice(5) : v.bucket.slice(2), y: v.volume }))} />
      </Card>

      <Card className="p-4">
        <div className="text-[13px] font-semibold text-mut mb-2">Estimated 1RM</div>
        <select value={exId} onChange={(e) => setExId(e.target.value)}
          className="w-full mb-3 bg-surface2 border border-edge rounded-xl px-3 py-2 text-[14px] outline-none">
          <option value="">Choose exercise…</option>
          {exs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {exId ? <LineChart data={trend.map((t) => ({ x: fmtDate(t.day), y: kgOut(t.e1rm) as number }))} unit={` ${getUnits()}`} /> : <div className="text-dim text-[13px] text-center py-6">Pick a lift to see its trend</div>}
      </Card>

      <Card className="p-4">
        <div className="text-[13px] font-semibold text-mut mb-3">Muscle group volume <span className="text-dim font-normal">· last 4 weeks</span></div>
        {muscleItems.length ? <HBarList items={muscleItems} colors={MUSCLE_COLORS} /> : <div className="text-dim text-[13px] text-center py-6">No data yet</div>}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] font-semibold text-mut">Bodyweight</div>
          <Button small kind="ghost" onClick={() => setAddBw(true)}>＋ Log</Button>
        </div>
        {bw && bw.length > 0
          ? <LineChart color="#0a84ff" data={bw.slice(-40).map((b) => ({ x: fmtDate(b.date), y: kgOut(b.weight) as number }))} unit={` ${getUnits()}`} />
          : <div className="text-dim text-[13px] text-center py-6">Log your bodyweight to see the trend</div>}
      </Card>

      <Sheet open={addBw} onClose={() => setAddBw(false)} title="Log bodyweight">
        <BwForm onSaved={(rows) => { setBw(rows); setAddBw(false); }} />
      </Sheet>
    </div>
  );
}

function BwForm({ onSaved }: { onSaved: (rows: any[]) => void }) {
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState('');
  return (
    <div className="pt-1">
      <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label={`Weight (${getUnits()})`}><TextInput inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="78.4" /></Field>
      <Button className="w-full" disabled={!weight || !date} onClick={async () => onSaved(await api.bodyweight.add(date, inKg(Number(weight)) as number))}>Save</Button>
    </div>
  );
}

function PRs({ onNav }: { onNav: (r: string) => void }) {
  const [prs, setPrs] = useState<PRRow[] | null>(null);
  useEffect(() => { api.stats.prs().then(setPrs); }, []);
  if (!prs) return <Spinner />;
  if (prs.length === 0) return <Empty icon="🏆" title="No records yet" sub="Finish workouts with weight and reps and your PRs will appear here." />;
  return (
    <div className="space-y-2">
      {prs.map((p) => (
        <Card key={p.exercise_id} className="px-4 py-3" onClick={() => onNav(`library/${p.exercise_id}`)}>
          <div className="text-[14.5px] font-semibold mb-1">{p.exercise_name}</div>
          <div className="flex gap-4 text-[13px] tabular-nums">
            <span><span className="text-dim">Best:</span> {p.max_weight != null ? `${fmtWeight(p.max_weight)} × ${p.max_weight_reps}` : '–'}</span>
            <span className="text-accent"><span className="text-dim">e1RM:</span> {p.best_e1rm != null ? fmtWeight(p.best_e1rm) : '–'}</span>
            <span className="text-mut ml-auto">{p.best_e1rm_day ? fmtDate(p.best_e1rm_day) : ''}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Coach({ onNav }: { onNav: (r: string) => void }) {
  const [s, setS] = useState<Suggestions | null>(null);
  useEffect(() => { api.suggestions().then(setS); }, []);
  if (!s) return <Spinner />;
  const empty = !s.improving.length && !s.stalled.length && !s.neglected.length && !s.fatigue.length && !s.deload && !s.next_weights.length;
  if (empty) return <Empty icon="🧠" title="Not enough data yet" sub="Log a few weeks of workouts and STRONG will surface what's improving, what's stalled, and what to do next." />;

  return (
    <div className="space-y-3">
      {s.deload && (
        <Card className="p-4 border-bad/40">
          <div className="text-[14px] font-bold text-bad mb-1">Deload recommended</div>
          <p className="text-[13px] text-mut">{s.deload.hint}</p>
        </Card>
      )}
      {s.fatigue.map((f, i) => (
        <Card key={i} className="p-4 border-accent/30">
          <div className="text-[14px] font-bold text-accent mb-1">Fatigue warning</div>
          <p className="text-[13px] text-mut">{f.hint}</p>
        </Card>
      ))}
      {s.next_weights.length > 0 && (
        <Card className="p-4">
          <div className="text-[13px] font-semibold text-mut mb-2.5">Next session targets</div>
          <div className="space-y-2">
            {s.next_weights.map((n) => (
              <div key={n.exercise_id} className="flex items-center justify-between text-[13.5px]">
                <span className="truncate mr-2">{n.name}</span>
                <span className="tabular-nums shrink-0">
                  <span className="text-dim">{fmtWeight(n.last, false)}</span>
                  <span className={cx('mx-1', n.suggested > n.last ? 'text-good' : 'text-dim')}>→</span>
                  <span className={n.suggested > n.last ? 'text-good font-semibold' : 'text-mut'}>{fmtWeight(n.suggested)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {s.improving.length > 0 && (
        <Card className="p-4">
          <div className="text-[13px] font-semibold text-good mb-2">📈 Improving</div>
          {s.improving.map((x) => (
            <button key={x.exercise_id} onClick={() => onNav(`library/${x.exercise_id}`)} className="flex justify-between w-full py-1.5 text-[13.5px]">
              <span>{x.name}</span><span className="text-good tabular-nums">+{fmtWeight(x.change)} e1RM</span>
            </button>
          ))}
        </Card>
      )}
      {s.stalled.length > 0 && (
        <Card className="p-4">
          <div className="text-[13px] font-semibold text-accent mb-2">😐 Stalled</div>
          {s.stalled.map((x) => (
            <div key={x.exercise_id} className="py-1.5">
              <button onClick={() => onNav(`library/${x.exercise_id}`)} className="flex justify-between w-full text-[13.5px]">
                <span>{x.name}</span><span className="text-mut tabular-nums">{x.sessions} sessions flat</span>
              </button>
              <p className="text-[12px] text-dim mt-0.5">{x.hint}</p>
            </div>
          ))}
        </Card>
      )}
      {s.neglected.length > 0 && (
        <Card className="p-4">
          <div className="text-[13px] font-semibold text-blue mb-2">🫥 Neglected muscle groups</div>
          {s.neglected.map((x) => (
            <div key={x.muscle} className="flex justify-between py-1.5 text-[13.5px] capitalize">
              <span style={{ color: MUSCLE_COLORS[x.muscle] }}>{x.muscle}</span>
              <span className="text-mut">{fmtVolume(x.volume)} in 4 weeks</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
