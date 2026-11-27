/**
 * Shared per-coordinate fetch cache — the single home for the cache + TTL +
 * in-flight dedup + stale-on-error behavior that used to be triplicated across
 * forecast.ts / current.ts / daily.ts (audit pattern ε).
 *
 * Guarantees, all locked by tests:
 *  - **TTL:** a value newer than `ttlMs` short-circuits without a fetch.
 *  - **Bounded (LRU):** at most `maxEntries` keys are retained; the least-
 *    recently-used entry is evicted on insert (WX-P2-7 — the old Maps grew
 *    without bound in a long-running multi-venue server).
 *  - **In-flight dedup:** concurrent misses on the same key share one fetch.
 *  - **Stale-on-error:** if the loader throws, the last-known-good value is
 *    served (without refreshing its timestamp, so the next call still retries);
 *    if there is none, `empty` is returned. The engine never throws to callers.
 *  - **Retry (M5, v0.5.0):** the loader is retried up to `behavior.retries`
 *    times with a fixed backoff before falling through to stale-or-empty, so a
 *    single transient blip doesn't serve stale for the whole TTL window.
 *  - **Stale-while-revalidate (M6, v0.5.0):** when `behavior.swr` is on and an
 *    expired-but-present entry exists, it is served IMMEDIATELY and a background
 *    refresh runs (deduped), so no interactive caller blocks on a cold fetch
 *    once the key is warm.
 *  - **onError (M1, v0.5.0):** the optional per-call `onError` fires ONCE when a
 *    fetch ultimately fails (after retries), immediately before the stale/empty
 *    fallback — the single channel that makes an Open-Meteo outage observable.
 */

import { safeReport } from "./helpers.js";

/** Cache resilience behavior (M5 retry + M6 SWR), configured per cache instance. */
export interface CacheBehavior {
  /** Retry the loader this many times before falling back to stale/empty. Default 0. */
  retries?: number;
  /** Fixed backoff between retries, in ms. Default 0. */
  retryBackoffMs?: number;
  /** Stale-while-revalidate: serve an expired entry now, refresh in background. Default false. */
  swr?: boolean;
  /** Injectable sleep (tests inject a controllable one). Default real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

/** `freshFor` read from the value; a throw means the cache's own ttl (the engine never throws). */
function freshOrTtl<T>(freshFor: (data: T) => number, data: T, ttlMs: number): number {
  try {
    return freshFor(data);
  } catch {
    return ttlMs;
  }
}

/**
 * A reading is fresh only while the clock is at or after the fetch and less than the limit past it. A clock that stepped back (negative age) is not fresh, so a reading "from the future" is refetched, not served as fresh for as long as the step lasted (B-017).
 */
const isFresh = (age: number, limit: number): boolean => age >= 0 && age < limit;

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A value with its fetch time and whether it is a stale fallback (see getWithMeta). */
export interface CacheMeta<T> {
  data: T;
  fetchedAt: number;
  stale: boolean;
}

export class WeatherCache<T> {
  private store = new Map<string, { data: T; fetchedAt: number }>();
  /** Blocking cold-fetch dedup (a caller with no cached value to fall back on). */
  private inflight = new Map<string, Promise<T>>();
  /** Blocking dedup for getWithMeta (its jobs resolve to CacheMeta, not T). */
  private metaInflight = new Map<string, Promise<CacheMeta<T>>>();
  /** SWR background-refresh dedup — kept separate so it never satisfies a cold caller. */
  private refreshing = new Set<string>();

  private readonly retries: number;
  private readonly retryBackoffMs: number;
  private readonly swr: boolean;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = 200,
    behavior: CacheBehavior = {},
  ) {
    this.retries = behavior.retries ?? 0;
    this.retryBackoffMs = behavior.retryBackoffMs ?? 0;
    this.swr = behavior.swr ?? false;
    this.sleep = behavior.sleep ?? realSleep;
  }

