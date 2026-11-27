/** Longest a reading may be served at all, per kind of reading. */
export const MAX_AGE_MS = {
    now: 3 * 3600_000,
    hourly: 12 * 3600_000,
    daily: 24 * 3600_000,
    radar: 15 * 60_000,
};
/** How long a fetched value is considered fresh (no refetch inside it). */
export const FRESH_MS = {
    now: 10 * 60_000,
    hourly: 60 * 60_000,
    daily: 60 * 60_000,
    alerts: 5 * 60_000,
    radar: 4 * 60_000,
    point: 24 * 3600_000,
};
//# sourceMappingURL=provenance.js.map