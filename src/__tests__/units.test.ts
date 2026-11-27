import { describe, it, expect } from "vitest";
import { cToF, kmhToMph, mmToIn, mToMi, mToFt, paToInHg } from "../units.js";

describe("unit conversions", () => {
  it("converts to the output units", () => {
    expect(cToF(12)).toBeCloseTo(53.6, 6);
    expect(kmhToMph(12.96)).toBeCloseTo(8.053, 2);
    expect(mmToIn(0.254)).toBeCloseTo(0.01, 3);
    expect(mToMi(16093.44)).toBeCloseTo(10, 3);
    expect(mToFt(640.08)).toBeCloseTo(2100, 0);
    expect(paToInHg(100000.06)).toBeCloseTo(29.53, 2);
  });

  it("is null-preserving: null, undefined and NaN all give null", () => {
    const fns = [cToF, kmhToMph, mmToIn, mToMi, mToFt, paToInHg];
    for (const fn of fns) {
      expect(fn(null)).toBeNull();
      expect(fn(undefined)).toBeNull();
      expect(fn(NaN)).toBeNull();
    }
  });

  it("never fabricates a zero for a missing value", () => {
    expect(cToF(null)).not.toBe(0);
    expect(cToF(null)).not.toBe(32);
  });

  it("does not round", () => {
    expect(cToF(0.123456)).toBeCloseTo(32.2222208, 6);
    expect(mToMi(1)).toBeCloseTo(0.000621371, 9);
  });

  it("converts zero to a real zero, not null", () => {
    expect(cToF(0)).toBe(32);
    expect(mmToIn(0)).toBe(0);
  });
});
