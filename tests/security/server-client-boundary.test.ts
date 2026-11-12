import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Static regression guard for SECURITY.md §8 / Phase 3 §16/§20: no
// client-rendered file may import a server-only module (the service-role
// client, server-only env vars, or anything that itself imports either).
// `server-only` already turns this into a *build* failure (verified by
// `npm run build` succeeding), so this test is a fast, explicit,
// specifically-targeted second check that fails with a clear message
// naming the offending file, rather than relying solely on parsing a full
// production build's output.
const ROOT = join(import.meta.dirname, "..", "..");
const SCAN_DIRS = ["app", "components", "lib"];
const SERVER_ONLY_IMPORT_PATTERNS = [
  "@/lib/supabase/admin",
  "@/lib/env.server",
  "@/lib/auth/require-user",
  "@/lib/auth/profile",
  "@/lib/auth/sign-out-action",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if ([".ts", ".tsx"].includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

describe("server/client module boundary", () => {
  const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    const source = readFileSync(file, "utf-8");
    const isClientComponent = /^["']use client["'];?/m.test(source);
    if (!isClientComponent) continue;

    it(`${file.replace(ROOT + "/", "")} (a client component) does not import a server-only module`, () => {
      for (const pattern of SERVER_ONLY_IMPORT_PATTERNS) {
        expect(source.includes(pattern)).toBe(false);
      }
    });
  }
});
