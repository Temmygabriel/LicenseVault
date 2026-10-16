import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const packageWasmDir = join(
  root,
  "node_modules",
  "@piplabs",
  "cdr-crypto",
  "dist",
  "esm",
  "wasm",
);
const publicWasmDir = join(root, "public", "cdr-wasm");

const loaderPath = join(packageWasmDir, "loader.js");
const pathsPath = join(packageWasmDir, "wasm-paths.js");
const shimPath = join(packageWasmDir, "cb-mpc-tdh2.mjs");
const binaryPath = join(packageWasmDir, "cb-mpc-tdh2.wasm");

for (const path of [loaderPath, pathsPath, shimPath, binaryPath]) {
  if (!existsSync(path)) {
    throw new Error(`CDR browser asset not found: ${path}`);
  }
}

mkdirSync(publicWasmDir, { recursive: true });

copyFileSync(shimPath, join(publicWasmDir, "cb-mpc-tdh2.mjs"));
copyFileSync(binaryPath, join(publicWasmDir, "cb-mpc-tdh2.wasm"));

let pathsSource = readFileSync(pathsPath, "utf8");
pathsSource = pathsSource.replace(
  /export const wasmBinaryUrl[^;]*;/,
  'export const wasmBinaryUrl = new URL("/cdr-wasm/cb-mpc-tdh2.wasm", globalThis.location.origin);',
);
pathsSource = pathsSource.replace(
  /export const wasmShimSpecifier[^;]*;/,
  'export const wasmShimSpecifier = new URL("/cdr-wasm/cb-mpc-tdh2.mjs", globalThis.location.origin).href;',
);

if (!pathsSource.includes('"/cdr-wasm/cb-mpc-tdh2.wasm"')) {
  throw new Error("Failed to patch the CDR browser WASM binary URL.");
}
if (!pathsSource.includes('"/cdr-wasm/cb-mpc-tdh2.mjs"')) {
  throw new Error("Failed to patch the CDR browser WASM shim URL.");
}
writeFileSync(pathsPath, pathsSource);

let loaderSource = readFileSync(loaderPath, "utf8");
const nativeImport =
  'const shim = await new Function("specifier", "return import(specifier);")(wasmShimSpecifier);';

// The published JS strips TypeScript's type assertion, so patch the emitted JS
// form rather than matching the TypeScript source text from the SDK repository.
const importPatterns = [
  /const shim\s*=\s*[^;\n]*import\(wasmShimSpecifier\)[^;\n]*;/,
];

let patched = false;
for (const pattern of importPatterns) {
  if (pattern.test(loaderSource)) {
    loaderSource = loaderSource.replace(pattern, nativeImport);
    patched = true;
    break;
  }
}

if (!patched && !loaderSource.includes('new Function("specifier", "return import(specifier);")')) {
  throw new Error(
    "Could not find the known CDR WASM import in the installed loader; refusing to patch an unknown SDK version.",
  );
}

writeFileSync(loaderPath, loaderSource);

console.log("Prepared @piplabs/cdr-crypto for the browser:");
console.log("  - copied cb-mpc-tdh2.mjs and cb-mpc-tdh2.wasm to public/cdr-wasm/");
console.log("  - patched browser WASM URLs to stable same-origin paths");
console.log("  - patched the computed import to a native runtime import");
