import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, ProgressPhoto } from '../api';
import { Card, Button, Empty, Sheet, Field, TextInput, Spinner, confirmDialog } from '../components/ui';
import { processPhoto } from '../db/photos';
import { showToast } from '../components/Toast';
import { fmtDate, fmtWeight, todayISO, isoWeekStartLocal, cx } from '../util';

// Per-key load state: undefined = still loading, string = object URL,
// 'missing' = blob bytes gone/undecodable (show a real placeholder, never a
// broken <img>). Object URLs are revoked on unmount.
type PhotoState = Record<string, string | 'missing'>;

function usePhotoUrls(photos: ProgressPhoto[]) {
  const [urls, setUrls] = useState<PhotoState>({});
  const cache = useRef<PhotoState>({});
  const markMissing = (key: string) => {
    const u = cache.current[key];
    if (typeof u === 'string' && u !== 'missing') URL.revokeObjectURL(u);
    cache.current[key] = 'missing';
    setUrls({ ...cache.current });
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const p of photos) {
        if (cache.current[p.blob_key] !== undefined) continue;
        const blob = await api.photos.blob(p.blob_key);
        if (!alive) return;
        cache.current[p.blob_key] = blob ? URL.createObjectURL(blob) : 'missing';
        setUrls({ ...cache.current });
      }
    })();
    return () => { alive = false; };
  }, [photos]);
  useEffect(() => () => {
    Object.values(cache.current).forEach((u) => { if (typeof u === 'string' && u !== 'missing') URL.revokeObjectURL(u); });
  }, []);
  return { urls, markMissing };
}

// Returns a usable object URL, or undefined for loading/missing states.
function validPhotoUrl(urls: PhotoState, key: string): string | undefined {
  const u = urls[key];
  return typeof u === 'string' && u !== 'missing' ? u : undefined;
}

