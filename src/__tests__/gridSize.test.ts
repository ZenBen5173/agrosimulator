import { describe, it, expect } from "vitest";

/**
 * Test grid size calculation used in FarmDrawMap and FarmRedrawMap.
 * Determines NxN grid from farm acreage.
 */
function getGridSize(acres: number): number {
  if (acres < 1) return 4;
  if (acres <= 2) return 6;
  if (acres <= 4) return 8;
  return 10;
}

function sqMetersToAcres(m2: number): number {
  return m2 / 4046.86;
}

describe("getGridSize", () => {
  it("returns 4x4 for tiny farms under 1 acre", () => {
    expect(getGridSize(0.1)).toBe(4);
    expect(getGridSize(0.5)).toBe(4);
    expect(getGridSize(0.99)).toBe(4);
  });

  it("returns 6x6 for 1-2 acre farms", () => {
    expect(getGridSize(1)).toBe(6);
    expect(getGridSize(1.5)).toBe(6);
    expect(getGridSize(2)).toBe(6);
  });

  it("returns 8x8 for 2-4 acre farms", () => {
    expect(getGridSize(2.1)).toBe(8);
    expect(getGridSize(3)).toBe(8);
    expect(getGridSize(4)).toBe(8);
  });

  it("returns 10x10 for farms over 4 acres", () => {
    expect(getGridSize(4.1)).toBe(10);
    expect(getGridSize(10)).toBe(10);
    expect(getGridSize(100)).toBe(10);
  });
});

describe("sqMetersToAcres", () => {
  it("converts square meters to acres correctly", () => {
    // 1 acre = 4046.86 m²
    expect(sqMetersToAcres(4046.86)).toBeCloseTo(1, 2);
    expect(sqMetersToAcres(8093.72)).toBeCloseTo(2, 2);
    expect(sqMetersToAcres(0)).toBe(0);
  });
});
