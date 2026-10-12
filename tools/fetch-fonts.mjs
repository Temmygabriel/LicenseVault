/**
 * Download the latin-subset woff2 files this project's typography stack needs.
 *
 * WHY THIS EXISTS
 *
 * `next/font/google` fetches fonts from Google at BUILD time (it self-hosts them at runtime, so
 * there is no runtime dependency — only a build one). That build-time fetch failed in CI on
 * 2026-10-12 with twelve "Module not found: Can't resolve
 * '@vercel/turbopack-next/internal/font/google/font'" errors, on a commit that changed only
 * markdown. It then passed on a re-run. A build that can go red because a third party rate-limits
 * a CI runner is a real fragility, and it will recur.
 *
 * So the files are fetched once, committed, and loaded with `next/font/local`. The build stops
 * depending on anyone else's uptime, and the fonts are identical bytes either way.
 *
 * Not a dependency: nothing is added to package.json. This only moves bytes into the repo.
 *
 * Run once: node tools/fetch-fonts.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "fonts");

/**
 * A modern browser UA is required, and it is not incidental: Google serves woff2 only to clients
 * that advertise support, and falls back to much larger ttf otherwise. Without this the download
 * "succeeds" and quietly produces files three times the size.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Exactly the weights/styles `app/layout.tsx` declares — no more, so no unused bytes ship. */
const FAMILIES = [
  { name: "Newsreader", query: "Newsreader:ital,wght@0,400;0,500;1,400;1,500" },
  { name: "IBM Plex Sans", query: "IBM+Plex+Sans:wght@400;500;600" },
  { name: "IBM Plex Mono", query: "IBM+Plex+Mono:wght@400;500" },
];

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Pull the `latin` block out of a Google Fonts CSS response.
 *
 * The CSS is a sequence of `/* subset *​/ @font-face { ... }` blocks. Only `latin` is taken: the
 * app is English-only, and shipping latin-ext/cyrillic/greek would be dead weight in the repo and
 * in every visitor's cache. If a `latin` block is missing the script throws rather than silently
 * writing a narrower stack than the page asks for.
 */
function latinFaces(css) {
  const blocks = css.split("/*").slice(1);
  const faces = [];
  for (const block of blocks) {
    const subset = block.slice(0, block.indexOf("*/")).trim();
    if (subset !== "latin") continue;
    const url = /url\((https:\/\/[^)]+\.woff2)\)/.exec(block)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const style = /font-style:\s*(\w+)/.exec(block)?.[1] ?? "normal";
    if (url && weight) faces.push({ url, weight, style });
  }
  return faces;
}

/** A stable, self-describing filename: `Newsreader-400-italic.woff2`. */
const fileName = (family, face) =>
  `${family.replace(/\s+/g, "")}-${face.weight}-${face.style}.woff2`;

let written = 0;
for (const family of FAMILIES) {
  const css = await fetchText(
    `https://fonts.googleapis.com/css2?family=${family.query}&display=swap`,
  );
  const faces = latinFaces(css);
  if (faces.length === 0) throw new Error(`no latin faces returned for ${family.name}`);

  await mkdir(outDir, { recursive: true });
  for (const face of faces) {
    const file = fileName(family.name, face);
    const bytes = await fetchBytes(face.url);
    // A woff2 begins with the ASCII signature "wOF2". Checking it means a captive-portal HTML
    // error page cannot be committed as if it were a font.
    if (bytes.subarray(0, 4).toString("ascii") !== "wOF2") {
      throw new Error(`${file} is not a woff2 (got ${bytes.subarray(0, 4).toString("ascii")})`);
    }
    await writeFile(join(outDir, file), bytes);
    console.log(`  ${file}  ${(bytes.length / 1024).toFixed(1)} KB`);
    written += 1;
  }
}

console.log(`\n${written} woff2 files written to app/fonts/`);
