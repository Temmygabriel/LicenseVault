import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The CDR SDK and its crypto/WASM dependencies are Node-oriented. Keep them
  // out of the browser bundle and out of Next's server bundling so the WASM
  // loader resolves at runtime instead of being traced and rewritten.
  serverExternalPackages: [
    "@piplabs/cdr-sdk",
    "@piplabs/cdr-crypto",
    "@piplabs/cdr-contracts",
  ],
};

export default nextConfig;
