import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
const dynamicImport =
  'const shim = (await import(wasmShimSpecifier)) as { default: CreateCbMpcModule };';
const nativeImport =
  'const loadExternalModule = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<{ default: CreateCbMpcModule }>;\n    const shim = await loadExternalModule(wasmShimSpecifier);';

if (loaderSource.includes(dynamicImport)) {
  loaderSource = loaderSource.replace(dynamicImport, nativeImport);
} else if (!loaderSource.includes("loadExternalModule")) {
  throw new Error("The installed CDR loader changed shape; refusing to patch it blindly.");
}

writeFileSync(loaderPath, loaderSource);

console.log("Prepared @piplabs/cdr-crypto for the browser:");
console.log("  - copied cb-mpc-tdh2.mjs and cb-mpc-tdh2.wasm to public/cdr-wasm/");
console.log("  - patched browser WASM URLs to stable same-origin paths");
console.log("  - patched the computed import to a native runtime import");
