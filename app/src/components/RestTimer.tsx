import React, { useEffect, useRef, useState } from 'react';
import { fmtClock, cx } from '../util';

// Singleton rest timer state (survives navigation within the SPA).
type TimerState = { endsAt: number; total: number } | null;
let timerState: TimerState = null;
const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }

export function startRestTimer(seconds: number) {
  timerState = { endsAt: Date.now() + seconds * 1000, total: seconds };
  // Create/resume the shared AudioContext HERE, inside the user's tap —
  // iOS refuses audio started outside a gesture, and browsers cap the
  // number of contexts, so we keep exactly one for the app's lifetime.
  ensureAudio();
  notify();
}

let audioCtx: AudioContext | null = null;
function ensureAudio(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}
export function clearRestTimer() { timerState = null; notify(); }
export function adjustRestTimer(delta: number) {
  if (!timerState) return;
  timerState = { ...timerState, endsAt: timerState.endsAt + delta * 1000, total: Math.max(1, timerState.total + delta) };
  notify();
}

function beep() {
  try {
    const ctx = ensureAudio();
    if (!ctx) { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); return; }
    const play = (t: number, f: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4);
    };
    play(0, 880); play(0.45, 880); play(0.9, 1174);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch { /* audio unavailable */ }
}

export function RestTimerBar() {
  const [, force] = useState(0);
  // Key the "finished" handling on the timer's endsAt so each distinct rest
  // period fires its beep exactly once, and — critically — a scheduled cleanup
  // only clears the timer it belongs to. Previously a fresh timer started within
  // 1.6s of the last one finishing got wiped by the old cleanup → "no rest timer".
  const firedRef = useRef<number | null>(null);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    const iv = setInterval(() => {
      if (timerState) {
        const left = Math.ceil((timerState.endsAt - Date.now()) / 1000);
        if (left <= 0 && firedRef.current !== timerState.endsAt) {
          firedRef.current = timerState.endsAt;
          const finished = timerState.endsAt;
          beep();
          setTimeout(() => { if (timerState && timerState.endsAt === finished) clearRestTimer(); }, 1600);
        }
        force((x) => x + 1);
      }
    }, 250);
    return () => { listeners.delete(l); clearInterval(iv); };
  }, []);
  if (!timerState) return null;
  const left = Math.max(0, Math.ceil((timerState.endsAt - Date.now()) / 1000));
  const pct = Math.max(0, Math.min(1, left / timerState.total));
  const done = left === 0;
  const R = 26, C = 2 * Math.PI * R; // ring geometry
  return (
    <div className="fixed inset-x-0 top-1/2 -translate-y-1/2 z-40 px-6 flex justify-center pointer-events-none animate-slideup">
      <div className={cx(
        'pointer-events-auto w-full max-w-xs bg-surface2/95 backdrop-blur rounded-3xl px-6 pt-6 pb-5 shadow-2xl shadow-black/60 border',
        done ? 'border-good/60' : 'border-accent/50',
      )}>
        <div className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-mut mb-4">
          {done ? 'Rest complete' : 'Resting'}
        </div>
        <div className="relative w-40 h-40 mx-auto mb-5">
          <svg viewBox="0 0 64 64" className="w-40 h-40 -rotate-90">
            <circle cx="32" cy="32" r={R} fill="none" stroke="#2b3440" strokeWidth="5" />
            <circle cx="32" cy="32" r={R} fill="none" stroke={done ? '#2ec7a5' : '#4b93f8'} strokeWidth="5"
              strokeDasharray={`${pct * C} ${C}`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.25s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cx('text-[38px] font-bold tabular-nums leading-none', done ? 'text-good' : 'text-ink')}>
              {done ? 'Go' : fmtClock(left)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => adjustRestTimer(-15)} className="px-4 py-2 rounded-xl bg-surface border border-edge text-[13px] font-semibold text-mut active:bg-edge">−15</button>
          <button onClick={() => adjustRestTimer(15)} className="px-4 py-2 rounded-xl bg-surface border border-edge text-[13px] font-semibold text-mut active:bg-edge">+15</button>
          <button onClick={clearRestTimer} className="px-4 py-2 rounded-xl bg-accent text-white text-[13px] font-bold active:bg-accent-dim">{done ? 'Done' : 'Skip'}</button>
        </div>
      </div>
    </div>
  );
}
