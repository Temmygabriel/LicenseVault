/**
 * Real-state screenshots, driven through the real UI.
 *
 * The brief (§9) requires one screenshot attached to each visual-QA score. The important word is
 * *real*: a screenshot of a state the app cannot actually produce is a drawing, and this project's
 * whole claim is that it does not draw things. So this tool does not assemble markup — it types an
 * address into the field, clicks the button, waits for the machine to settle, and captures whatever
 * the app then renders. If the app changes, the pictures change with it.
 *
 * It uses the same CDP plumbing as `tools/ui-audit.mjs` (Node's built-in global `WebSocket`, no npm
 * package) so there is one mechanism to understand, not two.
 *
 * Usage:
 *   1. npm run build && npm start -- -p 4173
 *   2. start Edge/Chrome with --remote-debugging-port=9222 --headless=new
 *   3. npm run ui:capture
 *
 * For the VERIFICATION_ERROR scene the state has a cause that must be real too. Point the server at
 * an RPC that is not there, rather than mocking a failure in the browser:
 *
 *   STORY_RPC_URL=http://127.0.0.1:9 npm start -- -p 4174
 *   node tools/ui-capture.mjs http://localhost:4174/ qa-screens error
 *
 * This machine's image path is deliberately not used for reviewing the output; the screenshots are
 * produced for the record and read by a human, not opened here.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = 9222;
const BASE = process.argv[2] ?? "http://localhost:4173/";
const OUT_DIR = process.argv[3] ?? "qa-screens";
const ONLY = process.argv[4] ?? null;

/** The addresses the scenes ask about. Both are real: one holds the licence, one does not. */
const LICENSE_HOLDER = "0x226e01730F6991C1BD11f58d1204638bee89A863";
const NOT_A_HOLDER = "0x75D900D18866D8aA416CCEFD9e85D2C61dB0aCa9";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  // The brief (§9) names 320px explicitly, and it is the width where the docket's own header
  // wrapped in BUILD 5, so it is captured rather than assumed.
  narrow: { width: 320, height: 844 },
};

/**
 * Each scene says which viewports it is worth capturing at, and how to reach the state.
 *
 * `unreachable` scenes are only meaningful against a server whose RPC is down — the tool refuses
 * to produce them against a healthy server rather than photographing a state that is not real.
 */
const SCENES = [
  {
    name: "locked",
    viewports: ["desktop", "mobile", "narrow"],
    unreachable: false,
    expectStatus: "Locked",
    caption: "LOCKED — the state before any question has been asked.",
  },
  {
    name: "verified",
    viewports: ["desktop", "mobile"],
    unreachable: false,
    address: LICENSE_HOLDER,
    expectStatus: "License verified",
    caption: "LICENSE VERIFIED — the recorded holder of licence token #73227.",
  },
  {
    name: "no-license",
    viewports: ["desktop", "mobile"],
    unreachable: false,
    address: NOT_A_HOLDER,
    expectStatus: "No license",
    caption: "NO LICENSE — an address the condition evaluated and returned false for.",
  },
  {
    name: "verification-error",
    viewports: ["desktop"],
    unreachable: true,
    address: LICENSE_HOLDER,
    expectStatus: "Verification error",
    caption:
      "VERIFICATION ERROR — the same holder address against a server whose RPC is unreachable. " +
      "Note it does NOT say NO LICENSE: an unreachable dependency is not a statement about rights.",
  },
  {
    // The brief's §9 list asks for the proof receipt on its own, and it sits below the fold, so
    // this scene scrolls to it instead of to the docket.
    name: "proof",
    viewports: ["desktop"],
    unreachable: false,
    scrollTo: "#proof",
    caption:
      "PROOF RECEIPT — read from the committed run, not typed in: the verifier's own counts and the " +
      "six transaction links re-checked against Aeneid.",
  },
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

  async eval(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text ?? "evaluate failed");
    return result.value;
  }
}

