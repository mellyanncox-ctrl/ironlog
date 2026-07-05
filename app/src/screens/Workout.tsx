import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, Workout, WorkoutExercise, SetRow, PREvent } from '../api';
import { Button, Sheet, Field, TextInput, confirmDialog } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import { startRestTimer, clearRestTimer } from '../components/RestTimer';
import { cx, fmtClock, fmtWeight, kgOut, inKg, getUnits } from '../util';

const SET_TYPE_LABEL: Record<string, string> = { warmup: 'W', working: '', dropset: 'D', failure: 'F' };
const SET_TYPE_COLOR: Record<string, string> = { warmup: 'text-blue', working: 'text-mut', dropset: 'text-accent', failure: 'text-bad' };
const SS_COLORS = ['#ff9f0a', '#0a84ff', '#bf5af2', '#30d158', '#ff6482'];

export function WorkoutScreen({ workoutId, onDone, onMinimize, muscles, equipment }: {
  workoutId: number; onDone: () => void; onMinimize: () => void; muscles: string[]; equipment: string[];
}) {
  const [w, setW] = useState<Workout | null>(null);
  const [picker, setPicker] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [prs, setPrs] = useState<PREvent[] | null>(null);
  const [notes, setNotes] = useState('');
  const [tick, setTick] = useState(0);

  const reload = () => api.workouts.get(workoutId).then((res) => { setW(res); setNotes(res.notes || ''); });
  useEffect(() => { reload(); }, [workoutId]);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(iv); }, []);

  if (!w) return null;
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(w.started_at).getTime()) / 1000));
  const doneSets = w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.completed).length, 0);
  const totalVolume = w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.completed && s.set_type !== 'warmup').reduce((x, s) => x + (s.weight || 0) * (s.reps || 0), 0), 0);

  async function finish() {
    clearRestTimer();
    const res = await api.workouts.finish(w!.id, notes);
    if ((res as any).discarded) { onDone(); return; }
    setPrs(res.new_prs || []);
  }

  async function cancel() {
    if (!confirmDialog('Discard this workout? All logged sets will be deleted.')) return;
    clearRestTimer();
    await api.workouts.remove(w!.id);
    onDone();
  }

  // PR celebration screen
  if (prs !== null) {
    return (
      <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center px-8 animate-fadein">
        <div className="text-5xl mb-4">{prs.length > 0 ? '🏆' : '✅'}</div>
        <h1 className="text-[24px] font-bold mb-1">Workout complete</h1>
        <p className="text-mut text-[14px] mb-6">{doneSets} sets · {fmtWeight(totalVolume, true)} total volume · {fmtClock(elapsed)}</p>
        {prs.length > 0 && (
          <div className="w-full max-w-sm bg-surface border border-edge rounded-2xl p-4 mb-6">
            <div className="text-[13px] font-semibold text-accent mb-2">{prs.length} new PR{prs.length > 1 ? 's' : ''}</div>
            {prs.map((p, i) => (
              <div key={i} className="flex justify-between py-1.5 text-[14px]">
                <span>{p.exercise_name}</span>
                <span className="text-mut tabular-nums">{p.kind === 'weight' ? `${fmtWeight(p.weight)} × ${p.reps}` : `e1RM ${fmtWeight(p.value)}`}</span>
              </div>
            ))}
          </div>
        )}
        <Button onClick={onDone} className="w-full max-w-sm">Done</Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-bg overflow-y-auto pb-40">
      {/* header */}
      <div className="sticky top-0 z-30 bg-bg/90 backdrop-blur border-b border-edge px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={onMinimize} className="flex items-center gap-1 text-mut text-[14px] font-medium py-1 pr-2" title="Back to home — workout keeps running">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            Home
          </button>
          <div className="text-center">
            <input value={w.name}
              onChange={(e) => setW({ ...w, name: e.target.value })}
              onBlur={(e) => api.workouts.update(w.id, { name: e.target.value })}
              className="bg-transparent text-center text-[16px] font-semibold outline-none w-44" />
            <div className="text-[12px] text-mut tabular-nums">{fmtClock(elapsed)} · {doneSets} sets · {fmtWeight(totalVolume)}</div>
          </div>
          <button onClick={() => setFinishing(true)} className="text-accent text-[15px] font-bold py-1">Finish</button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 pt-3 space-y-3">
        {w.exercises.map((we, i) => (
          <ExerciseCard key={we.id} we={we} prev={i > 0 ? w.exercises[i - 1] : null} onChange={reload} workout={w} setW={setW} />
        ))}
        <button onClick={() => setPicker(true)}
          className="w-full py-3.5 rounded-2xl border border-dashed border-edge text-accent font-medium text-[15px] active:bg-surface">
          ＋ Add exercise
        </button>
      </div>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} muscles={muscles} equipment={equipment}
        onPick={async (ex) => { setPicker(false); await api.workouts.addExercise(w.id, ex.id); reload(); }} />

      <Sheet open={finishing} onClose={() => setFinishing(false)} title="Finish workout">
        <p className="text-[13px] text-mut mb-4">Incomplete sets will be removed. {doneSets} completed sets will be saved.</p>
        <Field label="Workout notes (optional)">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Felt strong. Slept 8h." />
        </Field>
        <Button className="w-full" onClick={finish}>Save workout</Button>
        <button onClick={() => { setFinishing(false); cancel(); }}
          className="w-full mt-3 text-bad text-[14px] font-medium py-2 active:opacity-60">Discard workout</button>
      </Sheet>
    </div>
  );
}

