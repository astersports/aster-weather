import { describe, it, expect } from "vitest";
import { readLastGood, writeLastGood, type WeatherStore } from "../store.js";

function memStore(): WeatherStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async get(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("readLastGood — null in every case the contract names", () => {
  it("returns null with no store", async () => {
    expect(await readLastGood(undefined, "k", 1000, 0)).toBeNull();
  });

  it("returns null for a missing key", async () => {
    expect(await readLastGood(memStore(), "absent", 1000, 0)).toBeNull();
  });

  it("returns null for a value that is not valid JSON", async () => {
    const store = memStore();
    store.map.set("k", "{not json");
    expect(await readLastGood(store, "k", 1000, 0)).toBeNull();
  });

  it("returns null when the parsed value has no numeric fetchedAt", async () => {
    for (const raw of [
      JSON.stringify({ data: 1 }),
      JSON.stringify({ fetchedAt: "123", data: 1 }),
      JSON.stringify({ fetchedAt: null, data: 1 }),
      "null",
      "42",
    ]) {
      const store = memStore();
      store.map.set("k", raw);
      expect(await readLastGood(store, "k", 1000, 0)).toBeNull();
    }
  });

  it("returns null when fetchedAt is not finite", async () => {
    const store = memStore();
    store.map.set("k", '{"fetchedAt":1e999,"data":1}'); // parses to Infinity
    expect(await readLastGood(store, "k", 1000, 0)).toBeNull();
  });

  it("returns null when the value is older than maxAgeMs", async () => {
    const store = memStore();
    writeLastGood(store, "k", { t: 1 }, 0);
    await flush();
    expect(await readLastGood(store, "k", 1000, 1001)).toBeNull();
  });

  it("returns null when the store's get() rejects", async () => {
    const store: WeatherStore = {
      get: async () => {
        throw new Error("boom");
      },
      set: async () => {},
    };
    expect(await readLastGood(store, "k", 1000, 0)).toBeNull();
  });

  it("returns null when the store's get() throws synchronously", async () => {
    const store: WeatherStore = {
      get: () => {
        throw new Error("boom");
      },
      set: async () => {},
    };
    expect(await readLastGood(store, "k", 1000, 0)).toBeNull();
  });
});

describe("readLastGood / writeLastGood — round trip and age bound", () => {
  it("writes the documented envelope and reads it back with its fetch time", async () => {
    const store = memStore();
    writeLastGood(store, "k", { t: 12 }, 1000);
    await flush();
    expect(store.map.get("k")).toBe(JSON.stringify({ fetchedAt: 1000, data: { t: 12 } }));
    expect(await readLastGood<{ t: number }>(store, "k", 5000, 1500)).toEqual({
      data: { t: 12 },
      fetchedAt: 1000,
    });
  });

  it("a value exactly maxAgeMs old is returned; one millisecond older is not", async () => {
    const store = memStore();
    writeLastGood(store, "k", 7, 1000);
    await flush();
    expect(await readLastGood<number>(store, "k", 1000, 2000)).toEqual({ data: 7, fetchedAt: 1000 });
    expect(await readLastGood<number>(store, "k", 1000, 2001)).toBeNull();
  });
});

describe("writeLastGood — never throws, never leaves a rejection", () => {
  it("swallows a rejected set() with no unhandled rejection", async () => {
    const store: WeatherStore = {
      get: async () => null,
      set: async () => {
        throw new Error("disk full");
      },
    };
    expect(() => writeLastGood(store, "k", 1, 0)).not.toThrow();
    await flush(); // an unhandled rejection would fail the run here
  });

  it("swallows a set() that throws synchronously", () => {
    const store: WeatherStore = {
      get: async () => null,
      set: () => {
        throw new Error("boom");
      },
    };
    expect(() => writeLastGood(store, "k", 1, 0)).not.toThrow();
  });

  it("does nothing with an undefined store", () => {
    expect(() => writeLastGood(undefined, "k", { t: 1 }, 0)).not.toThrow();
  });
});
