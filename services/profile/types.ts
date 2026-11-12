/**
 * Shared use-case result shape for services/profile/*. Framework-independent
 * (ARCHITECTURE.md's services/ responsibility: orchestrate validation + data
 * access, no React/Next.js/browser API of its own) so it can be called
 * identically from a Server Action or, later, a test.
 */
export type ServiceResult =
  { success: true } | { success: false; error: string; fieldErrors?: Record<string, string[]> };
