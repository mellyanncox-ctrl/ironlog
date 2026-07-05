// On-device SQLite via sql.js (WASM), persisted to IndexedDB.
// Exposes a node:sqlite-like surface so the data modules read naturally:
//   db.prepare(sql).all/get/run, db.exec(sql), withTx(fn)
import initSqlJs from 'sql.js';

export type Row = Record<string, any>;
export interface Stmt { all(...p: any[]): Row[]; get(...p: any[]): Row | undefined; run(...p: any[]): { changes: number; lastInsertRowid: number } }
export interface DB { prepare(sql: string): Stmt; exec(sql: string): void; export(): Uint8Array; close(): void }

// Storage backends -----------------------------------------------------------
export interface Storage {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
}

import { openIdb } from './photos';

const IDB_STORE = 'db';
const IDB_KEY = 'main';

export class IdbStorage implements Storage {
  private open(): Promise<IDBDatabase> { return openIdb(); }
  async load(): Promise<Uint8Array | null> {
    const idb = await this.open();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => { resolve(req.result ? new Uint8Array(req.result) : null); idb.close(); };
      req.onerror = () => { reject(req.error); idb.close(); };
    });
  }
  async save(bytes: Uint8Array): Promise<void> {
    const idb = await this.open();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => { resolve(); idb.close(); };
      tx.onerror = () => { reject(tx.error); idb.close(); };
    });
  }
}

export class MemoryStorage implements Storage {
  bytes: Uint8Array | null = null;
  async load() { return this.bytes; }
  async save(b: Uint8Array) { this.bytes = b; }
}

// DB wrapper ------------------------------------------------------------------
let _db: DB | null = null;
let _raw: any = null;
let _SQL: any = null;
let _storage: Storage | null = null;
let _dirty = false;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _saving: Promise<void> = Promise.resolve();
let _lastError: string | null = null;

function wrap(raw: any): DB {
  return {
    prepare(sql: string): Stmt {
      return {
        all(...p: any[]) {
          const st = raw.prepare(sql);
          try {
            if (p.length) st.bind(p.map(coerce));
            const rows: Row[] = [];
            while (st.step()) rows.push(st.getAsObject());
            return rows;
          } finally { st.free(); }
        },
        get(...p: any[]) {
          const st = raw.prepare(sql);
          try {
            if (p.length) st.bind(p.map(coerce));
            return st.step() ? st.getAsObject() : undefined;
          } finally { st.free(); }
        },
        run(...p: any[]) {
          raw.run(sql, p.map(coerce));
          markDirty();
          const changes = raw.getRowsModified();
          const r = raw.exec('SELECT last_insert_rowid() AS id');
          return { changes, lastInsertRowid: Number(r[0]?.values?.[0]?.[0] ?? 0) };
        },
      };
    },
    exec(sql: string) { raw.run(sql); markDirty(); },
    export() { return raw.export(); },
    close() { raw.close(); },
  };
}

function coerce(v: any) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && Number.isNaN(v)) return null;
  return v;
}

function markDirty() {
  _dirty = true;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { void flush(); }, 400);
}

export async function flush(): Promise<void> {
  if (!_dirty || !_raw || !_storage) return;
  _dirty = false;
  const bytes = _raw.export() as Uint8Array;
  _saving = _saving.then(() => _storage!.save(bytes)).catch((e) => { _lastError = String(e); _dirty = true; });
  await _saving;
}

export function persistenceError(): string | null { return _lastError; }

let _initPromise: Promise<DB> | null = null;

export function initDb(opts?: { storage?: Storage; wasmUrl?: string }): Promise<DB> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _storage = opts?.storage ?? new IdbStorage();
    _SQL = await initSqlJs(opts?.wasmUrl ? { locateFile: () => opts.wasmUrl! } : undefined);
    let existing: Uint8Array | null = null;
    try { existing = await _storage.load(); } catch { existing = null; }
    _raw = existing ? new _SQL.Database(existing) : new _SQL.Database();
    _db = wrap(_raw);
    // durability: flush when the page is hidden/closed; ask the browser not to evict us
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
      window.addEventListener('pagehide', () => { void flush(); });
      if (navigator.storage?.persist) void navigator.storage.persist();
    }
    return _db;
  })();
  return _initPromise;
}

export function getDb(): DB {
  if (!_db) throw new Error('DB not initialized');
  return _db;
}

export function withTx<T>(fn: () => T): T {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  }
}

// Backup: raw SQLite file bytes out / in.
export function exportBytes(): Uint8Array { return getDb().export(); }

export async function importBytes(bytes: Uint8Array): Promise<void> {
  if (!_SQL) throw new Error('DB not initialized');
  const candidate = new _SQL.Database(bytes);
  // sanity check: must be a STRONG database
  const check = candidate.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('workouts','exercises','sets')");
  if (!check.length || check[0].values.length < 3) {
    candidate.close();
    throw new Error('Not a STRONG backup file');
  }
  if (_raw) _raw.close();
  _raw = candidate;
  _db = wrap(_raw);
  markDirty();
  await flush();
}
