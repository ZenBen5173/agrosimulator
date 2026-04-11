/**
 * Pure math engine for resource quantity calculations.
 * No AI, no external calls — just crop profiles + farm geometry.
 */
import cropProfiles from "@/config/cropResourceProfiles.json";

interface PlotInfo {
  label: string;
  crop_name: string;
  growth_stage: string;
  area_m2: number;
  risk_score: number | null;
  days_since_fertilized: number | null;
  days_since_pesticide: number | null;
}

interface WeatherInfo {
  rainfall_mm: number;
  condition: string;
  forecast_rain_3h: boolean;
}

export interface PlotResourceNeed {
  label: string;
  crop_name: string;
  growth_stage: string;
  water_litres: number;
  skip_water: boolean;
  skip_water_reason: string | null;
  fertilizer_type: string | null;
  fertilizer_grams: number;
  fertilizer_due: boolean;
  pesticide_type: string | null;
  pesticide_ml: number;
  pesticide_due: boolean;
  labour_minutes: number;
  estimated_cost_rm: number;
}

export interface PrepListSummary {
  total_water_litres: number;
  total_fertilizer_items: { type: string; grams: number }[];
  total_pesticide_items: { type: string; ml: number }[];
  total_labour_minutes: number;
  total_estimated_cost_rm: number;
  plots: PlotResourceNeed[];
}

type CropProfiles = Record<string, Record<string, {
  water_ml_per_m2_per_day: number;
  water_skip_if_rain_mm: number;
  fertilizer_type: string | null;
  fertilizer_g_per_m2: number;
  fertilizer_frequency_days: number;
  pesticide_threshold_risk_score: number;
  pesticide_type: string | null;
  pesticide_ml_per_m2: number;
  labour_minutes_per_plot: number;
}>>;

const profiles = cropProfiles as CropProfiles;

// Average prices for cost estimation (RM)
const COST_PER_LITRE_WATER = 0.002; // piped/pump cost
const COST_PER_G_FERTILIZER: Record<string, number> = {
  "Baja Hijau (NPK 15-15-15)": 0.003,
  "Baja Bunga (NPK 12-12-17)": 0.0035,
  "Baja Urea 46%": 0.002,
  "Baja MOP Potash": 0.004,
};
const COST_PER_ML_PESTICIDE: Record<string, number> = {
  "Lorsban (Chlorpyrifos)": 0.05,
  "Dithane M-45 (Mancozeb)": 0.03,
  "Tilt (Propiconazole)": 0.08,
  "Confidor (Imidacloprid)": 0.06,
  "Kocide (Copper Hydroxide)": 0.04,
  "Derosal (Carbendazim)": 0.05,
  "Dipel (Bt Spray)": 0.07,
};

/**
 * Calculate exact resource needs for a set of plots.
 * Pure function — no DB calls.
 */
