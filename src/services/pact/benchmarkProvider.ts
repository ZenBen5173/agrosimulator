/**
 * Pact benchmark data provider.
 *
 * Abstracts where the district aggregate comes from. Today: an in-memory
 * seeded dataset for the demo. Tomorrow: Supabase district_price_aggregate
 * table populated by a cron job that reads farmer-logged sales.
 *
 * The provider interface is intentionally narrow so swapping is trivial.
 */

import type { CropName } from "@/lib/diagnosis/types";
import type { DistrictPriceWeek } from "@/lib/pact/types";

export interface BenchmarkProvider {
  getDistrictWeek(
    district: string,
    crop: CropName,
    weekStarting: string
  ): Promise<DistrictPriceWeek | null>;

  getFarmerLastSale(
    farmerId: string,
    crop: CropName
  ): Promise<number | null>;
}

// ─── Seeded demo provider ───────────────────────────────────────

/**
 * Realistic demo data for the finals — mirrors actual Malaysian wholesale
 * price patterns observed in DOA market reports. Replace with Supabase-
 * backed implementation post-finals.
 *
 * Coverage: chilli + paddy + kangkung + banana + corn + sweet_potato across
 * the major Malaysian growing districts so any judge typing in any
 * reasonable district + crop combo gets a realistic answer.
 */
const SEED_AGGREGATES: DistrictPriceWeek[] = (() => {
  const week = latestMonday();
  const rows: DistrictPriceWeek[] = [];

  // Cameron Highlands — vegetable belt (chilli, kangkung)
  rows.push(
    { district: "Cameron Highlands", crop: "chilli", weekStarting: week, medianRmPerKg: 4.2, minRmPerKg: 3.6, maxRmPerKg: 5.1, sampleCount: 14 },
    { district: "Cameron Highlands", crop: "kangkung", weekStarting: week, medianRmPerKg: 2.4, minRmPerKg: 2.0, maxRmPerKg: 2.9, sampleCount: 9 },
    { district: "Cameron Highlands", crop: "corn", weekStarting: week, medianRmPerKg: 1.7, minRmPerKg: 1.4, maxRmPerKg: 2.1, sampleCount: 6 }
  );

  // Kedah — MADA paddy belt + chilli + corn
  rows.push(
    { district: "Kedah", crop: "paddy", weekStarting: week, medianRmPerKg: 2.6, minRmPerKg: 2.4, maxRmPerKg: 2.85, sampleCount: 22 },
    { district: "Kedah", crop: "chilli", weekStarting: week, medianRmPerKg: 5.4, minRmPerKg: 4.8, maxRmPerKg: 6.2, sampleCount: 8 },
    { district: "Kedah", crop: "corn", weekStarting: week, medianRmPerKg: 1.5, minRmPerKg: 1.3, maxRmPerKg: 1.8, sampleCount: 11 }
  );

  // Perak — paddy + sweet potato + banana
  rows.push(
    { district: "Perak", crop: "paddy", weekStarting: week, medianRmPerKg: 2.55, minRmPerKg: 2.3, maxRmPerKg: 2.8, sampleCount: 18 },
    { district: "Perak", crop: "sweet_potato", weekStarting: week, medianRmPerKg: 1.9, minRmPerKg: 1.6, maxRmPerKg: 2.3, sampleCount: 7 },
    { district: "Perak", crop: "banana", weekStarting: week, medianRmPerKg: 1.6, minRmPerKg: 1.3, maxRmPerKg: 2.0, sampleCount: 12 }
  );

  // Selangor — peri-urban veg gardens
  rows.push(
    { district: "Selangor", crop: "kangkung", weekStarting: week, medianRmPerKg: 1.8, minRmPerKg: 1.5, maxRmPerKg: 2.2, sampleCount: 8 },
    { district: "Selangor", crop: "chilli", weekStarting: week, medianRmPerKg: 5.1, minRmPerKg: 4.4, maxRmPerKg: 6.0, sampleCount: 6 }
  );

  // Johor — banana, corn, sweet potato
  rows.push(
    { district: "Johor", crop: "banana", weekStarting: week, medianRmPerKg: 1.7, minRmPerKg: 1.4, maxRmPerKg: 2.1, sampleCount: 14 },
    { district: "Johor", crop: "corn", weekStarting: week, medianRmPerKg: 1.6, minRmPerKg: 1.4, maxRmPerKg: 1.9, sampleCount: 9 },
    { district: "Johor", crop: "sweet_potato", weekStarting: week, medianRmPerKg: 2.0, minRmPerKg: 1.7, maxRmPerKg: 2.4, sampleCount: 6 }
  );

  // Kelantan — paddy + kangkung
  rows.push(
    { district: "Kelantan", crop: "paddy", weekStarting: week, medianRmPerKg: 2.5, minRmPerKg: 2.3, maxRmPerKg: 2.75, sampleCount: 11 },
    { district: "Kelantan", crop: "kangkung", weekStarting: week, medianRmPerKg: 1.7, minRmPerKg: 1.4, maxRmPerKg: 2.0, sampleCount: 5 }
  );

  // Pahang — banana + chilli (highland mix)
  rows.push(
    { district: "Pahang", crop: "banana", weekStarting: week, medianRmPerKg: 1.8, minRmPerKg: 1.5, maxRmPerKg: 2.2, sampleCount: 9 },
    { district: "Pahang", crop: "chilli", weekStarting: week, medianRmPerKg: 4.6, minRmPerKg: 4.0, maxRmPerKg: 5.4, sampleCount: 7 }
  );

  // Sabah — sweet potato + banana + corn
  rows.push(
    { district: "Sabah", crop: "sweet_potato", weekStarting: week, medianRmPerKg: 1.85, minRmPerKg: 1.5, maxRmPerKg: 2.3, sampleCount: 10 },
    { district: "Sabah", crop: "banana", weekStarting: week, medianRmPerKg: 1.5, minRmPerKg: 1.2, maxRmPerKg: 1.9, sampleCount: 8 },
    { district: "Sabah", crop: "corn", weekStarting: week, medianRmPerKg: 1.4, minRmPerKg: 1.2, maxRmPerKg: 1.7, sampleCount: 6 }
  );

  // Sarawak — paddy + kangkung
  rows.push(
    { district: "Sarawak", crop: "paddy", weekStarting: week, medianRmPerKg: 2.45, minRmPerKg: 2.2, maxRmPerKg: 2.7, sampleCount: 9 },
    { district: "Sarawak", crop: "kangkung", weekStarting: week, medianRmPerKg: 1.6, minRmPerKg: 1.3, maxRmPerKg: 1.95, sampleCount: 5 }
  );

  return rows;
})();

const SEED_FARMER_LAST_SALES: Record<string, Record<CropName, number>> = {
  "demo-farmer-1": {
    chilli: 3.8,
    paddy: 2.5,
    kangkung: 1.6,
    banana: 1.5,
    corn: 1.2,
    sweet_potato: 1.4,
  },
};

export const seededProvider: BenchmarkProvider = {
  async getDistrictWeek(district, crop, weekStarting) {
    return (
      SEED_AGGREGATES.find(
        (a) =>
          a.district.toLowerCase() === district.toLowerCase() &&
          a.crop === crop &&
          a.weekStarting === weekStarting
      ) ?? null
    );
  },
  async getFarmerLastSale(farmerId, crop) {
    return SEED_FARMER_LAST_SALES[farmerId]?.[crop] ?? null;
  },
};

// ─── Helper: this week's Monday in ISO format ───────────────────

export function latestMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  // Monday = 1; sunday = 0 → 6 days back
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}
