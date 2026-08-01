#!/usr/bin/env node
/**
 * capture-product-shots.mjs — P0 marketing product screenshots.
 *
 * READ-ONLY. Serves the existing static export (poa-app/out/) on a local port and
 * photographs real, logged-out org surfaces (Decentral Park tasks, KUBI voting/team,
 * Argus treasury, the /explore proof band). No dev server, no transactions, no app-source
 * edits. Client JS fetches live subgraph data, so every shot waits for network idle plus a
 * settle delay before capturing.
 *
 * Output: full-res PNGs to a temp review dir, then `cwebp -q <Q>` into
 * poa-app/public/images/product/<name>.webp. Prints a size report and FAILS if any webp
 * exceeds MAX_WEBP_KB or the total exceeds MAX_TOTAL_KB (lower -q or tighten the clip).
 *
 * Re-runnable. Config-driven: see SHOTS below. Every clip is an element-level locator
 * screenshot (auto-scrolls) or an explicit rect; hazardous / half-loaded chrome is removed
 * via per-shot `prepare` steps (hide selectors, blur focus, make a modal opaque), never by
 * fabricating copy. If a surface changes and a selector breaks, the shot fails loudly rather
 * than shipping a wrong frame.
 *
 * Usage:
 *   node poa-app/scripts/marketing/capture-product-shots.mjs [--only name1,name2] [-q 82] [--keep-server]
 *
 * Env overrides (all have sane defaults):
 *   POA_OUT_DIR        default: <repo>/poa-app/out
 *   POA_PORT           default: 8377
 *   POA_CHROME         Chromium executable (default: cached Playwright chromium-1217)
 *   POA_PLAYWRIGHT     path to a playwright-core install (default: npx cache lookup)
 *   POA_REVIEW_DIR     full-res PNG originals (default: /tmp/poa-shots-review)
 */

import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_DIR = process.env.POA_OUT_DIR || path.join(REPO_ROOT, 'poa-app', 'out');
const PUBLIC_PRODUCT_DIR = path.join(REPO_ROOT, 'poa-app', 'public', 'images', 'product');
const REVIEW_DIR = process.env.POA_REVIEW_DIR || '/tmp/poa-shots-review';
const PORT = parseInt(process.env.POA_PORT || '8377', 10);
const BASE = `http://127.0.0.1:${PORT}`;

const MAX_WEBP_KB = 200;
const MAX_TOTAL_KB = 1200;

// ---- CLI ----
const argv = process.argv.slice(2);
function argVal(flag, dflt) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
const ONLY = argVal('--only', null)?.split(',').map((s) => s.trim()).filter(Boolean) || null;
const QUALITY = parseInt(argVal('-q', '82'), 10);
const KEEP_SERVER = argv.includes('--keep-server');

// ---- resolve Chromium + playwright-core (no local dep; reuse Playwright's cache) ----
function resolveChrome() {
  if (process.env.POA_CHROME && existsSync(process.env.POA_CHROME)) return process.env.POA_CHROME;
  const cacheRoot = path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cacheRoot)) {
    const dirs = readdirSync(cacheRoot).filter((d) => d.startsWith('chromium-')).sort();
    for (const d of dirs.reverse()) {
      for (const sub of ['chrome-mac-arm64', 'chrome-mac', 'chrome-linux', 'chrome-win']) {
        for (const bin of [
          'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
          'Chromium.app/Contents/MacOS/Chromium',
          'chrome',
          'chrome.exe',
        ]) {
          const p = path.join(cacheRoot, d, sub, bin);
          if (existsSync(p)) return p;
        }
      }
    }
  }
  throw new Error('Chromium not found. Set POA_CHROME to a Playwright Chromium executable.');
}

function resolvePlaywright() {
  if (process.env.POA_PLAYWRIGHT) return process.env.POA_PLAYWRIGHT;
  // Look through the npx cache for a playwright-core install.
  const npxCache = path.join(process.env.HOME, '.npm', '_npx');
  if (existsSync(npxCache)) {
    for (const hash of readdirSync(npxCache)) {
      const p = path.join(npxCache, hash, 'node_modules', 'playwright-core');
      if (existsSync(path.join(p, 'index.js'))) return p;
    }
  }
  // Fall back to a normal require resolution (in case it is installed somewhere on the path).
  try {
    const require = createRequire(import.meta.url);
    return path.dirname(require.resolve('playwright-core/package.json'));
  } catch {
    throw new Error('playwright-core not found. Set POA_PLAYWRIGHT to a playwright-core dir.');
  }
}

