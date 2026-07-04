// Remote auto-sync: fetches the sync.json snapshot that the scheduled job in
// /sync publishes to a private GitHub repo. Pure fetch + validation — importing
// happens through the normal Garmin pipeline in api.ts (same dedupe as files).
export type SyncSnapshot = {
  version: number;
  generated_at: string;
  activities: any[];
  daily: any[];
};

export type SyncOutcome =
  | { state: 'unconfigured' }
  | { state: 'nochange' }
  | { state: 'ok'; activities: number; daily: number }
  | { state: 'error'; message: string };

export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export async function fetchSyncSnapshot(
  repo: string,
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<SyncSnapshot> {
  let res: Response;
  try {
    res = await fetchFn(`https://api.github.com/repos/${repo}/contents/data/sync.json`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch {
    throw new Error('Could not reach GitHub — check your connection.');
  }
  if (res.status === 401 || res.status === 403) throw new Error(`GitHub rejected the token — it needs read access to ${repo}.`);
  if (res.status === 404) throw new Error('No sync data found. Check the repo name (owner/repo) and that the sync job has run at least once.');
  if (!res.ok) throw new Error(`GitHub error ${res.status}.`);
  let snap: any;
  try { snap = await res.json(); } catch { throw new Error('sync.json is not valid JSON.'); }
  if (!snap || snap.version !== 1 || !Array.isArray(snap.activities) || !Array.isArray(snap.daily)) {
    throw new Error('sync.json has an unexpected format — regenerate it with the sync script.');
  }
  return snap as SyncSnapshot;
}
