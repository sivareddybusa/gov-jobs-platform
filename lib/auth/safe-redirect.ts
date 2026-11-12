/**
 * Only ever returns a same-origin, relative path — never follows a
 * client-supplied absolute/external URL. Used for post-login and
 * post-confirmation redirect targets, which are otherwise a classic
 * open-redirect vector (SECURITY.md §9: validate all external input,
 * including redirect targets, before using it).
 */
export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return fallback;
}