export function calculateResources(
  plots: PlotInfo[],
  weather: WeatherInfo
): PrepListSummary {
  const plotNeeds: PlotResourceNeed[] = [];

  for (const plot of plots) {
    const cropData = profiles[plot.crop_name];
    const stageData = cropData?.[plot.growth_stage];

    if (!stageData) {
      plotNeeds.push({
        label: plot.label,
        crop_name: plot.crop_name,
        growth_stage: plot.growth_stage,
        water_litres: 0,
        skip_water: true,
        skip_water_reason: "No resource profile for this crop/stage",
        fertilizer_type: null,
        fertilizer_grams: 0,
        fertilizer_due: false,
        pesticide_type: null,
        pesticide_ml: 0,
        pesticide_due: false,
        labour_minutes: 15,
        estimated_cost_rm: 0,
      });
      continue;
    }

    // Water calculation
    const waterMl = stageData.water_ml_per_m2_per_day * plot.area_m2;
    const waterLitres = Math.round(waterMl / 1000 * 10) / 10;
    const skipWater = weather.rainfall_mm >= stageData.water_skip_if_rain_mm;
    const skipReason = skipWater
      ? `Rain ${weather.rainfall_mm}mm exceeds ${stageData.water_skip_if_rain_mm}mm threshold`
      : weather.forecast_rain_3h
        ? "Rain forecast within 3 hours — delay watering"
        : null;

    // Fertilizer calculation
    const fertGrams = Math.round(stageData.fertilizer_g_per_m2 * plot.area_m2);
    const fertDue =
      stageData.fertilizer_type !== null &&
      stageData.fertilizer_frequency_days > 0 &&
      (plot.days_since_fertilized === null ||
        plot.days_since_fertilized >= stageData.fertilizer_frequency_days);

    // Pesticide calculation
    const pestMl = Math.round(stageData.pesticide_ml_per_m2 * plot.area_m2 * 10) / 10;
    const pestDue =
      stageData.pesticide_type !== null &&
      (plot.risk_score ?? 0) >= stageData.pesticide_threshold_risk_score &&
      (plot.days_since_pesticide === null || plot.days_since_pesticide >= 7);

    // Cost estimation
    let cost = 0;
    if (!skipWater) cost += waterLitres * COST_PER_LITRE_WATER;
    if (fertDue && stageData.fertilizer_type) {
      cost += fertGrams * (COST_PER_G_FERTILIZER[stageData.fertilizer_type] || 0.003);
    }
    if (pestDue && stageData.pesticide_type) {
      cost += pestMl * (COST_PER_ML_PESTICIDE[stageData.pesticide_type] || 0.05);
    }

    plotNeeds.push({
      label: plot.label,
      crop_name: plot.crop_name,
      growth_stage: plot.growth_stage,
      water_litres: skipWater ? 0 : waterLitres,
      skip_water: skipWater || (skipReason !== null),
      skip_water_reason: skipReason,
      fertilizer_type: fertDue ? stageData.fertilizer_type : null,
      fertilizer_grams: fertDue ? fertGrams : 0,
      fertilizer_due: fertDue,
      pesticide_type: pestDue ? stageData.pesticide_type : null,
      pesticide_ml: pestDue ? pestMl : 0,
      pesticide_due: pestDue,
      labour_minutes: stageData.labour_minutes_per_plot,
      estimated_cost_rm: Math.round(cost * 100) / 100,
    });
  }

  // Aggregate
  const totalWater = plotNeeds.reduce((s, p) => s + p.water_litres, 0);
  const fertMap = new Map<string, number>();
  const pestMap = new Map<string, number>();

  for (const p of plotNeeds) {
    if (p.fertilizer_type && p.fertilizer_grams > 0) {
      fertMap.set(p.fertilizer_type, (fertMap.get(p.fertilizer_type) || 0) + p.fertilizer_grams);
    }
    if (p.pesticide_type && p.pesticide_ml > 0) {
      pestMap.set(p.pesticide_type, (pestMap.get(p.pesticide_type) || 0) + p.pesticide_ml);
    }
  }

  return {
    total_water_litres: Math.round(totalWater * 10) / 10,
    total_fertilizer_items: Array.from(fertMap.entries()).map(([type, grams]) => ({ type, grams })),
    total_pesticide_items: Array.from(pestMap.entries()).map(([type, ml]) => ({ type, ml })),
    total_labour_minutes: plotNeeds.reduce((s, p) => s + p.labour_minutes, 0),
    total_estimated_cost_rm: Math.round(plotNeeds.reduce((s, p) => s + p.estimated_cost_rm, 0) * 100) / 100,
    plots: plotNeeds,
  };
}

/**
 * Calculate plot area in m² from bounding box and grid.
 * cell_area = bounding_box_area / grid_size²
 * plot_area = cell_count × cell_area
 */
export function calculatePlotAreaM2(
  boundingBox: { north: number; south: number; east: number; west: number },
  gridSize: number,
  cellCount: number
): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;

  const latDiff = toRad(boundingBox.north - boundingBox.south);
  const lngDiff = toRad(boundingBox.east - boundingBox.west);
  const midLat = toRad((boundingBox.north + boundingBox.south) / 2);

  const height = latDiff * R;
  const width = lngDiff * R * Math.cos(midLat);
  const totalArea = height * width;
  const cellArea = totalArea / (gridSize * gridSize);

  return Math.round(cellArea * cellCount * 100) / 100;
}
