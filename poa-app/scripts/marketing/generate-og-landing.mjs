#!/usr/bin/env node
/**
 * generate-og-landing.mjs — deterministic landing OG image generator (P5).
 *
 * Renders the landing-only Open Graph card (1200x630): a simple Poa.box
 * wordmark and the "Build together. Own Together" line on a warm background.
 *
 * Output: poa-app/public/images/poa-og-landing.png (1200x630 PNG, well < 300KB).
 *
 * Deterministic + re-runnable:
 *   - Fonts (Archivo Variable, IBM Plex Mono 500) are read from public/fonts/ and
 *     base64-embedded into the HTML with font-display:block, so the display face
 *     is GUARANTEED loaded (never a fallback serif).
 *   - Rendered at DPR 2 via the Playwright-managed Chrome for Testing binary
 *     (headless --screenshot), then top-left cropped to 2400x1260 (the render
 *     window is intentionally taller than the 630px body so headless Chrome's
 *     reserved viewport never clips the bottom row), then downscaled to 1200x630.
 *
 * Requirements: a Playwright Chromium install (~/Library/Caches/ms-playwright/
 * chromium-*), plus `sips` (macOS). No node_modules image deps.
 *
 * Usage:  node poa-app/scripts/marketing/generate-og-landing.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import zlib from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..", "..");
const FONTS_DIR = join(APP_ROOT, "public", "fonts");
const OUT_PNG = join(APP_ROOT, "public", "images", "poa-og-landing.png");

// ---------------------------------------------------------------------------
// Locate the Playwright-managed Chrome for Testing binary.
// ---------------------------------------------------------------------------
function findChrome() {
  const cache = join(process.env.HOME, "Library", "Caches", "ms-playwright");
  if (!existsSync(cache)) throw new Error("no ms-playwright cache; install Playwright chromium");
  const chromiumDirs = readdirSync(cache)
    .filter((d) => d.startsWith("chromium-") && !d.includes("headless"))
    .sort()
    .reverse();
  for (const d of chromiumDirs) {
    const bin = join(
      cache,
      d,
      "chrome-mac-arm64",
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing"
    );
    if (existsSync(bin)) return bin;
  }
  throw new Error("Chrome for Testing binary not found under " + cache);
}

// ---------------------------------------------------------------------------
// Build the OG HTML with embedded fonts.
// ---------------------------------------------------------------------------
function b64(file) {
  return readFileSync(join(FONTS_DIR, file)).toString("base64");
}

function buildHtml() {
  const archivo = b64("archivo-vf.woff2");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><style>
  @font-face { font-family:'Archivo'; src:url(data:font/woff2;base64,${archivo}) format('woff2'); font-weight:100 900; font-display:block; }
  :root {
    --bone:#f4f1e9; --ink:#16181d; --signal:#b45309; --hair:#c4bda9;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { width:1200px; height:630px; }
  body { background:var(--bone); color:var(--ink); font-family:'Archivo',system-ui,sans-serif; -webkit-font-smoothing:antialiased; overflow:hidden; }
  .frame { position:relative; width:1200px; height:630px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:34px; overflow:hidden; border:1px solid var(--hair); box-shadow:inset 0 0 0 12px var(--bone); }
  .topband { position:absolute; top:0; left:0; right:0; height:6px; background:var(--signal); }
  .brand { font-size:112px; font-weight:730; font-variation-settings:'wght' 730; letter-spacing:-0.045em; line-height:1; }
  .tagline { font-size:48px; font-weight:480; font-variation-settings:'wght' 480; letter-spacing:-0.025em; line-height:1.15; }
  .tagline .own { display:inline-block; margin-left:0.16em; color:var(--signal); }
</style></head>
<body>
  <div class="frame">
    <span class="topband"></span>
    <h1 class="brand">Poa.box</h1>
    <p class="tagline">Build together. <span class="own">Own Together</span></p>
  </div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Minimal top-left PNG crop (8-bit non-interlaced RGB/RGBA), zlib only.
// ---------------------------------------------------------------------------
function cropTopLeft(inBuf, keepW, keepH) {
  const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!inBuf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  let off = 8, width, height, bitDepth, colorType, interlace;
  const idat = [];
  let iend = false;
  while (off < inBuf.length && !iend) {
    const len = inBuf.readUInt32BE(off);
    const type = inBuf.toString("ascii", off + 4, off + 8);
    const data = inBuf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") iend = true;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error("unsupported PNG format");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error("unsupported colorType " + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = 1 + width * channels;
  const px = Buffer.alloc(width * height * channels);
  const bpp = channels;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const rowStart = y * stride + 1;
    for (let x = 0; x < width * channels; x++) {
      const rb = raw[rowStart + x];
      const a = x >= bpp ? px[y * width * channels + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * width * channels + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * width * channels + x - bpp] : 0;
      let v;
      if (filter === 0) v = rb;
      else if (filter === 1) v = rb + a;
      else if (filter === 2) v = rb + b;
      else if (filter === 3) v = rb + ((a + b) >> 1);
      else {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * width * channels + x] = v & 0xff;
    }
  }
  const outW = Math.min(keepW, width), outH = Math.min(keepH, height);
  const outStride = 1 + outW * channels;
  const outRaw = Buffer.alloc(outH * outStride);
  for (let y = 0; y < outH; y++) {
    outRaw[y * outStride] = 0;
    for (let x = 0; x < outW * channels; x++)
      outRaw[y * outStride + 1 + x] = px[y * width * channels + x];
  }
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return ~c; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const tb = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])) >>> 0, 0);
    return Buffer.concat([len, tb, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(outW, 0); ihdr.writeUInt32BE(outH, 4);
  ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(outRaw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const chrome = findChrome();
const work = mkdtempSync(join(tmpdir(), "poa-og-"));
const htmlPath = join(work, "og.html");
const tallPng = join(work, "og-tall.png");
const cropPng = join(work, "og-1260.png");

writeFileSync(htmlPath, buildHtml());

// Render at DPR2 into a window taller than the body (730 CSS px) so headless
// Chrome's reserved viewport height never clips the bottom row.
execFileSync(chrome, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=2",
  "--window-size=1200,730",
  `--screenshot=${tallPng}`,
  `file://${htmlPath}`,
], { stdio: "ignore" });

// Top-left crop 2400x(>=1260) -> 2400x1260 (the 630px body at DPR2).
const cropped = cropTopLeft(readFileSync(tallPng), 2400, 1260);
writeFileSync(cropPng, cropped);

// Downscale to the 1200x630 deliverable.
writeFileSync(OUT_PNG, readFileSync(cropPng));
execFileSync("sips", ["--resampleHeightWidth", "630", "1200", OUT_PNG], { stdio: "ignore" });

const bytes = readFileSync(OUT_PNG).length;
console.log(`wrote ${OUT_PNG} (1200x630, ${bytes} bytes)`);
if (bytes > 300 * 1024) {
  console.error("WARNING: OG exceeds 300KB");
  process.exit(1);
}
