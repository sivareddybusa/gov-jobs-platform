import { Badge } from "@/components/ui/badge";
import type { EligibilityStatus } from "@/domain/eligibility";

const LABELS: Record<EligibilityStatus, string> = {
  eligible: "Eligible",
  not_eligible: "Not eligible",
  needs_verification: "Needs verification",
};

const TONES: Record<EligibilityStatus, "green" | "red" | "amber"> = {
  eligible: "green",
  not_eligible: "red",
  needs_verification: "amber",
};

/** PRD.md §11/§10.2: the platform never claims certainty it doesn't have — "needs_verification" is a real, distinct badge, never silently folded into eligible/not_eligible. */
export function EligibilityBadge({ status }: { status: EligibilityStatus }) {
  return <Badge tone={TONES[status]}>{LABELS[status]}</Badge>;
}
