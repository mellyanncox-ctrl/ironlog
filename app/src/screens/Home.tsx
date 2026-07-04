import React, { useEffect, useState } from 'react';
import { api, Overview, Template, GarminDaily, WorkoutSummary, GarminActivity, ProgressPhoto } from '../api';
import { Card, Button, Stat, Pill } from '../components/ui';
import { fmtVolume, fmtDate, todayDow, DOW, fmtDuration, fmtDistance, fmtPace, isoWeekStartLocal, todayISO } from '../util';

export function Home({ onStartTemplate, onStartBlank, onResume, activeId, onNav }: {
  onStartTemplate: (id: number) => void; onStartBlank: () => void;
  onResume: () => void; activeId: number | null; onNav: (r: string) => void;
}) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [recent, setRecent] = useState<WorkoutSummary[]>([]);
  const [daily, setDaily] = useState<GarminDaily[]>([]);
  const [lastRun, setLastRun] = useState<GarminActivity | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);

  useEffect(() => {
    api.stats.overview().then(setOv);
    api.templates.list().then(setTemplates);
    api.workouts.list(3).then(setRecent);
    api.garmin.daily().then(setDaily).catch(() => {});
    api.garmin.runs(1).then((r) => setLastRun(r[0] || null)).catch(() => {});
    api.photos.list().then(setPhotos).catch(() => {});
  }, [activeId]);

  const today = todayDow();
  const shotThisWeek = photos.some((p) => isoWeekStartLocal(p.date) === isoWeekStartLocal(todayISO()));
  const todays = templates.filter((t) => t.day_of_week === today);
  const upcoming = templates.filter((t) => t.day_of_week != null && t.day_of_week !== today)
    .sort((a, b) => ((a.day_of_week! - today + 7) % 7) - ((b.day_of_week! - today + 7) % 7))[0];
  const latestDaily = daily.length ? daily[daily.length - 1] : null;

  return (
    <div className="px-4 pt-2 space-y-4">
      {/* stats strip */}
      <Card className="px-4 py-4 flex gap-2">
        <Stat label="week streak" value={ov ? `${ov.streak_weeks}🔥` : '–'} />
        <Stat label="this week" value={ov ? ov.workouts_this_week : '–'} sub="workouts" />
        <Stat label="volume" value={ov ? fmtVolume(ov.volume_this_week) : '–'} sub="this week" />
        <Stat label="PRs" value={ov ? ov.prs_this_month : '–'} sub="this month" accent />
      </Card>

      {/* active workout */}
      {activeId && (
        <Card className="p-4 border-accent/50" onClick={onResume}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold text-accent">Workout in progress</div>
              <div className="text-[12px] text-mut">Tap to resume logging</div>
            </div>
            <span className="text-accent text-xl">→</span>
          </div>
        </Card>
      )}

      {/* today */}
      {!activeId && (
        <div>
          <SectionTitle>Today · {DOW[today]}</SectionTitle>
          {todays.length > 0 ? todays.map((t) => (
            <Card key={t.id} className="p-4 mb-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold">{t.name}</div>
                  <div className="text-[12px] text-mut truncate">{t.exercises.map((e) => e.exercise_name).join(' · ')}</div>
                </div>
                <Button small onClick={() => onStartTemplate(t.id)}>Start</Button>
              </div>
            </Card>
          )) : (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[15px] font-medium text-mut">Rest day — nothing scheduled</div>
                  {upcoming && <div className="text-[12px] text-dim">Next: {upcoming.name} on {DOW[upcoming.day_of_week!]}</div>}
                </div>
                <Button small kind="ghost" onClick={onStartBlank}>Quick start</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* recovery snapshot */}
      {latestDaily && (
        <div>
          <SectionTitle>Recovery <span className="text-dim font-normal">· Garmin · {fmtDate(latestDaily.date)}</span></SectionTitle>
          <Card className="px-4 py-3.5 flex gap-2">
            <Stat label="sleep" value={latestDaily.sleep_seconds ? fmtDuration(latestDaily.sleep_seconds) : '–'} />
            <Stat label="body battery" value={latestDaily.body_battery ?? '–'} />
            <Stat label="stress" value={latestDaily.stress ?? '–'} />
            <Stat label="resting HR" value={latestDaily.resting_hr ?? '–'} />
          </Card>
        </div>
      )}

      {/* weekly progress shot nudge */}
      {ov && ov.total_workouts > 0 && !shotThisWeek && (
        <Card className="px-4 py-3" onClick={() => onNav('photos')}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold">📸 Weekly progress shot</div>
              <div className="text-[12px] text-mut">None logged this week — takes 20 seconds</div>
            </div>
            <span className="text-accent text-[14px] font-semibold">Add ›</span>
          </div>
        </Card>
      )}

      {/* last run */}
      {lastRun && (
        <div>
          <SectionTitle>Last run</SectionTitle>
          <Card className="px-4 py-3" onClick={() => onNav('runs')}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold">🏃 {fmtDistance(lastRun.distance_m)} · {fmtPace(lastRun.duration_s, lastRun.distance_m)}</div>
                <div className="text-[12px] text-mut">{fmtDate(lastRun.started_at)} · {fmtDuration(lastRun.duration_s)}{lastRun.avg_hr ? ` · ♥ ${lastRun.avg_hr} bpm` : ''}</div>
              </div>
              <span className="text-dim">›</span>
            </div>
          </Card>
        </div>
      )}

      {/* recent workouts */}
      {recent.length > 0 && (
        <div>
          <SectionTitle>Recent</SectionTitle>
          <div className="space-y-2">
            {recent.map((w) => (
              <Card key={w.id} className="px-4 py-3" onClick={() => onNav(`history/${w.id}`)}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{w.name}</div>
                    <div className="text-[12px] text-mut">{fmtDate(w.started_at)} · {w.sets} sets · {fmtVolume(w.volume)}</div>
                  </div>
                  {w.prs > 0 && <Pill color="#ff9f0a">🏆 {w.prs} PR{w.prs > 1 ? 's' : ''}</Pill>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* first run */}
      {ov && ov.total_workouts === 0 && !activeId && (
        <Card className="p-5 text-center">
          <div className="text-3xl mb-2">🏋️</div>
          <div className="text-[16px] font-semibold mb-1">Welcome to Ironlog</div>
          <div className="text-[13px] text-mut mb-4">Start a blank workout, build a routine, or load sample data to explore.</div>
          <div className="flex gap-2 justify-center">
            <Button small kind="ghost" onClick={async () => { await api.demoSeed(); location.reload(); }}>Load sample data</Button>
            <Button small onClick={onStartBlank}>Start a workout</Button>
          </div>
        </Card>
      )}

      {!activeId && ov && ov.total_workouts > 0 && (
        <Button kind="ghost" className="w-full" onClick={onStartBlank}>＋ Start blank workout</Button>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] font-semibold text-mut uppercase tracking-wide mb-2">{children}</h2>;
}
