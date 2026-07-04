import React, { useEffect, useState } from 'react';
import { api, DayView, MealType, NutritionInsight } from '../api';
import { Card, Button, Spinner } from '../components/ui';
import { CalorieRing, MacroRow, MACRO } from '../components/nutrition';
import { LogFoodSheet, EntryEditSheet, GoalSheet, MealsScreen } from './NutritionSheets';
import { showToast } from '../components/Toast';
import { todayISO, fmtDateLong, cx } from '../util';
import { addDays } from '../db/dates';

const MEAL_META: { key: MealType; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: '☀️' },
  { key: 'lunch', label: 'Lunch', icon: '🥗' },
  { key: 'dinner', label: 'Dinner', icon: '🍽️' },
  { key: 'snacks', label: 'Snacks', icon: '🍎' },
];

function dayLabel(date: string): string {
  const t = todayISO();
  if (date === t) return 'Today';
  if (date === addDays(t, -1)) return 'Yesterday';
  if (date === addDays(t, 1)) return 'Tomorrow';
  return fmtDateLong(date);
}

export function Nutrition({ onNav }: { onNav: (r: string) => void }) {
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState<DayView | null>(null);
  const [view, setView] = useState<'diary' | 'meals'>('diary');
  const [addTo, setAddTo] = useState<MealType | null>(null);
  const [editEntry, setEditEntry] = useState<any | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [insights, setInsights] = useState<NutritionInsight[]>([]);

  const load = () => api.nutrition.diary.day(date).then(setDay);
  useEffect(() => { load(); api.nutrition.insights().then(setInsights).catch(() => {}); }, [date]);

  if (view === 'meals') return <MealsScreen onBack={() => { setView('diary'); load(); }} />;
  if (!day) return <Spinner />;

  const t = day.totals, tg = day.targets;
  const hasGoal = !!(tg && tg.calories);

  async function dupYesterday() {
    const r = await api.nutrition.diary.duplicateYesterday(date);
    if (r.copied) { showToast(`Copied ${r.copied} item${r.copied === 1 ? '' : 's'}`, 'ok'); load(); }
    else showToast('Nothing earlier to copy', 'ok');
  }

  return (
    <div className="px-4 pt-2 pb-4 space-y-3">
      {/* date navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setDate(addDays(date, -1))} className="w-9 h-9 rounded-full bg-surface border border-edge text-mut active:bg-surface2">‹</button>
        <button onClick={() => setDate(todayISO())} className="text-[15px] font-semibold">{dayLabel(date)}</button>
        <button onClick={() => setDate(addDays(date, 1))} disabled={date >= todayISO()}
          className={cx('w-9 h-9 rounded-full bg-surface border border-edge text-mut active:bg-surface2', date >= todayISO() && 'opacity-30 pointer-events-none')}>›</button>
      </div>

      {/* dashboard */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <CalorieRing eaten={t.kcal} target={day.budget} remaining={day.remaining} />
          <div className="grow min-w-0 space-y-2.5">
            <Summary label="Eaten" value={Math.round(t.kcal)} />
            {hasGoal
              ? <>
                  <Summary label={day.add_burned ? 'Budget' : 'Target'} value={day.budget ?? 0} sub={day.add_burned && day.burned ? `${tg!.calories} + ${day.burned} burned` : undefined} />
                  <Summary label={day.remaining! < 0 ? 'Over' : 'Remaining'} value={Math.abs(day.remaining ?? 0)} accent over={day.remaining! < 0} />
                </>
              : <button onClick={() => setGoalOpen(true)} className="text-[13px] text-accent font-medium text-left">Set a calorie goal →</button>}
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-edge/60">
          <MacroRow p={t.protein} c={t.carbs} f={t.fat} tp={tg?.protein ?? null} tc={tg?.carbs ?? null} tf={tg?.fat ?? null} />
        </div>
      </Card>

      {/* training ↔ food connection */}
      {(day.workouts.length > 0 || day.burned > 0 || day.weight != null) && (
        <Card className="px-4 py-3">
          <div className="flex items-center gap-4 text-[12.5px]">
            {day.workouts.length > 0 && (
              <div className="min-w-0">
                <div className="text-mut">Trained</div>
                <div className="font-semibold truncate">🏋️ {day.workouts.map((w) => w.name).join(', ')}</div>
              </div>
            )}
            {day.burned > 0 && (
              <div className="shrink-0">
                <div className="text-mut">Burned</div>
                <div className="font-semibold tabular-nums">🔥 {day.burned}</div>
              </div>
            )}
            {tg?.protein != null && (
              <div className="shrink-0 ml-auto text-right">
                <div className="text-mut">Protein</div>
                <div className="font-semibold tabular-nums" style={{ color: t.protein >= tg.protein * 0.9 ? MACRO.protein : undefined }}>{Math.round(t.protein)}/{Math.round(tg.protein)}g</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* meal sections */}
      {MEAL_META.map((m) => {
        const sec = day.meals.find((x) => x.meal_type === m.key)!;
        return (
          <Card key={m.key} className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge/50">
              <span className="text-[14px] font-semibold">{m.icon} {m.label}</span>
              <span className="text-[12px] text-mut tabular-nums">{sec.totals.kcal} kcal</span>
            </div>
            {sec.entries.length > 0 && (
              <div className="divide-y divide-edge/40">
                {sec.entries.map((e) => (
                  <button key={e.id} onClick={() => setEditEntry(e)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left active:bg-surface2">
                    <span className="grow min-w-0">
                      <span className="block text-[13.5px] truncate">{e.name}</span>
                      <span className="block text-[11px] text-mut">{e.quantity !== 1 ? `${e.quantity} × ` : ''}{e.serving_desc || 'serving'}</span>
                    </span>
                    <span className="text-[12.5px] text-mut tabular-nums shrink-0">{Math.round(e.kcal * e.quantity)}</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setAddTo(m.key)} className="w-full px-4 py-2.5 text-left text-[13px] text-accent font-medium active:bg-surface2">＋ Add food</button>
          </Card>
        );
      })}

      {/* insights */}
      {insights.length > 0 && (
        <div>
          <div className="text-[13px] font-semibold text-mut uppercase tracking-wide mb-2 px-1">Insights</div>
          <div className="space-y-2">
            {insights.slice(0, 4).map((ins, i) => (
              <Card key={i} className={cx('px-4 py-3 flex gap-3 items-start', ins.tone === 'good' && 'border-good/30', ins.tone === 'warn' && 'border-accent/30')}>
                <span className="text-[18px] leading-none">{ins.icon}</span>
                <span className="text-[13px] text-ink/90">{ins.text}</span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* actions */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button kind="ghost" onClick={dupYesterday}>⧉ Copy yesterday</Button>
        <Button kind="ghost" onClick={() => setView('meals')}>🍽 Meals</Button>
        <Button kind="ghost" onClick={() => setGoalOpen(true)}>🎯 Goals</Button>
        <Button kind="ghost" onClick={() => onNav('reports')}>📊 Reports</Button>
      </div>

      {addTo && <LogFoodSheet open onClose={() => setAddTo(null)} date={date} mealType={addTo} onChanged={load} />}
      <EntryEditSheet entry={editEntry} onClose={() => setEditEntry(null)} onChanged={load} />
      <GoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} goal={day.goal} weight={day.weight} onSaved={() => { setGoalOpen(false); load(); }} />
    </div>
  );
}

function Summary({ label, value, sub, accent, over }: { label: string; value: number; sub?: string; accent?: boolean; over?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12.5px] text-mut">{label}</span>
      <span className="text-right">
        <span className={cx('text-[16px] font-semibold tabular-nums', over ? 'text-bad' : accent ? 'text-accent' : 'text-ink')}>{value.toLocaleString()}</span>
        {sub && <span className="block text-[10.5px] text-dim tabular-nums">{sub}</span>}
      </span>
    </div>
  );
}
