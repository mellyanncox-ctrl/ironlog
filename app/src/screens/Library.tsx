import React, { useEffect, useMemo, useState } from 'react';
import { api, Exercise, ExerciseStats } from '../api';
import { Card, Spinner, Pill, Button, Sheet, Field, TextInput, Select, confirmDialog } from '../components/ui';
import { LineChart, BarChart } from '../components/charts';
import { cap, cx, fmtDate, fmtWeight, MUSCLE_COLORS, fmtVolume, fmtCardio } from '../util';
import { EXERCISE_TYPES, EXERCISE_TYPE_LABELS } from '../db/schema';

const TYPE_CHIP: Record<string, string> = { strength: 'Strength', dynamic: 'Dynamic', static: 'Static', cardio: 'Cardio' };

export function Library({ muscles, equipment, onNav }: { muscles: string[]; equipment: string[]; onNav: (r: string) => void }) {
  const [list, setList] = useState<Exercise[] | null>(null);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equip, setEquip] = useState('');
  const [type, setType] = useState('');
  useEffect(() => { api.exercises.list().then(setList); }, []);
  const filtered = useMemo(() => (list || []).filter((e) =>
    (!q || e.name.toLowerCase().includes(q.toLowerCase())) && (!muscle || e.muscle === muscle) && (!equip || e.equipment === equip) && (!type || e.exercise_type === type)
  ), [list, q, muscle, equip, type]);
  if (!list) return <Spinner />;

  return (
    <div className="px-4 pt-2 pb-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises…"
        className="w-full bg-surface border border-edge rounded-xl px-3.5 py-2.5 text-[15px] outline-none focus:border-accent/60 placeholder:text-dim mb-2" />
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-1">
        <Chip label="All types" active={!type} onClick={() => setType('')} />
        {EXERCISE_TYPES.map((t) => <Chip key={t} label={TYPE_CHIP[t]} active={type === t} onClick={() => setType(type === t ? '' : t)} />)}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-1">
        <Chip label="All" active={!muscle} onClick={() => setMuscle('')} />
        {muscles.map((m) => <Chip key={m} label={cap(m)} active={muscle === m} onClick={() => setMuscle(muscle === m ? '' : m)} dot={MUSCLE_COLORS[m]} />)}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-1">
        <Chip label="Any equipment" active={!equip} onClick={() => setEquip('')} />
        {equipment.map((m) => <Chip key={m} label={cap(m)} active={equip === m} onClick={() => setEquip(equip === m ? '' : m)} />)}
      </div>
      <div className="space-y-1.5">
        {filtered.map((e) => (
          <Card key={e.id} className="px-4 py-3" onClick={() => onNav(`library/${e.id}`)}>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: MUSCLE_COLORS[e.muscle] || '#5b5b63' }} />
              <div className="grow min-w-0">
                <div className="text-[14.5px] font-medium truncate">{e.name}{e.exercise_type !== 'strength' ? <span className="text-accent text-[11px] ml-1.5">{TYPE_CHIP[e.exercise_type]}</span> : null}{e.is_custom ? <span className="text-dim text-[11px] ml-1.5">custom</span> : null}</div>
                <div className="text-[12px] text-mut capitalize">{e.muscle}{e.secondary ? ` · +${e.secondary.split(',').length}` : ''} · {e.equipment}</div>
              </div>
              <span className="text-dim">›</span>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <div className="text-center text-dim py-10 text-[13px]">No matches</div>}
      </div>
    </div>
  );
}

function Chip({ label, active, onClick, dot }: { label: string; active: boolean; onClick: () => void; dot?: string }) {
  return (
    <button onClick={onClick} className={cx('px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border shrink-0',
      active ? 'bg-ink text-black border-ink' : 'bg-surface text-mut border-edge')}>
      {dot && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: dot }} />}
      {label}
    </button>
  );
}

