// Automatic cloud backup: pushes the full .ironlog backup blob to a private
// GitHub repo the user owns, so training data survives a lost or wiped phone.
// Mirrors the read-only Garmin sync in remoteSync.ts, but writes via the GitHub
// Contents API. The token (fine-grained PAT, Contents: read & write) lives only
// in the on-device settings table.
export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const PATH = 'ironlog-backup.ironlog';
const API_VERSION = '2022-11-28';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000; // avoid arg-count limits on fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function currentSha(repo: string, token: string, fetchFn: typeof fetch): Promise<string | null> {
  const res = await fetchFn(`https://api.github.com/repos/${repo}/contents/${PATH}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION },
  });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new Error(`GitHub rejected the token — it needs Contents read & write on ${repo}.`);
  if (!res.ok) throw new Error(`GitHub error ${res.status}.`);
  const j = await res.json();
  return (j && j.sha) || null;
}

export async function pushBackup(repo: string, token: string, bytes: Uint8Array, fetchFn: typeof fetch = fetch): Promise<void> {
  let sha: string | null;
  try { sha = await currentSha(repo, token, fetchFn); }
  catch (e) { throw e instanceof Error ? e : new Error('Could not reach GitHub.'); }
  let res: Response;
  try {
    res = await fetchFn(`https://api.github.com/repos/${repo}/contents/${PATH}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Ironlog backup ${new Date().toISOString()}`,
        content: toBase64(bytes),
        ...(sha ? { sha } : {}),
      }),
    });
  } catch {
    throw new Error('Could not reach GitHub — check your connection.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('GitHub rejected the token — it needs Contents read & write access.');
  if (res.status === 404) throw new Error('Repo not found. Check the name (owner/repo) and that the token can see it.');
  if (!res.ok) throw new Error(`GitHub error ${res.status}.`);
}

export async function pullBackup(repo: string, token: string, fetchFn: typeof fetch = fetch): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetchFn(`https://api.github.com/repos/${repo}/contents/${PATH}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': API_VERSION },
    });
  } catch {
    throw new Error('Could not reach GitHub — check your connection.');
  }
  if (res.status === 404) throw new Error('No cloud backup found yet — back up from your other device first.');
  if (res.status === 401 || res.status === 403) throw new Error(`GitHub rejected the token — it needs Contents read access to ${repo}.`);
  if (!res.ok) throw new Error(`GitHub error ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
}