/** Is the RPC this server uses actually reachable? Asked of the app, not of the environment. */
async function serverCanReachChain(url) {
  const response = await fetch(new URL("/api/verify-license", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: LICENSE_HOLDER }),
  });
  return response.ok;
}

/**
 * Type into the React-controlled field the way a person would.
 *
 * This is deliberately TWO steps with a frame in between, and the reason is a real defect this tool
 * shipped with for one run: setting the value and calling `requestSubmit()` in the same tick meant
 * `verify()` closed over the *previous* `draft` — the empty string — so every scene failed local
 * validation and photographed `LOCKED` with a "not a valid EVM address" note. Six screenshots of a
 * state nobody asked for, all of them looking plausible.
 */
function typeAddress(address) {
  return `(() => {
    const input = document.querySelector("#wallet-address");
    if (!input) return "no field";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(address)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return "typed";
  })()`;
}

/** Did React actually take the value, or is the field still showing something else? */
const FIELD_VALUE = `(() => {
  const input = document.querySelector("#wallet-address");
  return input ? input.value : null;
})()`;

/**
 * Is React actually driving this page yet?
 *
 * "The form is in the DOM" is NOT the same question, and treating it as one cost this tool a run.
 * Next.js server-renders the form, so `#verify-license-form` exists in the HTML from the first
 * paint while React owns nothing — and `form.requestSubmit()` on an un-hydrated form is a *native*
 * submit, which reloads the page and resets the field. Every scene then photographed `LOCKED` with
 * nothing to show for it.
 *
 * React attaches a `__reactFiber$…` property to the nodes it takes over, and server-rendered HTML
 * never has one. That makes it a direct answer to the question rather than a proxy for it.
 */
const HYDRATED = `(() => {
  const form = document.querySelector("#verify-license-form");
  if (!form || document.readyState !== "complete") return false;
  return Object.keys(form).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
})()`;

/** Submit through the form, so the component's own onSubmit path runs. */
const SUBMIT = `(() => {
  const form = document.querySelector("#verify-license-form");
  if (!form) return "no form";
  if (typeof form.requestSubmit === "function") form.requestSubmit();
  else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  return "submitted";
})()`;


/** Wait for the machine to stop moving: no busy attribute, and a settled status label. */
const SETTLED = `(() => {
  const button = document.querySelector(".docket__action .action--block");
  const status = document.querySelector(".status__label");
  if (!button || !status) return null;
  const busy = button.getAttribute("aria-busy") === "true";
  return busy ? null : status.textContent.trim();
})()`;

/**
 * Scroll a section to the top of the viewport so every capture is framed the same way.
 *
 * Defaults to the docket, which is the page's product object; the proof scene asks for `#proof`.
 */
