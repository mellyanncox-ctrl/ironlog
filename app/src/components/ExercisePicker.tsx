import React, { useEffect, useMemo, useState } from 'react';
import { api, Exercise } from '../api';
import { Sheet, TextInput, Button, Field, Select, Pill } from './ui';
import { cap, cx, MUSCLE_COLORS } from '../util';

export function ExercisePicker({ open, onClose, onPick, muscles, equipment }: {
  open: boolean; onClose: () => void; onPick: (e: Exercise) => void;
  muscles: string[]; equipment: string[];
}) {
  const [list, setList] = useState<Exercise[]>([]);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equip, setEquip] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newEx, setNewEx] = useState({ name: '', muscle: 'chest', equipment: 'barbell', secondary: '' });

  useEffect(() => { if (open) api.exercises.list().then(setList); }, [open]);

  const filtered = useMemo(() => list.filter((e) =>
    (!q || e.name.toLowerCase().includes(q.toLowerCase())) &&
    (!muscle || e.muscle === muscle) &&
    (!equip || e.equipment === equip)
  ), [list, q, muscle, equip]);

  async function create() {
    if (!newEx.name.trim()) return;
    try {
      const ex = await api.exercises.create(newEx);
      setCreating(false);
      setCreateError('');
      setNewEx({ name: '', muscle: 'chest', equipment: 'barbell', secondary: '' });
      onPick(ex);
    } catch (e: any) {
      setCreateError(e.message || 'Could not create exercise');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={creating ? 'New exercise' : 'Choose exercise'} full>
      {creating ? (
        <div className="pt-2">
          <Field label="Name"><TextInput autoFocus value={newEx.name} onChange={(e) => setNewEx({ ...newEx, name: e.target.value })} placeholder="e.g. Cable Pullover" /></Field>
          <Field label="Primary muscle">
            <Select value={newEx.muscle} onChange={(e) => setNewEx({ ...newEx, muscle: e.target.value })}>
              {muscles.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
            </Select>
          </Field>
          <Field label="Equipment">
            <Select value={newEx.equipment} onChange={(e) => setNewEx({ ...newEx, equipment: e.target.value })}>
              {equipment.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
            </Select>
          </Field>
          {createError && <div className="text-bad text-[13px] mb-3">{createError}</div>}
          <div className="flex gap-2 mt-2">
            <Button kind="ghost" className="flex-1" onClick={() => { setCreating(false); setCreateError(''); }}>Back</Button>
            <Button className="flex-1" onClick={create} disabled={!newEx.name.trim()}>Create</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="sticky top-0 bg-surface pb-2 z-10">
            <TextInput placeholder="Search exercises…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
              <FilterChip label="All muscles" active={!muscle} onClick={() => setMuscle('')} />
              {muscles.map((m) => <FilterChip key={m} label={cap(m)} active={muscle === m} onClick={() => setMuscle(muscle === m ? '' : m)} color={MUSCLE_COLORS[m]} />)}
            </div>
            <div className="flex gap-2 mt-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
              <FilterChip label="All equipment" active={!equip} onClick={() => setEquip('')} />
              {equipment.map((m) => <FilterChip key={m} label={cap(m)} active={equip === m} onClick={() => setEquip(equip === m ? '' : m)} />)}
            </div>
          </div>
          <button onClick={() => setCreating(true)} className="w-full text-left px-4 py-3 rounded-xl border border-dashed border-edge text-accent text-[14px] font-medium mb-2 active:bg-surface2">
            ＋ Create custom exercise{q.trim() ? ` “${q.trim()}”` : ''}
          </button>
          <div className="divide-y divide-edge/60">
            {filtered.map((e) => (
              <button key={e.id} onClick={() => onPick(e)} className="w-full text-left py-3 px-1 flex items-center gap-3 active:bg-surface2 rounded-lg">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: MUSCLE_COLORS[e.muscle] || '#5b5b63' }} />
                <span className="grow">
                  <span className="block text-[15px] font-medium">{e.name}{e.is_custom ? <span className="text-dim text-[11px] ml-1.5">custom</span> : null}</span>
                  <span className="block text-[12px] text-mut capitalize">{e.muscle} · {e.equipment}</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-center text-dim text-[13px] py-10">No matches</div>}
          </div>
        </>
      )}
    </Sheet>
  );
}

function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick}
      className={cx('px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border transition-colors shrink-0',
        active ? 'bg-ink text-black border-ink' : 'bg-surface2 text-mut border-edge')}>
      {color && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: color }} />}
      {label}
    </button>
  );
}
