// Phase 7 (ingestion). SECURITY.md §10's SSRF protection is the
// highest-risk piece of this phase — table-driven tests for every address
// class the spec explicitly names (RFC1918, loopback, link-local, cloud
// metadata) plus the classes it implies (carrier-grade NAT, multicast,
// IPv4-mapped IPv6) before this logic is ever wired to a real fetch.
import { describe, expect, it } from "vitest";
import { isPrivateOrReservedIpv4, isPrivateOrReservedIpv6 } from "@/lib/ingestion/safe-fetch";

describe("isPrivateOrReservedIpv4", () => {
  const privateAddresses = [
    ["10.0.0.1", "RFC1918 10.0.0.0/8"],
    ["10.255.255.255", "RFC1918 10.0.0.0/8 upper bound"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.255", "loopback range"],
    ["169.254.169.254", "cloud metadata endpoint (AWS/GCP/Azure)"],
    ["169.254.0.1", "link-local"],
    ["172.16.0.1", "RFC1918 172.16.0.0/12 lower bound"],
    ["172.31.255.255", "RFC1918 172.16.0.0/12 upper bound"],
    ["192.168.0.1", "RFC1918 192.168.0.0/16"],
    ["192.168.255.255", "RFC1918 192.168.0.0/16 upper bound"],
    ["0.0.0.0", "this network"],
    ["100.64.0.1", "carrier-grade NAT 100.64.0.0/10"],
    ["100.127.255.255", "carrier-grade NAT upper bound"],
    ["192.0.0.1", "IETF protocol assignments"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast/reserved"],
  ] as const;

  it.each(privateAddresses)("blocks %s (%s)", (ip) => {
    expect(isPrivateOrReservedIpv4(ip)).toBe(true);
  });

  const publicAddresses = [
    ["8.8.8.8", "public DNS"],
    ["1.1.1.1", "public DNS"],
    ["172.15.255.255", "just below the 172.16.0.0/12 private range"],
    ["172.32.0.0", "just above the 172.16.0.0/12 private range"],
    ["169.253.255.255", "just below link-local"],
    ["100.63.255.255", "just below carrier-grade NAT range"],
    ["100.128.0.0", "just above carrier-grade NAT range"],
    ["203.0.113.5", "TEST-NET-3, treated as ordinary public space by this classifier"],
  ] as const;

  it.each(publicAddresses)("allows %s (%s)", (ip) => {
    expect(isPrivateOrReservedIpv4(ip)).toBe(false);
  });

  it("treats a malformed address as unsafe (fails closed)", () => {
    expect(isPrivateOrReservedIpv4("not-an-ip")).toBe(true);
    expect(isPrivateOrReservedIpv4("1.2.3")).toBe(true);
    expect(isPrivateOrReservedIpv4("1.2.3.4.5")).toBe(true);
  });
});

describe("isPrivateOrReservedIpv6", () => {
  it("blocks loopback ::1", () => {
    expect(isPrivateOrReservedIpv6("::1")).toBe(true);
  });

  it("blocks the unspecified address ::", () => {
    expect(isPrivateOrReservedIpv6("::")).toBe(true);
  });

  it("blocks link-local fe80::/10", () => {
    expect(isPrivateOrReservedIpv6("fe80::1")).toBe(true);
  });

  it("blocks unique local fc00::/7 (both fc and fd)", () => {
    expect(isPrivateOrReservedIpv6("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIpv6("fd12:3456::1")).toBe(true);
  });

  it("re-checks the embedded address of an IPv4-mapped IPv6 address", () => {
    expect(isPrivateOrReservedIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIpv6("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIpv6("::ffff:8.8.8.8")).toBe(false);
  });

  it("allows an ordinary public IPv6 address", () => {
    expect(isPrivateOrReservedIpv6("2001:4860:4860::8888")).toBe(false); // Google public DNS
  });
});
