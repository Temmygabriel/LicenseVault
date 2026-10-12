import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Locked typography stack (build-spec §45).
// Newsreader — editorial serif display
// IBM Plex Sans — interface
// IBM Plex Mono — addresses, ids, protocol data
//
// ─────────────────────────────────────────────────────────────────────────────
// THESE ARE SELF-HOSTED ON PURPOSE, AND IT IS NOT A STYLE PREFERENCE.
//
// They used to come from `next/font/google`, which downloads them at BUILD time. On 2026-10-12
// that build failed in CI with twelve "Can't resolve '@vercel/turbopack-next/internal/font/
// google/font'" errors — on a commit that changed only markdown — and then passed on a re-run.
// Google rate-limits CI runners, so a red build was a matter of when, not whether.
//
// The bytes are identical either way; `next/font` self-hosted them at runtime in both cases. The
// only thing that changed is that the build no longer depends on someone else's uptime. Regenerate
// with `node tools/fetch-fonts.mjs`; the files are OFL and their provenance is in
// `app/fonts/README.md`.
//
// `adjustFontFallback` is kept explicit so the pre-swap fallback metrics match what the previous
// Google declarations produced — a serif fallback for the serif, sans for the rest. Leaving it
// unset would have quietly changed the swap behaviour the BUILD 6 measurements were taken against.
// ─────────────────────────────────────────────────────────────────────────────

const display = localFont({
  src: [
    { path: "./fonts/Newsreader-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Newsreader-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/Newsreader-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Newsreader-500-italic.woff2", weight: "500", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const interfaceSans = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-interface",
  display: "swap",
  adjustFontFallback: "Arial",
});

const dataMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-data",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: "LicenseVault — A license should open the door",
  description:
    "LicenseVault turns an onchain IP license into a real access permission for protected digital content.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${interfaceSans.variable} ${dataMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
