#!/usr/bin/env node
/**
 * Verify the production static-export bundle contains zero E2E-mode code.
 *
 * Run after a production build (NEXT_PUBLIC_E2E_MODE unset) to confirm webpack
 * tree-shaking dropped every E2E branch. Fails non-zero if any E2E export name
 * (auto-discovered from src/services/e2e/) or sensitive env-var name appears
 * in the build output.
 *
 * Usage:
 *   yarn build && yarn e2e:check
 */

const fs = require('fs');
const path = require('path');

const POA_APP = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(POA_APP, 'out');
const E2E_SRC = path.join(POA_APP, 'src', 'services', 'e2e');

// Discover function/class exports from src/services/e2e/. These names in
// the production bundle indicate code-path leaks (a function survived
// tree-shaking even though E2E branches should have died).
//
// Bare const exports (e.g. `export const E2E_PASSKEY_SEED = ...`) are
// intentionally NOT scanned: webpack often preserves their binding name
// even when the value is `""` in production, which is harmless.
function discoverE2EExports() {
  const names = new Set();
  for (const file of fs.readdirSync(E2E_SRC)) {
    if (!/\.(js|jsx|ts|tsx)$/.test(file)) continue;
    const src = fs.readFileSync(path.join(E2E_SRC, file), 'utf8');
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|default function)\s+([A-Za-z_$][\w$]*)/g)) {
      names.add(m[1]);
    }
  }
  return [...names];
}

// Sensitive env var names that must not leak even if no symbol references them.
const FORBIDDEN_ENVS = [
  'POA_E2E_BURNER_PK',
  'POA_E2E_PASSKEY_SEED',
  'NEXT_PUBLIC_E2E_BURNER_PK',
  'NEXT_PUBLIC_E2E_PASSKEY_SEED',
  // The flag itself: DefinePlugin replaces the literal, so its NAME surviving means a runtime
  // read (e.g. `process.env[key]` or a string) that will not fold.
  'NEXT_PUBLIC_E2E_MODE',
];

// E2E-only COPY. Export names are renamed by terser, so a branch that survived behind an
// imported flag (the `E2E_ENABLED` import that commit 08b0359b removed) is invisible to the
// symbol scan above — but its strings are not. Anything here in the bundle means the branch
// shipped, merely switched off.
const FORBIDDEN_COPY = [
  'Voting must run for at least 10 minutes',
  '"10 min"',
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && /\.(js|html|json)$/.test(entry.name)) files.push(full);
  }
  return files;
}

if (!fs.existsSync(OUT_DIR)) {
  console.error(`[e2e-check] No build output at ${OUT_DIR}. Run 'yarn build' first.`);
  process.exit(1);
}

const FORBIDDEN = [...discoverE2EExports(), ...FORBIDDEN_ENVS, ...FORBIDDEN_COPY];
const files = walk(OUT_DIR);
const hits = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const symbol of FORBIDDEN) {
    if (content.includes(symbol)) {
      hits.push({ file: path.relative(OUT_DIR, file), symbol });
    }
  }
}

if (hits.length > 0) {
  console.error(`[e2e-check] FAIL: found ${hits.length} forbidden symbol(s) in production bundle:`);
  for (const { file, symbol } of hits) console.error(`  ${file}: ${symbol}`);
  console.error('');
  console.error('E2E code leaked into the production build. Verify every E2E branch reads');
  console.error("process.env.NEXT_PUBLIC_E2E_MODE === 'true' directly at the use site so");
  console.error('Next.js inlines the literal at build time.');
  process.exit(1);
}

console.log(`[e2e-check] OK: scanned ${files.length} bundle file(s); checked ${FORBIDDEN.length} symbols; no leaks.`);
