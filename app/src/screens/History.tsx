import React, { useEffect, useState } from 'react';
import { api, WorkoutSummary, Workout, GarminActivity, PRRow } from '../api';
import { Card, Pill, Empty, Button, Spinner, confirmDialog, Sheet, Field, TextInput } from '../components/ui';
import { fmtDate, fmtTime, fmtVolume, fmtWeight, fmtDuration, fmtDistance, fmtPace, fmtCardio, cx, kgOut, inKg, getUnits } from '../util';

type HistoryItem =
  | { kind: 'workout'; date: string; w: WorkoutSummary }
  | { kind: 'garmin'; date: string; a: GarminActivity };

const TYPE_ICON: Record<string, string> = {
  running: '🏃', trail_running: '🏃', treadmill_running: '🏃',
  cycling: '🚴', indoor_cycling: '🚴', swimming: '🏊', open_water_swimming: '🏊',
  walking: '🚶', hiking: '🥾', strength_training: '🏋️', yoga: '🧘', rowing: '🚣',
};
const typeIcon = (t: string) => TYPE_ICON[t] || '⌚';
const typeLabel = (t: string) => t.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function History({ onNav, onDuplicated }: { onNav: (r: string) => void; onDuplicated: () => void }) {
  const [list, setList] = useState<HistoryItem[] | null>(null);
  const [prs, setPrs] = useState<PRRow[]>([]);
  useEffect(() => {
    Promise.all([api.workouts.list(200), api.garmin.activities(300)]).then(([ws, as]) => {
      const items: HistoryItem[] = [
        ...ws.map((w): HistoryItem => ({ kind: 'workout', date: w.started_at, w })),
        ...as.map((a): HistoryItem => ({ kind: 'garmin', date: a.started_at, a })),
      ];
      items.sort((a, b) => b.date.localeCompare(a.date));
      setList(items);
    });
    api.stats.prs().then((rows) =>
      setPrs(rows.filter((r) => r.max_weight != null || r.best_e1rm != null)
        .sort((a, b) => (b.best_e1rm ?? 0) - (a.best_e1rm ?? 0)))
    ).catch(() => {});
  }, []);
  if (!list) return <Spinner />;
  if (list.length === 0) return <Empty icon="📓" title="No workouts yet" sub="Finished workouts and Garmin activities appear here." />;

  // group by month
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const it of list) {
    const label = new Date(it.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const g = groups.find((x) => x.label === label);
    g ? g.items.push(it) : groups.push({ label, items: [it] });
  }

  return (
    <div className="px-4 pt-2 pb-4 space-y-5">
      {prs.length > 0 && <PersonalBests prs={prs} onNav={onNav} />}
      {groups.map((g) => (
        <div key={g.label}>
          <h2 className="text-[13px] font-semibold text-mut uppercase tracking-wide mb-2">{g.label}</h2>
          <div className="space-y-2">
            {g.items.map((it) =>
              it.kind === 'workout' ? (
                <Card key={`w${it.w.id}`} className="px-4 py-3" onClick={() => onNav(`history/${it.w.id}`)}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="text-[15px] font-semibold">{it.w.name}</div>
                    {it.w.prs > 0 && <Pill color="#ff9f0a">🏆 {it.w.prs}</Pill>}
                  </div>
                  <div className="text-[12px] text-mut">{fmtDate(it.w.started_at)} · {it.w.sets} sets · {fmtVolume(it.w.volume)}</div>
                  <div className="text-[12px] text-dim truncate mt-0.5">{it.w.exercise_names.join(' · ')}</div>
                </Card>
              ) : (
                <Card key={`g${it.a.id}`} className="px-4 py-3" onClick={() => onNav(`activity/${it.a.id}`)}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="text-[15px] font-semibold">{typeIcon(it.a.activity_type)} {it.a.name || typeLabel(it.a.activity_type)}</div>
                    {it.a.distance_m != null && it.a.distance_m > 0 && (
                      <div className="text-[13px] font-semibold text-accent tabular-nums">{fmtDistance(it.a.distance_m)}</div>
                    )}
                  </div>
                  <div className="flex justify-between text-[12px] text-mut tabular-nums">
                    <span>{fmtDate(it.a.started_at)} · {fmtTime(it.a.started_at)}</span>
                    <span>
                      {it.a.duration_s ? fmtDuration(it.a.duration_s) : ''}
                      {it.a.activity_type === 'running' && it.a.duration_s && it.a.distance_m ? ` · ${fmtPace(it.a.duration_s, it.a.distance_m)}` : ''}
                      {it.a.avg_hr ? ` · ♥ ${it.a.avg_hr}` : ''}
                    </span>
                  </div>
                </Card>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PersonalBests({ prs, onNav }: { prs: PRRow[]; onNav: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const shown = open ? prs : prs.slice(0, 3);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between mb-2 px-1">
        <h2 className="text-[13px] font-semibold text-mut uppercase tracking-wide">🏆 Personal bests <span className="text-dim normal-case font-normal">· {prs.length}</span></h2>
        <span className="text-[12px] text-accent font-medium">{open ? 'Show less' : 'Show all'}</span>
      </button>
      <div className="space-y-2">
        {shown.map((r) => (
          <Card key={r.exercise_id} className="px-4 py-3" onClick={() => onNav(`library/${r.exercise_id}`)}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate">{r.exercise_name}</div>
                <div className="text-[12px] text-mut tabular-nums">
                  {r.max_weight != null ? `Heaviest ${fmtWeight(r.max_weight)}${r.max_weight_reps ? ` × ${r.max_weight_reps}` : ''}` : ''}
                  {r.max_reps != null ? `${r.max_weight != null ? ' · ' : ''}Most reps ${r.max_reps}` : ''}
                </div>
              </div>
              {r.best_e1rm != null && (
                <div className="text-right shrink-0">
                  <div className="text-[15px] font-bold text-accent tabular-nums">{fmtWeight(r.best_e1rm)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-dim">est. 1RM</div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function WorkoutDetail({ id, onNav, onDuplicated }: { id: number; onNav: (r: string) => void; onDuplicated: () => void }) {
  const [w, setW] = useState<Workout | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { api.workouts.get(id).then(setW); }, [id]);
  if (!w) return <Spinner />;

  const volume = w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.completed && s.set_type !== 'warmup').reduce((x, s) => x + (s.weight || 0) * (s.reps || 0), 0), 0);
  const durS = w.ended_at ? Math.round((new Date(w.ended_at).getTime() - new Date(w.started_at).getTime()) / 1000) : null;

  async function duplicate() {
    await api.workouts.duplicate(w!.id);
    onDuplicated();
  }
  async function remove() {
    if (!confirmDialog('Delete this workout permanently?')) return;
    await api.workouts.remove(w!.id);
    onNav('history');
  }

  return (
    <div className="px-4 pt-2 pb-6">
      <button onClick={() => onNav('history')} className="text-accent text-[14px] font-medium mb-3">‹ History</button>
      <div className="mb-4">
        <h1 className="text-[22px] font-bold">{w.name}</h1>
        <div className="text-[13px] text-mut">{fmtDate(w.started_at)} · {fmtTime(w.started_at)}{durS ? ` · ${fmtDuration(durS)}` : ''} · {fmtVolume(volume)}</div>
        {w.notes && <div className="text-[13px] text-mut mt-1 italic">“{w.notes}”</div>}
      </div>

      <div className="space-y-3">
        {w.exercises.map((we) => (
          <Card key={we.id} className="px-4 py-3">
            <div className="text-[14px] font-semibold text-accent mb-1.5">{we.exercise_name}</div>
            {we.notes && <div className="text-[12px] text-dim italic mb-1">{we.notes}</div>}
            <div className="space-y-1">
              {we.sets.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 text-[13px] tabular-nums">
                  <span className={cx('w-5 font-bold', s.set_type === 'warmup' ? 'text-blue' : s.set_type === 'failure' ? 'text-bad' : s.set_type === 'dropset' ? 'text-accent' : 'text-mut')}>
                    {s.set_type === 'warmup' ? 'W' : s.set_type === 'dropset' ? 'D' : s.set_type === 'failure' ? 'F' : i + 1}
                  </span>
                  <span className="text-ink">
                    {we.exercise_type === 'cardio' ? fmtCardio(s)
                      : we.exercise_type === 'static' ? `${s.duration_s ?? '–'}s hold`
                      : we.exercise_type === 'dynamic' ? `${s.reps ?? '–'} reps`
                      : `${fmtWeight(s.weight)} × ${s.reps ?? '–'}`}
                  </span>
                  {we.exercise_type !== 'cardio' && s.rpe != null && <span className="text-dim">@{s.rpe}</span>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 mt-5">
        <Button kind="ghost" className="flex-1" onClick={duplicate}>Repeat workout</Button>
        <Button kind="ghost" className="flex-1" onClick={() => setEditing(true)}>Edit</Button>
        <Button kind="danger" onClick={remove}>Delete</Button>
      </div>

      <EditWorkoutSheet w={w} open={editing} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); api.workouts.get(id).then(setW); }} />
    </div>
  );
}

// Full edit of a completed workout: name, notes, and every set (weight/reps/rpe/type), add/remove sets.
function EditWorkoutSheet({ w, open, onClose, onSaved }: { w: Workout; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(w.name);
  const [notes, setNotes] = useState(w.notes || '');
  const [work, setWork] = useState<Workout>(w);
  useEffect(() => { if (open) api.workouts.get(w.id).then((x) => { setWork(x); setName(x.name); setNotes(x.notes || ''); }); }, [open]);

  async function save() {
    await api.workouts.update(w.id, { name, notes });
    onSaved();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit workout" full>
      <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Notes"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="space-y-3 mb-4">
        {work.exercises.map((we) => (
          <div key={we.id} className="border border-edge rounded-xl p-3">
            <div className="text-[13px] font-semibold text-accent mb-2">{we.exercise_name}</div>
            {we.sets.map((s) => <EditSetRow key={s.id} s={s} onChanged={() => api.workouts.get(w.id).then(setWork)} />)}
            <button className="text-accent text-[13px] font-medium mt-1"
              onClick={async () => { await api.workoutExercises.addSet(we.id); api.workouts.get(w.id).then(setWork); }}>＋ Add set</button>
          </div>
        ))}
      </div>
      <Button className="w-full" onClick={save}>Save changes</Button>
    </Sheet>
  );
}

function EditSetRow({ s, onChanged }: { s: any; onChanged: () => void }) {
  const [weight, setWeight] = useState(s.weight != null ? String(kgOut(s.weight)) : '');
  const [reps, setReps] = useState(s.reps != null ? String(s.reps) : '');
  const [rpe, setRpe] = useState(s.rpe != null ? String(s.rpe) : '');
  async function save() {
    await api.sets.update(s.id, {
      weight: weight === '' ? null : inKg(Number(weight)),
      reps: reps === '' ? null : Number(reps),
      rpe: rpe === '' ? null : Number(rpe),
      completed: true,
    });
    onChanged();
  }
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[12px] text-dim w-4">{s.position + 1}</span>
      <input value={weight} onChange={(e) => setWeight(e.target.value)} onBlur={save} inputMode="decimal"
        className="w-20 h-8 rounded-lg text-center text-[13px] bg-surface2 outline-none tabular-nums" placeholder={getUnits()} />
      <span className="text-dim text-[12px]">×</span>
      <input value={reps} onChange={(e) => setReps(e.target.value)} onBlur={save} inputMode="numeric"
        className="w-14 h-8 rounded-lg text-center text-[13px] bg-surface2 outline-none tabular-nums" placeholder="reps" />
      <input value={rpe} onChange={(e) => setRpe(e.target.value)} onBlur={save} inputMode="decimal"
        className="w-12 h-8 rounded-lg text-center text-[12px] bg-surface2 text-mut outline-none tabular-nums" placeholder="RPE" />
      <button onClick={async () => { await api.sets.remove(s.id); onChanged(); }} className="text-bad text-[13px] ml-auto px-2">✕</button>
    </div>
  );
}

