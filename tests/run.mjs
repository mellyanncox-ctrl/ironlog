// Test orchestrator: bundles each suite with esbuild, then runs it in Node.
// sql.js and jsdom stay external so their filesystem-based loaders work.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// bundles must live inside the project so external requires (sql.js, jsdom) resolve
const out = path.join(root, 'tests', '.build');
mkdirSync(out, { recursive: true });
const suites = ['data-layer.test.ts', 'migration.test.ts', 'ui-smoke.test.tsx'];
let failed = false;

for (const suite of suites) {
  const outfile = path.join(out, suite.replace(/\.tsx?$/, '.cjs'));
  console.log(`\n━━━ ${suite} ━━━`);
  try {
    execSync(
      `npx esbuild "${path.join(root, 'tests', suite)}" --bundle --platform=node --jsx=automatic ` +
      `--loader:.css=empty --loader:.wasm=file --external:sql.js --external:jsdom ` +
      `--external:zxing-wasm --external:zxing-wasm/* --outfile="${outfile}"`,
      { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] }
    );
    execSync(`node "${outfile}"`, { cwd: root, stdio: 'inherit' });
  } catch {
    failed = true;
  }
}
rmSync(out, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
