/**
 * Parse a daily-forecast precipitation string ("55% rain" / "80% snow" /
 * "96% storms") into `{ pct, kind }` for a precipitation heads-up banner.
 * The string is produced by the daily-strip composer as `${pct}% ${rainWord(code)}`
 * (see ./wmo `rainWord`), so the noun already distinguishes rain/snow/storms.
 *
 * Pure. Returns `{ pct: null, kind: null }` when input is empty or
 * unparseable (never fabricate). Merged verbatim (behavior) from aster-sports
 * `parsePrecip`.
 */

export interface ParsedPrecip {
  pct: number | null;
  kind: string | null;
}

export function parsePrecip(rn: unknown): ParsedPrecip {
  if (typeof rn !== "string") return { pct: null, kind: null };
  const m = rn.match(/^(\d+)%\s*([a-z]+)/i);
  if (!m) return { pct: null, kind: null };
  return { pct: Number(m[1]), kind: m[2].toLowerCase() };
}
