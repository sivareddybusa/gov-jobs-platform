import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, stripJsonFences } from "@/lib/llm/adapters";
import { addLlmKeySchema } from "@/domain/llm";

afterEach(() => vi.unstubAllGlobals());

const req = { system: "sys", user: "usr", schema: { type: "object" } };

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }) as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("stripJsonFences", () => {
  it("removes markdown fences only", () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe("OpenAI adapter", () => {
  it("sends bearer auth + json_schema and reads the message", async () => {
    const f = mockFetch({ choices: [{ message: { content: '{"ok":true}' } }] });
    const out = await createClient("openai", "sk-secret", "gpt-x").generateJson(req);
    expect(out).toBe('{"ok":true}');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-secret");
    expect(JSON.parse(init.body as string).response_format.type).toBe("json_schema");
  });
});

describe("Anthropic adapter", () => {
  it("uses x-api-key and the messages API", async () => {
    const f = mockFetch({ content: [{ type: "text", text: '```json\n{"ok":1}\n```' }] });
    const out = await createClient("anthropic", "ak-secret", "claude-x").generateJson(req);
    expect(out).toBe('{"ok":1}');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("ak-secret");
  });
});

describe("Cloudflare adapter", () => {
  const acct = "a".repeat(32);
  it("targets the account's ai/run endpoint and reads result.response (string or object)", async () => {
    const f = mockFetch({ result: { response: { ok: 1 } } });
    const out = await createClient("cloudflare", "cf-secret", "@cf/meta/m", acct).generateJson(req);
    expect(JSON.parse(out)).toEqual({ ok: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/meta/m`);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer cf-secret");
    expect(JSON.parse(init.body as string).max_tokens).toBeGreaterThanOrEqual(2048); // not the 256 default
  });
  it("refuses an invalid account id (no request made)", async () => {
    const f = mockFetch({});
    await expect(
      createClient("cloudflare", "k", "@cf/m", "../evil").generateJson(req),
    ).rejects.toThrow(/account ID/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("retries", () => {
  it("retries once on a transient failure, but never on a 4xx", async () => {
    const ok = {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "{}" } }] }),
    };
    const flaky = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce(ok);
    vi.stubGlobal("fetch", flaky);
    expect(await createClient("openai", "k", "m").generateJson(req)).toBe("{}");
    expect(flaky).toHaveBeenCalledTimes(2);

    const badKey = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    vi.stubGlobal("fetch", badKey);
    await expect(createClient("openai", "k", "m").generateJson(req)).rejects.toThrow(/HTTP 401/);
    expect(badKey).toHaveBeenCalledTimes(1);
  });
});

describe("error handling", () => {
  it("reports only the status code, never the provider body or key", async () => {
    mockFetch({ error: "bad key sk-leaky-123" }, false, 401);
    const err = await createClient("openai", "sk-leaky-123", "m")
      .generateJson(req)
      .catch((e: Error) => e);
    expect((err as Error).message).toBe("The AI provider returned HTTP 401.");
    expect((err as Error).message).not.toContain("sk-leaky");
  });
  it("fails cleanly on empty output and network errors", async () => {
    mockFetch({ choices: [{ message: { content: "" } }] });
    await expect(createClient("openai", "k", "m").generateJson(req)).rejects.toThrow(/no output/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("net"))),
    );
    await expect(createClient("openai", "k", "m").generateJson(req)).rejects.toThrow(
      /did not respond/,
    );
  });
});

describe("addLlmKeySchema", () => {
  const base = { provider: "openai", label: "Prod", apiKey: "sk-abcdefgh" };
  it("accepts a valid key and requires an account id for Cloudflare", () => {
    expect(addLlmKeySchema.safeParse(base).success).toBe(true);
    expect(addLlmKeySchema.safeParse({ ...base, provider: "cloudflare" }).success).toBe(false);
    expect(
      addLlmKeySchema.safeParse({ ...base, provider: "cloudflare", accountId: "b".repeat(32) })
        .success,
    ).toBe(true);
  });
  it("rejects spaces, short keys, unknown providers and odd model names", () => {
    expect(addLlmKeySchema.safeParse({ ...base, apiKey: "has space inside" }).success).toBe(false);
    expect(addLlmKeySchema.safeParse({ ...base, apiKey: "short" }).success).toBe(false);
    expect(addLlmKeySchema.safeParse({ ...base, provider: "evil" }).success).toBe(false);
    expect(addLlmKeySchema.safeParse({ ...base, model: "a b;rm" }).success).toBe(false);
  });
});
