import React, { useEffect, useState } from 'react';
import { api, DayView, MealType, NutritionInsight } from '../api';
import { Card, Button, Spinner } from '../components/ui';
import { CalorieBlock, MacroRow, MacroCol, WeekStrip, MealIcon, MACRO } from '../components/nutrition';
import { LogFoodSheet, EntryEditSheet, GoalSheet, MealsScreen } from './NutritionSheets';
import { showToast } from '../components/Toast';
import { todayISO, fmtDateLong, cx } from '../util';
import { addDays } from '../db/dates';

const MEAL_META: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

function dayLabel(date: string): string {
  const t = todayISO();
  if (date === t) return 'Today';
  if (date === addDays(t, -1)) return 'Yesterday';
  if (date === addDays(t, 1)) return 'Tomorrow';
  return fmtDateLong(date);
}

// The Sun→Sat week containing `date`, for the strip.
function weekOf(date: string) {
  const d = new Date(date + 'T00:00:00');
  const sun = addDays(date, -d.getDay());
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return Array.from({ length: 7 }, (_, i) => ({ iso: addDays(sun, i), letter: letters[i] }));
}

export function Nutrition({ onNav }: { onNav: (r: string) => void }) {
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState<DayView | null>(null);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'diary' | 'meals'>('diary');
  const [addTo, setAddTo] = useState<MealType | null>(null);
  const [editEntry, setEditEntry] = useState<any | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [macroMode, setMacroMode] = useState<'eaten' | 'left'>('eaten');
  const [insights, setInsights] = useState<NutritionInsight[]>([]);

  const week = weekOf(date);
  function load() {
    api.nutrition.diary.day(date).then(setDay);
    api.nutrition.diary.loggedDates(week[0].iso, week[6].iso).then((d) => setLogged(new Set(d)));
  }
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
  function toggleExpand(k: string) {
    setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }

  const stripDays = week.map((w) => ({ ...w, logged: logged.has(w.iso), today: w.iso === todayISO() }));

  return (
    <div className="px-4 pt-1 pb-4 space-y-4">
      {/* header: day + streak */}
      <div className="flex items-center justify-between">
        <button onClick={() => setDate(todayISO())} className="flex items-center gap-1.5">
          <span className="text-[22px] font-bold tracking-tight">{dayLabel(date)}</span>
          {date !== todayISO() && <span className="text-[13px] text-accent font-medium">· Today</span>}
        </button>
        {day.streak > 0 && (
          <div className="flex items-center gap-1 bg-surface border border-edge rounded-full px-3 py-1">
            <span className="text-[14px] font-bold tabular-nums">{day.streak}</span>
            <span className="text-[13px]">🔥</span>
          </div>
        )}
      </div>

      {/* weekday strip */}
      <WeekStrip days={stripDays} selected={date} onSelect={setDate} />

      {/* calories */}
      <Card className="p-5">
        {hasGoal
          ? <CalorieBlock eaten={t.kcal} target={day.budget} remaining={day.remaining} />
          : (
            <div>
              <CalorieBlock eaten={t.kcal} target={null} remaining={null} />
              <button onClick={() => setGoalOpen(true)} className="mt-3 text-[13px] text-accent font-medium">Set a calorie goal →</button>
            </div>
          )}
        {day.add_burned && day.burned > 0 && (
          <div className="mt-2.5 text-[12px] text-mut">Includes 🔥 {day.burned} kcal burned</div>
        )}
      </Card>

      {/* macros */}
      <Card className="p-5 relative">
        <button onClick={() => setMacroMode((m) => (m === 'eaten' ? 'left' : 'eaten'))}
          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-surface2 border border-edge text-mut flex items-center justify-center text-[13px]"
          title={macroMode === 'eaten' ? 'Show remaining' : 'Show eaten'}>⇄</button>
        <MacroRow
          p={macroMode === 'left' && tg?.protein != null ? Math.max(0, tg.protein - t.protein) : t.protein}
          c={macroMode === 'left' && tg?.carbs != null ? Math.max(0, tg.carbs - t.carbs) : t.carbs}
          f={macroMode === 'left' && tg?.fat != null ? Math.max(0, tg.fat - t.fat) : t.fat}
          tp={tg?.protein ?? null} tc={tg?.carbs ?? null} tf={tg?.fat ?? null} />
        {macroMode === 'left' && <div className="mt-3 text-[11px] text-dim">Grams remaining to hit your targets</div>}
      </Card>

      {/* training connection */}
      {(day.workouts.length > 0 || day.burned > 0) && (
        <Card className="px-4 py-3 flex items-center gap-4 text-[12.5px]">
          {day.workouts.length > 0 && (
            <div className="min-w-0">
              <div className="text-mut">Trained today</div>
              <div className="font-semibold truncate">🏋️ {day.workouts.map((w) => w.name).join(', ')}</div>
            </div>
          )}
          {day.burned > 0 && (
            <div className="shrink-0 ml-auto text-right">
              <div className="text-mut">Burned</div>
              <div className="font-semibold tabular-nums">🔥 {day.burned}</div>
            </div>
          )}
        </Card>
      )}

      {/* diary */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-[18px] font-bold">Diary</h2>
        </div>
        <div className="space-y-2.5">
          {MEAL_META.map((m) => {
            const sec = day.meals.find((x) => x.meal_type === m.key)!;
            const n = sec.entries.length;
            const summary = n === 0 ? 'Nothing logged yet'
              : `${sec.entries[0].name}${n > 1 ? ` and ${n - 1} more` : ''}`;
            const open = expanded.has(m.key);
            return (
              <Card key={m.key} className="overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-accent shrink-0"><MealIcon type={m.key} /></span>
                  <button onClick={() => n > 0 && toggleExpand(m.key)} className="grow min-w-0 text-left">
                    <div className="text-[15px] font-semibold">{m.label}</div>
                    <div className="text-[12px] text-mut truncate">{summary}{n > 0 ? ` · ${sec.totals.kcal} cal` : ''}</div>
                  </button>
                  <button onClick={() => setAddTo(m.key)}
                    className="shrink-0 text-[13px] font-semibold text-accent bg-accent/12 rounded-lg px-3.5 py-1.5 active:bg-accent/20">Log</button>
                </div>
                {open && n > 0 && (
                  <div className="border-t border-edge/50 divide-y divide-edge/40">
                    {sec.entries.map((e) => (
                      <button key={e.id} onClick={() => setEditEntry(e)} className="w-full flex items-center gap-2 px-4 py-2.5 pl-14 text-left active:bg-surface2">
                        <span className="grow min-w-0">
                          <span className="block text-[13.5px] truncate">{e.name}</span>
                          <span className="block text-[11px] text-mut">{e.quantity !== 1 ? `${e.quantity} × ` : ''}{e.serving_desc || 'serving'}</span>
                        </span>
                        <span className="text-[12.5px] text-mut tabular-nums shrink-0">{Math.round(e.kcal * e.quantity)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* insights */}
      {insights.length > 0 && (
        <div>
          <h2 className="text-[18px] font-bold mb-2 px-1">Insights</h2>
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
