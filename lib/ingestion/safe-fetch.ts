import "server-only";

import dns from "node:dns/promises";
import net from "node:net";

// SECURITY.md §10 "SSRF protections for server-side fetches": resolve the
// hostname and reject private/internal IP ranges before connecting; never
// blindly follow a redirect to a different host without re-validating it
// the same way; enforce a request timeout and response size cap; only
// https:// is ever fetched.

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25MB — generous for a govt notice PDF, still bounded.

export class SafeFetchError extends Error {}

export function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformed -> treat as unsafe
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // "this network"
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast/reserved (224.0.0.0+)
  return false;
}

export function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized === "::") return true; // unspecified
  if (
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9")
  )
    return true; // link-local fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local fc00::/7
  if (normalized.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — re-check the embedded IPv4 address.
    const embedded = normalized.slice("::ffff:".length);
    if (net.isIPv4(embedded)) return isPrivateOrReservedIpv4(embedded);
  }
  return false;
}

async function assertHostIsPublic(hostname: string): Promise<void> {
  // A bare IP literal in the URL — validate it directly without a DNS lookup.
  if (net.isIP(hostname)) {
    const unsafe = net.isIPv4(hostname)
      ? isPrivateOrReservedIpv4(hostname)
      : isPrivateOrReservedIpv6(hostname);
    if (unsafe)
      throw new SafeFetchError(`Refusing to fetch a private/reserved IP address: ${hostname}`);
    return;
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SafeFetchError("Refusing to fetch localhost.");
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new SafeFetchError(`Could not resolve hostname: ${hostname}`);
  }
  if (addresses.length === 0)
    throw new SafeFetchError(`Hostname resolved to no addresses: ${hostname}`);

  for (const address of addresses) {
    const unsafe = net.isIPv4(address)
      ? isPrivateOrReservedIpv4(address)
      : isPrivateOrReservedIpv6(address);
    if (unsafe) {
      throw new SafeFetchError(
        `Hostname ${hostname} resolves to a private/reserved address (${address}).`,
      );
    }
  }
}

async function assertUrlIsSafe(url: URL): Promise<void> {
  if (url.protocol !== "https:") {
    throw new SafeFetchError(`Only https:// URLs are fetched (got ${url.protocol}).`);
  }
  if (url.username || url.password) {
    throw new SafeFetchError("Refusing to fetch a URL containing embedded credentials.");
  }
  await assertHostIsPublic(url.hostname);
}

export type SafeFetchResult = {
  body: Buffer;
  contentType: string | null;
  finalUrl: string;
};

/**
 * Fetches a URL with SSRF protections: https-only, DNS-resolved and
 * checked against private/reserved IP ranges before every connection
 * (including after each redirect hop — `redirect: "manual"` plus a
 * bounded manual loop, never the runtime's own automatic redirect
 * following), a response size cap enforced by streaming (not a
 * post-download check), and a request timeout. Used only by the admin
 * ingestion pipeline (SECURITY.md §10) — never reachable from an
 * unauthenticated or non-admin request path.
 */
export async function safeFetch(
  inputUrl: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let currentUrl: URL;
  try {
    currentUrl = new URL(inputUrl);
  } catch {
    throw new SafeFetchError("Invalid URL.");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertUrlIsSafe(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "gov-jobs-platform-ingestion/1.0 (+admin-triggered document fetch)",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    // Manual redirect handling: never auto-follow. Each hop is
    // independently re-validated against the same SSRF checks — a URL
    // that starts on an allow-listed-looking host but redirects to an
    // internal address must not be followed blindly.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SafeFetchError("Redirect response with no Location header.");
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new SafeFetchError(`Fetch failed with status ${response.status}.`);
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > maxBytes) {
      throw new SafeFetchError(`Response exceeds the ${maxBytes}-byte size cap (Content-Length).`);
    }

    if (!response.body) {
      throw new SafeFetchError("Response had no body.");
    }

    // Streamed size enforcement — the size cap is checked as bytes arrive,
    // not only after a full download completes, so an unbounded/lying
    // Content-Length can't be used to exhaust memory.
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SafeFetchError(
          `Response exceeded the ${maxBytes}-byte size cap while streaming.`,
        );
      }
      chunks.push(value);
    }

    return {
      body: Buffer.concat(chunks),
      contentType: response.headers.get("content-type"),
      finalUrl: currentUrl.toString(),
    };
  }

  throw new SafeFetchError(`Exceeded the maximum of ${MAX_REDIRECTS} redirects.`);
}
