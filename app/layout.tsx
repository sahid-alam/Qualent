import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

// Satoshi, the font on www.7gence.com. Self-hosted: it isn't on Google Fonts.
const sans = localFont({
  src: [
    { path: "./fonts/Satoshi-Regular.woff2", weight: "400" },
    { path: "./fonts/Satoshi-Medium.woff2", weight: "500" },
    { path: "./fonts/Satoshi-Bold.woff2", weight: "700" },
  ],
  variable: "--font-satoshi",
});
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = { title: "Qualent" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("qualent_theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" dir="ltr" data-theme={theme} className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-canvas font-sans text-base text-fg">{children}</body>
    </html>
  );
}