function ExerciseCard({ we, prev, onChange, workout, setW }: {
  we: WorkoutExercise; prev: WorkoutExercise | null; onChange: () => void;
  workout: Workout; setW: (w: Workout) => void;
}) {
  const [menu, setMenu] = useState(false);
  const ssColor = we.superset_group != null ? SS_COLORS[we.superset_group % SS_COLORS.length] : null;

  async function toggleSuperset() {
    if (we.superset_group != null) {
      await api.workoutExercises.update(we.id, { superset_group: null });
    } else if (prev) {
      const g = prev.superset_group != null ? prev.superset_group : Math.max(0, ...workout.exercises.map((e) => (e.superset_group ?? -1))) + 1;
      if (prev.superset_group == null) await api.workoutExercises.update(prev.id, { superset_group: g });
      await api.workoutExercises.update(we.id, { superset_group: g });
    }
    setMenu(false); onChange();
  }

  async function removeExercise() {
    if (!confirmDialog(`Remove ${we.exercise_name} from this workout?`)) return;
    await api.workoutExercises.remove(we.id); setMenu(false); onChange();
  }

  return (
    <div className="bg-surface border border-edge rounded-2xl overflow-hidden" style={ssColor ? { borderLeft: `3px solid ${ssColor}` } : undefined}>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div>
          <div className="text-[15px] font-semibold text-accent">{we.exercise_name}</div>
          <div className="text-[11px] text-dim capitalize">
            {we.muscle}{ssColor ? ' · superset' : ''} · rest {Math.round(we.rest_seconds / 60 * 10) / 10}m
          </div>
        </div>
        <button onClick={() => setMenu(true)} className="text-mut px-2 py-1 text-[18px] leading-none">⋯</button>
      </div>

      {/* sets table */}
      <div className="px-2 pb-2">
        <div className="grid grid-cols-[36px_1fr_72px_60px_46px_40px] gap-1 px-2 py-1 text-[10.5px] uppercase tracking-wide text-dim font-medium">
          <span>Set</span><span>Previous</span><span className="text-center">{getUnits()}</span><span className="text-center">Reps</span><span className="text-center">RPE</span><span></span>
        </div>
        {we.sets.map((s, idx) => (
          <SetLine key={s.id} s={s} idx={idx} we={we} onChange={onChange} workout={workout} setW={setW} />
        ))}
        <button onClick={async () => { await api.workoutExercises.addSet(we.id); onChange(); }}
          className="w-full mt-1 py-2 rounded-xl bg-surface2 text-mut text-[13px] font-medium active:bg-edge">
          ＋ Add set
        </button>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={we.exercise_name}>
        <div className="space-y-2 pt-1">
          <MenuBtn onClick={toggleSuperset} disabled={we.superset_group == null && !prev}>
            {we.superset_group != null ? 'Remove from superset' : 'Superset with previous exercise'}
          </MenuBtn>
          <MenuBtn onClick={async () => {
            const v = prompt('Rest between sets (seconds):', String(we.rest_seconds));
            if (v && Number(v) > 0) { await api.workoutExercises.update(we.id, { rest_seconds: Number(v) }); setMenu(false); onChange(); }
          }}>Set rest timer ({we.rest_seconds}s)</MenuBtn>
          <MenuBtn onClick={async () => {
            const v = prompt('Exercise notes:', we.notes || '');
            if (v !== null) { await api.workoutExercises.update(we.id, { notes: v }); setMenu(false); onChange(); }
          }}>{we.notes ? `Notes: ${we.notes.slice(0, 30)}…` : 'Add note'}</MenuBtn>
          <MenuBtn danger onClick={removeExercise}>Remove exercise</MenuBtn>
        </div>
      </Sheet>
    </div>
  );
}

