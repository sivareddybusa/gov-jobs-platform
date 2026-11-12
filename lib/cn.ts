/** Joins class names, skipping falsy values. Not worth pulling in clsx/tailwind-merge for this. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
