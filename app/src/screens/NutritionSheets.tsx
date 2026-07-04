import React, { useEffect, useMemo, useState } from 'react';
import { api, Food, Meal, MealType, NutritionGoal } from '../api';
import { Sheet, Button, Field, TextInput, Select, Seg, Empty, Spinner, Card, confirmDialog } from '../components/ui';
import { MACRO } from '../components/nutrition';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { showToast } from '../components/Toast';
import { ACTIVITY_LEVELS } from '../db/schema';
import { cx } from '../util';

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
// scale per-serving nutrition by quantity for previews
function scaled(f: { kcal: number; protein: number; carbs: number; fat: number }, q: number) {
  return { kcal: r0(f.kcal * q), protein: r0(f.protein * q), carbs: r0(f.carbs * q), fat: r0(f.fat * q) };
}

function MacroChips({ p, c, f }: { p: number; c: number; f: number }) {
  return (
    <span className="inline-flex gap-2 text-[11px] tabular-nums">
      <span style={{ color: MACRO.protein }}>P {p}</span>
      <span style={{ color: MACRO.carbs }}>C {c}</span>
      <span style={{ color: MACRO.fat }}>F {f}</span>
    </span>
  );
}

// ── Log Food sheet: search / recent / favourites / custom + quick add ────────
export function LogFoodSheet({ open, onClose, date, mealType, onChanged }: {
  open: boolean; onClose: () => void; date: string; mealType: MealType; onChanged: () => void;
}) {
  const [tab, setTab] = useState<'all' | 'recent' | 'fav' | 'custom'>('all');
  const [q, setQ] = useState('');
  const [list, setList] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [qty, setQty] = useState('1');
  const [quick, setQuick] = useState(false);
  const [newFood, setNewFood] = useState(false);
  const [foodDraft, setFoodDraft] = useState<any | null>(null);
  const [mealPick, setMealPick] = useState(false);
  const [scan, setScan] = useState(false);

  useEffect(() => { if (open) { setTab('all'); setQ(''); setPicked(null); setQuick(false); setScan(false); } }, [open]);
  useEffect(() => {
    if (!open) return;
    if (tab === 'recent') api.nutrition.foods.recent().then(setList);
    else if (tab === 'fav') api.nutrition.foods.favourites().then(setList);
    else if (tab === 'custom') api.nutrition.foods.custom().then(setList);
    else api.nutrition.foods.search(q).then(setList);
  }, [open, tab, q]);

  async function add() {
    if (!picked) return;
    await api.nutrition.diary.add({ date, meal_type: mealType, food_id: picked.id, quantity: Number(qty) || 1 });
    showToast(`Added ${picked.name}`, 'ok');
    setPicked(null); setQty('1'); onChanged();
  }

  // Resolve a scanned barcode: local hit → log fast; Open Food Facts → prefill a
  // new-food form (which caches it for offline re-scan); miss/offline → manual add.
  async function onScanned(code: string) {
    setScan(false);
    const r = await api.nutrition.foods.lookupBarcode(code);
    if (r.source === 'local') { setPicked(r.food); setQty('1'); return; }
    if (r.source === 'off') { setFoodDraft({ ...r.draft }); setNewFood(true); showToast(`Found: ${r.draft.name}`, 'ok'); return; }
    if (r.source === 'offline') showToast('Offline — type the food in, it’ll scan next time', 'error');
    else if (r.source === 'error') showToast(r.message || 'Lookup failed', 'error');
    else showToast('Not in the food database — add it once and it’s saved', 'error');
    setFoodDraft({ barcode: code, name: '' }); setNewFood(true);
  }

  const preview = picked ? scaled(picked, Number(qty) || 0) : null;

  return (
    <Sheet open={open} onClose={onClose} title={`Add to ${mealType}`} full>
      {/* quick actions */}
      <div className="flex gap-2 mb-3">
        <Button small kind="ghost" className="flex-1" onClick={() => setScan(true)}>📷 Scan</Button>
        <Button small kind="ghost" className="flex-1" onClick={() => setQuick(true)}>⚡ Quick</Button>
        <Button small kind="ghost" className="flex-1" onClick={() => setMealPick(true)}>🍽 Meal</Button>
        <Button small kind="ghost" className="flex-1" onClick={() => { setFoodDraft(null); setNewFood(true); }}>＋ Food</Button>
      </div>

      <TextInput autoFocus placeholder="Search foods…" value={q}
        onChange={(e) => { setQ(e.target.value); if (tab !== 'all') setTab('all'); }} className="mb-2" />
      <Seg className="mb-3" value={tab} onChange={(v) => setTab(v as any)}
        options={[{ value: 'all', label: 'All' }, { value: 'recent', label: 'Recent' }, { value: 'fav', label: '★' }, { value: 'custom', label: 'Mine' }]} />

      {list.length === 0
        ? <Empty icon="🔎" title="No foods found" sub={tab === 'custom' ? 'Create your own food to reuse it forever.' : 'Try another search, or quick-add the calories.'} />
        : (
          <div className="space-y-1.5">
            {list.map((f) => (
              <button key={f.id} onClick={() => { setPicked(f); setQty('1'); }}
                className="w-full flex items-center gap-2 text-left bg-surface2 border border-edge rounded-xl px-3 py-2.5 active:bg-edge">
                <span className="grow min-w-0">
                  <span className="block text-[14px] font-medium truncate">{f.name}{f.favourite ? ' ★' : ''}</span>
                  <span className="block text-[11.5px] text-mut truncate">{f.brand ? f.brand + ' · ' : ''}{f.serving_desc} · {r0(f.kcal)} kcal</span>
                </span>
                <span className="shrink-0"><MacroChips p={r0(f.protein)} c={r0(f.carbs)} f={r0(f.fat)} /></span>
              </button>
            ))}
          </div>
        )}

      {/* serving picker for the tapped food */}
      {picked && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setPicked(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-lg mx-auto bg-surface border-t border-edge rounded-t-3xl p-5 animate-slideup" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div className="min-w-0 pr-2">
                <div className="text-[16px] font-semibold truncate">{picked.name}</div>
                <div className="text-[12px] text-mut">{picked.serving_desc}{picked.brand ? ` · ${picked.brand}` : ''}</div>
              </div>
              <button onClick={() => api.nutrition.foods.toggleFavourite(picked.id).then(setPicked)}
                className="text-[20px] leading-none shrink-0" title="Favourite">{picked.favourite ? '★' : '☆'}</button>
            </div>
            <div className="flex items-center gap-3 my-4">
              <span className="text-[13px] text-mut">Servings</span>
              <button onClick={() => setQty(String(Math.max(0.25, r1((Number(qty) || 1) - 0.5))))} className="w-9 h-9 rounded-full bg-surface2 border border-edge text-[18px] active:bg-edge">−</button>
              <TextInput inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="w-20 text-center" />
              <button onClick={() => setQty(String(r1((Number(qty) || 0) + 0.5)))} className="w-9 h-9 rounded-full bg-surface2 border border-edge text-[18px] active:bg-edge">＋</button>
            </div>
            {preview && (
              <div className="flex items-center justify-between mb-4 text-[13px] tabular-nums">
                <span className="text-[20px] font-bold text-accent">{preview.kcal} <span className="text-[12px] text-mut font-normal">kcal</span></span>
                <MacroChips p={preview.protein} c={preview.carbs} f={preview.fat} />
              </div>
            )}
            <Button className="w-full" onClick={add}>Add to {mealType}</Button>
          </div>
        </div>
      )}

      <QuickAddSheet open={quick} onClose={() => setQuick(false)} date={date} mealType={mealType} onAdded={() => { setQuick(false); onChanged(); }} />
      <FoodFormSheet open={newFood} onClose={() => { setNewFood(false); setFoodDraft(null); }} prefill={foodDraft} onSaved={(f) => { setNewFood(false); setFoodDraft(null); setPicked(f); setQty('1'); }} />
      <PickMealSheet open={mealPick} onClose={() => setMealPick(false)} date={date} mealType={mealType} onLogged={() => { setMealPick(false); onChanged(); }} />
      {scan && <BarcodeScanner onDetected={onScanned} onClose={() => setScan(false)} />}
    </Sheet>
  );
}

