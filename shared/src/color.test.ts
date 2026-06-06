import { describe, it, expect } from "vitest";
import { nextLevel, hexToHue, isLowLevel, LEVELS, type Level } from "./color";

describe("nextLevel", () => {
  it("advances through the scale and wraps empty -> full", () => {
    expect(nextLevel("full")).toBe("three_quarter");
    expect(nextLevel("half")).toBe("quarter");
    expect(nextLevel("empty")).toBe("full");
  });
  it("covers every level exactly once before repeating", () => {
    const seen = new Set<string>();
    let l: Level = LEVELS[0];
    for (let i = 0; i < LEVELS.length; i++) {
      seen.add(l);
      l = nextLevel(l);
    }
    expect(seen.size).toBe(LEVELS.length);
    expect(l).toBe("full");
  });
});

describe("isLowLevel", () => {
  it("flags quarter and below, not half or null", () => {
    expect(isLowLevel("quarter")).toBe(true);
    expect(isLowLevel("almost_out")).toBe(true);
    expect(isLowLevel("empty")).toBe(true);
    expect(isLowLevel("half")).toBe(false);
    expect(isLowLevel(null)).toBe(false);
  });
});

describe("hexToHue", () => {
  it("orders red < green < blue and sends greys to the end", () => {
    expect(hexToHue("#ff0000")).toBeCloseTo(0, 0);
    expect(hexToHue("#00ff00")).toBeCloseTo(120, 0);
    expect(hexToHue("#0000ff")).toBeCloseTo(240, 0);
    expect(hexToHue("#808080")).toBeGreaterThan(360);
  });
});
