# AI providers (switchable LLM)

Super admins manage language-model keys on **Admin → AI providers** (`/admin/ai-providers`). Every AI feature (job-notification import, exam sync) calls `getActiveLlm()` (`lib/llm/resolve.ts`), which returns the single key marked **In use**.

## Providers
Google Gemini, OpenAI (GPT), Anthropic Claude, Cloudflare Workers AI (needs Account ID + token). Add one by extending `domain/llm` (`LLM_PROVIDERS`) and `lib/llm/adapters.ts`.

## Behaviour
- Several keys per provider can be saved. Exactly one is **In use**; pressing **Use** on another atomically switches (RPC `set_active_llm_credential`; a unique partial index makes two active keys impossible). All others show **Not in use**.
- Resolution order: active saved key → legacy `GEMINI_API_KEY` env var (shown as fallback) → none (AI features report "not configured").
- Each adapter returns raw JSON text; callers `JSON.parse` + Zod-validate it. AI output stays untrusted.

## Security
- Keys are encrypted with **AES-256-GCM** (`lib/crypto/secret-box.ts`) using `APP_ENCRYPTION_KEY` (32 random bytes, base64, server env only; `openssl rand -base64 32`). Changing/losing it makes saved keys undecryptable (re-add them).
- `llm_credentials` has RLS enabled with **no policies** and revoked grants: no browser session can read or write it. Only server code with the service role, behind `requireAdminRole("super_admin")`, can.
- The UI is write-only: it shows the name, last 4 characters and model, never the key. Keys are never logged, audited, or placed in error messages (adapters report only the HTTP status).
- Add / use / remove are written to `audit_logs` (provider + label, no key material).
- Adapters call fixed provider hosts only; the Cloudflare account ID is validated as 32 hex characters; model names are validated against a strict pattern.

## Tests
`tests/crypto`, `tests/llm` (mocked fetch: auth headers, endpoints, error redaction), `tests/db/llm-credentials.test.ts` (RLS denial, encryption at rest, single active key, audit), `tests/e2e/ai-providers.spec.ts`. Live calls to each provider are **not** tested (no keys here).