// ── Quick add: free-form calories (+ optional macros) ────────────────────────
export function QuickAddSheet({ open, onClose, date, mealType, onAdded }: {
  open: boolean; onClose: () => void; date: string; mealType: MealType; onAdded: () => void;
}) {
  const [name, setName] = useState(''); const [kcal, setKcal] = useState('');
  const [p, setP] = useState(''); const [c, setC] = useState(''); const [f, setF] = useState('');
  useEffect(() => { if (open) { setName(''); setKcal(''); setP(''); setC(''); setF(''); } }, [open]);
  async function save() {
    await api.nutrition.diary.add({ date, meal_type: mealType, name: name || 'Quick add', kcal: Number(kcal) || 0, protein: Number(p) || 0, carbs: Number(c) || 0, fat: Number(f) || 0 });
    showToast('Added', 'ok'); onAdded();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Quick add">
      <Field label="Name (optional)"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lunch out" /></Field>
      <Field label="Calories"><TextInput autoFocus inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="500" /></Field>
      <div className="flex gap-2">
        <Field label="Protein (g)"><TextInput inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} placeholder="0" /></Field>
        <Field label="Carbs (g)"><TextInput inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} placeholder="0" /></Field>
        <Field label="Fat (g)"><TextInput inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} placeholder="0" /></Field>
      </div>
      <Button className="w-full mt-1" disabled={!kcal && !p && !c && !f} onClick={save}>Add to {mealType}</Button>
    </Sheet>
  );
}

