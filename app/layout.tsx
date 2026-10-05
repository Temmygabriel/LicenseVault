import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";

// Locked typography stack (build-spec §45).
// Newsreader — editorial serif display
// IBM Plex Sans — interface
// IBM Plex Mono — addresses, ids, protocol data
const display = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const interfaceSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-interface",
  display: "swap",
});

const dataMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-data",
  display: "swap",
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
