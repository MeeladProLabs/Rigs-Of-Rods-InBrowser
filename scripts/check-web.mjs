// CI web check: syntax-checks every inline <script> in the HTML pages and
// verifies that referenced local assets exist. Stdlib only.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['web/index.html', 'web/repo.html', 'web/controls.html'];

let failed = false;

function fail(msg) {
  failed = true;
  console.error('FAIL: ' + msg);
}

for (const page of pages) {
  const path = join(root, page);
  if (!existsSync(path)) {
    fail(`${page} does not exist`);
    continue;
  }
  const html = readFileSync(path, 'utf8');

  // 1. Syntax-check inline scripts (no src attribute).
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const code = m[2] || '';
    if (/\bsrc\s*=/.test(attrs)) continue; // external script, checked via assets
    i++;
    try {
      new Function(code); // eslint-disable-line no-new-func
    } catch (e) {
      fail(`${page} inline script #${i}: ${e.message}`);
    }
  }
  if (i === 0) console.log(`note: ${page} has no inline scripts (nothing to syntax-check)`);

  // 2. Verify local asset references (scripts, stylesheets, local links).
  const refRe = /(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;
  while ((m = refRe.exec(html)) !== null) {
    const ref = m[1];
    if (!ref || /^(https?:|data:|mailto:|\/\/)/.test(ref)) continue;
    if (ref.endsWith('.html') || ref.endsWith('.htm')) {
      if (!existsSync(join(root, 'web', ref))) fail(`${page} links to missing page: ${ref}`);
      continue;
    }
    if (ref.startsWith('js/')) {
      if (!existsSync(join(root, 'web', ref))) fail(`${page} references missing asset: ${ref}`);
    }
  }
}

// 3. The game binaries are intentionally not committed; warn, don't fail.
for (const bin of ['RoR.js', 'RoR.wasm', 'RoR.data']) {
  const p = join(root, 'web', bin);
  if (!existsSync(p)) {
    console.log(`note: web/${bin} not present (build artifact — see BUILD.md)`);
  }
}

if (failed) {
  console.error('\nweb check failed.');
  process.exit(1);
}
console.log('web check passed.');
