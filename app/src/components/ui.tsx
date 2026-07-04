import React, { useEffect } from 'react';
import { cx } from '../util';

export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('bg-surface border border-edge rounded-2xl', onClick && 'cursor-pointer active:bg-surface2 transition-colors', className)}>
      {children}
    </div>
  );
}

export function Button({ children, onClick, kind = 'primary', className, disabled, small }: {
  children: React.ReactNode; onClick?: (e: React.MouseEvent) => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'subtle'; className?: string; disabled?: boolean; small?: boolean;
}) {
  const base = small ? 'px-3 py-1.5 text-[13px] rounded-lg' : 'px-4 py-2.5 text-[15px] rounded-xl';
  const kinds = {
    primary: 'bg-accent text-white font-semibold active:bg-accent-dim',
    ghost: 'bg-surface2 text-ink font-medium border border-edge active:bg-edge',
    subtle: 'bg-transparent text-accent font-medium active:opacity-60',
    danger: 'bg-transparent text-bad font-medium border border-edge active:bg-surface2',
  };
  return (
    <button disabled={disabled} onClick={onClick} className={cx(base, kinds[kind], 'transition-all select-none', disabled && 'opacity-40 pointer-events-none', className)}>
      {children}
    </button>
  );
}

export function Sheet({ open, onClose, children, title, full }: {
  open: boolean; onClose: () => void; children: React.ReactNode; title?: string; full?: boolean;
}) {
  useEffect(() => {
    if (open) { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70 animate-fadein" onClick={onClose} />
      <div className={cx('relative w-full sm:max-w-lg bg-surface border-t sm:border border-edge sm:rounded-3xl rounded-t-3xl animate-slideup flex flex-col', full ? 'h-[92dvh]' : 'max-h-[88dvh]')}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface2 text-mut flex items-center justify-center text-[15px] active:bg-edge">✕</button>
        </div>
        <div className="overflow-y-auto px-5 pb-8 grow">{children}</div>
      </div>
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange, className }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={cx('flex bg-surface2 rounded-xl p-0.5 border border-edge', className)}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cx('flex-1 py-1.5 px-3 rounded-[10px] text-[13px] font-medium transition-all',
            value === o.value ? 'bg-edge text-ink shadow-sm' : 'text-mut')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <div className="text-[13px] text-mut mb-1.5 font-medium">{label}</div>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('w-full bg-surface2 border border-edge rounded-xl px-3.5 py-2.5 text-[15px] outline-none focus:border-accent/60 placeholder:text-dim', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx('w-full bg-surface2 border border-edge rounded-xl px-3.5 py-2.5 text-[15px] outline-none focus:border-accent/60 appearance-none', props.className)} />;
}

export function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="flex-1 min-w-0">
      <div className={cx('text-[22px] font-bold tracking-tight tabular-nums', accent ? 'text-accent' : 'text-ink')}>{value}</div>
      <div className="text-[12px] text-mut mt-0.5 truncate">{label}</div>
      {sub && <div className="text-[11px] text-dim truncate">{sub}</div>}
    </div>
  );
}

export function Empty({ icon, title, sub, action }: { icon: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="text-4xl mb-3 opacity-60">{icon}</div>
      <div className="text-[16px] font-semibold text-ink">{title}</div>
      {sub && <div className="text-[13px] text-mut mt-1 max-w-xs mx-auto">{sub}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Pill({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface2 border border-edge text-mut"
      style={color ? { color, borderColor: color + '44' } : undefined}>
      {children}
    </span>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-edge border-t-accent rounded-full animate-spin" /></div>;
}

export function confirmDialog(msg: string): boolean { return window.confirm(msg); }
