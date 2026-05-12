/**
 * Pure benchmark message construction.
 *
 * Given the district aggregate + farmer's own last sale, build the killer
 * line. All deterministic — no I/O. Data provider is injected.
 */

import type { CropName } from "@/lib/diagnosis/types";
import type {
  DistrictPriceWeek,
  PriceBenchmarkResponse,
} from "./types";

/**
 * Produce the benchmark response for one farmer in one district for one
 * crop, given the district aggregate row and the farmer's own most-recent
 * sale price (in RM/kg) for that crop. Either may be null.
 */
export function buildBenchmark(input: {
  district: string;
  crop: CropName;
  weekStarting: string;
  district_aggregate: DistrictPriceWeek | null;
  farmer_last_sale_rm_per_kg: number | null;
}): PriceBenchmarkResponse {
  const {
    district,
    crop,
    weekStarting,
    district_aggregate,
    farmer_last_sale_rm_per_kg,
  } = input;

  // Case 1: no district data
  if (!district_aggregate) {
    return {
      district,
      crop,
      weekStarting,
      district_median_rm_per_kg: null,
      district_sample_count: 0,
      farmer_last_sale_rm_per_kg,
      message:
        "Not enough farmers in your district have shared their prices yet — keep logging your sales and the network will get smarter.",
      comparison: "no_district_data",
      trustNote: "0 farmers reporting. Need at least 5 for a useful benchmark.",
    };
  }

  // Case 2: district data exists but farmer hasn't logged a sale yet
  if (farmer_last_sale_rm_per_kg === null) {
    return {
      district,
      crop,
      weekStarting,
      district_median_rm_per_kg: district_aggregate.medianRmPerKg,
      district_sample_count: district_aggregate.sampleCount,
      farmer_last_sale_rm_per_kg: null,
      message: `Other ${crop} farmers in ${district} averaged RM ${district_aggregate.medianRmPerKg.toFixed(
        2
      )}/kg this week (${district_aggregate.sampleCount} farms reporting). Log your next sale to see how you compare.`,
      comparison: "no_farmer_data",
      trustNote: trustNoteFor(district_aggregate.sampleCount),
    };
  }

  // Case 3: full comparison
  const delta = farmer_last_sale_rm_per_kg - district_aggregate.medianRmPerKg;
  const tolerance = Math.max(0.05, district_aggregate.medianRmPerKg * 0.02);
  let comparison: PriceBenchmarkResponse["comparison"];
  if (Math.abs(delta) <= tolerance) comparison = "at_median";
  else if (delta > 0) comparison = "above_median";
  else comparison = "below_median";

  let message: string;
  if (comparison === "above_median") {
    message = `Other ${crop} farmers in ${district} averaged RM ${district_aggregate.medianRmPerKg.toFixed(
      2
    )}/kg this week. You sold at RM ${farmer_last_sale_rm_per_kg.toFixed(
      2
    )} — RM ${delta.toFixed(2)} above. Nice work — keep selling to that buyer.`;
  } else if (comparison === "below_median") {
    message = `Other ${crop} farmers in ${district} averaged RM ${district_aggregate.medianRmPerKg.toFixed(
      2
    )}/kg this week. You sold at RM ${farmer_last_sale_rm_per_kg.toFixed(
      2
    )} — RM ${Math.abs(delta).toFixed(
      2
    )} below. Worth checking your buyer or trying a different one.`;
  } else {
    message = `Other ${crop} farmers in ${district} averaged RM ${district_aggregate.medianRmPerKg.toFixed(
      2
    )}/kg this week. You sold at RM ${farmer_last_sale_rm_per_kg.toFixed(
      2
    )} — right at the district median.`;
  }

  return {
    district,
    crop,
    weekStarting,
    district_median_rm_per_kg: district_aggregate.medianRmPerKg,
    district_sample_count: district_aggregate.sampleCount,
    farmer_last_sale_rm_per_kg,
    message,
    comparison,
    trustNote: trustNoteFor(district_aggregate.sampleCount),
  };
}

function trustNoteFor(sampleCount: number): string {
  if (sampleCount >= 20) {
    return `Based on ${sampleCount} farms reporting this week — high confidence.`;
  }
  if (sampleCount >= 10) {
    return `Based on ${sampleCount} farms reporting this week — reasonable signal.`;
  }
  if (sampleCount >= 5) {
    return `Based on ${sampleCount} farms reporting this week — early signal, treat as a rough guide.`;
  }
  return `Only ${sampleCount} farms reporting this week — not enough to trust as a benchmark.`;
}