function frameOn(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const y = window.scrollY + el.getBoundingClientRect().top - 24;
    window.scrollTo(0, Math.max(0, y));
    return Math.round(window.scrollY);
  })()`;
}


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

const chainReachable = await serverCanReachChain(BASE);
console.log(`${BASE} — chain reachable from this server: ${chainReachable}`);

mkdirSync(OUT_DIR, { recursive: true });

for (const scene of SCENES) {
  if (ONLY !== null && scene.name !== ONLY) continue;

  if (scene.unreachable !== !chainReachable) {
    console.log(
      `skip ${scene.name}: this scene needs a server whose chain is ` +
        `${scene.unreachable ? "UNREACHABLE" : "reachable"}. Start the right one rather than ` +
        `photographing a state that is not real.`,
    );
    continue;
  }

  for (const vpName of scene.viewports) {
    const vp = VIEWPORTS[vpName];
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vpName === "mobile",
    });
    // A fresh load per scene, so no scene inherits the previous one's state.
    await cdp.send("Page.navigate", { url: `${BASE}?scene=${scene.name}&vp=${vpName}` });

    // Wait for hydration, not merely for paint.
    let hydrated = false;
    for (let i = 0; i < 80; i += 1) {
      hydrated = await cdp.eval(HYDRATED);
      if (hydrated) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!hydrated) throw new Error(`${scene.name}/${vpName}: React never took over the form`);

    if (scene.address !== undefined) {
      const typed = await cdp.eval(typeAddress(scene.address));
      if (typed !== "typed") throw new Error(`${scene.name}/${vpName}: ${typed}`);

      // Let React commit the controlled value before the submit reads it.
      await new Promise((r) => setTimeout(r, 250));

      const shown = await cdp.eval(FIELD_VALUE);
      if (shown !== scene.address) {
        throw new Error(
          `${scene.name}/${vpName}: the field holds "${String(shown)}", not the address asked for`,
        );
      }

      const outcome = await cdp.eval(SUBMIT);
      if (outcome !== "submitted") throw new Error(`${scene.name}/${vpName}: ${outcome}`);

      let status = null;
      for (let i = 0; i < 60; i += 1) {
        status = await cdp.eval(SETTLED);
        if (status !== null && status !== "Locked") break;
        await new Promise((r) => setTimeout(r, 250));
      }

      // A capture tool that photographs the wrong state is the same defect as an audit that reads
      // the wrong element. Assert the state is the one the scene claims, and refuse to write it.
      if (status !== scene.expectStatus) {
        throw new Error(
          `${scene.name}/${vpName}: settled on "${String(status)}", expected "${scene.expectStatus}"`,
        );
      }
      console.log(`  ${scene.name}/${vpName} -> status "${status}"`);
    }

    const framed = await cdp.eval(frameOn(scene.scrollTo ?? "article"));
    if (framed === null) throw new Error(`${scene.name}/${vpName}: nothing to frame`);
    await new Promise((r) => setTimeout(r, 150));

    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    const file = join(OUT_DIR, `${vpName}-${scene.name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`  wrote ${file}`);
  }
}

ws.close();

// A caption file travels with the images: a screenshot without the sentence that says which state
// it is and why it is that state is a picture, not evidence.
//
// It is written from SCENES rather than from what this run happened to produce, because the error
// scene needs a different server — two runs, one set of pictures. Written from the run, the second
// invocation would leave a README describing a single image.
const rows = [];
for (const scene of SCENES) {
  for (const vpName of scene.viewports) {
    const path = join(OUT_DIR, `${vpName}-${scene.name}.png`);
    const present = existsSync(path);
    rows.push(
      `| \`${vpName}-${scene.name}.png\` | ${present ? "present" : "**missing**"} | ${scene.caption} |`,
    );
  }
}

const readme = [
  "# Real-state screenshots",
  "",
  "Produced by `npm run ui:capture` (`tools/ui-capture.mjs`), which drives the real UI over the",
  "Chrome DevTools Protocol: it waits for React to hydrate, types an address, submits the form, waits",
  "for the state machine to settle, **asserts the state is the one the scene claims**, and only then",
  "captures. Nothing here is assembled for the picture, and a scene that settles on the wrong state",
  "is refused rather than written.",
  "",
  "| File | Status | State |",
  "|---|---|---|",
  ...rows,
  "",
  "## The error state needs a second server, on purpose",
  "",
  "`desktop-verification-error.png` is a real infrastructure failure, not a mocked one. It is",
  "captured against a server started with an unreachable RPC:",
  "",
  "```",
  "STORY_RPC_URL=http://127.0.0.1:9 npm start -- -p 4174",
  "node tools/ui-capture.mjs http://localhost:4174/ qa-screens verification-error",
  "```",
  "",
  "The tool refuses to produce that scene against a healthy server, and refuses the others against",
  "an unhealthy one — a screenshot of a state the app cannot actually produce is a drawing.",
].join("\n");
writeFileSync(join(OUT_DIR, "README.md"), readme);
console.log(`\nwrote ${join(OUT_DIR, "README.md")}`);
