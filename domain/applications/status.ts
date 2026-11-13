/** Application Tracker statuses. Order is the typical progression. */
export const APPLICATION_STATUSES = [
  "interested",
  "preparing",
  "applied",
  "admit_card_released",
  "exam_scheduled",
  "result_awaited",
  "selected",
  "not_selected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  interested: "Interested",
  preparing: "Preparing",
  applied: "Applied",
  admit_card_released: "Admit card released",
  exam_scheduled: "Exam scheduled",
  result_awaited: "Result awaited",
  selected: "Selected",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

/** Statuses after which no further progress is expected. */
export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "selected",
  "not_selected",
  "withdrawn",
];

export function isTerminalApplicationStatus(status: ApplicationStatus): boolean {
  return TERMINAL_APPLICATION_STATUSES.includes(status);
}
