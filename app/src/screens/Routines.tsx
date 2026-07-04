import React, { useEffect, useState } from 'react';
import { api, Template, TemplateExercise, Exercise } from '../api';
import { Card, Button, Empty, Sheet, Field, TextInput, Select, Spinner, confirmDialog } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import { DOW, DOW_SHORT, cx, kgOut, inKg, getUnits } from '../util';

export function Routines({ muscles, equipment, onStart }: {
  muscles: string[]; equipment: string[]; onStart: (id: number) => void;
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const reload = () => api.templates.list().then(setTemplates);
  useEffect(() => { reload(); }, []);
  if (!templates) return <Spinner />;

  return (
    <div className="px-4 pt-2 pb-4">
      {templates.length === 0 ? (
        <Empty icon="🗓️" title="No routines yet"
          sub="Build reusable workout templates — schedule them by day and start with one tap."
          action={<Button onClick={() => setEditing('new')}>Create routine</Button>} />
      ) : (
        <>
          <div className="space-y-2.5">
            {templates.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[16px] font-semibold">{t.name}</div>
                  <span className="text-[12px] text-mut font-medium">{t.day_of_week != null ? DOW[t.day_of_week] : 'Unscheduled'}</span>
                </div>
                <div className="text-[12.5px] text-mut mb-3 leading-relaxed">
                  {t.exercises.map((e) => `${e.target_sets}× ${e.exercise_name}`).join ? t.exercises.map((e) => `${e.target_sets}× ${e.exercise_name}`).join(' · ') : ''}
                </div>
                <div className="flex gap-2">
                  <Button small className="flex-1" onClick={() => onStart(t.id)}>Start workout</Button>
                  <Button small kind="ghost" onClick={() => setEditing(t)}>Edit</Button>
                  <Button small kind="danger" onClick={async () => {
                    if (!confirmDialog(`Delete routine “${t.name}”? Logged workouts are kept.`)) return;
                    await api.templates.remove(t.id); reload();
                  }}>✕</Button>
                </div>
              </Card>
            ))}
          </div>
          <Button kind="ghost" className="w-full mt-3" onClick={() => setEditing('new')}>＋ New routine</Button>
        </>
      )}
      {editing && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          muscles={muscles} equipment={equipment}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

type EditorExercise = {
  exercise_id: number; exercise_name: string; target_sets: number;
  target_reps: string; target_weight: number | null; rest_seconds: number; superset_group: number | null;
};

function TemplateEditor({ template, onClose, onSaved, muscles, equipment }: {
  template: Template | null; onClose: () => void; onSaved: () => void;
  muscles: string[]; equipment: string[];
}) {
  const [name, setName] = useState(template?.name || '');
  const [dow, setDow] = useState<string>(template?.day_of_week != null ? String(template.day_of_week) : '');
  const [exs, setExs] = useState<EditorExercise[]>(
    (template?.exercises || []).map((e) => ({
      exercise_id: e.exercise_id, exercise_name: e.exercise_name, target_sets: e.target_sets,
      target_reps: e.target_reps, target_weight: e.target_weight, rest_seconds: e.rest_seconds, superset_group: e.superset_group,
    }))
  );
  const [picker, setPicker] = useState(false);

  async function save() {
    const body = { name: name.trim() || 'Routine', day_of_week: dow === '' ? null : Number(dow), exercises: exs };
    template ? await api.templates.update(template.id, body) : await api.templates.create(body);
    onSaved();
  }

  function up(i: number, patch: Partial<EditorExercise>) {
    setExs(exs.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= exs.length) return;
    const copy = [...exs];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setExs(copy);
  }

  return (
    <Sheet open onClose={onClose} title={template ? 'Edit routine' : 'New routine'} full>
      <Field label="Name"><TextInput autoFocus={!template} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push Day" /></Field>
      <Field label="Scheduled day">
        <div className="flex gap-1.5 flex-wrap">
          <DayChip label="None" active={dow === ''} onClick={() => setDow('')} />
          {DOW_SHORT.map((d, i) => <DayChip key={d} label={d} active={dow === String(i)} onClick={() => setDow(String(i))} />)}
        </div>
      </Field>

      <div className="text-[13px] text-mut font-medium mb-2">Exercises</div>
      <div className="space-y-2 mb-3">
        {exs.map((e, i) => (
          <div key={i} className="border border-edge rounded-xl p-3 bg-surface2/40">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[14px] font-semibold">{e.exercise_name}</div>
              <div className="flex gap-1 items-center">
                <IconBtn onClick={() => move(i, -1)}>↑</IconBtn>
                <IconBtn onClick={() => move(i, 1)}>↓</IconBtn>
                <IconBtn onClick={() => setExs(exs.filter((_, idx) => idx !== i))} danger>✕</IconBtn>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <MiniField label="Sets">
                <input inputMode="numeric" value={e.target_sets} onChange={(ev) => up(i, { target_sets: Math.max(1, Number(ev.target.value) || 1) })} className={miniInput} />
              </MiniField>
              <MiniField label="Reps">
                <input value={e.target_reps} onChange={(ev) => up(i, { target_reps: ev.target.value })} className={miniInput} placeholder="8-12" />
              </MiniField>
              <MiniField label={getUnits()}>
                <input inputMode="decimal" value={e.target_weight != null ? String(kgOut(e.target_weight)) : ''} placeholder="auto"
                  onChange={(ev) => up(i, { target_weight: ev.target.value === '' ? null : inKg(Number(ev.target.value)) })} className={miniInput} />
              </MiniField>
              <MiniField label="Rest s">
                <input inputMode="numeric" value={e.rest_seconds} onChange={(ev) => up(i, { rest_seconds: Number(ev.target.value) || 0 })} className={miniInput} />
              </MiniField>
            </div>
            <button
              onClick={() => {
                if (e.superset_group != null) up(i, { superset_group: null });
                else if (i > 0) {
                  const g = exs[i - 1].superset_group ?? Math.max(0, ...exs.map((x) => x.superset_group ?? -1)) + 1;
                  const copy = [...exs];
                  copy[i - 1] = { ...copy[i - 1], superset_group: g };
                  copy[i] = { ...copy[i], superset_group: g };
                  setExs(copy);
                }
              }}
              className={cx('text-[12px] font-medium mt-2', e.superset_group != null ? 'text-accent' : 'text-dim', i === 0 && e.superset_group == null && 'opacity-40 pointer-events-none')}>
              {e.superset_group != null ? '⛓ Superset (tap to unlink)' : '⛓ Superset with previous'}
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => setPicker(true)} className="w-full py-3 rounded-xl border border-dashed border-edge text-accent font-medium text-[14px] mb-4">＋ Add exercise</button>
      <Button className="w-full" onClick={save} disabled={!name.trim() || exs.length === 0}>Save routine</Button>
      {template && <p className="text-[12px] text-dim text-center mt-3">Editing a routine never changes past logged workouts.</p>}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} muscles={muscles} equipment={equipment}
        onPick={(ex: Exercise) => {
          setExs([...exs, { exercise_id: ex.id, exercise_name: ex.name, target_sets: 3, target_reps: '8', target_weight: null, rest_seconds: 120, superset_group: null }]);
          setPicker(false);
        }} />
    </Sheet>
  );
}

const miniInput = 'w-full h-9 rounded-lg bg-surface2 border border-edge text-center text-[13px] tabular-nums outline-none focus:border-accent/60';
function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10.5px] text-dim uppercase tracking-wide block mb-1">{label}</span>{children}</label>;
}
function DayChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('px-3 py-1.5 rounded-full text-[12.5px] font-medium border',
      active ? 'bg-accent text-black border-accent' : 'bg-surface2 text-mut border-edge')}>
      {label}
    </button>
  );
}
function IconBtn({ children, onClick, danger }: any) {
  return <button onClick={onClick} className={cx('w-7 h-7 rounded-lg bg-surface border border-edge text-[13px]', danger ? 'text-bad' : 'text-mut')}>{children}</button>;
}