export function Photos() {
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [adding, setAdding] = useState<{ blob: Blob; width: number; height: number; preview: string } | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [compare, setCompare] = useState<ProgressPhoto[] | null>(null); // selection mode when array
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => api.photos.list().then(setPhotos);
  useEffect(() => { reload(); }, []);
  const { urls, markMissing } = usePhotoUrls(photos || []);

  const missingCount = useMemo(
    () => (photos || []).filter((p) => urls[p.blob_key] === 'missing').length,
    [photos, urls],
  );

  async function cleanupMissing() {
    if (!confirmDialog(`Remove ${missingCount} photo${missingCount === 1 ? '' : 's'} whose image data is no longer on this device? The entries can't be recovered without a backup.`)) return;
    const n = await api.photos.pruneMissing();
    reload();
    showToast(n ? `Removed ${n} unavailable photo${n === 1 ? '' : 's'}` : 'Nothing to remove', 'ok');
  }

  const byWeek = useMemo(() => {
    const groups: { week: string; items: ProgressPhoto[] }[] = [];
    for (const p of photos || []) {
      const week = isoWeekStartLocal(p.date);
      const g = groups.find((x) => x.week === week);
      g ? g.items.push(p) : groups.push({ week, items: [p] });
    }
    return groups;
  }, [photos]);

  const thisWeekDone = (photos || []).some((p) => isoWeekStartLocal(p.date) === isoWeekStartLocal(todayISO()));

  async function onFile(files: FileList | null) {
    if (!files || !files[0]) return;
    setBusy(true);
    try {
      const { blob, width, height } = await processPhoto(files[0]);
      setAdding({ blob, width, height, preview: URL.createObjectURL(blob) });
      setDate(todayISO());
      setNote('');
    } catch (e: any) {
      showToast(e.message || 'Could not read that image');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    if (!adding) return;
    setBusy(true);
    try {
      await api.photos.add({ blob: adding.blob, date, note, width: adding.width, height: adding.height });
      URL.revokeObjectURL(adding.preview);
      setAdding(null);
      reload();
      showToast('Progress shot saved', 'ok');
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!photos) return <Spinner />;

  return (
    <div className="px-4 pt-2 pb-6">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files)} />

      <div className="flex gap-2 mb-4">
        <Button className="flex-1" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Processing…' : thisWeekDone ? '＋ Add photo' : "＋ Add this week's shot"}
        </Button>
        {photos.length >= 2 && (
          <Button kind="ghost" onClick={() => setCompare(compare ? null : [])}>
            {compare ? 'Cancel' : 'Compare'}
          </Button>
        )}
      </div>

      {missingCount > 0 && !compare && (
        <div className="mb-3 rounded-xl border border-edge bg-surface2 p-3">
          <p className="text-[13px] text-mut">
            {missingCount} photo{missingCount === 1 ? "'s" : "s'"} image data is missing from this device — the entr{missingCount === 1 ? 'y' : 'ies'} can't be shown. This can happen when the browser reclaims storage. Restore a <code>.ironlog</code> backup to recover, or clear the empty entries.
          </p>
          <Button kind="ghost" className="mt-2" onClick={cleanupMissing}>Clear {missingCount} unavailable</Button>
        </div>
      )}

      {compare && <p className="text-[13px] text-accent mb-3">Pick two photos to compare — {2 - compare.length} to go.</p>}
      {!thisWeekDone && photos.length > 0 && !compare && (
        <p className="text-[13px] text-mut mb-3">No shot logged this week yet.</p>
      )}

      {photos.length === 0 ? (
        <Empty icon="📸" title="No progress shots yet"
          sub="Add one photo a week — same pose, same lighting. In 12 weeks the comparison will say more than the scale ever will." />
      ) : (
        <div className="space-y-5">
          {byWeek.map((g) => (
            <div key={g.week}>
              <h2 className="text-[13px] font-semibold text-mut uppercase tracking-wide mb-2">Week of {fmtDate(g.week)}</h2>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((p) => {
                  const selected = compare?.some((x) => x.id === p.id);
                  return (
                    <button key={p.id}
                      onClick={() => {
                        if (!compare) { setViewing(p); return; }
                        if (selected) setCompare(compare.filter((x) => x.id !== p.id));
                        else if (compare.length < 2) setCompare([...compare, p]);
                      }}
                      className={cx('relative aspect-[3/4] rounded-xl overflow-hidden bg-surface2 border', selected ? 'border-accent ring-2 ring-accent' : 'border-edge')}>
                      {typeof urls[p.blob_key] === 'string' && urls[p.blob_key] !== 'missing'
                        ? <img src={urls[p.blob_key]} alt="" className="w-full h-full object-cover" loading="lazy"
                            onError={() => markMissing(p.blob_key)} />
                        : urls[p.blob_key] === 'missing'
                          ? <div className="w-full h-full flex flex-col items-center justify-center text-dim text-[11px] gap-1 px-1 text-center"><span className="text-base">🚫</span>Image unavailable</div>
                          : <div className="w-full h-full flex items-center justify-center text-dim text-xs">…</div>}
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white/90 px-1.5 py-0.5">{fmtDate(p.date)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* add sheet */}
      <Sheet open={adding != null} onClose={() => { if (adding) URL.revokeObjectURL(adding.preview); setAdding(null); }} title="New progress shot">
        {adding && (
          <>
            <img src={adding.preview} alt="preview" className="w-full max-h-[40dvh] object-contain rounded-xl mb-4 bg-surface2" />
            <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Note (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Front relaxed, morning" /></Field>
            <Button className="w-full" disabled={busy} onClick={save}>Save</Button>
          </>
        )}
      </Sheet>

      {/* single view */}
      {viewing && (
        <PhotoViewer photo={viewing} url={validPhotoUrl(urls, viewing.blob_key)} onClose={() => setViewing(null)}
          onDeleted={() => { setViewing(null); reload(); }} />
      )}

      {/* compare view */}
      {compare && compare.length === 2 && (
        <CompareView a={compare[0]} b={compare[1]} urls={urls} onClose={() => setCompare(null)} />
      )}
    </div>
  );
}

function PhotoViewer({ photo, url, onClose, onDeleted }: { photo: ProgressPhoto; url?: string; onClose: () => void; onDeleted: () => void }) {
  const [weight, setWeight] = useState<number | null>(null);
  useEffect(() => { api.photos.nearestWeight(photo.date).then(setWeight); }, [photo.id]);
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fadein" onClick={onClose}>
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-[15px] font-semibold">{fmtDate(photo.date)}</div>
          <div className="text-[12px] text-mut">{photo.note || ''}{weight != null ? `${photo.note ? ' · ' : ''}${fmtWeight(weight)}` : ''}</div>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface2 text-mut">✕</button>
      </div>
      <div className="grow flex items-center justify-center px-2 min-h-0">
        {url
          ? <img src={url} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          : <span className="text-dim text-sm">Image data unavailable on this device</span>}
      </div>
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]" onClick={(e) => e.stopPropagation()}>
        <Button kind="danger" className="w-full" onClick={async () => {
          if (!confirmDialog('Delete this photo permanently?')) return;
          await api.photos.remove(photo.id);
          onDeleted();
        }}>Delete photo</Button>
      </div>
    </div>
  );
}

function CompareView({ a, b, urls, onClose }: { a: ProgressPhoto; b: ProgressPhoto; urls: PhotoState; onClose: () => void }) {
  const [wa, setWa] = useState<number | null>(null);
  const [wb, setWb] = useState<number | null>(null);
  useEffect(() => {
    api.photos.nearestWeight(a.date).then(setWa);
    api.photos.nearestWeight(b.date).then(setWb);
  }, [a.id, b.id]);
  const [first, second] = a.date <= b.date ? [a, b] : [b, a];
  const [wFirst, wSecond] = a.date <= b.date ? [wa, wb] : [wb, wa];
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fadein">
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2">
        <div className="text-[15px] font-semibold">Compare</div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface2 text-mut">✕</button>
      </div>
      <div className="grow grid grid-cols-2 gap-1 px-1 min-h-0">
        {[{ p: first, w: wFirst }, { p: second, w: wSecond }].map(({ p, w }) => (
          <div key={p.id} className="flex flex-col min-h-0">
            <div className="grow min-h-0 flex items-center justify-center">
              {validPhotoUrl(urls, p.blob_key)
                ? <img src={validPhotoUrl(urls, p.blob_key)} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
                : <span className="text-dim text-xs">Image unavailable</span>}
            </div>
            <div className="text-center py-2">
              <div className="text-[13px] font-semibold">{fmtDate(p.date)}</div>
              <div className="text-[11px] text-mut">{w != null ? fmtWeight(w) : ''}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="pb-[calc(env(safe-area-inset-bottom)+12px)]" />
    </div>
  );
}
