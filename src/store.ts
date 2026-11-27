/**
 * Optional consumer-supplied last-good store. The engine reads and writes
 * serialized readings through this interface; it holds no state of its own
 * beyond the in-process cache. Default: none.
 */
export interface WeatherStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/**
 * Read a last-good reading written by `writeLastGood`. Returns `null` for every
 * case that is not a usable reading: no store, a missing key, a value that is
 * not JSON, no finite `fetchedAt`, older than `maxAgeMs`, or a `get()` that
 * rejects or throws. Never throws.
 */
export async function readLastGood<T>(
  store: WeatherStore | undefined,
  key: string,
  maxAgeMs: number,
  now: number,
): Promise<{ data: T; fetchedAt: number } | null> {
  if (!store) return null;
  let raw: string | null;
  try {
    raw = await store.get(key);
  } catch {
    return null;
  }
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { fetchedAt, data } = parsed as { fetchedAt?: unknown; data?: unknown };
  if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return null;
  if (now - fetchedAt > maxAgeMs) return null;
  return { data: data as T, fetchedAt };
}

/**
 * Save a reading as `{ fetchedAt, data }`. Fire and forget: never throws and
 * never leaves a rejected promise behind. Does nothing without a store.
 */
export function writeLastGood<T>(
  store: WeatherStore | undefined,
  key: string,
  data: T,
  now: number,
): void {
  if (!store) return;
  try {
    const pending = store.set(key, JSON.stringify({ fetchedAt: now, data }));
    void Promise.resolve(pending).catch(() => {});
  } catch {
    // A throwing set() is swallowed: the last-good store is best effort.
  }
}
