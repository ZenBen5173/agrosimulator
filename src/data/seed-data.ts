/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AGROSIM DEMO MODE SEED DATA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS EXISTS:
 *
 * Supabase free tier limits each organization to 2 active projects. AgroSim
 * is normally deployed alongside another project (UniGuide), so we keep the
 * AgroSim Supabase project paused outside of active development.
 *
 * To ensure judges can still demo the app even when the database is paused,
 * we ship a snapshot of the demo farm's data inside the repo. When DEMO_MODE
 * is enabled (env var DEMO_MODE=true), the Supabase client is replaced with
 * an in-memory mock that:
 *
 *   • Reads from this seed file
 *   • Persists writes in the user's browser sessionStorage (resets on close)
 *   • Bypasses auth so the judge lands on the demo account directly
 *
 * Data resets every session — by design. This is a demo, not a production
 * deployment, and the judging flow only needs read-mostly behaviour with
 * a few in-memory writes for the chat-to-action wow moment.
 *
 * Last exported: 2026-04-25 from project qrevbizwmiqdlgtnptji
 * Demo farm:    3da5d81d-a21b-4119-9354-5e8daff85e69 (demo@agrosim.app)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DEMO_USER = {
  id: "a7cd8b7d-d657-4d97-b36b-b2b31bd76c4f",
  email: "demo@agrosim.app",
};

export const DEMO_FARM_ID = "3da5d81d-a21b-4119-9354-5e8daff85e69";

