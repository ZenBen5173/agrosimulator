/**
 * Types for the Pact layer — the network/collective features that destroy
 * the middleman tax for Malaysian smallholders.
 *
 * The MVP feature set: anonymous district price benchmark, group-buying
 * aggregator, network disease early-warning. Each compounds with density.
 */

import type { CropName } from "@/lib/diagnosis/types";

/**
 * One week's anonymous district aggregate of farm-gate sale prices for a
 * given crop. Powers the killer line: "Other farmers in your district got
 * RM 4.20/kg this week — you sold at RM 3.80."
 */
export interface DistrictPriceWeek {
  district: string;
  crop: CropName;
  weekStarting: string; // ISO yyyy-mm-dd (Monday)
  medianRmPerKg: number;
  minRmPerKg: number;
  maxRmPerKg: number;
  sampleCount: number;
}

/**
 * The full benchmark response surfaced to a single farmer.
 */
export interface PriceBenchmarkResponse {
  district: string;
  crop: CropName;
  weekStarting: string;

  // The anonymous district figure
  district_median_rm_per_kg: number | null;
  district_sample_count: number;

  // The farmer's own most recent sale (if available) — for the comparison line
  farmer_last_sale_rm_per_kg: number | null;

  // The headline story line we surface to the farmer (e.g. shown in the
  // benchmark card and any future copy-to-share output)
  message: string;

  // What we have in confidence terms
  comparison: "above_median" | "at_median" | "below_median" | "no_farmer_data" | "no_district_data";

  // Honest caveat: how thin the data is
  trustNote: string;
}

/**
 * Group-buy aggregation status surfaced to one farmer.
 */
export interface GroupBuyStatus {
  groupBuyId: string;
  district: string;
  itemName: string;
  unit: string;
  bulkPriceRm: number;
  individualPriceRm: number;
  savingsRm: number;

  participantsJoined: number;
  participantsTarget: number;
  closesAt: string; // ISO datetime

  farmerCommitted: boolean;
}
