#!/usr/bin/env node
/**
 * check-vocab.mjs — marketing-surface vocabulary lint gate (P-1 of the landing-v2 redesign).
 *
 * Zero dependencies. Node 20+, ESM. Two modes:
 *
 *   1. DEFAULT (HTML) mode — `node scripts/marketing/check-vocab.mjs`
 *      Walks the static export in `poa-app/out/` and scans the marketing surface for
 *      banned/off-register vocabulary. This is the authoritative gate; run it after
 *      `yarn build`.
 *
 *   2. SOURCE mode — `node scripts/marketing/check-vocab.mjs --src <path|glob> [...]`
 *      A cheap, build-free grep over .js/.jsx source so an agent can self-check a
 *      component before spending minutes on a build. Line-based; ERROR words only.
 *
 * Exit codes: 0 = clean (warnings allowed), 1 = ERROR-level hits, 2 = usage / missing out dir.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE HTML MODE SCANS (per file)
 *   - visible text: document body with <script>/<style>/<template>/<noscript> removed,
 *     tags stripped, HTML entities decoded.
 *   - <title> text.
 *   - <meta name=... content> and <meta property=... content> attribute values.
 *   - JSON-LD blocks: <script type="application/ld+json">, parsed as JSON, every string
 *     value (recursively) scanned.
 *   - <img alt="..."> attribute values.
 *   - <a href="..."> attribute values (URLs — catches e.g. /docs/on-chain-voting).
 *   - __NEXT_DATA__ page props: <script id="__NEXT_DATA__">, parsed as JSON, ONLY the
 *     string values reachable under props.pageProps are scanned. Build manifests, chunk
 *     paths, buildId, query, etc. are deliberately NOT scanned (they legitimately contain
 *     hashed filenames that would false-positive).
 *
 * FILES WALKED (relative to poa-app/out/):
 *   index.html, about/index.html, docs/index.html, docs/<slug>/index.html
 *
 * DOCS ARTICLE-BODY EXEMPTION (pragmatic choice, documented here):
 *   docs/<slug>/index.html (an ARTICLE route, i.e. any docs slug directory that is NOT the
 *   docs hub itself) carries a sanctioned substrate-vocabulary exemption for the article
 *   BODY — docs prose may name the underlying technology where technically unavoidable.
 *
 *   In this codebase, docs article routes render on the in-app Layout (NOT the marketing
 *   nav/footer chrome), so there is NO separable shared marketing chrome on them to scan.
 *   Everything on an article route is article-authored: the visible body, and the
 *   <title>/<meta>/JSON-LD SEO surface, which is derived verbatim from the article's
 *   front-matter title+description (i.e. a summary OF the exempt body). Scanning any of it
 *   only reports the article's own legitimate subject matter (e.g. "Gas sponsorship...").
 *   The spec grants a pragmatic approach here, so we take the honest one: docs ARTICLE
 *   routes are EXEMPT IN FULL — discovered and counted, but not scanned. (If a future docs
 *   redesign puts the marketing nav/footer on article routes, revisit and scan that chrome.)
 *
 *   The docs HUB (docs/index.html) is NOT an article route: its visible text, title, meta,
 *   JSON-LD, alt, and href chrome ARE scanned like index/about. The ONE exception on the
 *   hub is __NEXT_DATA__.pageProps, whose sole payload here is `allPostsData` — the full
 *   index of every article's front-matter title+description (article body-derived content
 *   under the exemption, embedded by Next). Scanning it would re-surface every article's
 *   substrate vocabulary, so the hub's pageProps is skipped. Hub chrome and hub-authored
 *   meta/keywords/JSON-LD are still fully enforced.
 *
 * ---------------------------------------------------------------------------
 * SOURCE-MODE LIMITATIONS (documented per spec):
 *   Source mode is a line-based regex smoke test, not a JSX parser. It scans .js/.jsx
 *   lines for ERROR-level banned words and reports file:line. To cut obvious noise it
 *   skips lines that are pure `import`/`export ... from` statements and single-line
 *   comments. It CANNOT distinguish a banned word inside a user-facing JSX string from
 *   one inside an identifier, prop name, or code comment spanning styles it doesn't model,
 *   so it may over-report (e.g. a variable literally named `tokenBalance`). It exists to
 *   catch copy typos fast; the HTML mode is the source of truth. Warnings are not checked
 *   in source mode.
 * ---------------------------------------------------------------------------
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// scripts/marketing/ -> poa-app/
const POA_APP_ROOT = resolve(__dirname, "..", "..");
const OUT_DIR = join(POA_APP_ROOT, "out");

// ---------------------------------------------------------------------------
// Vocabulary lists
// ---------------------------------------------------------------------------

// ERROR-level banned words/phrases. Matched word-boundary, case-insensitive.
// Multi-word entries match across a run of whitespace. Ordered longest-first
// within a family so double-reporting a hyphen/space variant is possible but a
// short word never pre-empts a longer phrase in the same location (both may fire;
// that is acceptable and desired per spec).
const BANNED = [
  "blockchain",
  "crypto",
  "web3",
  "DAO",
  "tokens",
  "token",
  "on-chain",
  "onchain",
  "wallet",
  "smart contracts",
  "smart contract",
  "gas",
  "mint",
  "airdrop",
  "NFT",
  "DeFi",
  "multisig",
  "multi-sig",
  "dapp",
  "protocol fee",
  "stablecoin",
];

// "decentralized" is ALLOWED bare. Only these compounds are ERRORs.
const DECENTRALIZED_COMPOUNDS = [
  "decentralized autonomous",
  "decentralized finance",
];
// hyphenated "decentralized-*" (e.g. "decentralized-governance") is also an error.
const DECENTRALIZED_HYPHEN_RE = /decentralized-\w/i;

// WARNING-level lists (report + count, but do NOT change exit code).
const WARN_LEFT = [
  "solidarity",
  "extractive",
  "exploitation",
  "capitalism",
  "capitalist",
  "mutual aid",
  "the workers",
];
const WARN_RIGHT = [
  "sovereignty",
  "sovereign",
  "financial freedom",
  "permissionless",
  "censorship-resistant",
];

// ---------------------------------------------------------------------------
// Matcher helpers
// ---------------------------------------------------------------------------

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a word-boundary, whitespace-flexible, case-insensitive regex for a term.
// Uses lookaround boundaries built on \w so hyphenated terms ("on-chain") still
// anchor on their outer edges and never match inside a longer word.
function termRegex(term) {
  const flexible = escapeRe(term).replace(/\\?\s+/g, "\\s+");
  // (?<![\w]) / (?![\w]) — boundary that treats hyphen inside the term as literal
  // but still refuses to match when the term is glued to word chars on either side.
  return new RegExp(`(?<![A-Za-z0-9])${flexible}(?![A-Za-z0-9])`, "gi");
}

const BANNED_RE = BANNED.map((t) => ({ term: t, re: termRegex(t) }));
const DECOMPOUND_RE = DECENTRALIZED_COMPOUNDS.map((t) => ({ term: t, re: termRegex(t) }));
const WARN_LEFT_RE = WARN_LEFT.map((t) => ({ term: t, re: termRegex(t) }));
const WARN_RIGHT_RE = WARN_RIGHT.map((t) => ({ term: t, re: termRegex(t) }));

// \bPOA\b all-caps only (case-SENSITIVE). The mark is "poa"; prose "Poa"; "POA" never.
const POA_CAPS_RE = /(?<![A-Za-z0-9])POA(?![A-Za-z0-9])/g;

const EM_DASH = "—"; // —

// Collapse whitespace and trim, for readable context snippets.
function snippet(text, index, span = 48) {
  const start = Math.max(0, index - span);
  const end = Math.min(text.length, index + span);
  return (start > 0 ? "…" : "") +
    text.slice(start, end).replace(/\s+/g, " ").trim() +
    (end < text.length ? "…" : "");
}

// ---------------------------------------------------------------------------
// HTML extraction (regex-based; the export is simple, deterministic HTML)
// ---------------------------------------------------------------------------

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, EM_DASH)
    .replace(/&#8212;/g, EM_DASH)
    .replace(/&#x2014;/gi, EM_DASH)
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

// Extract visible text: drop non-rendered element contents, strip tags, decode.
function extractVisibleText(html) {
  let s = html;
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<template\b[\s\S]*?<\/template>/gi, " ");
  s = s.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<head\b[\s\S]*?<\/head>/gi, " "); // title/meta scanned separately
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  return decodeEntities(s);
}

function extractTitle(html) {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]) : "";
}

// All <meta ... content="..."> values whose name/property is a text-bearing attr.
function extractMetaContents(html) {
  const out = [];
  const metaRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(html))) {
    const tag = m[0];
    const contentM = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    if (!contentM) continue;
    const value = contentM[2] !== undefined ? contentM[2] : contentM[3] || "";
    const nameM = /\b(?:name|property)\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const key = nameM ? (nameM[2] !== undefined ? nameM[2] : nameM[3]) : "meta";
    // Skip machine-only meta that never carries copy.
    if (/^(viewport|charset|robots|theme-color|color-scheme|referrer|format-detection|next-head-count|generator|apple-mobile|msapplication)/i.test(key)) {
      continue;
    }
    out.push({ key, value: decodeEntities(value) });
  }
  return out;
}

function extractImgAlts(html) {
  const out = [];
  const imgRe = /<img\b[^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html))) {
    const altM = /\balt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(m[0]);
    if (altM) {
      const value = altM[2] !== undefined ? altM[2] : altM[3] || "";
      if (value.trim()) out.push(decodeEntities(value));
    }
  }
  return out;
}

function extractAnchorHrefs(html) {
  const out = [];
  const aRe = /<a\b[^>]*>/gi;
  let m;
  while ((m = aRe.exec(html))) {
    const hrefM = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(m[0]);
    if (hrefM) {
      const value = hrefM[2] !== undefined ? hrefM[2] : hrefM[3] || "";
      if (value.trim()) out.push(decodeEntities(value));
    }
  }
  return out;
}

function extractJsonLdBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*("application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[2].trim();
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Unparseable JSON-LD is itself worth surfacing, but never as an ERROR here;
      // fall back to scanning the raw text so banned words are still caught.
      out.push({ __rawJsonLd: raw });
    }
  }
  return out;
}

function extractNextDataPageProps(html) {
  const m = /<script\b[^>]*id\s*=\s*("__NEXT_DATA__"|'__NEXT_DATA__')[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return null;
  try {
    const data = JSON.parse(m[2]);
    return data?.props?.pageProps ?? null;
  } catch {
    return null;
  }
}

// Recursively collect every string value in a JSON structure.
function collectStrings(value, acc) {
  if (value == null) return;
  if (typeof value === "string") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, acc);
  } else if (typeof value === "object") {
    for (const k of Object.keys(value)) collectStrings(value[k], acc);
  }
}

// ---------------------------------------------------------------------------
// Scanning a single string; pushes into errors/warnings arrays.
// checkExtras (POA caps, em-dash, exclamation) apply only to visible text and
// meta/JSON-LD strings per spec — not to hrefs (URLs) which are word-checked only.
// ---------------------------------------------------------------------------

function scanString({ text, where, errors, warnings, checkExclamation, checkExtras }) {
  if (!text) return;

  for (const { term, re } of BANNED_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      errors.push({ where, kind: `banned:"${term}"`, context: snippet(text, m.index) });
    }
  }
  for (const { term, re } of DECOMPOUND_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      errors.push({ where, kind: `banned:"${term}"`, context: snippet(text, m.index) });
    }
  }
  {
    const hm = DECENTRALIZED_HYPHEN_RE.exec(text);
    if (hm) {
      errors.push({ where, kind: `banned:"decentralized-*"`, context: snippet(text, hm.index) });
    }
  }

  if (checkExtras) {
    POA_CAPS_RE.lastIndex = 0;
    let pm;
    while ((pm = POA_CAPS_RE.exec(text))) {
      errors.push({ where, kind: "all-caps POA", context: snippet(text, pm.index) });
    }
    const dashIdx = text.indexOf(EM_DASH);
    if (dashIdx !== -1) {
      errors.push({ where, kind: "em-dash (—)", context: snippet(text, dashIdx) });
    }
  }

  if (checkExclamation) {
    const exIdx = text.indexOf("!");
    if (exIdx !== -1) {
      errors.push({ where, kind: "exclamation mark", context: snippet(text, exIdx) });
    }
  }

  for (const { term, re } of WARN_LEFT_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      warnings.push({ where, kind: `avoid(left):"${term}"`, context: snippet(text, m.index) });
    }
  }
  for (const { term, re } of WARN_RIGHT_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      warnings.push({ where, kind: `avoid(right):"${term}"`, context: snippet(text, m.index) });
    }
  }
}

// ---------------------------------------------------------------------------
// Per-file scan
// ---------------------------------------------------------------------------

function scanHtmlFile(absPath, relPath, isDocsArticle, errors, warnings) {
  // Docs ARTICLE routes are exempt in full (see header comment): their body, and their
  // front-matter-derived title/meta/JSON-LD, are all article-authored content under the
  // sanctioned substrate-vocabulary exemption, and they carry no separable marketing
  // chrome. Counted at discovery, but nothing is scanned.
  if (isDocsArticle) return;

  const html = readFileSync(absPath, "utf8");

  // SEO surface: title, meta, JSON-LD.
  const title = extractTitle(html);
  scanString({ text: title, where: `${relPath} <title>`, errors, warnings, checkExclamation: true, checkExtras: true });

  for (const { key, value } of extractMetaContents(html)) {
    scanString({ text: value, where: `${relPath} <meta ${key}>`, errors, warnings, checkExclamation: false, checkExtras: true });
  }

  for (const block of extractJsonLdBlocks(html)) {
    if (block && block.__rawJsonLd !== undefined) {
      scanString({ text: block.__rawJsonLd, where: `${relPath} JSON-LD(raw)`, errors, warnings, checkExclamation: false, checkExtras: true });
      continue;
    }
    const strings = [];
    collectStrings(block, strings);
    for (const s of strings) {
      scanString({ text: s, where: `${relPath} JSON-LD`, errors, warnings, checkExclamation: false, checkExtras: true });
    }
  }

  const visible = extractVisibleText(html);
  scanString({ text: visible, where: `${relPath} text`, errors, warnings, checkExclamation: true, checkExtras: true });

  for (const alt of extractImgAlts(html)) {
    scanString({ text: alt, where: `${relPath} img[alt]`, errors, warnings, checkExclamation: false, checkExtras: true });
  }

  for (const href of extractAnchorHrefs(html)) {
    // URLs: word-check only (no em-dash/exclamation/POA-caps checks on paths).
    // Exemption inheritance: hrefs pointing INTO docs article routes carry the
    // article-body exemption (the slug is derived from the exempt article, e.g.
    // /docs/gas-sponsor). Visible link TEXT is still fully checked above.
    if (/^\/?docs\/[^/]+\/?$/i.test(href.replace(/^https?:\/\/[^/]+/i, ""))) continue;
    scanString({ text: href, where: `${relPath} a[href]`, errors, warnings, checkExclamation: false, checkExtras: false });
  }

  // __NEXT_DATA__.pageProps — scanned on index/about. On the docs HUB, pageProps is the
  // `allPostsData` article index (article body-derived content under the exemption), so
  // it is skipped there; hub chrome/meta/JSON-LD above are still enforced.
  const isDocsHub = relPath === "docs/index.html";
  if (!isDocsHub) {
    const pageProps = extractNextDataPageProps(html);
    if (pageProps) {
      const strings = [];
      collectStrings(pageProps, strings);
      for (const s of strings) {
        scanString({ text: s, where: `${relPath} __NEXT_DATA__.pageProps`, errors, warnings, checkExclamation: false, checkExtras: true });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function discoverHtmlTargets() {
  const targets = []; // { abs, rel, isDocsArticle }
  const push = (relFromOut, isDocsArticle) => {
    const abs = join(OUT_DIR, relFromOut);
    if (existsSync(abs)) targets.push({ abs, rel: relFromOut, isDocsArticle });
  };

  push("index.html", false);
  push("about/index.html", false);
  push("docs/index.html", false); // docs HUB — full scan

  // docs/<slug>/index.html — article routes (exempt bodies)
  const docsDir = join(OUT_DIR, "docs");
  if (existsSync(docsDir)) {
    for (const entry of readdirSync(docsDir)) {
      const entryPath = join(docsDir, entry);
      if (!statSync(entryPath).isDirectory()) continue;
      const articleIndex = join(entryPath, "index.html");
      if (existsSync(articleIndex)) {
        push(`docs/${entry}/index.html`, true);
      }
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Source mode
// ---------------------------------------------------------------------------

function collectSourceFiles(inputs) {
  const files = [];
  const visit = (p) => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const e of readdirSync(p)) {
        if (e === "node_modules" || e === ".next" || e === "out") continue;
        visit(join(p, e));
      }
    } else if (/\.(jsx?|mjs)$/.test(p)) {
      files.push(p);
    }
  };
  for (const input of inputs) {
    visit(resolve(process.cwd(), input));
  }
  return files;
}

function scanSourceFile(absPath, errors) {
  const rel = relative(process.cwd(), absPath);
  const lines = readFileSync(absPath, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Skip pure import/export-from and single-line comments (documented limitation).
    if (/^import\b/.test(trimmed)) return;
    if (/^export\s+.*\bfrom\b/.test(trimmed)) return;
    if (/^\/\//.test(trimmed) || /^\*/.test(trimmed)) return;

    for (const { term, re } of BANNED_RE) {
      re.lastIndex = 0;
      if (re.test(line)) {
        errors.push({ where: `${rel}:${i + 1}`, kind: `banned:"${term}"`, context: line.trim().slice(0, 100) });
      }
    }
    for (const { term, re } of DECOMPOUND_RE) {
      re.lastIndex = 0;
      if (re.test(line)) {
        errors.push({ where: `${rel}:${i + 1}`, kind: `banned:"${term}"`, context: line.trim().slice(0, 100) });
      }
    }
    if (DECENTRALIZED_HYPHEN_RE.test(line)) {
      errors.push({ where: `${rel}:${i + 1}`, kind: `banned:"decentralized-*"`, context: line.trim().slice(0, 100) });
    }
    POA_CAPS_RE.lastIndex = 0;
    if (POA_CAPS_RE.test(line)) {
      errors.push({ where: `${rel}:${i + 1}`, kind: "all-caps POA", context: line.trim().slice(0, 100) });
    }
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printReport(errors, warnings, { mode }) {
  if (errors.length) {
    console.error(`\n✗ ${errors.length} ERROR-level vocabulary hit${errors.length === 1 ? "" : "s"}:\n`);
    for (const e of errors) {
      console.error(`  ERROR  ${e.where}`);
      console.error(`         ${e.kind}`);
      console.error(`         › ${e.context}`);
    }
  } else {
    console.log(`\n✓ No ERROR-level vocabulary hits (${mode} mode).`);
  }

  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} WARNING-level hit${warnings.length === 1 ? "" : "s"} (avoid list; exit code unaffected):\n`);
    for (const w of warnings) {
      console.log(`  WARN   ${w.where}`);
      console.log(`         ${w.kind}`);
      console.log(`         › ${w.context}`);
    }
  } else if (mode === "html") {
    console.log(`✓ No WARNING-level (avoid-list) hits.`);
  }
  console.log("");
}

function printHelp() {
  console.log(`
