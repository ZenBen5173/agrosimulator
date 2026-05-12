/**
 * Tests for the Pact layer's price benchmark logic.
 */

import { describe, it, expect } from "vitest";
import { buildBenchmark } from "@/lib/pact/priceBenchmark";
import {
  latestMonday,
  seededProvider,
} from "@/services/pact/benchmarkProvider";

describe("buildBenchmark", () => {
  it("returns no_district_data when aggregate is null", () => {
    const r = buildBenchmark({
      district: "Cameron Highlands",
      crop: "chilli",
      weekStarting: "2026-05-04",
      district_aggregate: null,
      farmer_last_sale_rm_per_kg: 4.0,
    });
    expect(r.comparison).toBe("no_district_data");
    expect(r.district_median_rm_per_kg).toBeNull();
    expect(r.message).toMatch(/keep logging/i);
  });

  it("returns no_farmer_data when farmer has no sale", () => {
    const r = buildBenchmark({
      district: "Cameron Highlands",
      crop: "chilli",
      weekStarting: "2026-05-04",
      district_aggregate: {
        district: "Cameron Highlands",
        crop: "chilli",
        weekStarting: "2026-05-04",
        medianRmPerKg: 4.2,
        minRmPerKg: 3.6,
        maxRmPerKg: 5.1,
        sampleCount: 14,
      },
      farmer_last_sale_rm_per_kg: null,
    });
    expect(r.comparison).toBe("no_farmer_data");
    expect(r.district_median_rm_per_kg).toBe(4.2);
    expect(r.message).toMatch(/4\.20\/kg/);
  });

  it("flags below_median with the correct message", () => {
    const r = buildBenchmark({
      district: "Cameron Highlands",
      crop: "chilli",
      weekStarting: "2026-05-04",
      district_aggregate: {
        district: "Cameron Highlands",
        crop: "chilli",
        weekStarting: "2026-05-04",
        medianRmPerKg: 4.2,
        minRmPerKg: 3.6,
        maxRmPerKg: 5.1,
        sampleCount: 14,
      },
      farmer_last_sale_rm_per_kg: 3.8,
    });
    expect(r.comparison).toBe("below_median");
    expect(r.message).toMatch(/RM 4\.20/);
    expect(r.message).toMatch(/RM 3\.80/);
    expect(r.message).toMatch(/below|check your buyer/i);
  });

  it("flags above_median when farmer beat the market", () => {
    const r = buildBenchmark({
      district: "Cameron Highlands",
      crop: "chilli",
      weekStarting: "2026-05-04",
      district_aggregate: {
        district: "Cameron Highlands",
        crop: "chilli",
        weekStarting: "2026-05-04",
        medianRmPerKg: 4.2,
        minRmPerKg: 3.6,
        maxRmPerKg: 5.1,
        sampleCount: 14,
      },
      farmer_last_sale_rm_per_kg: 4.6,
    });
    expect(r.comparison).toBe("above_median");
    expect(r.message).toMatch(/above/i);
  });

  it("flags at_median when farmer is within 2% of median", () => {
    const r = buildBenchmark({
      district: "Cameron Highlands",
      crop: "chilli",
      weekStarting: "2026-05-04",
      district_aggregate: {
        district: "Cameron Highlands",
        crop: "chilli",
        weekStarting: "2026-05-04",
        medianRmPerKg: 4.2,
        minRmPerKg: 3.6,
        maxRmPerKg: 5.1,
        sampleCount: 14,
      },
      farmer_last_sale_rm_per_kg: 4.21,
    });
    expect(r.comparison).toBe("at_median");
  });

  it("includes a trust note based on sample size", () => {
    const high = buildBenchmark({
      district: "Kedah",
      crop: "paddy",
      weekStarting: "2026-05-04",
      district_aggregate: {
        district: "Kedah",
        crop: "paddy",
        weekStarting: "2026-05-04",
        medianRmPerKg: 2.6,
        minRmPerKg: 2.4,
        maxRmPerKg: 2.85,
        sampleCount: 25,
      },
      farmer_last_sale_rm_per_kg: 2.5,
    });
    expect(high.trustNote).toMatch(/high confidence/i);

    const low = buildBenchmark({
      district: "Kedah",
      crop: "paddy",
      weekStarting: "2026-05-04",
      district_aggregate: {
        district: "Kedah",
        crop: "paddy",
        weekStarting: "2026-05-04",
        medianRmPerKg: 2.6,
        minRmPerKg: 2.4,
        maxRmPerKg: 2.85,
        sampleCount: 3,
      },
      farmer_last_sale_rm_per_kg: 2.5,
    });
    expect(low.trustNote).toMatch(/not enough/i);
  });
});

describe("latestMonday", () => {
  it("returns the same date if it is already Monday", () => {
    const monday = new Date("2026-05-04T12:00:00Z"); // Monday
    expect(latestMonday(monday)).toBe("2026-05-04");
  });

  it("returns the previous Monday for a Wednesday", () => {
    const wed = new Date("2026-05-06T12:00:00Z");
    expect(latestMonday(wed)).toBe("2026-05-04");
  });

  it("returns the previous Monday for a Sunday", () => {
    const sun = new Date("2026-05-10T12:00:00Z");
    expect(latestMonday(sun)).toBe("2026-05-04");
  });
});

describe("seededProvider integration", () => {
  it("returns Cameron Highlands chilli aggregate for current week", async () => {
    const week = latestMonday();
    const agg = await seededProvider.getDistrictWeek(
      "Cameron Highlands",
      "chilli",
      week
    );
    expect(agg).not.toBeNull();
    expect(agg?.medianRmPerKg).toBeGreaterThan(0);
  });

  it("is case-insensitive on district name", async () => {
    const week = latestMonday();
    const agg = await seededProvider.getDistrictWeek(
      "cameron highlands",
      "chilli",
      week
    );
    expect(agg).not.toBeNull();
  });

  it("returns null for unknown district/crop/week", async () => {
    const agg = await seededProvider.getDistrictWeek(
      "Antarctica",
      "chilli",
      "2025-01-01"
    );
    expect(agg).toBeNull();
  });

  it("returns the farmer last sale for known farmer", async () => {
    const sale = await seededProvider.getFarmerLastSale("demo-farmer-1", "chilli");
    expect(sale).toBeGreaterThan(0);
  });

  it("returns null for unknown farmer", async () => {
    const sale = await seededProvider.getFarmerLastSale("unknown", "chilli");
    expect(sale).toBeNull();
  });
});
