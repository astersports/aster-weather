/**
 * Optional consumer-supplied last-good store. The engine reads and writes
 * serialized readings through this interface; it holds no state of its own
 * beyond the in-process cache. Default: none.
 */
export interface WeatherStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
