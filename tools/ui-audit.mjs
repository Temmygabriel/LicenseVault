/**
 * Objective UI audit over the Chrome DevTools Protocol.
 *
 * This is the instrument behind every responsiveness number in `PROGRESS.md`, so it is committed
 * rather than kept on the side: a claim that cannot be re-measured is a claim on trust. It is a
 * measurement tool, not a product dependency — it needs **no npm package**. It drives Chrome with
 * Node's built-in global `WebSocket`, which is why it is plain `.mjs` and not TypeScript.
 *
 * Usage:
 *   1. npm run build && npm start -- -p 4173
 *   2. start Edge/Chrome with --remote-debugging-port=9222 --headless=new
 *   3. npm run ui:audit              # or: node tools/ui-audit.mjs [url]
 *
 * Eyeballing a screenshot is not a check, and this machine's image path is deliberately not used
 * for review.
 */

const PORT = 9222;
const URL_UNDER_TEST = process.argv[2] ?? "http://localhost:4173/";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1024", width: 1024, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-320", width: 320, height: 844 },
];

async function target() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await res.json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target — is the browser running with --remote-debugging-port?");
  return page.webSocketDebuggerUrl;
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

/** The measurement script, run inside the page. Pure DOM reads; nothing is mutated. */
const PROBE = String.raw`(() => {
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => Array.from(document.querySelectorAll(sel));
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);

  const header = q("header");
  const main = q("main");
  const hero = main ? main.firstElementChild : null;
  const headline = q("h1");
  const eyebrow = q("main p");
  const docket = q("article");
  const statusLabel = q(".status__label");
  const action = q("button");
  const rows = qa(".docket__row dt").map((dt) => dt.textContent.trim());
  const valueOf = (label) => {
    const dt = qa(".docket__row dt").find((n) => n.textContent.trim().toLowerCase() === label);
    const dd = dt ? dt.parentElement.querySelector("dd") : null;
    return dd ? dd.textContent.trim() : null;
  };

  const bg = getComputedStyle(document.body).backgroundColor;
  const parseRgb = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || "");
    if (!m) return null;
    return m[1].split(",").slice(0, 3).map((n) => Number(n.trim()));
  };
  const lum = ([r, g, b]) => {
    const f = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };

  const canvas = parseRgb(bg);
  const secondaryEl = q(".docket__note");
  const secondaryRgb = parseRgb(cs(secondaryEl, "color"));

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    docHeight: document.documentElement.scrollHeight,
    header: box(header),
    main: box(main),
    mainMaxWidth: cs(main, "max-width"),
    hero: box(hero),
    headline: { text: headline ? headline.textContent.trim() : null, box: box(headline), size: cs(headline, "font-size"), family: cs(headline, "font-family"), lineHeight: cs(headline, "line-height") },
    eyebrow: eyebrow ? eyebrow.textContent.trim() : null,
    docket: { box: box(docket), bg: cs(docket, "background-color") },
    status: statusLabel ? statusLabel.textContent.trim() : null,
    action: { label: action ? action.textContent.trim() : null, disabled: action ? action.disabled : null },
    rows,
    licenseRequired: valueOf("license required"),
    licenseHolder: valueOf("license holder"),
    network: valueOf("network"),
    anchors: { howItWorks: !!q("#how-it-works"), proof: !!q("#proof") },
    navLinks: qa("header a").map((a) => a.textContent.trim()),
    iconLink: q('link[rel="icon"]') ? q('link[rel="icon"]').getAttribute("href") : null,
    title: document.title,
    colors: {
      bodyBackground: bg,
      canvasRgb: canvas,
      secondaryRgb,
      secondaryOnCanvas: canvas && secondaryRgb ? ratio(canvas, secondaryRgb) : null,
      bodyFont: getComputedStyle(document.body).fontFamily,
    },
    receipt: {
      present: !!q(".receipt__rows"),
      groups: qa(".receipt__group-heading").map((h) => h.textContent.trim()),
      steps: qa(".receipt__step-link").map((a) => a.getAttribute("href")),
      verification: q(".receipt__verification") ? q(".receipt__verification").textContent.trim().slice(0, 80) : null,
    },
    sections: qa("section[id], div[id]").map((s) => s.id),
  };
})()`;

const wsUrl = await target();
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", reject);
});
const cdp = new Cdp(ws);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

/**
 * Wait until the page is actually laid out with its stylesheet applied.
 *
 * A fixed sleep is not good enough: navigating and measuring too early reports the browser's
 * default `<h1>` size and an unstyled full-width document, which looks exactly like a layout
 * bug and is not one. The first run of this script did that and produced a page of fake
 * findings. So wait for a real, CSS-dependent condition instead.
 */
async function settle() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        if (document.readyState !== "complete") return false;
        const d = document.querySelector(".docket");
        if (!d) return false;
        const maxW = getComputedStyle(d).maxWidth;
        const h1 = document.querySelector("h1");
        const size = h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0;
        return maxW === "680px" && size > 30;
      })()`,
      returnByValue: true,
    });
    if (result.value === true) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const results = [];

for (const vp of VIEWPORTS) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 1,
    mobile: vp.width < 700,
  });
  await cdp.send("Page.navigate", { url: `${URL_UNDER_TEST}?vp=${vp.name}` });

  const ready = await settle();
  if (!ready) throw new Error(`${vp.name}: the page never reached a styled layout`);

  const { result } = await cdp.send("Runtime.evaluate", {
    expression: PROBE,
    returnByValue: true,
    awaitPromise: false,
  });

  results.push({ name: vp.name, ...result.value });
}

ws.close();
console.log(JSON.stringify(results, null, 2));
