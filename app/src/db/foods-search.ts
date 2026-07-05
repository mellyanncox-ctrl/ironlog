// Food search matching — pure, testable, offline. No FTS dependency (sql.js
// ships without FTS5), so we prefilter cheaply in SQL then rank in JS. Handles
// multi-token queries (AND semantics), AU brand/synonym aliases, typo tolerance
// (small edit distance), and ranks verified/high-confidence/favourite foods
// first. Designed for libraries up to a few thousand rows.

export type SearchableFood = {
  id: number; name: string; brand: string; favourite: number; is_custom: number;
  verified?: number; confidence?: string;
};

// Phrase-level aliases: what people type → canonical words present in the data.
// Applied to the whole query string before tokenising so multi-word forms work.
const PHRASE_ALIASES: [RegExp, string][] = [
  [/\bmacca'?s\b/g, 'mcdonald'],
  [/\bmcdonalds\b/g, 'mcdonald'],
  [/\bhungry jacks?\b/g, 'hungry jack'],
  [/\bhj'?s\b/g, 'hungry jack'],
  [/\bgyg\b/g, 'guzman gomez'],
  [/\bkfc\b/g, 'kfc'],
  [/\bweet ?bix\b/g, 'weet bix'],
  [/\bweetbix\b/g, 'weet bix'],
  [/\bup and go\b/g, 'up go'],
];

// Token-level synonyms → a single canonical token (spelling variants, plurals).
const TOKEN_SYNONYMS: Record<string, string> = {
  yogurt: 'yoghurt', yoghourt: 'yoghurt',
  veggie: 'vegetable', veggies: 'vegetable', veg: 'vegetable', vegetables: 'vegetable',
  yoghurts: 'yoghurt', chips: 'chip', fries: 'chip',
  choc: 'chocolate', chocolatey: 'chocolate',
  protien: 'protein', prot: 'protein',
  brekkie: 'breakfast', brekky: 'breakfast',
  coke: 'cola',
};

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'in', 'to']);

function canon(token: string): string {
  return TOKEN_SYNONYMS[token] || token;
}

// Break a string into canonicalised search tokens.
export function tokenize(s: string): string[] {
  let t = String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ');
  for (const [re, to] of PHRASE_ALIASES) t = t.replace(re, to);
  const raw = t.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of raw) {
    const c = canon(w);
    if (STOPWORDS.has(c)) continue;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

// Levenshtein edit distance (iterative, O(n·m)).
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// How well one query token matches one haystack token. Higher is better;
// 0 means no acceptable match. Typo tolerance scales with word length.
function tokenMatch(q: string, h: string): number {
  if (q === h) return 10;
  if (h.startsWith(q)) return 8;          // prefix ("choc" → "chocolate")
  if (h.includes(q) && q.length >= 3) return 6; // substring
  if (q.includes(h) && h.length >= 3) return 5;
  const tol = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
  const d = editDistance(q, h);
  if (d <= tol) return 5 - d;             // typo match ("protien" → "protein")
  return 0;
}

const CONFIDENCE_RANK: Record<string, number> = { verified: 4, high: 3, medium: 2, low: 1 };

// Score a food against query tokens. Returns null when not every query token
// finds a match (AND semantics keep "coles chicken breast" precise). A higher
// score sorts first.
export function scoreFood(food: SearchableFood, queryTokens: string[]): number | null {
  if (queryTokens.length === 0) return 0;
  const nameTokens = tokenize(food.name);
  const brandTokens = tokenize(food.brand);
  const hay = [...brandTokens, ...nameTokens];
  if (hay.length === 0) return null;

  let score = 0;
  for (const q of queryTokens) {
    let best = 0, bestInBrand = false;
    for (const h of brandTokens) { const s = tokenMatch(q, h); if (s > best) { best = s; bestInBrand = true; } }
    for (const h of nameTokens) { const s = tokenMatch(q, h); if (s > best) { best = s; bestInBrand = false; } }
    if (best === 0) return null;          // this query word matched nothing → drop food
    score += best + (bestInBrand ? 2 : 0); // brand hits are worth a little more
  }
  // Rank bonuses.
  if (nameTokens[0] && queryTokens[0] && nameTokens[0].startsWith(queryTokens[0])) score += 4;
  score += (CONFIDENCE_RANK[food.confidence || 'medium'] || 2) * 2;
  score += food.favourite ? 6 : 0;
  score += food.is_custom ? 1 : 0;
  score -= Math.min(nameTokens.length, 6) * 0.1; // gently prefer concise names
  return score;
}

// Rank a candidate list against a query. Non-matching foods are dropped.
export function rankFoods<T extends SearchableFood>(foods: T[], query: string, limit: number): T[] {
  const qt = tokenize(query);
  const scored: { f: T; s: number }[] = [];
  for (const f of foods) {
    const s = scoreFood(f, qt);
    if (s != null) scored.push({ f, s });
  }
  scored.sort((a, b) => b.s - a.s || a.f.name.length - b.f.name.length);
  return scored.slice(0, limit).map((x) => x.f);
}

// A cheap SQL prefilter: OR of LIKEs over the query tokens so we only pull
// plausibly-relevant rows out of SQLite before JS ranking. Returns the WHERE
// fragment and its bound params. Falls back to all-active when no usable tokens.
export function prefilterSql(query: string): { where: string; params: string[] } {
  const toks = tokenize(query).filter((t) => t.length >= 2);
  if (toks.length === 0) return { where: 'archived = 0', params: [] };
  // Match each token as a prefix on name OR brand OR its first 3 chars (so typos
  // still surface a candidate set). Use first-3-chars prefix to stay broad.
  const clauses: string[] = [];
  const params: string[] = [];
  for (const t of toks) {
    const stem = t.slice(0, 3);
    clauses.push('(name LIKE ? OR brand LIKE ?)');
    params.push(`%${stem}%`, `%${stem}%`);
  }
  // OR across tokens keeps recall high; JS scoring enforces AND precision.
  return { where: `archived = 0 AND (${clauses.join(' OR ')})`, params };
}