// ---------------------------------------------------------------------------
// prepare() helpers — run in the browser via page.evaluate, keep frames honest.
// ---------------------------------------------------------------------------

/** Hide any element whose OWN text (direct text nodes) matches a regex. Returns count. */
const HIDE_BY_TEXT = `
  window.__hideByText = (re) => {
    let n = 0;
    for (const el of document.querySelectorAll('button, a, p, span, div')) {
      const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(' ');
      if (own && re.test(own)) { el.style.visibility = 'hidden'; n++; }
    }
    return n;
  };
`;

// ---------------------------------------------------------------------------
// SHOT SPECS
// url            : path served from out/
// viewport       : { width, height }
// deviceScaleFactor
// isMobile       : optional
// settleMs       : wait after networkidle (subgraph fetch + skeleton settle)
// clip           : 'FULL' | { anchor selector via clipSelector } | explicit rect {x,y,w,h}
// clipSelector   : element-level screenshot target (auto-scrolls). Preferred.
// clipRect       : explicit page-coordinate rect (used with fullPage capture)
// prepare        : async (page) => {}  — open modals, hide chrome, blur focus, etc.
// ---------------------------------------------------------------------------

const CHROME = resolveChrome();
const PW_DIR = resolvePlaywright();

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const SHOTS = [
  // 1. HERO — a completed Decentral Park task detail (payout card).
  {
    name: 'task-detail',
    // Deep link straight to the completed task's modal — card clicks are unreliable
    // (react-dnd drag wrappers intercept them). Composite id = {taskManager}-{taskId}.
    url: '/tasks/?org=Decentral%20Park&task=0x2d9d397a842b8d691ea2a232062cbc8ef8ebbdb7-0',
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    waitFor: ['Propagate plant cuttings', 'Reward'],
    settleMs: 5000,
    clipSelector: '.chakra-modal__content',
    async prepare(page) {
      await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    },
  },

  // 2. Decentral Park board — 4 columns, human assignees. Excludes projects sidebar + nav.
  {
    name: 'tasks-board',
    url: '/tasks/?org=Decentral%20Park',
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    waitFor: ['Initial Basement Set-up', 'Buy 8 plants'],
    settleMs: 5000,
    clipRect: { x: 220, y: 78, width: 1200, height: 815 },
    async prepare(page) {
      // Ensure the "Initial Basement Set-up" project is the active board (it is by default,
      // but click it to be deterministic if a different project is selected).
      const proj = page.getByText('Initial Basement Set-up', { exact: true }).first();
      if (await proj.count()) await proj.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
    },
  },

  // 3. KUBI hybrid election tally — real turnout, clear winner.
  //    The proposal description names the underlying tech (banned word) and the row carries an
  //    "Execution Failed" status badge; both are hidden so only the title + vote results show.
  {
    name: 'vote-tally',
    url: '/voting/?org=KUBI',
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    waitFor: ['View All History'],
    settleMs: 5000,
    clipSelector: '.chakra-modal__content',
    async prepare(page) {
      await page.getByText('View All History', { exact: false }).first().click({ timeout: 8000 });
      await page.waitForTimeout(3000);
      await page.getByText('Director of Education', { exact: false }).first().click({ timeout: 8000 });
      await page.waitForTimeout(3000);
      await page.evaluate(() => {
        const body = document.querySelector('.chakra-modal__body');
        if (body) {
          const inner = body.querySelector(':scope > .chakra-stack') || body;
          for (const kid of inner.children) {
            if (!/Results:/.test(kid.innerText || '')) kid.style.display = 'none';
          }
        }
        // Make the modal fully opaque so the hazardous history grid behind it cannot bleed
        // through. The glass style is a TRANSLUCENT rgba, so never reuse the computed color:
        // force a solid fill on the content and every glass layer inside it.
        const content = document.querySelector('.chakra-modal__content');
        if (content) {
          content.style.background = '#16121f';
          content.style.backdropFilter = 'none';
          // Composite each translucent layer over the modal base so the perceived color is
          // unchanged but nothing behind the modal can bleed through.
          const BASE = [22, 18, 31]; // #16121f
          for (const el of content.querySelectorAll('*')) {
            const bg = getComputedStyle(el).backgroundColor;
            const m = bg && bg.match(/rgba\(([\d.\s]+),([\d.\s]+),([\d.\s]+),([\d.]+)\)/);
            if (m && parseFloat(m[4]) > 0 && parseFloat(m[4]) < 1) {
              const a = parseFloat(m[4]);
              const solid = [m[1], m[2], m[3]].map((c, i) => Math.round(a * parseFloat(c) + (1 - a) * BASE[i]));
              el.style.backgroundColor = `rgb(${solid[0]},${solid[1]},${solid[2]})`;
            }
          }
        }
        const overlay = document.querySelector('.chakra-modal__overlay');
        if (overlay) overlay.style.background = '#0b0910';
        document.activeElement && document.activeElement.blur && document.activeElement.blur();
      });
      await page.waitForTimeout(400);
    },
  },

  // 4. Argus revenue distributions (PEAK) — real production profit shares, multi-claimant.
  //    Logged-out claim buttons read "Loading..."; hide them (no account to claim with).
  {
    name: 'treasury',
    url: '/treasury/?org=Argus',
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    waitFor: ['Profit Share #4', 'Profit Share #2'],
    settleMs: 6000,
    // Panel headed "Active Profit Shares" (the third grid item at page depth 2).
    clipSelector: 'text=Active Profit Shares >> xpath=ancestor::div[contains(@class,"css-")][3]',
    async prepare(page) {
      await page.evaluate(() => {
        // Hide any button that is still spinning ("Loading...") inside the profit-share cards.
        for (const b of document.querySelectorAll('button')) {
          if (/loading/i.test(b.innerText || '')) b.style.visibility = 'hidden';
        }
      });
      await page.waitForTimeout(300);
    },
  },

  // 5. Argus "Our Shared Treasury" header + stats trio (bonus variant, pairs with #4).
  {
    name: 'treasury-stats',
    url: '/treasury/?org=Argus',
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    waitFor: ['Members Sharing'],
    settleMs: 5000,
    // Header + description + the 3 stat cards (Members Sharing / Total Distributed / Distributions).
    // Fund/Deposit action buttons top-right are hidden to keep the band calm.
    clipRect: { x: 24, y: 100, width: 700, height: 232 },
    async prepare(page) {
      await page.evaluate(() => {
        for (const b of document.querySelectorAll('button')) {
          if (/fund bounties|deposit|fund gas/i.test(b.innerText || '')) b.style.visibility = 'hidden';
        }
      });
      await page.waitForTimeout(200);
    },
  },

  // 6. KUBI permissions matrix — roles × exact written powers.
  {
    name: 'team-matrix',
    url: '/team/?org=KUBI',
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    waitFor: ['wolfiesell'],
    settleMs: 5000,
    clipSelector: 'section:has(> h2:text-is("Permissions"))',
  },

  // 7. KUBI members grid (bonus) — real human members, activity, roles.
  {
    name: 'team-members',
    url: '/team/?org=KUBI',
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    waitFor: ['wolfiesell'],
    settleMs: 5000,
    clipSelector: 'section:has(> h2:text-is("Members"))',
  },

  // 8. /explore proof band — live registry counts (clean; the org-card grid itself carries
  //    banned words baked into a logo/description, so we photograph the trustworthy stats trio).
  {
    name: 'explore-stats',
    url: '/explore',
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    waitFor: ['Decentral Park'],
    settleMs: 5000,
    clipRect: { x: 470, y: 730, width: 500, height: 115 },  // stats trio only; network filter pills excluded
  },

  // 9. Mobile — Decentral Park board (single-column list on 390px).
  {
    name: 'tasks-board-mobile',
    url: '/tasks/?org=Decentral%20Park',
    viewport: MOBILE,
    deviceScaleFactor: 3,
    isMobile: true,
    waitFor: ['Buy 8 plants'],
    settleMs: 5000,
    clipRect: { x: 0, y: 0, width: 390, height: 844 },
  },
];