  /**
   * Return the cached value for `key` if fresh; otherwise run `loader` (with
   * in-flight dedup + bounded retry) and cache its result. On loader failure,
   * serve stale-or-`empty` and fire `onError` once. `loader` should throw on any
   * failure so the stale fallback fires. With SWR on, an expired-but-present
   * entry is returned immediately while a background refresh runs.
   */
  async get(
    key: string,
    loader: () => Promise<T>,
    empty: T,
    onError?: (err: unknown) => void,
    now: () => number = Date.now,
  ): Promise<T> {
    const cached = this.store.get(key);
    if (cached && isFresh(now() - cached.fetchedAt, this.ttlMs)) {
      // LRU touch: re-insert so this key is now most-recently-used.
      this.store.delete(key);
      this.store.set(key, cached);
      return cached.data;
    }

    // SWR: expired but we have a last-known-good — serve it now, refresh behind.
    if (this.swr && cached) {
      this.backgroundRefresh(key, loader, onError);
      return cached.data;
    }

    // Cold miss (or SWR off): block, deduped, with retry + stale-on-error.
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const job = (async (): Promise<T> => {
      try {
        return (await this.runWithRetry(key, loader)).data;
      } catch (err) {
        safeReport(onError, err);
        // Stale-on-error: last-known-good if present (timestamp NOT refreshed,
        // so the entry stays expired and the next call retries), else empty.
        return cached?.data ?? empty;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, job);
    return job;
  }

  /**
   * Age-bounded read for callers that must know how old a value is.
   *
   * - A fresh entry (younger than the TTL) is returned with `stale: false`.
   * - Otherwise the loader runs (deduped, with the same bounded retry). On
   *   success the value is cached with `fetchedAt` = the time of this fetch.
   * - If the loader ultimately fails, `onError` fires once. An entry no older
   *   than `maxStaleMs` is returned with `stale: true` and its timestamp is NOT
   *   refreshed. An older entry is dropped. With no usable entry, `empty` is
   *   returned with `stale: false`.
   *
   * Unlike `get()`, an expired entry is never returned before the loader has
   * been tried (no stale-while-revalidate), so an expired reading is never
   * shown as fresh. Never throws.
   *
   * `now` supplies the clock for both age checks and fetch times.
   *
   * `freshFor`, when given, reads how long a cached value stays fresh, from the
   * value itself. The result is capped by the cache's own TTL, so it can only
   * shorten freshness. Without it the TTL alone decides.
   */
  async getWithMeta(
    key: string,
    loader: () => Promise<T>,
    empty: T,
    onError?: (err: unknown) => void,
    maxStaleMs: number = Infinity,
    now: () => number = Date.now,
    freshFor?: (data: T) => number,
  ): Promise<CacheMeta<T>> {
    const cached = this.store.get(key);
    const freshMs =
      cached && freshFor ? Math.min(this.ttlMs, freshOrTtl(freshFor, cached.data, this.ttlMs)) : this.ttlMs;
    if (cached && isFresh(now() - cached.fetchedAt, freshMs)) {
      // LRU touch, as in get().
      this.store.delete(key);
      this.store.set(key, cached);
      return { data: cached.data, fetchedAt: cached.fetchedAt, stale: false };
    }

    const existing = this.metaInflight.get(key);
    if (existing) return existing;

    const job = (async (): Promise<CacheMeta<T>> => {
      try {
        const fetched = await this.runWithRetry(key, loader, now);
        return { data: fetched.data, fetchedAt: fetched.at, stale: false };
      } catch (err) {
        safeReport(onError, err);
        // Read the store now, not the value captured before the fetch.
        const entry = this.store.get(key);
        if (entry) {
          if (now() - entry.fetchedAt <= maxStaleMs) {
            return { data: entry.data, fetchedAt: entry.fetchedAt, stale: true };
          }
          this.store.delete(key);
        }
        return { data: empty, fetchedAt: now(), stale: false };
      } finally {
        this.metaInflight.delete(key);
      }
    })();

    this.metaInflight.set(key, job);
    return job;
  }

  /**
   * Read a cached entry without loading anything. A fresh entry comes back
   * `stale: false`; an entry past its freshness but no older than `maxStaleMs`
   * comes back `stale: true`, with its original `fetchedAt`; no entry, or an older
   * one, is `null`. Never calls a loader, never reports, never waits, and never
   * changes the cache.
   *
   * Freshness is decided as in `getWithMeta`: the cache's ttl, shortened by
   * `freshFor` when given (a throw falls back to the ttl).
   */
  peek(
    key: string,
    maxStaleMs: number = Infinity,
    now: () => number = Date.now,
    freshFor?: (data: T) => number,
  ): CacheMeta<T> | null {
    const cached = this.store.get(key);
    if (!cached) return null;
    const freshMs =
      freshFor ? Math.min(this.ttlMs, freshOrTtl(freshFor, cached.data, this.ttlMs)) : this.ttlMs;
    const age = now() - cached.fetchedAt;
    if (isFresh(age, freshMs)) return { data: cached.data, fetchedAt: cached.fetchedAt, stale: false };
    if (age <= maxStaleMs) return { data: cached.data, fetchedAt: cached.fetchedAt, stale: true };
    return null;
  }

  /**
   * Run `loader` with bounded retry. On success, caches + returns the value and
   * the time it was stored; on final failure (after `retries` retries), throws
   * the last error. Each attempt keeps its own downstream timeout budget; a
   * fixed backoff separates attempts.
   */
  private async runWithRetry(
    key: string,
    loader: () => Promise<T>,
    clock: () => number = Date.now,
  ): Promise<{ data: T; at: number }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const data = await loader();
        const at = clock();
        this.set(key, data, at);
        return { data, at };
      } catch (err) {
        lastErr = err;
        if (attempt < this.retries && this.retryBackoffMs > 0) {
          await this.sleep(this.retryBackoffMs);
        }
      }
    }
    throw lastErr;
  }

  /**
   * Fire-and-forget background refresh for SWR. Deduped via `refreshing` so a
   * burst of expired reads triggers a single refresh. On success the fresh value
   * replaces the stale entry; on failure the stale entry is kept and `onError`
   * fires. Never throws (fully wrapped) so it can't become an unhandled rejection.
   */
  private backgroundRefresh(
    key: string,
    loader: () => Promise<T>,
    onError?: (err: unknown) => void,
  ): void {
    if (this.refreshing.has(key)) return;
    this.refreshing.add(key);
    void (async () => {
      try {
        await this.runWithRetry(key, loader);
      } catch (err) {
        safeReport(onError, err);
      } finally {
        this.refreshing.delete(key);
      }
    })();
  }

  private set(key: string, data: T, at: number = Date.now()): void {
    this.store.delete(key);
    this.store.set(key, { data, fetchedAt: at });
    // Evict oldest (Map preserves insertion order) until within bound.
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  /** Remove one key from the store, the in-flight map and the refreshing set. */
  delete(key: string): void {
    this.store.delete(key);
    this.inflight.delete(key);
    this.metaInflight.delete(key);
    this.refreshing.delete(key);
  }

  /** Clear the cache + any in-flight jobs (test hook / consumer sign-out hygiene). */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
    this.metaInflight.clear();
    this.refreshing.clear();
  }
}
