import { describe, it, expect } from "vitest";
import { colorDistance, hexToOklab, nextLevel, hexToHue, isLowLevel, LEVELS, type Level } from "./color";

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

describe("colorDistance", () => {
  it("is zero for identical colours and 1 from black to white", () => {
    expect(colorDistance("#E8503E", "#E8503E")).toBe(0);
    expect(colorDistance("#000000", "#ffffff")).toBeCloseTo(1, 3);
  });
  it("is symmetric and perceptually ordered", () => {
    expect(colorDistance("#ff0000", "#0000ff")).toBeCloseTo(colorDistance("#0000ff", "#ff0000"), 10);
    // red is nearer to orange than to blue
    expect(colorDistance("#ff0000", "#ff8000")).toBeLessThan(colorDistance("#ff0000", "#0000ff"));
    // two brands' ultramarines read as the same colour (sampled chart hexes)
    expect(colorDistance("#3047A2", "#2A4899")).toBeLessThan(0.06);
  });
  it("hexToOklab puts white at L=1 with no chroma", () => {
    const [L, a, b] = hexToOklab("#ffffff");
    expect(L).toBeCloseTo(1, 3);
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
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
