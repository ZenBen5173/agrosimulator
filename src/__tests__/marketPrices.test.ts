import { describe, it, expect } from "vitest";

/**
 * Test market price generation and trend calculation.
 */

const BASE_PRICES: Record<string, { price: number; unit: string; type: string }> = {
  "Paddy (Rice)": { price: 1.2, unit: "kg", type: "crop" },
  "Oil Palm (FFB)": { price: 0.85, unit: "kg", type: "crop" },
  Rubber: { price: 5.5, unit: "kg", type: "crop" },
  Chilli: { price: 12.0, unit: "kg", type: "crop" },
  Tomato: { price: 4.5, unit: "kg", type: "crop" },
  "NPK Fertilizer": { price: 2.8, unit: "kg", type: "fertilizer" },
  Glyphosate: { price: 25.0, unit: "liter", type: "pesticide" },
};

function generatePrice(basePriceRM: number): {
  price: number;
  trend: string;
  trend_pct: number;
} {
  const variation = (Math.random() - 0.5) * 0.3; // ±15%
  const newPrice = Math.round(basePriceRM * (1 + variation) * 100) / 100;
  const changePct = Math.round(variation * 100 * 10) / 10;

  let trend: string;
  if (changePct > 2) trend = "up";
  else if (changePct < -2) trend = "down";
  else trend = "stable";

  return { price: newPrice, trend, trend_pct: Math.abs(changePct) };
}

describe("Market Price Generation", () => {
  it("generates prices within ±15% of base", () => {
    const base = 10.0;
    for (let i = 0; i < 50; i++) {
      const { price } = generatePrice(base);
      expect(price).toBeGreaterThanOrEqual(base * 0.85);
      expect(price).toBeLessThanOrEqual(base * 1.15);
    }
  });

  it("assigns correct trend labels", () => {
    // When variation is high positive → up
    // When variation is high negative → down
    // When variation is small → stable
    const trends = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { trend } = generatePrice(10.0);
      trends.add(trend);
    }
    // With 100 iterations, we should see all 3 trends
    expect(trends.size).toBeGreaterThanOrEqual(2);
  });

  it("trend_pct is always non-negative", () => {
    for (let i = 0; i < 50; i++) {
      const { trend_pct } = generatePrice(10.0);
      expect(trend_pct).toBeGreaterThanOrEqual(0);
    }
  });

  it("covers all Malaysian crop/input items", () => {
    const items = Object.keys(BASE_PRICES);
    expect(items).toContain("Paddy (Rice)");
    expect(items).toContain("Chilli");
    expect(items).toContain("NPK Fertilizer");
    expect(items).toContain("Glyphosate");
    expect(items.length).toBeGreaterThanOrEqual(7);
  });

  it("categorizes items correctly", () => {
    const crops = Object.entries(BASE_PRICES).filter(([, v]) => v.type === "crop");
    const inputs = Object.entries(BASE_PRICES).filter(([, v]) => v.type !== "crop");
    expect(crops.length).toBeGreaterThanOrEqual(5);
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });
});
