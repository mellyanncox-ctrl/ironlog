import React, { useEffect, useRef, useState } from 'react';
import { api, Settings } from '../api';
import { Card, Seg, Field, TextInput, Button, confirmDialog } from '../components/ui';
import { setUnits, todayISO } from '../util';
import { showToast } from '../components/Toast';
import { parseStrongCsv } from '../lib/strongParse';
import { fmtDate, fmtTime } from '../util';

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

      <CloudBackupCard />


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
          No account, no telemetry. Your training data never leaves this device unless you
          export it or turn on cloud backup — and cloud backup only ever goes to a private
          repo you own.
        </p>
      </Card>
    </div>
  );
}

function CloudBackupCard() {
  const [cfg, setCfg] = useState<{ repo: string; has_token: boolean; last_backup_at: string | null } | null>(null);
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);

  const load = () => api.backup.cloud.config().then((c) => { setCfg(c); setRepo(c.repo); });
  useEffect(() => { load(); }, []);

  async function saveAndBackup() {
    setBusy(true); setMsg(null);
    try {
      await api.backup.cloud.configure(repo, token);
      setToken('');
      const r = await api.backup.cloud.now(true);
      if (r.state === 'ok') { setMsg({ kind: 'ok', text: `Backed up ${(r.bytes! / 1024).toFixed(0)} KB.` }); setOpen(false); }
      else if (r.state === 'unconfigured') setMsg({ kind: 'warn', text: 'Enter the repo and token first.' });
      else if (r.state === 'error') setMsg({ kind: 'warn', text: r.message! });
      load();
    } catch (e: any) {
      setMsg({ kind: 'warn', text: e.message });
    } finally { setBusy(false); }
  }

  async function backupNow() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.backup.cloud.now(true);
      if (r.state === 'ok') setMsg({ kind: 'ok', text: `Backed up ${(r.bytes! / 1024).toFixed(0)} KB just now.` });
      else if (r.state === 'error') setMsg({ kind: 'warn', text: r.message! });
      load();
    } finally { setBusy(false); }
  }

  async function restore() {
    if (!confirmDialog('Restore from cloud REPLACES all data on this device with the latest cloud backup. Continue?')) return;
    setBusy(true); setMsg(null);
    try {
      await api.backup.cloud.restore();
      showToast('Restored from cloud', 'ok');
      setTimeout(() => location.reload(), 600);
    } catch (e: any) {
      setMsg({ kind: 'warn', text: e.message || 'Restore failed' });
    } finally { setBusy(false); }
  }

  if (!cfg) return null;
  const configured = cfg.repo && cfg.has_token;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold">Cloud backup {configured && <span className="text-good text-[12px] font-medium">· on</span>}</div>
          <div className="text-[12.5px] text-mut mt-0.5">
            {configured
              ? `Auto-backs up to ${cfg.repo} on launch and after each workout.${cfg.last_backup_at ? ` Last ${fmtDate(cfg.last_backup_at)} ${fmtTime(cfg.last_backup_at)}.` : ''}`
              : 'Automatically save your data to a private GitHub repo so a lost phone never means lost history.'}
          </div>
        </div>
        <Button small kind="ghost" onClick={() => setOpen(!open)}>{open ? 'Close' : configured ? 'Edit' : 'Set up'}</Button>
      </div>

      {configured && !open && (
        <div className="flex gap-2 mt-3">
          <Button small disabled={busy} onClick={backupNow}>{busy ? 'Backing up…' : 'Back up now'}</Button>
          <Button small kind="ghost" disabled={busy} onClick={restore}>Restore from cloud</Button>
        </div>
      )}

      {open && (
        <div className="mt-3">
          <p className="text-[12.5px] text-mut leading-relaxed mb-3">
            Create a <span className="font-medium">private</span> GitHub repo (e.g. <span className="font-medium">you/ironlog-backup</span>) and a
            fine-grained token with <span className="font-medium">Contents: read &amp; write</span> on just that repo. Both stay on this device.
            To recover on a new phone, install Ironlog, enter the same repo and token here, and tap Restore.
          </p>
          <Field label="Backup repo (owner/repo)">
            <TextInput value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="you/ironlog-backup" autoCapitalize="none" autoCorrect="off" />
          </Field>
          <Field label={cfg.has_token ? 'GitHub token (saved — leave blank to keep)' : 'GitHub token (Contents: read & write)'}>
            <TextInput type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.has_token ? '••••••••' : 'github_pat_…'} autoCapitalize="none" autoCorrect="off" />
          </Field>
          <div className="flex gap-2">
            <Button small disabled={busy || !repo.trim()} onClick={saveAndBackup}>{busy ? 'Saving…' : 'Save & back up'}</Button>
            {configured && (
              <Button small kind="danger" onClick={async () => {
                if (!confirmDialog('Turn off cloud backup and forget the token? Your cloud backup file stays in the repo.')) return;
                await api.backup.cloud.configure('', '');
                setRepo(''); setToken(''); setMsg(null); setOpen(false); load();
              }}>Turn off</Button>
            )}
          </div>
        </div>
      )}
      {msg && <div className={`text-[13px] mt-3 ${msg.kind === 'ok' ? 'text-good' : 'text-accent'}`}>{msg.text}</div>}
    </Card>
  );
}
