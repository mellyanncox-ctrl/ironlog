import React, { useEffect, useState } from 'react';
import { api, Settings } from './api';
import { setUnits, cx } from './util';
import { Home } from './screens/Home';
import { Nutrition } from './screens/Nutrition';
import { History, WorkoutDetail } from './screens/History';
import { Routines } from './screens/Routines';
import { Library, ExerciseDetail } from './screens/Library';
import { Progress } from './screens/Progress';
import { Reports } from './screens/Reports';
import { Garmin, ActivityDetail } from './screens/Garmin';
import { Runs } from './screens/Runs';
import { Swims } from './screens/Swims';
import { Photos } from './screens/Photos';
import { TriathlonPink } from './screens/TriathlonPink';
import { SettingsScreen } from './screens/Settings';
import { WorkoutScreen } from './screens/Workout';
import { RestTimerBar } from './components/RestTimer';
import { Spinner } from './components/ui';
import { showToast } from './components/Toast';

function useHashRoute(): [string, (r: string) => void] {
  const [route, setRoute] = useState(location.hash.slice(2) || '');
  useEffect(() => {
    const h = () => setRoute(location.hash.slice(2) || '');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return [route, (r: string) => { location.hash = '#/' + r; }];
}

const TABS = [
  { key: '', label: 'Home', icon: '⌂' },
  { key: 'food', label: 'Food', icon: '🍽' },
  { key: 'routines', label: 'Routines', icon: '▦' },
  { key: 'progress', label: 'Progress', icon: '↗' },
  { key: 'more', label: 'More', icon: '•••' },
];

const TITLES: Record<string, string> = {
  '': 'STRONG', food: 'Nutrition', history: 'History', routines: 'Routines', progress: 'Progress',
  library: 'Exercises', reports: 'Reports', garmin: 'Garmin', runs: 'Runs', swims: 'Swims',
  activity: 'Activity', photos: 'Progress photos', tripink: 'Triathlon Pink', settings: 'Settings', more: 'More',
};

export default function App() {
  const [route, nav] = useHashRoute();
  const [boot, setBoot] = useState<{ settings: Settings; muscles: string[]; equipment: string[] } | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showWorkout, setShowWorkout] = useState(false);

  useEffect(() => {
    api.bootstrap().then((b) => {
      setUnits(b.settings.units);
      setBoot(b);
      if (b.active_workout) setActiveId(b.active_workout.id);
      // Garmin auto-sync: fire-and-forget on launch, silent unless it found something new.
      if (navigator.onLine !== false) {
        api.garmin.sync.now().then((r) => {
          if (r.state === 'ok' && (r.activities > 0 || r.daily > 0)) {
            showToast(`Garmin: ${r.activities} new ${r.activities === 1 ? 'activity' : 'activities'}, ${r.daily} wellness days`, 'ok');
          }
        }).catch(() => {});
        // Silent, throttled cloud backup on launch (no-op unless configured).
        api.backup.cloud.now().catch(() => {});
      }
    });
  }, []);

  if (!boot) return <div className="min-h-dvh flex items-center justify-center"><Spinner /></div>;

  const { muscles, equipment } = boot;
  const seg = route.split('/');
  const base = seg[0];

  // Never silently orphan an in-progress workout: resume it instead of stacking a new one.
  function guardActive(): boolean {
    if (!activeId) return true;
    setShowWorkout(true);
    return false;
  }
  async function startTemplate(id: number) {
    if (!guardActive()) return;
    const w = await api.templates.start(id);
    setActiveId(w.id); setShowWorkout(true);
  }
  async function startBlank() {
    if (!guardActive()) return;
    const w = await api.workouts.create();
    setActiveId(w.id); setShowWorkout(true);
  }
  function workoutDone() {
    setActiveId(null); setShowWorkout(false);
    api.backup.cloud.now(true).catch(() => {}); // safeguard the just-finished session
    nav(''); // refresh home
  }

  const title = TITLES[base] ?? 'STRONG';

  return (
    <div className="min-h-dvh max-w-lg mx-auto pb-[calc(env(safe-area-inset-bottom)+84px)]">
      {/* header */}
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur border-b border-edge/60 px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 flex items-center justify-between">
        <h1 className="text-[21px] font-bold tracking-tight">
          {base === '' ? <><span className="text-accent">STR</span>ONG</> : title}
        </h1>
        {base === '' && (
          <button onClick={() => nav('settings')} className="w-9 h-9 rounded-full bg-surface border border-edge text-mut flex items-center justify-center">⚙</button>
        )}
      </header>

      {/* routes */}
      {base === '' && <Home onStartTemplate={startTemplate} onStartBlank={startBlank} activeId={activeId} onResume={() => setShowWorkout(true)} onNav={nav} />}
      {base === 'food' && <Nutrition onNav={nav} />}
      {base === 'history' && !seg[1] && <History onNav={nav} onDuplicated={() => { api.workouts.active().then((w) => { if (w) { setActiveId(w.id); setShowWorkout(true); } }); }} />}
      {base === 'history' && seg[1] && <WorkoutDetail id={Number(seg[1])} onNav={nav}
        onDuplicated={() => { api.workouts.active().then((w) => { if (w) { setActiveId(w.id); setShowWorkout(true); } }); }} />}
      {base === 'routines' && <Routines muscles={muscles} equipment={equipment} onStart={startTemplate} />}
      {base === 'library' && !seg[1] && <Library muscles={muscles} equipment={equipment} onNav={nav} />}
      {base === 'library' && seg[1] && <ExerciseDetail id={Number(seg[1])} onNav={nav} muscles={muscles} equipment={equipment} />}
      {base === 'progress' && <Progress onNav={nav} />}
      {base === 'reports' && <Reports onNav={nav} />}
      {base === 'garmin' && <Garmin onNav={nav} />}
      {base === 'activity' && seg[1] && <ActivityDetail id={Number(seg[1])} onNav={nav} />}
      {base === 'runs' && <Runs onNav={nav} />}
      {base === 'swims' && <Swims onNav={nav} />}
      {base === 'photos' && <Photos />}
      {base === 'tripink' && <TriathlonPink />}
      {base === 'settings' && <SettingsScreen settings={boot.settings} onChange={(s) => setBoot({ ...boot, settings: s })} />}
      {base === 'more' && <More onNav={nav} />}

      {/* resume pill */}
      {activeId && !showWorkout && (
        <button onClick={() => setShowWorkout(true)}
          className="fixed left-4 right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-40 max-w-lg mx-auto bg-accent text-white font-semibold rounded-2xl py-3 text-[14px] shadow-xl shadow-black/50 animate-slideup">
          ● Workout in progress — tap to resume
        </button>
      )}

      {/* tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-bg/90 backdrop-blur border-t border-edge">
        <div className="max-w-lg mx-auto flex pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => {
            const active = base === t.key || (t.key === 'more' && ['history', 'library', 'garmin', 'reports', 'settings', 'runs', 'swims', 'photos', 'tripink', 'activity'].includes(base));
            return (
              <button key={t.key} onClick={() => nav(t.key)}
                className={cx('flex-1 pt-2.5 pb-2 flex flex-col items-center gap-0.5 transition-colors', active ? 'text-accent' : 'text-dim')}>
                <span className="text-[19px] leading-none">{t.icon}</span>
                <span className="text-[10px] font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* active workout overlay */}
      {showWorkout && activeId && (
        <WorkoutScreen workoutId={activeId} onDone={workoutDone} onMinimize={() => setShowWorkout(false)} muscles={muscles} equipment={equipment} />
      )}
      <RestTimerBar />
    </div>
  );
}

function More({ onNav }: { onNav: (r: string) => void }) {
  const items = [
    { key: 'tripink', icon: '🏅', label: 'Triathlon Pink', sub: 'Your 16-week plan to the Perth Long — tick off each week' },
    { key: 'history', icon: '☰', label: 'Workout history', sub: 'Every logged session, PRs, and details' },
    { key: 'library', icon: '🏋️', label: 'Exercise library', sub: 'Browse, search, and add custom exercises' },
    { key: 'photos', icon: '📸', label: 'Progress photos', sub: 'Weekly shots, side-by-side compare' },
    { key: 'runs', icon: '🏃', label: 'Runs', sub: 'Distance, pace, and weekly mileage from Garmin' },
    { key: 'swims', icon: '🏊', label: 'Swims', sub: 'Distance, pace per 100 m, and weekly volume from Garmin' },
    { key: 'reports', icon: '📊', label: 'Weekly & monthly reports', sub: 'Volume, PRs, muscle balance, recovery' },
    { key: 'garmin', icon: '⌚', label: 'Garmin import', sub: 'Import activities and wellness data' },
    { key: 'settings', icon: '⚙️', label: 'Settings', sub: 'Units, rest timer, backup, data' },
  ];
  return (
    <div className="px-4 pt-2 space-y-2">
      {items.map((i) => (
        <button key={i.key} onClick={() => onNav(i.key)}
          className="w-full bg-surface border border-edge rounded-2xl px-4 py-3.5 flex items-center gap-3.5 text-left active:bg-surface2">
          <span className="text-2xl">{i.icon}</span>
          <span className="grow">
            <span className="block text-[15px] font-semibold">{i.label}</span>
            <span className="block text-[12px] text-mut">{i.sub}</span>
          </span>
          <span className="text-dim">›</span>
        </button>
      ))}
    </div>
  );
}
