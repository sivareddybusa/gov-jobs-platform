import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { LlmProviderCode } from "@/domain/llm";
import { LlmError, type JsonRequest, type LlmClient } from "./types";

// Large structured outputs (a whole syllabus) can take a while on big models.
const TIMEOUT_MS = 150_000;
const MAX_ATTEMPTS = 2;

/** Removes ```json fences some models add despite instructions. */
export function stripJsonFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (m?.[1] ?? t).trim();
}

/**
 * POSTs JSON to a fixed provider host. Errors carry only the status code:
 * provider bodies and URLs can echo credentials, so they are never surfaced.
 */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let lastError: LlmError = new LlmError("The AI provider did not respond.");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      lastError = new LlmError("The AI provider did not respond.");
      continue; // transient: retry once
    }
    if (!res.ok) {
      lastError = new LlmError(`The AI provider returned HTTP ${res.status}.`);
      if (res.status === 429 || res.status >= 500) continue; // transient: retry once
      throw lastError; // 4xx (bad key, bad request): retrying cannot help
    }
    try {
      return await res.json();
    } catch {
      throw new LlmError("The AI provider returned an unreadable response.");
    }
  }
  throw lastError;
}

function pick(obj: unknown, ...path: Array<string | number>): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur;
}

function asText(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return stripJsonFences(value);
  if (value && typeof value === "object") return JSON.stringify(value); // some APIs return parsed JSON
  throw new LlmError("The AI provider returned no output.");
}

export function geminiClient(apiKey: string, model: string): LlmClient {
  return {
    async generateJson({ system, user, schema }: JsonRequest) {
      const ai = new GoogleGenAI({ apiKey });
      let text: string | undefined;
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: user }] }],
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        });
        text = res.text;
      } catch (e) {
        const status = (e as { status?: number }).status;
        throw new LlmError(
          `The AI provider returned an error${status ? ` (HTTP ${status})` : ""}.`,
        );
      }
      return asText(text);
    },
  };
}

export function openaiClient(apiKey: string, model: string): LlmClient {
  return {
    async generateJson({ system, user, schema }) {
      const json = await postJson(
        "https://api.openai.com/v1/chat/completions",
        { Authorization: `Bearer ${apiKey}` },
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "output", schema, strict: false },
          },
        },
      );
      return asText(pick(json, "choices", 0, "message", "content"));
    },
  };
}

export function anthropicClient(apiKey: string, model: string): LlmClient {
  return {
    async generateJson({ system, user, schema }) {
      const json = await postJson(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        {
          model,
          max_tokens: 4096,
          system: `${system}\n\nRespond with ONLY a JSON object that matches this JSON Schema, with no commentary:\n${JSON.stringify(schema)}`,
          messages: [{ role: "user", content: user }],
        },
      );
      return asText(pick(json, "content", 0, "text"));
    },
  };
}

export function cloudflareClient(apiKey: string, model: string, accountId: string): LlmClient {
  return {
    async generateJson({ system, user, schema }) {
      if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new LlmError("Invalid Cloudflare account ID.");
      const json = await postJson(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        { Authorization: `Bearer ${apiKey}` },
        {
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_schema", json_schema: schema },
          // Workers AI defaults to 256 output tokens, which truncates JSON mid-object.
          max_tokens: 4096,
          temperature: 0,
        },
      );
      return asText(pick(json, "result", "response"));
    },
  };
}

export function createClient(
  provider: LlmProviderCode,
  apiKey: string,
  model: string,
  accountId?: string | null,
): LlmClient {
  switch (provider) {
    case "gemini":
      return geminiClient(apiKey, model);
    case "openai":
      return openaiClient(apiKey, model);
    case "anthropic":
      return anthropicClient(apiKey, model);
    case "cloudflare":
      return cloudflareClient(apiKey, model, accountId ?? "");
  }
}
