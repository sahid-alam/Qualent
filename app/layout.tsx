import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
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
