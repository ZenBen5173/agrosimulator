import { z } from "genkit";
import { ai } from "./genkit";
import { createClient } from "@/lib/supabase/server";

// ─── Schemas ────────────────────────────────────────────────

const FarmIdSchema = z.object({ farmId: z.string().uuid() });
const PlotIdSchema = z.object({ plotId: z.string().uuid() });

// ─── weatherTool ────────────────────────────────────────────

export const weatherTool = ai.defineTool(
  {
    name: "getWeather",
    description:
      "Fetch the latest weather snapshot for a farm including current conditions, temperature, humidity, rainfall, wind, and 5-day forecast.",
    inputSchema: FarmIdSchema,
    outputSchema: z.object({
      condition: z.string(),
      temp_celsius: z.number(),
      humidity_pct: z.number(),
      rainfall_mm: z.number(),
      wind_kmh: z.number(),
      forecast: z.array(
        z.object({
          date: z.string(),
          condition: z.string(),
          rain_chance: z.number(),
        })
      ),
      source: z.enum(["live_api", "gemini_web_search", "static_mock"]),
    }),
  },
  async ({ farmId }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("weather_snapshots")
      .select("*")
      .eq("farm_id", farmId)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    if (!data) {
      return {
        condition: "sunny",
        temp_celsius: 31,
        humidity_pct: 75,
        rainfall_mm: 0,
        wind_kmh: 8,
        forecast: [],
        source: "static_mock" as const,
      };
    }

    const forecast = (data.forecast_json || []) as {
      date: string;
      condition: string;
      rain_chance: number;
    }[];

    return {
      condition: data.condition,
      temp_celsius: data.temp_celsius,
      humidity_pct: data.humidity_pct,
      rainfall_mm: data.rainfall_mm,
      wind_kmh: data.wind_kmh,
      forecast,
      source: "live_api" as const,
    };
  }
);

// ─── plotsTool ──────────────────────────────────────────────

export const plotsTool = ai.defineTool(
  {
    name: "getPlots",
    description:
      "Get all active plots for a farm with crop name, growth stage, risk score, warning level, planted date, and expected harvest.",
    inputSchema: FarmIdSchema,
    outputSchema: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        crop_name: z.string(),
        growth_stage: z.string(),
        planted_date: z.string().nullable(),
        expected_harvest: z.string().nullable(),
        warning_level: z.string(),
        warning_reason: z.string().nullable(),
        risk_score: z.number().nullable(),
        days_since_checked: z.number().nullable(),
      })
    ),
  },
  async ({ farmId }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("plots")
      .select(
        "id, label, crop_name, growth_stage, planted_date, expected_harvest, warning_level, warning_reason, risk_score, days_since_checked"
      )
      .eq("farm_id", farmId)
      .eq("is_active", true);

    return (data || []).map((p) => ({
      id: p.id,
      label: p.label,
      crop_name: p.crop_name || "Unknown",
      growth_stage: p.growth_stage || "seedling",
      planted_date: p.planted_date,
      expected_harvest: p.expected_harvest,
      warning_level: p.warning_level || "none",
      warning_reason: p.warning_reason || null,
      risk_score: p.risk_score ?? null,
      days_since_checked: p.days_since_checked ?? null,
    }));
  }
);

// ─── marketPricesTool ───────────────────────────────────────

export const marketPricesTool = ai.defineTool(
  {
    name: "getMarketPrices",
    description:
      "Get current market prices and trends for crops, fertilizers, and pesticides.",
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        item_name: z.string(),
        item_type: z.string(),
        price_per_kg: z.number(),
        trend: z.string(),
        trend_pct: z.number(),
      })
    ),
  },
  async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("market_prices")
      .select("item_name, item_type, price_per_kg, trend, trend_pct")
      .order("updated_at", { ascending: false });

    return (data || []).map((m) => ({
      item_name: m.item_name,
      item_type: m.item_type,
      price_per_kg: m.price_per_kg,
      trend: m.trend || "stable",
      trend_pct: m.trend_pct || 0,
    }));
  }
);

// ─── plotHistoryTool ────────────────────────────────────────

export const plotHistoryTool = ai.defineTool(
  {
    name: "getPlotHistory",
    description:
      "Get recent events (inspections, treatments, harvests) for a specific plot. Returns last 20 events.",
    inputSchema: PlotIdSchema,
    outputSchema: z.array(
      z.object({
        event_type: z.string(),
        disease_name: z.string().nullable(),
        severity: z.string().nullable(),
        notes: z.string().nullable(),
        created_at: z.string(),
      })
    ),
  },
  async ({ plotId }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("plot_events")
      .select("event_type, disease_name, severity, notes, created_at")
      .eq("plot_id", plotId)
      .order("created_at", { ascending: false })
      .limit(20);

    return (data || []).map((e) => ({
      event_type: e.event_type,
      disease_name: e.disease_name || null,
      severity: e.severity || null,
      notes: e.notes || null,
      created_at: e.created_at,
    }));
  }
);

// ─── getFarmContextTool ─────────────────────────────────────

