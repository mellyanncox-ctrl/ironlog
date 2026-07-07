// Progress photo blob storage. Metadata lives in SQLite (progress_photos table);
// the image bytes live in a separate IndexedDB store so the debounced SQLite
// flush never has to re-export megabytes of pixels.

export interface PhotoStore {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | null>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

const IDB_NAME = 'ironlog';
const DB_STORE = 'db';
const PHOTO_STORE = 'photos';

// v2 adds the photos object store; existing v1 databases upgrade in place.
export function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Stored record shape. We persist raw bytes (ArrayBuffer) + mime type rather
// than a Blob object. WebKit/iOS stores IndexedDB Blobs as separate backing
// files that the browser can reclaim under storage pressure — the record then
// survives but returns a zero-length/detached Blob, so images render broken
// while metadata looks fine. ArrayBuffers are stored inline and don't detach.
interface PhotoRecord { b: ArrayBuffer; t: string }

function isRecord(v: any): v is PhotoRecord {
  return v && typeof v === 'object' && v.b instanceof ArrayBuffer;
}

export class IdbPhotoStore implements PhotoStore {
  private tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openIdb().then((idb) => new Promise<T>((resolve, reject) => {
      const tx = idb.transaction(PHOTO_STORE, mode);
      const req = fn(tx.objectStore(PHOTO_STORE));
      tx.oncomplete = () => { resolve(req.result); idb.close(); };
      tx.onerror = () => { reject(tx.error); idb.close(); };
    }));
  }
  async put(key: string, blob: Blob) {
    const buf = await blob.arrayBuffer();
    const rec: PhotoRecord = { b: buf, t: blob.type || 'image/jpeg' };
    await this.tx('readwrite', (s) => s.put(rec, key));
  }
  async get(key: string): Promise<Blob | null> {
    const r = await this.tx<any>('readonly', (s) => s.get(key));
    if (isRecord(r)) {
      return r.b.byteLength > 0 ? new Blob([r.b], { type: r.t || 'image/jpeg' }) : null;
    }
    // Legacy entries were stored as Blob objects (pre-ArrayBuffer). If the
    // backing bytes survived they're still usable; a detached/empty one counts
    // as missing so the UI can show a real "unavailable" state, not a broken img.
    if (r instanceof Blob) return r.size > 0 ? r : null;
    return null;
  }
  async remove(key: string) { await this.tx('readwrite', (s) => s.delete(key)); }
  async clear() { await this.tx('readwrite', (s) => s.clear()); }
  async keys() { return (await this.tx<any>('readonly', (s) => s.getAllKeys())) as string[]; }
}

export class MemoryPhotoStore implements PhotoStore {
  map = new Map<string, Blob>();
  async put(key: string, blob: Blob) { this.map.set(key, blob); }
  async get(key: string) { return this.map.get(key) || null; }
  async remove(key: string) { this.map.delete(key); }
  async clear() { this.map.clear(); }
  async keys() { return [...this.map.keys()]; }
}

// Resize + recompress in the browser so a 12MP camera shot becomes ~200–400 KB.
export async function processPhoto(file: Blob, maxDim = 1600, quality = 0.85): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not process image');
  return { blob, width: w, height: h };
}

export function newPhotoKey(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `p${Date.now()}-${Math.random().toString(36).slice(2)}`);
}
