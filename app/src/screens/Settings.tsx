import React, { useRef, useState } from 'react';
import { api, Settings } from '../api';
import { Card, Seg, Field, TextInput, Button, confirmDialog } from '../components/ui';
import { setUnits, todayISO } from '../util';
import { showToast } from '../components/Toast';
import { parseStrongCsv } from '../lib/strongParse';

export function SettingsScreen({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [rest, setRest] = useState(settings.default_rest);
  const [goal, setGoal] = useState(settings.weekly_goal);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const strongRef = useRef<HTMLInputElement>(null);
  const [strongMsg, setStrongMsg] = useState<string | null>(null);

  async function importStrong(files: FileList | null) {
    if (!files || !files[0]) return;
    setBusy(true); setStrongMsg(null);
    try {
      const { workouts, warnings } = parseStrongCsv(await files[0].text());
      if (workouts.length === 0) { setStrongMsg(warnings[0] || 'No workouts found.'); return; }
      const r = await api.importStrong(workouts);
      setStrongMsg(
        `Imported ${r.imported} workouts${r.skipped ? ` (${r.skipped} already imported)` : ''}.` +
        (r.exercises_created.length ? ` Added to library: ${r.exercises_created.join(', ')}.` : '')
      );
      if (r.imported > 0) showToast(`${r.imported} workouts imported`, 'ok');
    } catch (e: any) {
      setStrongMsg('Import failed: ' + e.message);
    } finally {
      setBusy(false);
      if (strongRef.current) strongRef.current.value = '';
    }
  }

  async function save(patch: Partial<Settings>) {
    try {
      const s = await api.settings.put(patch);
      setUnits(s.units);
      onChange(s);
    } catch (e: any) {
      showToast(e.message);
    }
  }

  async function exportBackup() {
    setBusy(true);
    try {
      const blob = await api.backup.export();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ironlog-backup-${todayISO()}.ironlog`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      showToast('Backup exported', 'ok');
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(files: FileList | null) {
    if (!files || !files[0]) return;
    if (!confirmDialog('Importing a backup REPLACES all current data on this device. Continue?')) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setBusy(true);
    try {
      await api.backup.import(files[0]);
      showToast('Backup restored', 'ok');
      setTimeout(() => location.reload(), 600);
    } catch (e: any) {
      showToast(e.message || 'Import failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="px-4 pt-2 pb-6 space-y-4">
      <Card className="p-4">
        <Field label="Units">
          <Seg value={settings.units} onChange={(u) => save({ units: u })}
            options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }]} />
        </Field>
        <Field label="Default rest timer (seconds)">
          <TextInput inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)}
            onBlur={() => Number(rest) > 0 && save({ default_rest: rest })} />
        </Field>
        <Field label="Weekly workout goal">
          <TextInput inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)}
            onBlur={() => Number(goal) > 0 && save({ weekly_goal: goal })} />
        </Field>
      </Card>

      <Card className="p-4">
        <div className="text-[14px] font-semibold mb-1">Backup</div>
        <p className="text-[12.5px] text-mut leading-relaxed mb-3">
          All data lives on this device. Export a backup file regularly — if the app is deleted
          or the browser clears its storage, the backup is the only way to get your history back.
          Backups include your progress photos and restore on any device running Ironlog.
        </p>
        <div className="flex gap-2">
          <Button small kind="ghost" disabled={busy} onClick={exportBackup}>Export backup</Button>
          <Button small kind="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>Import backup</Button>
        </div>
        <input ref={fileRef} type="file" accept=".ironlog,.db,application/octet-stream" className="hidden" onChange={(e) => importBackup(e.target.files)} />
      </Card>

      <Card className="p-4">
        <div className="text-[14px] font-semibold mb-1">Import from Strong</div>
        <p className="text-[12.5px] text-mut leading-relaxed mb-3">
          Bring your workout history from the Strong app (Settings → Export Data → CSV).
          History, PRs, and suggested weights all carry over. Weights import as-is, so set
          your units above to match Strong first. Safe to re-import — duplicates are skipped.
        </p>
        <Button small kind="ghost" disabled={busy} onClick={() => strongRef.current?.click()}>Import Strong CSV</Button>
        <input ref={strongRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importStrong(e.target.files)} />
        {strongMsg && <div className="text-[12.5px] mt-2 text-mut">{strongMsg}</div>}
      </Card>

      <Card className="p-4">
        <div className="text-[14px] font-semibold mb-1">Sample data</div>
        <p className="text-[12.5px] text-mut mb-3">Load a Push/Pull/Legs routine with three weeks of logged workouts to explore every feature.</p>
        <Button small kind="ghost" onClick={async () => { await api.demoSeed(); location.hash = '#/'; location.reload(); }}>Load sample data</Button>
      </Card>

      <Card className="p-4">
        <div className="text-[14px] font-semibold mb-1">Privacy</div>
        <p className="text-[12.5px] text-mut leading-relaxed">
          No account, no cloud, no telemetry. Your training data never leaves this device
          unless you export it yourself.
        </p>
      </Card>
    </div>
  );
}
