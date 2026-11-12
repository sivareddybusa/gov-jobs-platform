// Shared helper for reading auth emails from the local Supabase stack's
// Mailpit inbox during E2E tests — real emails, not mocked (Phase 3 §4/§25:
// "do not claim an email was received unless it was actually tested").
const MAILPIT_URL = process.env["E2E_MAILPIT_URL"] ?? "http://127.0.0.1:54324";

export async function findEmail(to: string, subjectContains: string) {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=10`);
  const json = (await res.json()) as {
    messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
  };
  const msg = json.messages.find(
    (m) => m.To.some((t) => t.Address === to) && m.Subject.includes(subjectContains),
  );
  if (!msg) return null;
  const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json()) as {
    HTML: string;
  };
  return full;
}

export function extractAuthConfirmLink(html: string): string | null {
  const match = html.match(/href="([^"]*\/auth\/confirm\?[^"]+)"/);
  return match ? (match[1]?.replace(/&amp;/g, "&") ?? null) : null;
}
