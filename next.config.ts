import type { NextConfig } from "next";

// Phase 12 (security hardening), fulfilling the deferred intent documented
// in SECURITY.md §29. HSTS is production-only (needs HTTPS confirmed
// stable first); the other four headers below are safe everywhere and
// don't affect script execution or dev tooling.
//
// Content-Security-Policy is NOT set here — it's generated per-request in
// lib/supabase/middleware.ts instead, using Next's documented nonce
// pattern. That requires every page to render dynamically (a static page
// has no request to read a nonce from at all), which is why
// app/layout.tsx sets `export const dynamic = "force-dynamic"` — a
// deliberate, explicit product decision (see docs/PROJECT_STATUS.md's
// Phase 12 section for the full account of what was tried, what broke, and
// why this specific approach was chosen over `'unsafe-inline'` or leaving
// CSP unset).
const productionOnlyHeaders =
  process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : [];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pins the project root explicitly so Turbopack doesn't misidentify it by
  // walking up to an unrelated lockfile in a parent directory.
  turbopack: {
    root: import.meta.dirname,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          ...productionOnlyHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
