import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const wasmDir = join(root, "public", "cdr-wasm");
const requiredAssets = ["cb-mpc-tdh2.mjs", "cb-mpc-tdh2.wasm"];

for (const asset of requiredAssets) {
  const path = join(wasmDir, asset);
  if (!existsSync(path)) throw new Error(`Missing prepared CDR browser asset: ${path}`);
}

const loaderPath = join(
  root,
  "node_modules",
  "@piplabs",
  "cdr-crypto",
  "dist",
  "esm",
  "wasm",
  "loader.js",
);
const pathsPath = join(
  root,
  "node_modules",
  "@piplabs",
  "cdr-crypto",
  "dist",
  "esm",
  "wasm",
  "wasm-paths.js",
);

const loader = readFileSync(loaderPath, "utf8");
const paths = readFileSync(pathsPath, "utf8");

if (!loader.includes('new Function("specifier", "return import(specifier);")')) {
  throw new Error("CDR loader was not patched to use a native runtime import.");
}
if (loader.includes('import(wasmShimSpecifier)')) {
  throw new Error("The bundler-visible computed CDR WASM import is still present.");
}
if (!paths.includes('"/cdr-wasm/cb-mpc-tdh2.wasm"')) {
  throw new Error("CDR WASM binary URL is not patched to the stable public asset.");
}
if (!paths.includes('"/cdr-wasm/cb-mpc-tdh2.mjs"')) {
  throw new Error("CDR WASM shim URL is not patched to the stable public asset.");
}

const staticRoot = join(root, ".next", "static");
let badDynamicImport = false;
let filesScanned = 0;

function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.name.endsWith(".js")) {
      filesScanned += 1;
      const source = readFileSync(path, "utf8");
      if (source.includes("Cannot find module as expression is too dynamic")) {
        badDynamicImport = true;
      }
    }
  }
}

if (existsSync(staticRoot)) scan(staticRoot);

if (badDynamicImport) {
  throw new Error("The production browser bundle still contains Turbopack's dynamic-module failure.");
}

console.log(`CDR browser bundle verification passed; scanned ${filesScanned} JS chunks.`);
