import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cn } from "@/lib/cn";
import "./globals.css";

// Self-hosted at build time by next/font (no request to fonts.googleapis.com
// at runtime) — compatible with the strict script-src 'self' CSP in
// lib/supabase/middleware.ts without any policy change.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Government Jobs Eligibility Platform",
  description:
    "Discover government jobs in India and understand your eligibility. Not a government website — always verify against the official notification.",
};

// Phase 12 (security hardening): forces every route in the app to render
// dynamically, project-wide and inherited by every page/layout underneath
// this root layout — including any added later — rather than annotating
// individual pages with `await connection()`. Required because this
// project's Content-Security-Policy uses per-request nonces
// (lib/supabase/middleware.ts), and Next.js only injects a nonce into a
// page's scripts during server-side rendering of an actual request; a
// statically-generated page has no request/response headers to read a
// nonce from at all (node_modules/next/dist/docs/.../content-security-policy.md),
// so leaving any page static would silently reintroduce the exact breakage
// this was built to fix. The cost — no static optimization/ISR/CDN caching
// anywhere — was a deliberate, explicit product decision (see
// docs/PROJECT_STATUS.md's Phase 12 section), not applied silently.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={cn(inter.className, "antialiased")}>{children}</body>
    </html>
  );
}
