/**
 * The local calendar date (YYYY-MM-DD) of an instant in an IANA time zone, or
 * `null` when the zone is unusable. Shared by the sun and radar code, so a
 * venue's "today" is the same date everywhere. Never throws.
 */
export function localDay(ms: number, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}
