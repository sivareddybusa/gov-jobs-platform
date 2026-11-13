import { requireAdminRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { listCredentialSummaries } from "@/db/llm-credentials";
import { LLM_PROVIDERS } from "@/domain/llm";
import { isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddKeyForm, KeyActions } from "./provider-forms";

export const metadata = { title: "AI providers · Admin" };

export default async function AiProvidersPage() {
  await requireAdminRole("super_admin");
  const keys = await listCredentialSummaries(createAdminClient());
  const encryptionReady = isEncryptionConfigured();
  const active = keys.find((k) => k.is_active);
  const activeProvider = active ? LLM_PROVIDERS.find((p) => p.code === active.provider) : undefined;
  const envFallback = !active && Boolean(process.env["GEMINI_API_KEY"]);

  return (
    <div>
      <PageHeader
        title="AI providers"
        description="Add API keys for the language models the platform may call. Exactly one key is “In use” at a time; every AI feature uses it."
      />

      <Card className="mb-4 p-3.5 text-sm">
        {active ? (
          <p>
            In use: <strong>{activeProvider?.name ?? active.provider}</strong> · {active.label} ·
            model <code>{active.model}</code>
          </p>
        ) : envFallback ? (
          <p>
            In use: <strong>Google Gemini</strong> from the server&apos;s{" "}
            <code>GEMINI_API_KEY</code> environment variable (fallback). Press Use on a saved key to
            override it.
          </p>
        ) : (
          <p className="text-amber-800">
            No AI provider is in use. AI features (job import, exam sync) are unavailable until you
            add a key and press Use.
          </p>
        )}
      </Card>

      {!encryptionReady ? (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          Keys can&apos;t be stored yet: set <code>APP_ENCRYPTION_KEY</code> on the server (generate
          with <code>openssl rand -base64 32</code>) and restart. Saved keys are encrypted with it.
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {LLM_PROVIDERS.map((p) => {
          const providerKeys = keys.filter((k) => k.provider === p.code);
          return (
            <Card
              key={p.code}
              data-testid={`provider-${p.code}`}
              className="flex flex-col gap-3 p-4"
            >
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{p.name}</h2>
                <p className="text-xs text-gray-500">{p.keyHelp}</p>
              </div>
              {providerKeys.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {providerKeys.map((k) => (
                    <li
                      key={k.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{k.label}</p>
                        <p className="text-xs text-gray-500">
                          ••••{k.key_last4} · {k.model}
                        </p>
                        <Badge tone={k.is_active ? "green" : "gray"} className="mt-1">
                          {k.is_active ? "In use" : "Not in use"}
                        </Badge>
                      </div>
                      <KeyActions id={k.id} isActive={k.is_active} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">No keys added.</p>
              )}
              <AddKeyForm
                provider={p.code}
                defaultModel={p.defaultModel}
                needsAccountId={p.needsAccountId}
                disabled={!encryptionReady}
              />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