check-vocab.mjs — marketing-surface vocabulary lint gate

USAGE
  node scripts/marketing/check-vocab.mjs              # HTML mode: scan poa-app/out/
  node scripts/marketing/check-vocab.mjs --src <p>... # source mode: grep .js/.jsx
  node scripts/marketing/check-vocab.mjs --help

HTML mode walks out/{index, about/index, docs/index, docs/*/index}.html and scans
visible text, <title>, meta, JSON-LD, img alt, a href, and __NEXT_DATA__ pageProps
for banned/off-register vocabulary. Docs article routes are exempt in full
(article-authored content, no separable marketing chrome); the docs hub is scanned
except its article-index pageProps.

Source mode is a fast, build-free grep for ERROR-level banned words over the given
paths/dirs (recursively, .js/.jsx/.mjs), for agent self-checks before building.

EXIT CODES
  0  clean (warnings allowed)
  1  ERROR-level hits found
  2  usage error / missing out dir

ERROR words: blockchain, crypto, web3, DAO, token(s), on-chain, wallet,
  smart contract(s), gas, mint, airdrop, NFT, DeFi, multisig, dapp, protocol fee,
  stablecoin; "decentralized" compounds; all-caps POA; em-dash; exclamation.
WARNING (avoid) words: solidarity, extractive, exploitation, capitalism(t),
  mutual aid, "the workers" / sovereign(ty), financial freedom, permissionless,
  censorship-resistant.
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const srcIdx = argv.indexOf("--src");
  if (srcIdx !== -1) {
    const inputs = argv.slice(srcIdx + 1).filter((a) => !a.startsWith("-"));
    if (inputs.length === 0) {
      console.error("Usage: check-vocab.mjs --src <path|dir> [more...]");
      process.exit(2);
    }
    const files = collectSourceFiles(inputs);
    if (files.length === 0) {
      console.error(`No .js/.jsx/.mjs files found under: ${inputs.join(", ")}`);
      process.exit(2);
    }
    const errors = [];
    for (const f of files) scanSourceFile(f, errors);
    console.log(`\nSource scan: ${files.length} file${files.length === 1 ? "" : "s"} under ${inputs.join(", ")}`);
    printReport(errors, [], { mode: "source" });
    process.exit(errors.length ? 1 : 0);
  }

  // HTML mode
  if (!existsSync(OUT_DIR)) {
    console.error(`✗ Missing static export directory: ${OUT_DIR}`);
    console.error(`  Run \`yarn build\` in poa-app/ first.`);
    process.exit(2);
  }

  const targets = discoverHtmlTargets();
  if (targets.length === 0) {
    console.error(`✗ No marketing HTML files found under ${OUT_DIR}.`);
    console.error(`  Expected at least out/index.html — did the build finish?`);
    process.exit(2);
  }

  const errors = [];
  const warnings = [];
  for (const t of targets) {
    scanHtmlFile(t.abs, t.rel, t.isDocsArticle, errors, warnings);
  }

  const articleCount = targets.filter((t) => t.isDocsArticle).length;
  const scannedCount = targets.length - articleCount;
  console.log(`\nHTML scan: ${scannedCount} scanned + ${articleCount} exempt docs article route(s) = ${targets.length} in out/`);
  printReport(errors, warnings, { mode: "html" });

  process.exit(errors.length ? 1 : 0);
}

main();
