import React, { useEffect, useState } from 'react';

// Tiny global toast — errors must never be silent.
type Toast = { id: number; text: string; kind: 'error' | 'ok' };
let nextId = 1;
const listeners = new Set<(t: Toast) => void>();

export function showToast(text: string, kind: 'error' | 'ok' = 'error') {
  const t = { id: nextId++, text: String(text).slice(0, 200), kind };
  listeners.forEach((l) => l(t));
}

export function installGlobalErrorHandlers() {
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason?.message || String(e.reason || 'Something went wrong');
    showToast(msg);
    e.preventDefault();
  });
  window.addEventListener('error', (e) => {
    if (e.message && !/ResizeObserver/.test(e.message)) showToast(e.message);
  });
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const l = (t: Toast) => {
      setToasts((cur) => [...cur.slice(-2), t]);
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 4000);
    };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-[calc(env(safe-area-inset-top)+8px)] left-3 right-3 z-[70] space-y-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id}
          className={`max-w-lg mx-auto px-4 py-3 rounded-xl text-[13.5px] font-medium shadow-xl shadow-black/40 animate-slideup border ${
            t.kind === 'error' ? 'bg-[#2a1215] border-bad/40 text-[#ff9d97]' : 'bg-[#12291a] border-good/40 text-[#7ee2a0]'}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
