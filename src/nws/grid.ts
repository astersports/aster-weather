/**
 * The NWS forecast grid: `forecastGridData` layers, each a list of values over
 * ISO 8601 intervals (`validTime` = `start/duration`). Parsing and lookup are
 * pure; `getGrid` is the one fetch, cached like the point lookup.
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, bindOnError } from "../helpers.js";
import { FRESH_MS, MAX_AGE_MS, type EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
import { nwsJson } from "./http.js";
import { getPoint } from "./point.js";

/** One grid value over `[start, end)`. `value` is `null` when NWS gave none. */
export interface GridBlock {
  start: number;
  end: number;
  value: number | null;
}

const DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/;

const HOUR_MS = 3600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

/** An ISO 8601 duration (days, hours, minutes) in ms, or null when unparsable or empty. */
function durationMs(iso: string): number | null {
  const m = DURATION.exec(iso);
  if (!m) return null;
  const [, d, h, min] = m;
  if (d === undefined && h === undefined && min === undefined) return null;
  return (
    Number(d ?? 0) * DAY_MS + Number(h ?? 0) * HOUR_MS + Number(min ?? 0) * MINUTE_MS
  );
}

/**
 * Blocks of one grid layer, sorted by start. Anything that is not an object
 * with a `values` array gives `[]`. An entry whose interval does not parse is
 * skipped; a non-finite value becomes `null`.
 */
export function parseGridLayer(layer: unknown): GridBlock[] {
  const values = rec(layer)?.values;
  if (!Array.isArray(values)) return [];
  const blocks: GridBlock[] = [];
  for (const entry of values) {
    const e = rec(entry);
    if (!e || typeof e.validTime !== "string") continue;
    const parts = e.validTime.split("/");
    if (parts.length !== 2) continue;
    const start = Date.parse(parts[0]!);
    const span = durationMs(parts[1]!);
    if (Number.isNaN(start) || span === null) continue;
    const value = typeof e.value === "number" && Number.isFinite(e.value) ? e.value : null;
    blocks.push({ start, end: start + span, value });
  }
  return blocks.sort((a, b) => a.start - b.start);
}

/** The value of the block with `start <= t < end`; `null` when none contains `t`. */
export function gridValueAt(blocks: GridBlock[], t: number): number | null {
  const hit = blocks.find((b) => b.start <= t && t < b.end);
  return hit ? hit.value : null;
}

const gridCache = new WeatherCache<Record<string, GridBlock[]> | null>(
  FRESH_MS.hourly,
  200,
  RESILIENT_CACHE,
);

/** At most four decimals, trailing zeros dropped: the same key as the point cache. */
const fmt = (v: number): string => String(Number(v.toFixed(4)));

/** Every layer under `properties` that has a `values` array, parsed. */
function parseGridBody(body: unknown): Record<string, GridBlock[]> {
  const props = rec(rec(body)?.properties);
  if (!props) throw new Error("NWS grid: no properties");
  const out: Record<string, GridBlock[]> = {};
  for (const [name, layer] of Object.entries(props)) {
    if (Array.isArray(rec(layer)?.values)) out[name] = parseGridLayer(layer);
  }
  return out;
}

/**
 * The forecast grid for a coordinate, layer by layer, or `null` when the point
 * is outside coverage or the grid could not be read. Never throws.
 */
export async function getGrid(
  coords: Coords,
  opts: EngineOptions = {},
): Promise<Record<string, GridBlock[]> | null> {
  const { lat, lon } = coords;
  const point = await getPoint(coords, opts);
  if (!point) return null;
  const now = opts.now ?? Date.now;
  const key = `${fmt(lat)},${fmt(lon)}`;
  const meta = await gridCache.getWithMeta(
    key,
    async () => {
      const body = await nwsJson(point.forecastGridData, opts);
      if (body === null) throw new Error("NWS grid: 404");
      return parseGridBody(body);
    },
    null,
    bindOnError(opts, "getGrid", lat, lon),
    MAX_AGE_MS.hourly,
    now,
  );
  return meta.data;
}

/** Test hook: clear every cached grid. */
export function clearGridCache(): void {
  gridCache.clear();
}