export const getFarmContextTool = ai.defineTool(
  {
    name: "getFarmContext",
    description:
      "Get full farm metadata: name, location, area, soil type, water source, grid size.",
    inputSchema: FarmIdSchema,
    outputSchema: z.object({
      id: z.string(),
      name: z.string().nullable(),
      district: z.string().nullable(),
      state: z.string().nullable(),
      area_acres: z.number(),
      grid_size: z.number(),
      soil_type: z.string().nullable(),
      water_source: z.string().nullable(),
    }),
  },
  async ({ farmId }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("farms")
      .select(
        "id, name, district, state, area_acres, grid_size, soil_type, water_source"
      )
      .eq("id", farmId)
      .single();

    if (!data) {
      return {
        id: farmId,
        name: null,
        district: null,
        state: null,
        area_acres: 1,
        grid_size: 6,
        soil_type: null,
        water_source: null,
      };
    }

    return {
      id: data.id,
      name: data.name,
      district: data.district,
      state: data.state,
      area_acres: data.area_acres,
      grid_size: data.grid_size,
      soil_type: data.soil_type,
      water_source: data.water_source,
    };
  }
);

// ─── inventoryTool ──────────────────────────────────────────

export const inventoryTool = ai.defineTool(
  {
    name: "getInventory",
    description:
      "Get current inventory stock levels for a farm (fertilizers, pesticides, seeds, etc).",
    inputSchema: FarmIdSchema,
    outputSchema: z.array(
      z.object({
        id: z.string(),
        item_name: z.string(),
        item_type: z.string(),
        current_quantity: z.number(),
        unit: z.string(),
        reorder_threshold: z.number().nullable(),
        last_purchase_price_rm: z.number().nullable(),
      })
    ),
  },
  async ({ farmId }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("inventory_items")
      .select(
        "id, item_name, item_type, current_quantity, unit, reorder_threshold, last_purchase_price_rm"
      )
      .eq("farm_id", farmId);

    return (data || []).map((i) => ({
      id: i.id,
      item_name: i.item_name,
      item_type: i.item_type,
      current_quantity: i.current_quantity,
      unit: i.unit,
      reorder_threshold: i.reorder_threshold ?? null,
      last_purchase_price_rm: i.last_purchase_price_rm ?? null,
    }));
  }
);

// ─── resourceProfileTool ────────────────────────────────────

export const resourceProfileTool = ai.defineTool(
  {
    name: "getResourceProfile",
    description:
      "Look up the crop resource profile (water, fertilizer, pesticide requirements) for a specific crop at a specific growth stage. Uses MARDI-based guidelines.",
    inputSchema: z.object({
      crop: z.string(),
      growth_stage: z.string(),
    }),
    outputSchema: z.object({
      water_ml_per_m2_per_day: z.number(),
      water_skip_if_rain_mm: z.number(),
      fertilizer_type: z.string().nullable(),
      fertilizer_g_per_m2: z.number(),
      fertilizer_frequency_days: z.number(),
      pesticide_threshold_risk_score: z.number(),
      pesticide_type: z.string().nullable(),
      pesticide_ml_per_m2: z.number(),
      labour_minutes_per_plot: z.number(),
    }),
  },
  async ({ crop, growth_stage }) => {
    // Dynamic import to avoid bundling JSON at tool definition time
    const profiles = await import("@/config/cropResourceProfiles.json");
    const cropData = (profiles.default as Record<string, Record<string, unknown>>)[crop];
    const stageData = cropData?.[growth_stage] as Record<string, unknown> | undefined;

    if (!stageData) {
      // Fallback defaults
      return {
        water_ml_per_m2_per_day: 4,
        water_skip_if_rain_mm: 3,
        fertilizer_type: "NPK 15-15-15",
        fertilizer_g_per_m2: 2,
        fertilizer_frequency_days: 14,
        pesticide_threshold_risk_score: 0.7,
        pesticide_type: null,
        pesticide_ml_per_m2: 0,
        labour_minutes_per_plot: 15,
      };
    }

    return {
      water_ml_per_m2_per_day: (stageData.water_ml_per_m2_per_day as number) ?? 4,
      water_skip_if_rain_mm: (stageData.water_skip_if_rain_mm as number) ?? 3,
      fertilizer_type: (stageData.fertilizer_type as string) ?? null,
      fertilizer_g_per_m2: (stageData.fertilizer_g_per_m2 as number) ?? 0,
      fertilizer_frequency_days: (stageData.fertilizer_frequency_days as number) ?? 14,
      pesticide_threshold_risk_score: (stageData.pesticide_threshold_risk_score as number) ?? 0.7,
      pesticide_type: (stageData.pesticide_type as string) ?? null,
      pesticide_ml_per_m2: (stageData.pesticide_ml_per_m2 as number) ?? 0,
      labour_minutes_per_plot: (stageData.labour_minutes_per_plot as number) ?? 15,
    };
  }
);

// ─── webSearchTool (uses Gemini's built-in google_search) ───

export const webSearchTool = ai.defineTool(
  {
    name: "searchAgriculturalNews",
    description:
      "Search the web for latest Malaysian agricultural news, disease outbreaks, weather alerts, fertilizer recalls, or pest invasions. Returns a summary of findings.",
    inputSchema: z.object({
      query: z.string().describe("Search query about Malaysian agriculture"),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          title: z.string(),
          summary: z.string(),
          relevance: z.enum(["high", "medium", "low"]),
        })
      ),
    }),
  },
  async ({ query }) => {
    // This tool delegates to Gemini with google_search grounding
    // The calling flow will invoke Gemini with google_search tool enabled
    // For now, return empty — the flow handles the actual search
    return {
      results: [
        {
          title: `Search: ${query}`,
          summary: "Web search delegated to Gemini google_search grounding.",
          relevance: "medium" as const,
        },
      ],
    };
  }
);
