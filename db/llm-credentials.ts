import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;
export type LlmCredentialRow = Database["public"]["Tables"]["llm_credentials"]["Row"];
/** Everything except the encrypted key: safe to hand to UI code. */
export type LlmCredentialSummary = Omit<LlmCredentialRow, "encrypted_key">;

const SUMMARY_COLUMNS =
  "id, provider, label, key_last4, account_id, model, is_active, created_by, created_at, updated_at";

// All functions here require the SERVICE-ROLE client (the table has no RLS policies).

export async function listCredentialSummaries(db: DB): Promise<LlmCredentialSummary[]> {
  const { data } = await db
    .from("llm_credentials")
    .select(SUMMARY_COLUMNS)
    .order("created_at", { ascending: true });
  return (data as LlmCredentialSummary[] | null) ?? [];
}

export async function getActiveCredential(db: DB): Promise<LlmCredentialRow | null> {
  const { data } = await db.from("llm_credentials").select("*").eq("is_active", true).maybeSingle();
  return data;
}

export async function insertCredential(
  db: DB,
  row: Database["public"]["Tables"]["llm_credentials"]["Insert"],
) {
  return db.from("llm_credentials").insert(row).select(SUMMARY_COLUMNS).single();
}

export async function setActiveCredential(db: DB, id: string) {
  return db.rpc("set_active_llm_credential", { p_id: id });
}

export async function getCredentialSummary(db: DB, id: string) {
  const { data } = await db
    .from("llm_credentials")
    .select(SUMMARY_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data as LlmCredentialSummary | null;
}

export async function deleteCredential(db: DB, id: string) {
  return db.from("llm_credentials").delete().eq("id", id);
}
