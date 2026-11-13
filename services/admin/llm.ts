import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { addLlmKeySchema, getProviderInfo, llmCredentialActionSchema } from "@/domain/llm";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto/secret-box";
import {
  deleteCredential,
  getCredentialSummary,
  insertCredential,
  setActiveCredential,
} from "@/db/llm-credentials";
import { recordAuditEvent } from "@/lib/audit";
import type { ServiceResult } from "@/services/profile/types";

type DB = SupabaseClient<Database>;

/**
 * LLM key management. `db` MUST be the service-role client (llm_credentials has
 * no RLS policies) and the caller MUST already have passed
 * requireAdminRole("super_admin"). Key values are never logged or audited.
 */
export async function addLlmKeyUseCase(
  db: DB,
  actorId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = addLlmKeySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (!isEncryptionConfigured()) {
    return {
      success: false,
      error: "APP_ENCRYPTION_KEY is not set on the server, so keys cannot be stored safely.",
    };
  }
  const d = parsed.data;
  const info = getProviderInfo(d.provider)!;
  const { data, error } = await insertCredential(db, {
    provider: d.provider,
    label: d.label,
    encrypted_key: encryptSecret(d.apiKey),
    key_last4: d.apiKey.slice(-4),
    account_id: info.needsAccountId ? (d.accountId ?? null) : null,
    model: d.model || info.defaultModel,
    created_by: actorId,
  });
  if (error || !data) return { success: false, error: "Could not save the key." };
  await recordAuditEvent({
    actorId,
    eventType: "llm.key_added",
    entityTable: "llm_credentials",
    entityId: data.id,
    metadata: { provider: d.provider, label: d.label },
  });
  return { success: true };
}

export async function llmKeyActionUseCase(
  db: DB,
  actorId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = llmCredentialActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { id, action } = parsed.data;
  const cred = await getCredentialSummary(db, id);
  if (!cred) return { success: false, error: "Key not found." };

  if (action === "use") {
    const { error } = await setActiveCredential(db, id);
    if (error) return { success: false, error: "Could not switch the active key." };
  } else {
    const { error } = await deleteCredential(db, id);
    if (error) return { success: false, error: "Could not remove the key." };
  }
  await recordAuditEvent({
    actorId,
    eventType: action === "use" ? "llm.key_activated" : "llm.key_removed",
    entityTable: "llm_credentials",
    entityId: id,
    metadata: { provider: cred.provider, label: cred.label },
  });
  return { success: true };
}
