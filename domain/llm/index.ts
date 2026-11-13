import { z } from "zod";

export const LLM_PROVIDER_CODES = ["gemini", "openai", "anthropic", "cloudflare"] as const;
export type LlmProviderCode = (typeof LLM_PROVIDER_CODES)[number];

export type LlmProviderInfo = {
  code: LlmProviderCode;
  name: string;
  defaultModel: string;
  needsAccountId: boolean;
  keyHelp: string;
};

/** The providers offered on the admin page. Add an entry + an adapter in lib/llm to support another. */
export const LLM_PROVIDERS: readonly LlmProviderInfo[] = [
  {
    code: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    needsAccountId: false,
    keyHelp: "Create a key at aistudio.google.com/apikey (billing must be enabled).",
  },
  {
    code: "openai",
    name: "OpenAI (GPT)",
    defaultModel: "gpt-4.1-mini",
    needsAccountId: false,
    keyHelp: "Create a key at platform.openai.com/api-keys.",
  },
  {
    code: "anthropic",
    name: "Anthropic Claude",
    defaultModel: "claude-haiku-5-5",
    needsAccountId: false,
    keyHelp: "Create a key at console.anthropic.com.",
  },
  {
    code: "cloudflare",
    name: "Cloudflare Workers AI",
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    needsAccountId: true,
    keyHelp:
      "Needs your Cloudflare Account ID and an API token with the Workers AI permission (dash.cloudflare.com).",
  },
];

export function getProviderInfo(code: string): LlmProviderInfo | undefined {
  return LLM_PROVIDERS.find((p) => p.code === code);
}

export const addLlmKeySchema = z
  .object({
    provider: z.enum(LLM_PROVIDER_CODES, "Select a provider"),
    label: z.string().trim().min(1, "Give the key a name").max(60),
    apiKey: z
      .string()
      .trim()
      .min(8, "That key looks too short")
      .max(500, "That key looks too long")
      .regex(/^\S+$/, "A key cannot contain spaces"),
    model: z
      .string()
      .trim()
      .max(100)
      .regex(/^[A-Za-z0-9@._:/-]*$/, "Model name has invalid characters")
      .optional(),
    accountId: z
      .string()
      .trim()
      .regex(/^([a-f0-9]{32})?$/i, "Cloudflare Account ID is 32 hex characters")
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (getProviderInfo(v.provider)?.needsAccountId && !v.accountId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "Account ID is required" });
    }
  });

export const llmCredentialActionSchema = z.object({
  id: z.uuid("Invalid key"),
  action: z.enum(["use", "remove"]),
});