export const SEED = {
  farms: [
    {
      id: "3da5d81d-a21b-4119-9354-5e8daff85e69",
      user_id: "a7cd8b7d-d657-4d97-b36b-b2b31bd76c4f",
      name: null,
      district: "Kuala Langat",
      state: "Selangor",
      polygon_geojson: { type: "Polygon", coordinates: [[[101.37919664382936, 2.8708001784829404], [101.37923955917358, 2.863149377645039], [101.38844490051271, 2.863170808531137], [101.38827323913576, 2.8707787477397515], [101.37919664382936, 2.8708001784829404]]] },
      bounding_box: { east: 101.3977575302124, west: 101.37919664382936, north: 2.87099305515351, south: 2.8631065158716487 },
      area_acres: 431.14,
      grid_size: 10,
      soil_type: "clay_loam",
      water_source: "irrigated",
      ai_soil_reasoning: null,
      onboarding_done: true,
      created_at: "2026-04-08T06:56:58.064639+00:00",
      terrain_type: "flat",
      total_parcels: 2,
    },
  ],

  plots: [
    { id: "1e5ef0c0-5475-4834-b392-588d89f6085b", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", label: "A", crop_name: "Paddy", crop_variety: null, growth_stage: "seedling", planted_date: "2026-04-08", expected_harvest: null, days_since_checked: 0, warning_level: "yellow", warning_reason: "Paddy seedlings are highly susceptible to fungal diseases such as blast or sheath blight, which are favored by the forecasted rainy conditions.", risk_score: 0.48, ai_placement_reason: "Zone A — 76.0 acres", colour_hex: "#4ade80", is_active: true, created_at: "2026-04-08T07:12:41.365368+00:00", updated_at: "2026-04-24T06:00:32.672+00:00", photo_url: null },
    { id: "9c496e8c-0571-4e07-8dc5-62ebf92f7774", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", label: "B", crop_name: "Chilli", crop_variety: null, growth_stage: "seedling", planted_date: "2026-04-08", expected_harvest: null, days_since_checked: 0, warning_level: "none", warning_reason: "Treatment successful", risk_score: 0.38, ai_placement_reason: "Zone B — 112.8 acres", colour_hex: "#f87171", is_active: true, created_at: "2026-04-08T07:12:41.365368+00:00", updated_at: "2026-04-24T06:00:32.672+00:00", photo_url: null },
    { id: "41ea61b9-9b4d-4b92-94ed-5893b62d6f04", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", label: "C", crop_name: "Cucumber", crop_variety: null, growth_stage: "seedling", planted_date: "2026-04-08", expected_harvest: null, days_since_checked: 0, warning_level: "yellow", warning_reason: "Cucumber seedlings are susceptible to fungal diseases like downy mildew or anthracnose.", risk_score: 0.38, ai_placement_reason: "Zone C — 22.0 acres", colour_hex: "#60a5fa", is_active: true, created_at: "2026-04-08T07:12:41.365368+00:00", updated_at: "2026-04-24T06:00:32.672+00:00", photo_url: null },
    { id: "2d02bf7b-6ed9-420d-963c-9b4c4f39b405", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", label: "D", crop_name: "Kangkung", crop_variety: null, growth_stage: "seedling", planted_date: "2026-04-08", expected_harvest: null, days_since_checked: 0, warning_level: "yellow", warning_reason: "Kangkung seedlings are vulnerable to fungal issues like white rust or leaf spots.", risk_score: 0.38, ai_placement_reason: "Zone D — 28.5 acres", colour_hex: "#fbbf24", is_active: true, created_at: "2026-04-08T07:12:41.365368+00:00", updated_at: "2026-04-24T06:00:32.672+00:00", photo_url: null },
    { id: "f21690c1-ea74-4e3e-b918-09a4ba7c7e0a", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", label: "E", crop_name: "Eggplant", crop_variety: null, growth_stage: "seedling", planted_date: "2026-04-08", expected_harvest: null, days_since_checked: 0, warning_level: "yellow", warning_reason: "Eggplant seedlings are susceptible to damping-off and fungal blights.", risk_score: 0.38, ai_placement_reason: "Zone E — 52.8 acres", colour_hex: "#a78bfa", is_active: true, created_at: "2026-04-08T07:12:41.365368+00:00", updated_at: "2026-04-24T06:00:32.672+00:00", photo_url: null },
    { id: "8ce1da5f-d18a-47ce-abd7-3293c1ec7175", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", label: "F", crop_name: "Okra", crop_variety: null, growth_stage: "seedling", planted_date: "2026-04-08", expected_harvest: null, days_since_checked: 0, warning_level: "yellow", warning_reason: "Okra seedlings are vulnerable to damping-off and fungal diseases.", risk_score: 0.38, ai_placement_reason: "Zone F — 109.0 acres", colour_hex: "#34d399", is_active: true, created_at: "2026-04-08T07:12:41.365368+00:00", updated_at: "2026-04-24T06:00:32.672+00:00", photo_url: null },
    { id: "1b82e36a-ff31-4b02-b72b-b94f726ef65b", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", label: "G", crop_name: "Sweet Corn", crop_variety: null, growth_stage: "seedling", planted_date: "2026-04-08", expected_harvest: null, days_since_checked: 0, warning_level: "yellow", warning_reason: "Sweet corn seedlings are vulnerable to fungal diseases like rust or blight.", risk_score: 0.38, ai_placement_reason: "Zone G — 26.0 acres", colour_hex: "#fb923c", is_active: true, created_at: "2026-04-08T07:12:41.365368+00:00", updated_at: "2026-04-24T06:00:32.672+00:00", photo_url: null },
  ],

  inventory_items: [
    { id: "7bfbd6bf-9803-4f1e-bc01-b8135ccc0dee", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", item_name: "Baja Bunga (NPK 12-12-17)", item_type: "fertilizer", current_quantity: 0.6, unit: "kg", reorder_threshold: 1.5, reorder_quantity: null, last_purchase_price_rm: 3.80, supplier_name: "Kedai Ah Kow", created_at: "2026-04-11T07:33:37.884989+00:00", updated_at: "2026-04-24T07:58:01.249+00:00" },
    { id: "d6d0a750-44ef-4800-86a1-974bc25cf3ba", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", item_name: "Baja Hijau (NPK 15-15-15)", item_type: "fertilizer", current_quantity: 0, unit: "kg", reorder_threshold: 2, reorder_quantity: null, last_purchase_price_rm: 3.20, supplier_name: "Kedai Ah Kow", created_at: "2026-04-11T07:33:37.884989+00:00", updated_at: "2026-04-24T08:06:13.284+00:00" },
    { id: "888383e9-05ff-4149-97fe-8347605c1680", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", item_name: "Baja MOP Potash", item_type: "fertilizer", current_quantity: 1.8, unit: "kg", reorder_threshold: 1, reorder_quantity: null, last_purchase_price_rm: 4.00, supplier_name: "Kedai Baja Sdn Bhd", created_at: "2026-04-11T07:33:37.884989+00:00", updated_at: "2026-04-11T07:33:37.884989+00:00" },
    { id: "b498b1b9-1925-4785-85e5-2fcd741ce98a", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", item_name: "Baja Urea 46%", item_type: "fertilizer", current_quantity: 1.5, unit: "kg", reorder_threshold: 1, reorder_quantity: null, last_purchase_price_rm: 2.50, supplier_name: "Kedai Baja Sdn Bhd", created_at: "2026-04-11T07:33:37.884989+00:00", updated_at: "2026-04-24T08:14:18.913+00:00" },
    { id: "69f54feb-fef5-4777-bd99-4d29ee99c3af", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", item_name: "Confidor (Imidacloprid)", item_type: "pesticide", current_quantity: 80, unit: "ml", reorder_threshold: 30, reorder_quantity: null, last_purchase_price_rm: 0.06, supplier_name: "Agri Supplies KL", created_at: "2026-04-11T07:33:37.884989+00:00", updated_at: "2026-04-11T07:33:37.884989+00:00" },
    { id: "6f42d0d4-7c2b-49f7-94e4-b6d32615f41a", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", item_name: "Dipel (Bt Spray)", item_type: "pesticide", current_quantity: 150, unit: "ml", reorder_threshold: 40, reorder_quantity: null, last_purchase_price_rm: 0.07, supplier_name: "Agri Supplies KL", created_at: "2026-04-11T07:33:37.884989+00:00", updated_at: "2026-04-11T07:33:37.884989+00:00" },
    { id: "15a7d4d7-7839-4706-8c83-847a0918e0f2", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", item_name: "Dithane M-45 (Mancozeb)", item_type: "pesticide", current_quantity: 450, unit: "ml", reorder_threshold: 100, reorder_quantity: null, last_purchase_price_rm: 0.03, supplier_name: "Agri Supplies KL", created_at: "2026-04-11T07:33:37.884989+00:00", updated_at: "2026-04-11T07:33:37.884989+00:00" },
    { id: "18281773-f09e-4af6-aba9-a6dcbc3955c8", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", item_name: "Kocide (Copper Hydroxide)", item_type: "pesticide", current_quantity: 300, unit: "ml", reorder_threshold: 80, reorder_quantity: null, last_purchase_price_rm: 0.04, supplier_name: "Kedai Ah Kow", created_at: "2026-04-11T07:33:37.884989+00:00", updated_at: "2026-04-11T07:33:37.884989+00:00" },
    { id: "359f69b8-0886-4921-9ec4-581dc30c5d49", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", item_name: "Lorsban (Chlorpyrifos)", item_type: "pesticide", current_quantity: 200, unit: "ml", reorder_threshold: 50, reorder_quantity: null, last_purchase_price_rm: 0.05, supplier_name: "Agri Supplies KL", created_at: "2026-04-11T07:33:37.884989+00:00", updated_at: "2026-04-11T07:33:37.884989+00:00" },
  ],

  equipment: [
    { id: "cb0c8b42-b432-4839-8b64-5c4d1d113ab1", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", name: "Honda WB20 Water Pump", category: "irrigation", purchase_date: "2024-03-15", purchase_price_rm: 1200, salvage_value_rm: 150, useful_life_years: 5, depreciation_method: "straight_line", current_book_value_rm: 850, condition: "good", last_serviced_date: "2026-01-10", created_at: "2026-04-11T08:01:32.745667+00:00" },
    { id: "af140acc-7855-4b03-9220-afb19db5db40", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", name: "Solo 425 Backpack Sprayer", category: "spraying", purchase_date: "2025-01-20", purchase_price_rm: 280, salvage_value_rm: 30, useful_life_years: 4, depreciation_method: "straight_line", current_book_value_rm: 215, condition: "good", last_serviced_date: "2026-03-01", created_at: "2026-04-11T08:01:32.745667+00:00" },
    { id: "be0cb9d9-4ed6-4363-8210-f639c719fa5c", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", name: "Tajima Harvest Knife Set", category: "harvesting", purchase_date: "2025-06-01", purchase_price_rm: 85, salvage_value_rm: 10, useful_life_years: 3, depreciation_method: "straight_line", current_book_value_rm: 60, condition: "fair", last_serviced_date: null, created_at: "2026-04-11T08:01:32.745667+00:00" },
    { id: "f282a67c-7cbc-417c-aef8-cd669fbe893e", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", name: "Wheelbarrow (70L)", category: "transport", purchase_date: "2023-08-10", purchase_price_rm: 180, salvage_value_rm: 20, useful_life_years: 6, depreciation_method: "straight_line", current_book_value_rm: 95, condition: "fair", last_serviced_date: "2025-09-15", created_at: "2026-04-11T08:01:32.745667+00:00" },
    { id: "4195989a-c28c-4b09-b95f-ec8c50fb8e8c", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", name: "Drip Irrigation Kit (500m)", category: "irrigation", purchase_date: "2025-11-01", purchase_price_rm: 650, salvage_value_rm: 50, useful_life_years: 5, depreciation_method: "straight_line", current_book_value_rm: 590, condition: "excellent", last_serviced_date: null, created_at: "2026-04-11T08:01:32.745667+00:00" },
  ],

  customers: [
    { id: "c1a00000-0000-4000-a000-000000000001", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", name: "Restoran Ah Huat", phone: "012-3456789", address: "Lot 23, Jln Besar, Kuala Langat", notes: "Regular buyer, pays on time. Prefers cili padi and kangkung.", total_outstanding_rm: 336.00, created_at: "2026-04-11T09:09:14.729859+00:00" },
    { id: "c1a00000-0000-4000-a000-000000000002", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", name: "Pasar Tani Kuala Langat", phone: "013-9876543", address: "Pasar Tani, Banting", notes: "Weekly market. Cash on delivery.", total_outstanding_rm: 108, created_at: "2026-04-11T09:09:14.729859+00:00" },
  ],

  suppliers: [
    { id: "a1b00000-0000-4000-b000-000000000001", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", name: "Kedai Ah Kow", phone: "016-5551234", address: "No 8, Jln Pertanian, Banting", notes: "Main fertilizer supplier. Good prices on NPK.", created_at: "2026-04-11T09:09:14.729859+00:00" },
    { id: "a1b00000-0000-4000-b000-000000000002", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", name: "Agri Supplies KL", phone: "03-80001234", address: "Lot 5, Kawasan Perindustrian, Shah Alam", notes: "Pesticides and seeds. Delivery within 2 days.", created_at: "2026-04-11T09:09:14.729859+00:00" },
  ],

  weather_snapshots: [
    { id: "67a7eea1-f054-46f1-a13f-cb682a21a856", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", fetched_at: "2026-04-24T06:00:19.128383+00:00", condition: "sunny", temp_celsius: 28, humidity_pct: 75, rainfall_mm: 0, wind_kmh: 12, forecast_json: [{ date: "2026-04-24", temp_max: 32, temp_min: 24, condition: "sunny", rain_chance: 10 }, { date: "2026-04-25", temp_max: 30, temp_min: 24, condition: "sunny", rain_chance: 10 }, { date: "2026-04-26", temp_max: 33, temp_min: 24, condition: "rainy", rain_chance: 80 }, { date: "2026-04-27", temp_max: 33, temp_min: 24, condition: "sunny", rain_chance: 10 }, { date: "2026-04-28", temp_max: 30, temp_min: 26, condition: "overcast", rain_chance: 40 }] },
  ],

  farm_alerts: [
    { id: "33cc43f9-c037-40d4-85b5-98ba29739c88", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", alert_type: "disease_outbreak", title: "Bacterial wilt outbreak in Kuala Langat", summary: "Multiple farms in Kuala Langat district reported bacterial wilt on chilli crops. Spread via contaminated soil water.", severity: "high", affected_crops: ["Chilli"], recommended_action: "Inspect all chilli plots immediately. Avoid overhead watering. Remove and destroy infected plants.", source_type: "community_outbreak", read: true, dismissed: false, dedup_key: "bwilt:3da5d81d", created_at: "2026-04-11T08:01:48.527316+00:00" },
    { id: "f264e3cd-ef74-439f-be9c-01310671b6c6", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", alert_type: "weather_warning", title: "Heavy rain expected next 48 hours", summary: "MetMalaysia issued a yellow warning for Selangor. 40-60mm rainfall expected. Risk of flash floods in low-lying areas.", severity: "medium", affected_crops: [], recommended_action: "Clear drainage channels. Delay pesticide spraying. Move equipment to higher ground.", source_type: "weather_pattern", read: true, dismissed: false, dedup_key: "rain48h:3da5d81d", created_at: "2026-04-11T08:01:48.527316+00:00" },
    { id: "2739cad6-b77c-4eab-bc0d-bdb224bda00c", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", alert_type: "market_alert", title: "Chilli prices up 18% this week", summary: "FAMA wholesale price for cili padi increased from RM12/kg to RM14.16/kg due to supply shortage from east coast floods.", severity: "low", affected_crops: ["Chilli"], recommended_action: "Good time to sell if harvest ready. Consider planting more chilli for next cycle.", source_type: "news", read: true, dismissed: false, dedup_key: "chilliprice:3da5d81d", created_at: "2026-04-11T08:01:48.527316+00:00" },
  ],

  market_prices: [
    { id: "9cbb48a9-41d5-4170-abc0-72c28c4ee6e4", item_name: "Bendi (Okra)", item_type: "crop", price_per_kg: 6.8, unit: "kg", trend: "up", trend_pct: 8.5, source: null, updated_at: "2026-04-11T08:02:42.566284+00:00" },
    { id: "ed043e05-671b-44ee-9251-fbc05d2aeb11", item_name: "Beras Paddy (GradeA)", item_type: "crop", price_per_kg: 1.2, unit: "kg", trend: "stable", trend_pct: 0, source: "FAMA Malaysia", updated_at: "2026-04-06T14:46:54.772458+00:00" },
    { id: "a8559c81-1480-44a8-a57a-f97851163925", item_name: "Cili Merah (Red Chilli)", item_type: "crop", price_per_kg: 12, unit: "kg", trend: "up", trend_pct: 8.5, source: "FAMA Malaysia", updated_at: "2026-04-06T14:46:54.772458+00:00" },
    { id: "46aa8e6a-c73d-4be7-b2b7-f62a4d717359", item_name: "Cili Padi", item_type: "crop", price_per_kg: 14.16, unit: "kg", trend: "up", trend_pct: 18, source: null, updated_at: "2026-04-11T08:02:42.566284+00:00" },
    { id: "5baa8682-ac83-4134-9216-141c3a3a4659", item_name: "Jagung Manis", item_type: "crop", price_per_kg: 4.2, unit: "kg", trend: "up", trend_pct: 5, source: null, updated_at: "2026-04-11T08:02:42.566284+00:00" },
    { id: "3924c4a7-91f2-4ab3-88ba-6d018a6db10a", item_name: "Kangkung", item_type: "crop", price_per_kg: 3.5, unit: "kg", trend: "stable", trend_pct: -1.2, source: null, updated_at: "2026-04-11T08:02:42.566284+00:00" },
    { id: "1624c459-1c23-4322-af53-e5432642a061", item_name: "Paddy (Beras)", item_type: "crop", price_per_kg: 1.2, unit: "kg", trend: "stable", trend_pct: 0.5, source: null, updated_at: "2026-04-11T08:02:42.566284+00:00" },
    { id: "5840099a-f3ce-463e-8bcf-210c9e10a2f1", item_name: "Terung", item_type: "crop", price_per_kg: 5.6, unit: "kg", trend: "stable", trend_pct: 1, source: null, updated_at: "2026-04-11T08:02:42.566284+00:00" },
    { id: "f34f9f4c-db35-4914-bea6-5d1f5fa6ac8e", item_name: "Timun", item_type: "crop", price_per_kg: 3.8, unit: "kg", trend: "down", trend_pct: -4.5, source: null, updated_at: "2026-04-11T08:02:42.566284+00:00" },
  ],

  diagnosis_sessions: [
    { id: "544d01dd-bdf9-4a5f-a85b-3dbbcf63e4d8", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: "41ea61b9-9b4d-4b92-94ed-5893b62d6f04", plot_event_id: null, layer_reached: 1, final_confidence: 0.72, final_outcome: "uncertain", diagnosis_name: "Possible aphid damage", treatment_plan: ["Apply Confidor (Imidacloprid) spray", "Monitor for 3 days", "Check underside of leaves"], follow_up_status: "pending", follow_up_due: "2026-04-13", closed_at: null, created_at: "2026-04-11T08:02:42.566284+00:00" },
    { id: "8c7692df-3749-47ed-9a3c-7c1c1eb851b8", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: "9c496e8c-0571-4e07-8dc5-62ebf92f7774", plot_event_id: null, layer_reached: 2, final_confidence: 0.88, final_outcome: "confirmed", diagnosis_name: "Cercospora Leaf Spot", treatment_plan: ["Remove affected leaves", "Apply Dithane M-45 (2g/L)", "Spray before 9am", "Repeat every 7 days for 3 weeks", "Improve air circulation"], follow_up_status: "better", follow_up_due: "2026-04-11", closed_at: "2026-04-24T08:00:13.271+00:00", created_at: "2026-04-11T08:02:42.566284+00:00" },
  ],

  // ── Tasks (subset of recent ones for demo) ──
  tasks: [
    { id: "f0959f74-4c14-4df3-8684-24ef03296534", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, title: "Irrigate all seedling plots", description: "Provide daily water to all plots to support seedling growth.", task_type: "watering", priority: "urgent", due_date: "2026-04-25", completed: false, completed_at: null, auto_generated: true, triggered_by: "weather", created_at: "2026-04-25T06:00:00+00:00", resource_item: "Water", resource_quantity: 30000, resource_unit: "litres", estimated_cost_rm: 0, timing_recommendation: "Water early morning or late afternoon to minimize evaporation.", inventory_item_id: null },
    { id: "de8335a5-1127-4a98-ba86-3e5cd8e1fc8b", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: "2d02bf7b-6ed9-420d-963c-9b4c4f39b405", title: "Fertilize Kangkung Plot D", description: "Apply Baja Urea 46% to Kangkung seedlings as per schedule.", task_type: "fertilizing", priority: "normal", due_date: "2026-04-25", completed: false, completed_at: null, auto_generated: true, triggered_by: "schedule", created_at: "2026-04-25T06:00:00+00:00", resource_item: "Baja Urea 46%", resource_quantity: 15, resource_unit: "kg", estimated_cost_rm: 37.5, timing_recommendation: "Apply in the morning, followed by light watering.", inventory_item_id: null },
    { id: "c09388d9-66f4-4ea9-b57a-893dbe6f4271", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: "9c496e8c-0571-4e07-8dc5-62ebf92f7774", title: "Fertilize Chilli Plot B", description: "Apply Baja Bunga (NPK 12-12-17) to Chilli seedlings as per schedule.", task_type: "fertilizing", priority: "normal", due_date: "2026-04-25", completed: false, completed_at: null, auto_generated: true, triggered_by: "schedule", created_at: "2026-04-25T06:00:00+00:00", resource_item: "Baja Bunga (NPK 12-12-17)", resource_quantity: 12, resource_unit: "kg", estimated_cost_rm: 36, timing_recommendation: "Apply in the morning, followed by light watering.", inventory_item_id: null },
    { id: "bc50e8fb-d17c-4db1-921e-aca0b275720f", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, title: "Conduct farm-wide inspection", description: "Check all plots for pest/disease signs, nutrient deficiencies, and overall plant health.", task_type: "inspection", priority: "normal", due_date: "2026-04-25", completed: false, completed_at: null, auto_generated: true, triggered_by: "schedule", created_at: "2026-04-25T06:00:00+00:00", resource_item: null, resource_quantity: 0, resource_unit: null, estimated_cost_rm: 0, timing_recommendation: "Perform during cooler morning hours.", inventory_item_id: null },
    { id: "70fa95c0-b640-447b-8daa-474dacc334fd", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, title: "Re-stock Baja Urea 46%", description: "Purchase additional Baja Urea 46% to ensure sufficient supply.", task_type: "farm_wide", priority: "urgent", due_date: "2026-04-25", completed: false, completed_at: null, auto_generated: true, triggered_by: "inspection_result", created_at: "2026-04-25T06:00:00+00:00", resource_item: "Baja Urea 46%", resource_quantity: 25, resource_unit: "kg", estimated_cost_rm: 62.5, timing_recommendation: "Procure as soon as possible.", inventory_item_id: null },
  ],

  // ── Financial records (recent, for the 30-day chart) ──
  financial_records: [
    { id: "2e00171b-e6d2-4cfd-b33f-e83fd12d218c", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "income", category: "Sales", amount: 108.00, description: "Pasar Tani Kuala Langat (INV-0020)", record_date: "2026-04-12", created_at: "2026-04-23T18:26:23.017717+00:00" },
    { id: "c5c41cb6-0e3c-4a37-9f4d-6c044dd2b846", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "income", category: "Sales", amount: 108.00, description: "Kangkung 18kg @ RM6/kg - Pasar Tani (INV-0014)", record_date: "2026-04-12", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "c317dc22-1c88-4f8e-8131-539cfe0f202a", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "expense", category: "Fertilizer", amount: 45.00, description: "Baja Hijau NPK (15kg) (BILL-0009)", record_date: "2026-04-11", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "17129a05-9f86-498f-9fdf-b81418bad502", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "expense", category: "Fuel", amount: 20.00, description: "Petrol for pump + delivery", record_date: "2026-04-10", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "4cdaeeae-65a6-4254-a2ef-ac71bc5076a5", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "income", category: "Sales", amount: 336.00, description: "Cili padi 24kg @ RM14/kg - Pasar Borong (INV-0002)", record_date: "2026-04-09", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "9a4be87e-e075-4cd7-a39e-d92c100e583c", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "expense", category: "Seeds", amount: 15.00, description: "Benih bendi 100g", record_date: "2026-04-08", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "e4a6c7ae-c185-4cb0-b74f-c283ef56426c", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "income", category: "Sales", amount: 156.00, description: "Kangkung 26kg @ RM6/kg - Restoran Mei (INV-0015)", record_date: "2026-04-06", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "27614bb9-05ad-4ed0-999d-09628b29bf73", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "expense", category: "Labour", amount: 80.00, description: "Abang Ali - 2 days harvest help", record_date: "2026-04-05", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "4bdda83e-79f8-4b76-9e84-d0cb9cac3b01", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "expense", category: "Pesticide", amount: 28.00, description: "Kocide Copper Hydroxide 300ml", record_date: "2026-04-04", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "58cdd850-faa6-4f90-973a-f7761868bf8f", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "income", category: "Sales", amount: 95.00, description: "Timun 25kg @ RM3.80/kg - Pasar Tani (INV-0013)", record_date: "2026-04-03", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "bf43d036-2036-414b-86d9-21f455cbd676", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "income", category: "Subsidy", amount: 200.00, description: "Subsidi Baja MySUBSIDI Q1 2026", record_date: "2026-04-01", created_at: "2026-04-11T08:44:06.456862+00:00" },
    { id: "e0b3c515-4f54-490b-bf9b-de862f4c1b6d", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", plot_id: null, record_type: "income", category: "Sales", amount: 240.00, description: "Cili padi 20kg @ RM12/kg - Restoran Ah Huat (INV-0001)", record_date: "2026-03-30", created_at: "2026-04-11T08:44:06.456862+00:00" },
  ],

  chat_threads: [
    { id: "aaa00000-0000-4000-a000-000000000003", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", title: "Restock Baja Hijau", last_message: "Ready to create a purchase order when you confirm.", last_message_at: "2026-04-11T11:15:07.154054+00:00", is_active: true, created_at: "2026-04-11T11:45:07.154054+00:00", has_unread: false, is_archived: false },
    { id: "aaa00000-0000-4000-a000-000000000002", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", title: "Chilli leaf spot diagnosis", last_message: "Treatment is straightforward: remove affected leaves and apply Dithane M-45.", last_message_at: "2026-04-11T10:45:07.154054+00:00", is_active: true, created_at: "2026-04-11T11:45:07.154054+00:00", has_unread: false, is_archived: false },
    { id: "aaa00000-0000-4000-a000-000000000001", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", title: "Daily operations", last_message: "Your total resource cost today is approximately RM5.36.", last_message_at: "2026-04-11T09:45:07.154054+00:00", is_active: true, created_at: "2026-04-11T11:45:07.154054+00:00", has_unread: false, is_archived: false },
  ],

  chat_messages: [
    { id: "f846eb16-8952-4c4f-bb33-436fc03eb846", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", role: "user", content: "What should I do today?", metadata: null, created_at: "2026-04-11T06:29:48.89395+00:00", thread_id: "aaa00000-0000-4000-a000-000000000001" },
    { id: "31a5e6dd-921f-491c-b51e-4729e580437c", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", role: "assistant", content: "Good morning! Based on your farm data, here are your priorities today:\n\n1. **Water paddy plot A** — 45L needed.\n2. **Apply Baja Hijau to chilli plot B** — Your chilli seedlings are 14 days old.\n3. **Check drainage channels** — Rain forecast for tomorrow.\n\nTotal cost: RM5.36.", metadata: null, created_at: "2026-04-11T06:29:53.89395+00:00", thread_id: "aaa00000-0000-4000-a000-000000000001" },
    { id: "c5120f87-1bcc-4eae-ba9f-c512f0c84438", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", role: "user", content: "My chilli leaves have brown spots, is it serious?", metadata: null, created_at: "2026-04-11T07:29:48.89395+00:00", thread_id: "aaa00000-0000-4000-a000-000000000002" },
    { id: "7087b507-bfed-4e04-a35a-008b7e2a2c8b", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", role: "assistant", content: "Brown spots on chilli leaves could be Cercospora leaf spot.\n\nTreatment: remove affected leaves and apply Dithane M-45.", metadata: null, created_at: "2026-04-11T07:29:53.89395+00:00", thread_id: "aaa00000-0000-4000-a000-000000000002" },
  ],

  // ── Purchase docs ──
  purchase_rfqs: [
    { id: "f1a00000-0000-4000-a000-000000000001", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", supplier_id: "a1b00000-0000-4000-b000-000000000001", rfq_number: "RFQ-0001", rfq_date: "2026-04-11", status: "quoted", notes: "Requesting price for next month fertilizer supply", total_rm: 150.00, created_at: "2026-04-11T09:09:14.729859+00:00" },
  ],
  purchase_orders: [
    { id: "e1a00000-0000-4000-a000-000000000002", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", supplier_id: "a1b00000-0000-4000-b000-000000000002", rfq_id: null, po_number: "PO-0002", po_date: "2026-04-10", status: "confirmed", total_rm: 59.00, created_at: "2026-04-11T09:09:14.729859+00:00" },
    { id: "e1a00000-0000-4000-a000-000000000025", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", supplier_id: "a1b00000-0000-4000-b000-000000000002", rfq_id: null, po_number: "PO-0011", po_date: "2026-04-05", status: "received", total_rm: 110.00, created_at: "2026-04-11T10:15:37.393746+00:00" },
    { id: "e1a00000-0000-4000-a000-000000000001", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", supplier_id: "a1b00000-0000-4000-b000-000000000001", rfq_id: null, po_number: "PO-0001", po_date: "2026-03-14", status: "received", total_rm: 83.00, created_at: "2026-04-11T09:09:14.729859+00:00" },
  ],
  purchase_invoices: [
    { id: "e3a00000-0000-4000-a000-000000000001", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", supplier_id: "a1b00000-0000-4000-b000-000000000001", po_id: "e1a00000-0000-4000-a000-000000000001", grn_id: "e2a00000-0000-4000-a000-000000000001", bill_number: "BILL-0001", bill_date: "2026-03-16", due_date: "2026-04-16", status: "paid", total_rm: 83.00, paid_rm: 83.00, created_at: "2026-04-11T09:09:14.729859+00:00" },
  ],
  goods_received_notes: [
    { id: "e2a00000-0000-4000-a000-000000000001", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", po_id: "e1a00000-0000-4000-a000-000000000001", supplier_id: "a1b00000-0000-4000-b000-000000000001", grn_number: "GRN-0001", grn_date: "2026-03-16", received_by: "Ben", notes: null, total_rm: 83.00, created_at: "2026-04-11T09:09:14.729859+00:00" },
  ],

  // ── Sales docs ──
  sales_orders: [
    { id: "d2a00000-0000-4000-a000-000000000002", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", customer_id: "c1a00000-0000-4000-a000-000000000001", quotation_id: null, so_number: "SO-0002", so_date: "2026-04-08", status: "fulfilled", total_rm: 336.00, created_at: "2026-04-11T09:09:14.729859+00:00" },
    { id: "d2a00000-0000-4000-a000-000000000001", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", customer_id: "c1a00000-0000-4000-a000-000000000001", quotation_id: "d1a00000-0000-4000-a000-000000000001", so_number: "SO-0001", so_date: "2026-03-22", status: "fulfilled", total_rm: 240.00, created_at: "2026-04-11T09:09:14.729859+00:00" },
  ],
  delivery_orders: [
    { id: "d3a00000-0000-4000-a000-000000000001", farm_id: "3da5d81d-a21b-4119-9354-5e8daff85e69", customer_id: "c1a00000-0000-4000-a000-000000000001", so_id: "d2a00000-0000-4000-a000-000000000001", do_number: "DO-0001", do_date: "2026-03-25", status: "delivered", total_rm: 240.00, created_at: "2026-04-11T09:09:14.729859+00:00" },
  ],

  // Empty tables — judges won't see these in demo flow
  sales_quotations: [] as Record<string, unknown>[],
  sales_invoices: [] as Record<string, unknown>[],
  document_items: [] as Record<string, unknown>[],
  inventory_movements: [] as Record<string, unknown>[],
  plot_events: [] as Record<string, unknown>[],
  farm_features: [] as Record<string, unknown>[],
  farm_zones: [] as Record<string, unknown>[],
  receipt_scans: [] as Record<string, unknown>[],
  treatment_monitoring: [] as Record<string, unknown>[],
  equipment_usage: [] as Record<string, unknown>[],
  planting_plans: [] as Record<string, unknown>[],
  resource_prep_lists: [] as Record<string, unknown>[],
  expert_referrals: [] as Record<string, unknown>[],
  push_subscriptions: [] as Record<string, unknown>[],
  notification_preferences: [] as Record<string, unknown>[],
  onboarding_ai_suggestions: [] as Record<string, unknown>[],
  activity_feed: [] as Record<string, unknown>[],
  payments: [] as Record<string, unknown>[],
  purchase_requests: [] as Record<string, unknown>[],
  grid_cells: [] as Record<string, unknown>[],
  profiles: [{ id: "a7cd8b7d-d657-4d97-b36b-b2b31bd76c4f", email: "demo@agrosim.app", display_name: "Demo Farmer", created_at: "2026-04-08T06:56:58.064639+00:00" }],
};

export type SeedTable = keyof typeof SEED;

export function isDemoMode(): boolean {
  if (typeof process !== "undefined" && process.env) {
    return process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  }
  return false;
}