function MenuBtn({ children, onClick, danger, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={cx('w-full text-left px-4 py-3 rounded-xl bg-surface2 border border-edge text-[14px] font-medium active:bg-edge', danger ? 'text-bad' : 'text-ink', disabled && 'opacity-40')}>
      {children}
    </button>
  );
}

const TYPES: SetRow['set_type'][] = ['working', 'warmup', 'dropset', 'failure'];

function SetLine({ s, idx, we, onChange, workout, setW }: {
  s: SetRow; idx: number; we: WorkoutExercise; onChange: () => void;
  workout: Workout; setW: (w: Workout) => void;
}) {
  const [weight, setWeight] = useState<string>(s.weight != null ? String(kgOut(s.weight)) : '');
  const [reps, setReps] = useState<string>(s.reps != null ? String(s.reps) : '');
  const [rpe, setRpe] = useState<string>(s.rpe != null ? String(s.rpe) : '');
  useEffect(() => { setWeight(s.weight != null ? String(kgOut(s.weight)) : ''); setReps(s.reps != null ? String(s.reps) : ''); setRpe(s.rpe != null ? String(s.rpe) : ''); }, [s.id, s.weight, s.reps, s.rpe]);

  // Swipe-left to reveal delete. Only engages on a deliberate horizontal drag,
  // so typing in the inputs and vertical scrolling are unaffected.
  const [dx, setDx] = useState(0);
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null);
  function onTouchStart(e: React.TouchEvent) { const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY, active: false }; }
  function onTouchMove(e: React.TouchEvent) {
    const st = swipe.current; if (!st) return;
    const t = e.touches[0]; const mx = t.clientX - st.x, my = t.clientY - st.y;
    if (!st.active) { if (Math.abs(mx) < 8 || Math.abs(mx) <= Math.abs(my)) return; st.active = true; }
    e.preventDefault();
    setDx(Math.max(-84, Math.min(0, mx + (dx < 0 ? -0 : 0))));
  }
  function onTouchEnd() { const st = swipe.current; swipe.current = null; if (!st?.active) return; setDx((d) => (d < -42 ? -76 : 0)); }

  const prevSet = we.previous[idx];
  const workingIdx = we.sets.filter((x) => x.set_type !== 'warmup').findIndex((x) => x.id === s.id);
  const label = s.set_type === 'working' ? String(workingIdx + 1) : SET_TYPE_LABEL[s.set_type];

  function save(extra: any = {}) {
    return api.sets.update(s.id, {
      weight: weight === '' ? null : inKg(Number(weight)),
      reps: reps === '' ? null : Number(reps),
      rpe: rpe === '' ? null : Number(rpe),
      ...extra,
    });
  }

  async function cycleType() {
    const next = TYPES[(TYPES.indexOf(s.set_type) + 1) % TYPES.length];
    await save({ set_type: next }); onChange();
  }

  async function toggleDone() {
    const nowDone = !s.completed;
    if (nowDone && weight === '' && prevSet) setWeight(String(kgOut(prevSet.weight) ?? ''));
    if (nowDone && reps === '' && prevSet) setReps(String(prevSet.reps ?? ''));
    const body = {
      completed: nowDone,
      weight: (weight === '' && nowDone && prevSet) ? prevSet.weight : (weight === '' ? null : inKg(Number(weight))),
      reps: (reps === '' && nowDone && prevSet) ? prevSet.reps : (reps === '' ? null : Number(reps)),
      rpe: rpe === '' ? null : Number(rpe),
    };
    await api.sets.update(s.id, body);
    if (nowDone) startRestTimer(we.rest_seconds);
    onChange();
  }

  async function removeSet() { await api.sets.remove(s.id); onChange(); }

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* delete revealed on swipe-left */}
      <button onClick={removeSet}
        className="absolute inset-y-0 right-0 w-[76px] flex items-center justify-center bg-bad text-white text-[12px] font-semibold"
        style={{ opacity: dx < 0 ? 1 : 0 }}>
        Delete
      </button>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${dx}px)`, transition: swipe.current ? 'none' : 'transform 0.18s ease' }}
        className="relative grid grid-cols-[36px_1fr_72px_60px_46px_40px] gap-1 items-center px-2 py-[3px] rounded-lg bg-surface">
      {s.completed && <span className="absolute inset-0 rounded-lg bg-good/10 pointer-events-none" />}
      <button onClick={cycleType}
        className={cx('h-8 rounded-lg text-[13px] font-bold', SET_TYPE_COLOR[s.set_type], s.set_type !== 'working' && 'bg-surface2')}>
        {label || workingIdx + 1}
      </button>
      <div className="text-[12px] text-dim tabular-nums truncate">
        {prevSet ? `${fmtWeight(prevSet.weight, false)} × ${prevSet.reps}${prevSet.rpe ? ` @${prevSet.rpe}` : ''}` : '—'}
      </div>
      <input inputMode="decimal" value={weight} placeholder={prevSet ? String(kgOut(prevSet.weight) ?? '') : '0'}
        onChange={(e) => setWeight(e.target.value)} onBlur={() => save()}
        className={cx('h-8 rounded-lg text-center text-[14px] font-semibold tabular-nums bg-surface2 outline-none focus:ring-1 focus:ring-accent/60', s.completed && 'bg-transparent')} />
      <input inputMode="numeric" value={reps} placeholder={prevSet ? String(prevSet.reps ?? '') : '0'}
        onChange={(e) => setReps(e.target.value)} onBlur={() => save()}
        className={cx('h-8 rounded-lg text-center text-[14px] font-semibold tabular-nums bg-surface2 outline-none focus:ring-1 focus:ring-accent/60', s.completed && 'bg-transparent')} />
      <input inputMode="decimal" value={rpe} placeholder="–"
        onChange={(e) => setRpe(e.target.value)} onBlur={() => save()}
        className={cx('h-8 rounded-lg text-center text-[13px] tabular-nums bg-surface2 text-mut outline-none focus:ring-1 focus:ring-accent/60', s.completed && 'bg-transparent')} />
      <button onClick={toggleDone}
        className={cx('relative h-8 rounded-lg font-bold text-[15px] transition-colors', s.completed ? 'bg-good text-black' : 'bg-surface2 text-dim')}>
        ✓
      </button>
      </div>
    </div>
  );
}
