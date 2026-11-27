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
export declare function readLastGood<T>(store: WeatherStore | undefined, key: string, maxAgeMs: number, now: number): Promise<{
    data: T;
    fetchedAt: number;
} | null>;
/**
 * Save a reading as `{ fetchedAt, data }`. Fire and forget: never throws and
 * never leaves a rejected promise behind. Does nothing without a store.
 */
export declare function writeLastGood<T>(store: WeatherStore | undefined, key: string, data: T, now: number): void;
//# sourceMappingURL=store.d.ts.map