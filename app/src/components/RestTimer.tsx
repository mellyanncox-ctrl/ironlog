import React, { useEffect, useRef, useState } from 'react';
import { fmtClock } from '../util';

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
  const doneRef = useRef(false);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    const iv = setInterval(() => {
      if (timerState) {
        const left = Math.ceil((timerState.endsAt - Date.now()) / 1000);
        if (left <= 0 && !doneRef.current) { doneRef.current = true; beep(); setTimeout(() => { clearRestTimer(); doneRef.current = false; }, 1600); }
        force((x) => x + 1);
      }
    }, 250);
    return () => { listeners.delete(l); clearInterval(iv); };
  }, []);
  if (!timerState) return null;
  const left = Math.max(0, Math.ceil((timerState.endsAt - Date.now()) / 1000));
  const pct = Math.max(0, Math.min(1, left / timerState.total));
  return (
    <div className="fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-40 animate-slideup">
      <div className="bg-surface2/95 backdrop-blur border border-edge rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-xl shadow-black/40">
        <div className="relative w-9 h-9 shrink-0">
          <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#26262c" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15" fill="none" stroke={left === 0 ? '#30d158' : '#ff9f0a'} strokeWidth="3.5"
              strokeDasharray={`${pct * 94.2} 94.2`} strokeLinecap="round" />
          </svg>
        </div>
        <div className="grow">
          <div className={`text-[19px] font-bold tabular-nums leading-none ${left === 0 ? 'text-good' : 'text-ink'}`}>
            {left === 0 ? 'Go' : fmtClock(left)}
          </div>
          <div className="text-[11px] text-mut mt-0.5">Rest timer</div>
        </div>
        <button onClick={() => adjustRestTimer(-15)} className="px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-[12px] font-semibold text-mut active:bg-edge">−15</button>
        <button onClick={() => adjustRestTimer(15)} className="px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-[12px] font-semibold text-mut active:bg-edge">+15</button>
        <button onClick={clearRestTimer} className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-mut active:opacity-60">Skip</button>
      </div>
    </div>
  );
}
