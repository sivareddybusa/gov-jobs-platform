import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getActiveCredential } from "@/db/llm-credentials";
import { getProviderInfo, type LlmProviderCode } from "@/domain/llm";
import { createClient, geminiClient } from "./adapters";
import { LlmError, type ActiveLlm } from "./types";

const ENV_GEMINI_MODEL = "gemini-2.5-flash";

/**
 * The LLM every AI feature must use: the key a super_admin marked "In use" on
 * /admin/ai-providers, else the legacy GEMINI_API_KEY env var, else null.
 */
export async function getActiveLlm(): Promise<ActiveLlm | null> {
  const row = await getActiveCredential(createAdminClient());
  if (row) {
    if (!getProviderInfo(row.provider)) throw new LlmError("The active AI provider is unknown.");
    const apiKey = decryptSecret(row.encrypted_key);
    return {
      client: createClient(row.provider as LlmProviderCode, apiKey, row.model, row.account_id),
      provider: row.provider as LlmProviderCode,
      model: row.model,
    };
  }
  if (serverEnv.GEMINI_API_KEY) {
    return {
      client: geminiClient(serverEnv.GEMINI_API_KEY, ENV_GEMINI_MODEL),
      provider: "env_gemini",
      model: ENV_GEMINI_MODEL,
    };
  }
  return null;
}

export async function requireActiveLlm(): Promise<ActiveLlm> {
  const llm = await getActiveLlm();
  if (!llm) throw new LlmError("No AI provider is configured. A super admin can add one.");
  return llm;
}

export async function isLlmConfigured(): Promise<boolean> {
  try {
    return (await getActiveLlm()) !== null;
  } catch {
    return false;
  }
}
