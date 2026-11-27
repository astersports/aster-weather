/**
 * Provenance vocabulary for the NWS engine: what a reading is, how old it may
 * be, and how long a cached value stays fresh.
 */
import type { FetchOptions } from "./types.js";
import type { WeatherStore } from "./store.js";

/** `observed` = a station measurement; `forecast` = the official model forecast. */
export type ReadingKind = "observed" | "forecast";

/** What every engine reading carries so a consumer can label it. */
export interface Stamp {
  kind: ReadingKind;
  /** Epoch ms the reading is for (observation or forecast hour). */
  at: number;
  /** Epoch ms the engine fetched it. */
  fetchedAt: number;
  /** True when served from the last-good store past its freshness window. */
  stale: boolean;
  source: "nws-station" | "nws-forecast" | "noaa-radar";
}

/** Longest a reading may be served at all, per kind of reading. */
export const MAX_AGE_MS = {
  now: 3 * 3600_000,
  hourly: 12 * 3600_000,
  daily: 24 * 3600_000,
  radar: 15 * 60_000,
} as const;

/** How long a fetched value is considered fresh (no refetch inside it). */
export const FRESH_MS = {
  now: 10 * 60_000,
  hourly: 60 * 60_000,
  daily: 60 * 60_000,
  alerts: 5 * 60_000,
  radar: 4 * 60_000,
  point: 24 * 3600_000,
} as const;

/** Shared option type, used by every fetcher. */
export interface EngineOptions extends FetchOptions {
  userAgent?: string; // servers only
  store?: WeatherStore; // last-good readings; default: none
  now?: () => number; // default Date.now
  radar?: boolean; // getNow / getDaily: also ask the radar (Task 8). Default false
}
