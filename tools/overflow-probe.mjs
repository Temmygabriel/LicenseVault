/**
 * Overflow probe: find which element is wider than the viewport, if any.
 *
 * Run when `tools/ui-audit.mjs` reports `scrollWidth > innerWidth` — a horizontal scrollbar is the
 * one responsive defect that is invisible in a screenshot of the top of the page. Same prerequisites
 * as the audit (a served page and a browser on port 9222).
 *
 * Usage: npm run ui:overflow -- [url] [width]
 */

const PORT = 9222;
const URL_UNDER_TEST = process.argv[2] ?? "http://localhost:4173/";
const WIDTH = Number(process.argv[3] ?? 320);

const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
const page = (await res.json()).find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id !== undefined && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(new Error(JSON.stringify(m.error)));
    else p.resolve(m.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: 844,
  deviceScaleFactor: 1,
  mobile: WIDTH < 700,
});
await send("Page.navigate", { url: URL_UNDER_TEST });
await new Promise((r) => setTimeout(r, 1200));

const expression = `(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || "")).slice(0, 60),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        text: (el.textContent || "").trim().slice(0, 40),
      });
    }
  }
  return {
    innerWidth: window.innerWidth,
    clientWidth: vw,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    offenders: offenders.slice(0, 25),
  };
})()`;

const { result } = await send("Runtime.evaluate", { expression, returnByValue: true });
console.log(JSON.stringify(result.value, null, 2));
ws.close();