export function ExerciseDetail({ id, onNav, muscles, equipment }: { id: number; onNav: (r: string) => void; muscles: string[]; equipment: string[] }) {
  const [ex, setEx] = useState<Exercise | null>(null);
  const [stats, setStats] = useState<ExerciseStats | null>(null);
  const [editing, setEditing] = useState(false);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    // getOne includes archived exercises — PR lists can link to them
    api.exercises.getOne(id).then((e) => { e ? setEx(e) : setMissing(true); });
    api.exercises.stats(id).then(setStats);
  }, [id]);
  if (missing) return (
    <div className="px-4 pt-2">
      <button onClick={() => onNav('library')} className="text-accent text-[14px] font-medium mb-3">‹ Library</button>
      <div className="text-center text-dim text-[14px] py-16">This exercise no longer exists.</div>
    </div>
  );
  if (!ex || !stats) return <Spinner />;

  // group history by workout
  const sessions: { workout_id: number; date: string; sets: typeof stats.history }[] = [];
  for (const h of stats.history) {
    const last = sessions[sessions.length - 1];
    if (last && last.workout_id === h.workout_id) last.sets.push(h);
    else sessions.push({ workout_id: h.workout_id, date: h.started_at, sets: [h] });
  }

  return (
    <div className="px-4 pt-2 pb-6">
      <button onClick={() => onNav('library')} className="text-accent text-[14px] font-medium mb-3">‹ Library</button>
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-[22px] font-bold leading-tight">{ex.name}</h1>
        <Button small kind="ghost" onClick={() => setEditing(true)}>Edit</Button>
      </div>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {ex.exercise_type !== 'strength' && <Pill color="#4b93f8">{EXERCISE_TYPE_LABELS[ex.exercise_type]}</Pill>}
        <Pill color={MUSCLE_COLORS[ex.muscle]}>{cap(ex.muscle)}</Pill>
        {ex.secondary.split(',').filter(Boolean).map((m) => <Pill key={m}>{cap(m)}</Pill>)}
        <Pill>{cap(ex.equipment)}</Pill>
      </div>

      {stats.pr && (
        <Card className="px-4 py-3.5 mb-3 flex gap-2">
          <PrStat label="Best weight" v={stats.pr.max_weight != null ? fmtWeight(stats.pr.max_weight) : '–'} sub={stats.pr.max_weight_reps ? `× ${stats.pr.max_weight_reps}` : ''} />
          <PrStat label="Est. 1RM" v={stats.pr.best_e1rm != null ? fmtWeight(stats.pr.best_e1rm) : '–'} sub={stats.pr.best_e1rm_day ? fmtDate(stats.pr.best_e1rm_day) : ''} accent />
          <PrStat label="Max reps" v={stats.pr.max_reps ?? '–'} sub="" />
        </Card>
      )}

      {stats.trend.length > 0 && (
        <Card className="p-4 mb-3">
          <div className="text-[13px] font-semibold text-mut mb-2">Estimated 1RM</div>
          <LineChart data={stats.trend.map((t) => ({ x: fmtDate(t.day), y: t.e1rm }))} />
        </Card>
      )}
      {stats.volume.length > 0 && (
        <Card className="p-4 mb-3">
          <div className="text-[13px] font-semibold text-mut mb-2">Weekly volume</div>
          <BarChart data={stats.volume.slice(-12).map((v) => ({ x: v.bucket.slice(5), y: v.volume }))} />
        </Card>
      )}

      {sessions.length > 0 && (
        <>
          <h2 className="text-[13px] font-semibold text-mut uppercase tracking-wide mb-2 mt-5">History</h2>
          <div className="space-y-2">
            {sessions.map((s) => (
              <Card key={s.workout_id} className="px-4 py-3" onClick={() => onNav(`history/${s.workout_id}`)}>
                <div className="text-[12px] text-mut mb-1">{fmtDate(s.date)}</div>
                <div className="text-[13.5px] tabular-nums space-x-3">
                  {s.sets.map((x, i) => (
                    <span key={i} className={x.set_type === 'warmup' ? 'text-dim' : 'text-ink'}>
                      {ex.exercise_type === 'static' ? `${x.duration_s ?? '–'}s`
                        : ex.exercise_type === 'dynamic' ? `${x.reps ?? '–'} reps`
                        : ex.exercise_type === 'cardio' ? fmtCardio(x)
                        : `${fmtWeight(x.weight, false)}×${x.reps}`}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      {sessions.length === 0 && <div className="text-center text-dim text-[13px] py-8">Not logged yet.</div>}

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit exercise">
        <EditExercise ex={ex} muscles={muscles} equipment={equipment}
          onSaved={(e) => { setEx(e); setEditing(false); }}
          onDeleted={() => onNav('library')} />
      </Sheet>
    </div>
  );
}

function PrStat({ label, v, sub, accent }: any) {
  return (
    <div className="flex-1">
      <div className={cx('text-[17px] font-bold tabular-nums', accent ? 'text-accent' : 'text-ink')}>{v}<span className="text-[12px] text-dim font-normal ml-1">{sub}</span></div>
      <div className="text-[11px] text-mut">{label}</div>
    </div>
  );
}

function EditExercise({ ex, muscles, equipment, onSaved, onDeleted }: {
  ex: Exercise; muscles: string[]; equipment: string[]; onSaved: (e: Exercise) => void; onDeleted: () => void;
}) {
  const [form, setForm] = useState({ name: ex.name, muscle: ex.muscle, equipment: ex.equipment, secondary: ex.secondary, exercise_type: ex.exercise_type });
  return (
    <div className="pt-1">
      <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Type">
        <Select value={form.exercise_type} onChange={(e) => setForm({ ...form, exercise_type: e.target.value })}>
          {EXERCISE_TYPES.map((t) => <option key={t} value={t}>{EXERCISE_TYPE_LABELS[t]}</option>)}
        </Select>
      </Field>
      <Field label="Primary muscle">
        <Select value={form.muscle} onChange={(e) => setForm({ ...form, muscle: e.target.value })}>
          {muscles.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
        </Select>
      </Field>
      <Field label="Secondary muscles (comma-separated)">
        <TextInput value={form.secondary} onChange={(e) => setForm({ ...form, secondary: e.target.value })} placeholder="triceps,shoulders" />
      </Field>
      <Field label="Equipment">
        <Select value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })}>
          {equipment.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
        </Select>
      </Field>
      <Button className="w-full mb-2" onClick={async () => onSaved(await api.exercises.update(ex.id, form))}>Save</Button>
      <Button kind="danger" className="w-full" onClick={async () => {
        if (!confirmDialog(`Delete “${ex.name}”? If it's used in workouts it will be archived instead.`)) return;
        await api.exercises.remove(ex.id); onDeleted();
      }}>Delete exercise</Button>
    </div>
  );
}