// ── Create / edit a custom food (also the destination after a barcode scan) ──
export function FoodFormSheet({ open, onClose, onSaved, edit, prefill }: {
  open: boolean; onClose: () => void; onSaved: (f: Food) => void; edit?: Food | null; prefill?: any | null;
}) {
  const blank = { name: '', brand: '', serving_desc: '', serving_grams: '', kcal: '', protein: '', carbs: '', fat: '', fibre: '', sugar: '', sodium: '', barcode: '' };
  const [v, setV] = useState<any>(blank);
  const [scan, setScan] = useState(false);
  const src = edit || prefill;
  useEffect(() => {
    if (!open) return;
    if (src) setV({
      name: src.name ?? '', brand: src.brand ?? '', serving_desc: src.serving_desc ?? '', serving_grams: src.serving_grams ?? '',
      kcal: src.kcal ?? '', protein: src.protein ?? '', carbs: src.carbs ?? '', fat: src.fat ?? '',
      fibre: src.fibre ?? '', sugar: src.sugar ?? '', sodium: src.sodium ?? '', barcode: src.barcode ?? '',
    });
    else setV(blank);
  }, [open, edit, prefill]);
  const set = (k: string) => (e: any) => setV((s: any) => ({ ...s, [k]: e.target.value }));
  async function save() {
    try {
      const f = edit ? await api.nutrition.foods.update(edit.id, v) : await api.nutrition.foods.create(v);
      showToast(edit ? 'Food updated' : 'Food saved', 'ok'); onSaved(f);
    } catch (e: any) { showToast(e.message || 'Could not save', 'error'); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit food' : (prefill?.name ? 'Confirm food' : 'New food')} full>
      <Field label="Barcode">
        <div className="flex gap-2">
          <TextInput inputMode="numeric" value={v.barcode} onChange={set('barcode')} placeholder="Optional — scan or type" />
          <Button kind="ghost" onClick={() => setScan(true)}>📷</Button>
        </div>
      </Field>
      <Field label="Name"><TextInput value={v.name} onChange={set('name')} placeholder="e.g. Chicken thigh, roasted" /></Field>
      <div className="flex gap-2">
        <Field label="Brand (optional)"><TextInput value={v.brand} onChange={set('brand')} placeholder="Optional" /></Field>
        <Field label="Serving"><TextInput value={v.serving_desc} onChange={set('serving_desc')} placeholder="100 g / 1 cup" /></Field>
      </div>
      <div className="text-[12px] text-mut mb-2 -mt-1">Per one serving:</div>
      <div className="flex gap-2">
        <Field label="Calories"><TextInput inputMode="numeric" value={v.kcal} onChange={set('kcal')} placeholder="0" /></Field>
        <Field label="Serving grams"><TextInput inputMode="decimal" value={v.serving_grams} onChange={set('serving_grams')} placeholder="Optional" /></Field>
      </div>
      <div className="flex gap-2">
        <Field label="Protein (g)"><TextInput inputMode="decimal" value={v.protein} onChange={set('protein')} placeholder="0" /></Field>
        <Field label="Carbs (g)"><TextInput inputMode="decimal" value={v.carbs} onChange={set('carbs')} placeholder="0" /></Field>
        <Field label="Fat (g)"><TextInput inputMode="decimal" value={v.fat} onChange={set('fat')} placeholder="0" /></Field>
      </div>
      <div className="flex gap-2">
        <Field label="Fibre (g)"><TextInput inputMode="decimal" value={v.fibre} onChange={set('fibre')} placeholder="—" /></Field>
        <Field label="Sugar (g)"><TextInput inputMode="decimal" value={v.sugar} onChange={set('sugar')} placeholder="—" /></Field>
        <Field label="Sodium (mg)"><TextInput inputMode="decimal" value={v.sodium} onChange={set('sodium')} placeholder="—" /></Field>
      </div>
      <Button className="w-full mt-1" disabled={!v.name} onClick={save}>{edit ? 'Save changes' : 'Save food'}</Button>
      {scan && <BarcodeScanner onDetected={(code) => { setScan(false); setV((s: any) => ({ ...s, barcode: code })); }} onClose={() => setScan(false)} />}
    </Sheet>
  );
}

// ── Pick a saved meal to log ─────────────────────────────────────────────────
function PickMealSheet({ open, onClose, date, mealType, onLogged }: {
  open: boolean; onClose: () => void; date: string; mealType: MealType; onLogged: () => void;
}) {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  useEffect(() => { if (open) api.nutrition.meals.list().then(setMeals); }, [open]);
  async function log(m: Meal) {
    await api.nutrition.diary.logMeal({ meal_id: m.id, date, meal_type: mealType });
    showToast(`Logged ${m.name}`, 'ok'); onLogged();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Log a saved meal" full>
      {!meals ? <Spinner /> : meals.length === 0
        ? <Empty icon="🍽" title="No saved meals yet" sub="Build meals and recipes in the Meals tab, then log them in one tap." />
        : (
          <div className="space-y-2">
            {meals.map((m) => (
              <button key={m.id} onClick={() => log(m)} className="w-full text-left bg-surface2 border border-edge rounded-xl px-3.5 py-3 active:bg-edge">
                <div className="flex items-center justify-between">
                  <span className="text-[14.5px] font-medium">{m.name}</span>
                  <span className="text-[13px] text-accent tabular-nums">{m.per_serving.kcal} kcal</span>
                </div>
                <div className="text-[11.5px] text-mut mt-0.5">{m.servings} serving{m.servings === 1 ? '' : 's'} · <MacroChips p={m.per_serving.protein} c={m.per_serving.carbs} f={m.per_serving.fat} /></div>
              </button>
            ))}
          </div>
        )}
    </Sheet>
  );
}

// ── Edit an existing diary entry (quantity / meal / delete) ──────────────────
export function EntryEditSheet({ entry, onClose, onChanged }: {
  entry: any | null; onClose: () => void; onChanged: () => void;
}) {
  const [qty, setQty] = useState('1');
  const [mt, setMt] = useState<MealType>('breakfast');
  useEffect(() => { if (entry) { setQty(String(entry.quantity)); setMt(entry.meal_type); } }, [entry]);
  if (!entry) return null;
  const preview = scaled(entry, Number(qty) || 0);
  async function save() {
    await api.nutrition.diary.update(entry.id, { quantity: Number(qty) || 1, meal_type: mt });
    onChanged(); onClose();
  }
  async function del() {
    if (!confirmDialog('Delete this entry?')) return;
    await api.nutrition.diary.remove(entry.id); onChanged(); onClose();
  }
  return (
    <Sheet open={!!entry} onClose={onClose} title={entry.name}>
      <div className="text-[12px] text-mut mb-3">{entry.serving_desc || 'serving'} · {r0(entry.kcal)} kcal each</div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[13px] text-mut">Servings</span>
        <button onClick={() => setQty(String(Math.max(0.25, r1((Number(qty) || 1) - 0.5))))} className="w-9 h-9 rounded-full bg-surface2 border border-edge text-[18px]">−</button>
        <TextInput inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="w-20 text-center" />
        <button onClick={() => setQty(String(r1((Number(qty) || 0) + 0.5)))} className="w-9 h-9 rounded-full bg-surface2 border border-edge text-[18px]">＋</button>
      </div>
      <Field label="Meal">
        <Seg value={mt} onChange={(v) => setMt(v as MealType)}
          options={[{ value: 'breakfast', label: 'B’fast' }, { value: 'lunch', label: 'Lunch' }, { value: 'dinner', label: 'Dinner' }, { value: 'snacks', label: 'Snacks' }]} />
      </Field>
      <div className="flex items-center justify-between my-4 text-[13px] tabular-nums">
        <span className="text-[20px] font-bold text-accent">{preview.kcal} <span className="text-[12px] text-mut font-normal">kcal</span></span>
        <MacroChips p={preview.protein} c={preview.carbs} f={preview.fat} />
      </div>
      <div className="flex gap-2">
        <Button kind="danger" onClick={del}>Delete</Button>
        <Button className="grow" onClick={save}>Save</Button>
      </div>
    </Sheet>
  );
}

// ── Goals: TDEE calculator + editable targets ────────────────────────────────
export function GoalSheet({ open, onClose, goal, weight, onSaved }: {
  open: boolean; onClose: () => void; goal: NutritionGoal | null; weight: number | null; onSaved: (g: NutritionGoal) => void;
}) {
  const [v, setV] = useState<any>({});
  const [preview, setPreview] = useState<{ calories: number; protein: number; carbs: number; fat: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    setV({
      goal_type: goal?.goal_type || 'maintain', sex: goal?.sex || '', age: goal?.age ?? '', height_cm: goal?.height_cm ?? '',
      activity: goal?.activity || 'moderate', target_weight: goal?.target_weight ?? '', add_burned: !!goal?.add_burned,
      auto: goal ? !!goal.auto : true,
      calories: goal?.calories ?? '', protein: goal?.protein ?? '', carbs: goal?.carbs ?? '', fat: goal?.fat ?? '',
    });
  }, [open, goal]);
  // live TDEE preview
  useEffect(() => {
    if (!open) return;
    api.nutrition.goals.preview({ sex: v.sex, age: v.age, height_cm: v.height_cm, activity: v.activity, goal_type: v.goal_type, weight_kg: weight })
      .then(setPreview).catch(() => setPreview(null));
  }, [open, v.sex, v.age, v.height_cm, v.activity, v.goal_type, weight]);
  const set = (k: string, val: any) => setV((s: any) => ({ ...s, [k]: val }));
  async function save() {
    const body: any = { goal_type: v.goal_type, sex: v.sex || null, age: v.age, height_cm: v.height_cm, activity: v.activity, target_weight: v.target_weight, add_burned: v.add_burned, auto: v.auto };
    if (!v.auto) { body.calories = v.calories; body.protein = v.protein; body.carbs = v.carbs; body.fat = v.fat; }
    try { const g = await api.nutrition.goals.put(body); showToast('Goals saved', 'ok'); onSaved(g); }
    catch (e: any) { showToast(e.message || 'Could not save', 'error'); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Nutrition goals" full>
      <Field label="Goal">
        <Seg value={v.goal_type} onChange={(val) => set('goal_type', val)}
          options={[{ value: 'lose', label: 'Lose' }, { value: 'maintain', label: 'Maintain' }, { value: 'gain', label: 'Gain' }, { value: 'performance', label: 'Perform' }]} />
      </Field>
      <div className="text-[13px] font-semibold text-mut mt-2 mb-2">Your details <span className="text-dim font-normal">· stays on device</span></div>
      <div className="flex gap-2">
        <Field label="Sex">
          <Seg value={v.sex} onChange={(val) => set('sex', val)} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        </Field>
        <Field label="Age"><TextInput inputMode="numeric" value={v.age} onChange={(e) => set('age', e.target.value)} placeholder="30" /></Field>
      </div>
      <div className="flex gap-2">
        <Field label="Height (cm)"><TextInput inputMode="numeric" value={v.height_cm} onChange={(e) => set('height_cm', e.target.value)} placeholder="178" /></Field>
        <Field label="Target weight"><TextInput inputMode="decimal" value={v.target_weight} onChange={(e) => set('target_weight', e.target.value)} placeholder="Optional" /></Field>
      </div>
      <Field label="Activity level">
        <Select value={v.activity} onChange={(e) => set('activity', e.target.value)}>
          {ACTIVITY_LEVELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select>
      </Field>
      <div className="text-[11.5px] text-mut mb-3">Current weight uses your latest logged bodyweight{weight ? ` (${weight} kg)` : ' — log one in Progress for an accurate estimate'}.</div>

      {preview && v.auto && (
        <Card className="p-4 mb-3">
          <div className="text-[12px] text-mut mb-1">Calculated targets</div>
          <div className="flex items-baseline justify-between">
            <span className="text-[24px] font-bold text-accent tabular-nums">{preview.calories} <span className="text-[13px] text-mut font-normal">kcal</span></span>
            <span className="text-[13px] tabular-nums"><MacroChips p={preview.protein} c={preview.carbs} f={preview.fat} /></span>
          </div>
        </Card>
      )}

      <label className="flex items-center justify-between py-2">
        <span className="text-[14px]">Auto-calculate targets</span>
        <input type="checkbox" checked={!!v.auto} onChange={(e) => set('auto', e.target.checked)} className="w-5 h-5 accent-[#ff9f0a]" />
      </label>
      {!v.auto && (
        <div className="flex gap-2 mt-1">
          <Field label="Calories"><TextInput inputMode="numeric" value={v.calories} onChange={(e) => set('calories', e.target.value)} placeholder="2300" /></Field>
          <Field label="Protein"><TextInput inputMode="numeric" value={v.protein} onChange={(e) => set('protein', e.target.value)} /></Field>
          <Field label="Carbs"><TextInput inputMode="numeric" value={v.carbs} onChange={(e) => set('carbs', e.target.value)} /></Field>
          <Field label="Fat"><TextInput inputMode="numeric" value={v.fat} onChange={(e) => set('fat', e.target.value)} /></Field>
        </div>
      )}
      <label className="flex items-center justify-between py-2 border-t border-edge/60 mt-2">
        <span className="text-[14px]">Add workout calories to budget<span className="block text-[11.5px] text-mut">Off by default — avoids over-eating</span></span>
        <input type="checkbox" checked={!!v.add_burned} onChange={(e) => set('add_burned', e.target.checked)} className="w-5 h-5 accent-[#ff9f0a]" />
      </label>
      <Button className="w-full mt-3" onClick={save}>Save goals</Button>
    </Sheet>
  );
}

// ── Meals + recipes: list, build, log ────────────────────────────────────────
export function MealsScreen({ onBack }: { onBack: () => void }) {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [edit, setEdit] = useState<Meal | 'new' | null>(null);
  const load = () => api.nutrition.meals.list().then(setMeals);
  useEffect(() => { load(); }, []);
  return (
    <div className="px-4 pt-2 pb-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="text-[14px] text-accent">‹ Nutrition</button>
        <Button small onClick={() => setEdit('new')}>＋ New meal</Button>
      </div>
      {!meals ? <Spinner /> : meals.length === 0
        ? <Empty icon="🍽" title="No meals yet" sub="Save a smoothie, a go-to breakfast, or a full recipe — then log it in one tap." action={<Button small onClick={() => setEdit('new')}>Create your first meal</Button>} />
        : (
          <div className="space-y-2">
            {meals.map((m) => (
              <Card key={m.id} className="px-4 py-3" onClick={() => setEdit(m)}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold truncate">{m.name}</div>
                    <div className="text-[12px] text-mut truncate">{m.items.length} item{m.items.length === 1 ? '' : 's'} · {m.servings} serving{m.servings === 1 ? '' : 's'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[14px] font-semibold text-accent tabular-nums">{m.per_serving.kcal} kcal</div>
                    <div className="text-[11px]"><MacroChips p={m.per_serving.protein} c={m.per_serving.carbs} f={m.per_serving.fat} /></div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      {edit && <MealFormSheet meal={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} onDeleted={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function MealFormSheet({ meal, onClose, onSaved, onDeleted }: {
  meal: Meal | null; onClose: () => void; onSaved: () => void; onDeleted: () => void;
}) {
  const [name, setName] = useState(meal?.name || '');
  const [servings, setServings] = useState(String(meal?.servings ?? 1));
  const [items, setItems] = useState<{ food_id: number | null; name: string; quantity: number; kcal: number; protein: number; carbs: number; fat: number; fibre: number | null; sugar: number | null; sodium: number | null }[]>(
    meal ? meal.items.map((i) => ({ food_id: i.food_id, name: i.name, quantity: i.quantity, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, fibre: i.fibre, sugar: i.sugar, sodium: i.sodium })) : []
  );
  const [addFood, setAddFood] = useState(false);
  const total = useMemo(() => items.reduce((a, it) => ({ kcal: a.kcal + it.kcal * it.quantity, protein: a.protein + it.protein * it.quantity, carbs: a.carbs + it.carbs * it.quantity, fat: a.fat + it.fat * it.quantity }), { kcal: 0, protein: 0, carbs: 0, fat: 0 }), [items]);
  const per = (n: number) => r0(n / (Number(servings) || 1));

  async function save() {
    try {
      const body = { name, servings: Number(servings) || 1, items: items.map((i) => (i.food_id ? { food_id: i.food_id, quantity: i.quantity } : { name: i.name, quantity: i.quantity, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, fibre: i.fibre, sugar: i.sugar, sodium: i.sodium })) };
      if (meal) await api.nutrition.meals.update(meal.id, body); else await api.nutrition.meals.create(body);
      showToast('Meal saved', 'ok'); onSaved();
    } catch (e: any) { showToast(e.message || 'Could not save', 'error'); }
  }
  async function del() { if (!meal || !confirmDialog('Delete this meal?')) return; await api.nutrition.meals.remove(meal.id); onDeleted(); }

  return (
    <Sheet open onClose={onClose} title={meal ? 'Edit meal' : 'New meal'} full>
      <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Breakfast smoothie" /></Field>
      <Field label="Makes how many servings?"><TextInput inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} /></Field>

      <div className="flex items-center justify-between mb-2 mt-1">
        <div className="text-[13px] font-semibold text-mut">Ingredients</div>
        <Button small kind="ghost" onClick={() => setAddFood(true)}>＋ Add food</Button>
      </div>
      {items.length === 0 ? <div className="text-[13px] text-dim py-3 text-center">No ingredients yet.</div> : (
        <div className="space-y-1.5 mb-3">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-surface2 border border-edge rounded-xl px-3 py-2">
              <span className="grow min-w-0">
                <span className="block text-[13.5px] truncate">{it.name}</span>
                <span className="block text-[11px] text-mut">{r0(it.kcal * it.quantity)} kcal · <MacroChips p={r0(it.protein * it.quantity)} c={r0(it.carbs * it.quantity)} f={r0(it.fat * it.quantity)} /></span>
              </span>
              <input inputMode="decimal" value={String(it.quantity)} onChange={(e) => { const q = Number(e.target.value) || 0; setItems((s) => s.map((x, i) => i === idx ? { ...x, quantity: q } : x)); }}
                className="w-14 text-center bg-surface border border-edge rounded-lg py-1 text-[13px]" />
              <button onClick={() => setItems((s) => s.filter((_, i) => i !== idx))} className="text-dim text-[16px] px-1">✕</button>
            </div>
          ))}
        </div>
      )}

      <Card className="p-3 mb-3">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-mut">Per serving</span>
          <span className="tabular-nums"><span className="text-accent font-semibold">{per(total.kcal)} kcal</span> · <MacroChips p={per(total.protein)} c={per(total.carbs)} f={per(total.fat)} /></span>
        </div>
      </Card>

      <div className="flex gap-2">
        {meal && <Button kind="danger" onClick={del}>Delete</Button>}
        <Button className="grow" disabled={!name || items.length === 0} onClick={save}>Save meal</Button>
      </div>

      {/* pick a food to add as an ingredient */}
      {addFood && <IngredientPicker onClose={() => setAddFood(false)} onPick={(f) => { setItems((s) => [...s, { food_id: f.id, name: f.name, quantity: 1, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fibre: f.fibre, sugar: f.sugar, sodium: f.sodium }]); setAddFood(false); }} />}
    </Sheet>
  );
}

function IngredientPicker({ onClose, onPick }: { onClose: () => void; onPick: (f: Food) => void }) {
  const [q, setQ] = useState(''); const [list, setList] = useState<Food[]>([]);
  useEffect(() => { api.nutrition.foods.search(q).then(setList); }, [q]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-lg mx-auto bg-surface border-t border-edge rounded-t-3xl p-5 max-h-[80dvh] flex flex-col animate-slideup" onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-semibold mb-2">Add ingredient</div>
        <TextInput autoFocus placeholder="Search foods…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
        <div className="overflow-y-auto space-y-1.5">
          {list.map((f) => (
            <button key={f.id} onClick={() => onPick(f)} className="w-full text-left bg-surface2 border border-edge rounded-xl px-3 py-2 active:bg-edge">
              <span className="block text-[13.5px] truncate">{f.name}</span>
              <span className="block text-[11px] text-mut">{f.serving_desc} · {r0(f.kcal)} kcal</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