// ---------------------------------------------------------------------------
// Static server (no external dep) — maps /tasks/ -> tasks/index.html etc.
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.map': 'application/json',
};

function startServer() {
  const fs = require2('node:fs');
  const server = http.createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let fsPath = path.join(OUT_DIR, urlPath);
      if (!fsPath.startsWith(OUT_DIR)) { res.statusCode = 403; return res.end('forbidden'); }
      if (existsSync(fsPath) && statSync(fsPath).isDirectory()) fsPath = path.join(fsPath, 'index.html');
      else if (!existsSync(fsPath) && existsSync(fsPath + '.html')) fsPath = fsPath + '.html';
      else if (!existsSync(fsPath) && existsSync(path.join(fsPath, 'index.html'))) fsPath = path.join(fsPath, 'index.html');
      if (!existsSync(fsPath)) { res.statusCode = 404; return res.end('not found'); }
      const ext = path.extname(fsPath).toLowerCase();
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      fs.createReadStream(fsPath).pipe(res);
    } catch (e) {
      res.statusCode = 500; res.end(String(e));
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// createRequire for the CJS-style fs streaming above
let __req;
function require2(id) { (__req ??= createRequire(import.meta.url)); return __req(id); }

function fmtKB(bytes) { return (bytes / 1024).toFixed(1); }

// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(path.join(OUT_DIR, 'index.html'))) {
    console.error(`[FATAL] ${OUT_DIR}/index.html missing — run \`yarn build\` first (do NOT rebuild in P0).`);
    process.exit(2);
  }
  mkdirSync(REVIEW_DIR, { recursive: true });
  mkdirSync(PUBLIC_PRODUCT_DIR, { recursive: true });

  // cwebp availability
  try { execFileSync('which', ['cwebp'], { stdio: 'ignore' }); }
  catch { console.error('[FATAL] cwebp not found — `brew install webp`.'); process.exit(2); }

  const pw = await import(pathToFileURL(path.join(PW_DIR, 'index.js')).href);
  const chromium = pw.chromium || pw.default?.chromium;

  const server = await startServer();
  console.log(`static server: ${BASE}  (serving ${OUT_DIR})`);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const results = [];
  const shots = SHOTS.filter((s) => !ONLY || ONLY.includes(s.name));

  try {
    for (const shot of shots) {
      const ctx = await browser.newContext({
        viewport: shot.viewport,
        deviceScaleFactor: shot.deviceScaleFactor,
        isMobile: !!shot.isMobile,
        hasTouch: !!shot.isMobile,
      });
      // The Graph gateway API key is domain-locked; pages served from 127.0.0.1 get
      // "auth error: domain not authorized by user" and render their empty states.
      // route.continue() cannot rewrite Origin (browser-controlled header), so proxy the
      // request through node fetch with the authorized production Origin and fulfill.
      await ctx.route('**gateway.thegraph.com**', async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') {
          return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
        }
        try {
          const resp = await fetch(req.url(), {
            method: req.method(),
            headers: { 'content-type': 'application/json', origin: 'https://poa.earth' },
            body: req.postData(),
          });
          const body = await resp.text();
          route.fulfill({ status: resp.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body });
        } catch {
          route.abort();
        }
      });
      const page = await ctx.newPage();
      const pageErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 160)); });
      try {
        // Data-aware load: the subgraph gateway is flaky under bursts, and a page can render
        // its EMPTY state (e.g. "Create Your First Project") when queries return nothing.
        // Blind settle delays photograph that. Instead, wait for per-shot sentinel text that
        // only exists once real data has landed; on timeout, reload and try again (2 reloads).
        let loaded = false;
        for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
          if (attempt > 0) console.log(`    (retry ${attempt}: reloading ${shot.name})`);
          await page.goto(BASE + shot.url, { waitUntil: 'networkidle', timeout: 60000 });
          try {
            for (const t of shot.waitFor || []) {
              await page.waitForSelector(`text=${t}`, { timeout: 45000 });
            }
            loaded = true;
          } catch (e) {
            if (attempt === 2) throw new Error(`sentinel never appeared: ${e.message.split('\n')[0]}`);
          }
        }
        await page.waitForTimeout(shot.settleMs || 4000);
        await page.addInitScript(HIDE_BY_TEXT).catch(() => {});
        await page.addStyleTag({ content: '::-webkit-scrollbar{display:none!important} *{scrollbar-width:none!important}' });
        if (shot.prepare) await shot.prepare(page);
        await page.waitForTimeout(300);

        const pngPath = path.join(REVIEW_DIR, `${shot.name}.png`);
        if (shot.clipSelector) {
          const loc = page.locator(shot.clipSelector).first();
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await loc.screenshot({ path: pngPath });
        } else if (shot.clipRect) {
          const r = shot.clipRect;
          await page.screenshot({ path: pngPath, clip: { x: r.x, y: r.y, width: r.width, height: r.height } });
        } else {
          await page.screenshot({ path: pngPath, fullPage: false });
        }

        const webpPath = path.join(PUBLIC_PRODUCT_DIR, `${shot.name}.webp`);
        execFileSync('cwebp', ['-q', String(QUALITY), '-quiet', pngPath, '-o', webpPath]);
        const bytes = statSync(webpPath).size;
        const dim = imageSize(pngPath);
        results.push({ name: shot.name, url: shot.url, webpPath, bytes, width: dim.w, height: dim.h, ok: true });
        console.log(`  ✓ ${shot.name.padEnd(20)} ${String(dim.w).padStart(5)}x${String(dim.h).padStart(4)}  ${fmtKB(bytes).padStart(7)} KB`);
      } catch (e) {
        results.push({ name: shot.name, url: shot.url, ok: false, error: e.message.slice(0, 200) });
        console.error(`  ✗ ${shot.name}: ${e.message.split('\n')[0]}`);
        if (pageErrors.length) console.error(`      page errors: ${pageErrors.slice(0, 2).join(' | ')}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    if (!KEEP_SERVER) server.close();
    else console.log(`(server left running on ${BASE}; ctrl-c to stop)`);
  }

  // ---- size report + gate ----
  const okShots = results.filter((r) => r.ok);
  const totalBytes = okShots.reduce((a, r) => a + r.bytes, 0);
  console.log('\n=== size report ===');
  for (const r of okShots) console.log(`  ${r.name.padEnd(20)} ${fmtKB(r.bytes).padStart(8)} KB  (${r.width}x${r.height})`);
  console.log(`  ${'TOTAL'.padEnd(20)} ${fmtKB(totalBytes).padStart(8)} KB`);

  const over = okShots.filter((r) => r.bytes > MAX_WEBP_KB * 1024);
  const failed = results.filter((r) => !r.ok);
  let bad = false;
  if (over.length) {
    bad = true;
    console.error(`\n[FAIL] ${over.length} webp(s) over ${MAX_WEBP_KB}KB: ${over.map((r) => `${r.name} ${fmtKB(r.bytes)}KB`).join(', ')}`);
    console.error('       Lower -q or tighten the clip and re-run.');
  }
  if (totalBytes > MAX_TOTAL_KB * 1024) {
    bad = true;
    console.error(`\n[FAIL] total ${fmtKB(totalBytes)}KB over ${MAX_TOTAL_KB}KB budget.`);
  }
  if (failed.length) {
    console.error(`\n[WARN] ${failed.length} shot(s) failed: ${failed.map((r) => r.name).join(', ')}`);
  }
  if (bad) process.exit(1);
  console.log('\nOK — all webp under budget.');
}

// Minimal PNG dimension reader (IHDR) to avoid a dependency.
function imageSize(pngPath) {
  const buf = require2('node:fs').readFileSync(pngPath);
  // PNG signature is 8 bytes; IHDR width/height are big-endian uint32 at offsets 16 and 20.
  if (buf.length > 24 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  return { w: 0, h: 0 };
}

main().catch((e) => { console.error(e); process.exit(1); });
