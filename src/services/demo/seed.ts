/**
 * Demo data wipe + reseed — RICH version.
 *
 * Mirrors the SQL seed run by hand once on May 11. Designed to make Pak Ali
 * look like a farmer who's been using AgroSim for a full season — multiple
 * plots, real inventory movements, prior diagnoses, weeks of sales, varied
 * group buys with neighbours, plot timeline events, district disease signal.
 *
 * Called from POST /api/demo/reset (which uses the service-role client and
 * is callable unauthed for the landing-page "Reset demo data" button).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const DEMO_EMAIL = "demo@agrosim.app";
export const NEIGHBOUR_EMAIL = "dev@agrosim.app";
const NEIGHBOUR_2_EMAIL = "demo@agrosimulator.com";
const NEIGHBOUR_3_EMAIL = "test@example.com";

export const ALL_FIXTURE_EMAILS = [
  DEMO_EMAIL,
  NEIGHBOUR_EMAIL,
  NEIGHBOUR_2_EMAIL,
  NEIGHBOUR_3_EMAIL,
];

const DEMO_DISTRICT = "Cameron Highlands";
const DEMO_STATE = "Pahang";

// ─── Wipe ───────────────────────────────────────────────────────

/**
 * Wipe all data owned by ANY of the four fixture users (demo + 3 neighbours)
 * in one call. This is the only correct way — wiping subsets leaves stale
 * neighbour-initiated group buys behind, which then get duplicated when the
 * reseed re-creates farms with new UUIDs.
 *
 * Returns the count of affected rows for telemetry.
 */
export async function wipeAllFixtureData(
  supabase: SupabaseClient,
  fixtureUserIds: string[]
): Promise<{ rowsAffected: number }> {
  if (fixtureUserIds.length === 0) return { rowsAffected: 0 };

  let rowsAffected = 0;

  // 1. Group buy participations the fixtures joined in OTHER farmers' buys
  const { count: partCount } = await supabase
    .from("pact_group_buy_participants")
    .delete({ count: "exact" })
    .in("user_id", fixtureUserIds);
  rowsAffected += partCount ?? 0;

  // 2. Farms — CASCADE handles plots, plot_events, tasks, inventory_*,
  //    doctor_diagnosis_sessions, doctor_treatment_followup, farmer_sales,
  //    pact_group_buys (with FK CASCADE we added in v2_0 migration),
  //    chat_threads, chat_messages, weather_snapshots, activity_feed,
  //    farm_features, farm_zones, planting_plans, onboarding_ai_suggestions.
  const { count: farmCount } = await supabase
    .from("farms")
    .delete({ count: "exact" })
    .in("user_id", fixtureUserIds);
  rowsAffected += farmCount ?? 0;

  // 3. District disease aggregate (anonymous, district-scoped).
  const { count: aggCount } = await supabase
    .from("district_disease_aggregate")
    .delete({ count: "exact" })
    .eq("district", DEMO_DISTRICT);
  rowsAffected += aggCount ?? 0;

  return { rowsAffected };
}

// Legacy 2-user wipers retained as thin wrappers so existing imports compile.
export async function wipeDemoData(
  supabase: SupabaseClient,
  demoUserId: string
): Promise<{ rowsAffected: number }> {
  return wipeAllFixtureData(supabase, [demoUserId]);
}

export async function wipeNeighbourData(
  supabase: SupabaseClient,
  neighbourUserId: string
): Promise<{ rowsAffected: number }> {
  return wipeAllFixtureData(supabase, [neighbourUserId]);
}

// ─── Seed ───────────────────────────────────────────────────────

export interface SeedResult {
  demoFarmId: string;
  neighbourFarmId: string;
  plotIds: string[];
  inventoryItemIds: string[];
  diagnosisSessionIds: string[];
  groupBuyIds: string[];
  farmerSalesCount: number;
  movementsCount: number;
  tasksCount: number;
  plotEventsCount: number;
}

export async function seedDemoData(
  supabase: SupabaseClient,
  args: { demoUserId: string; neighbourUserId: string }
): Promise<SeedResult> {
  const { demoUserId, neighbourUserId } = args;

  // Look up the two extra neighbour user IDs (Lim, Salmah) by email so group
  // buys have varied initiators. They may or may not exist; we tolerate
  // either case and fall back to the primary neighbour if not present.
  const { data: usersList } = await supabase.auth.admin.listUsers();
  const neighbour2 = usersList?.users.find((u) => u.email === NEIGHBOUR_2_EMAIL);
  const neighbour3 = usersList?.users.find((u) => u.email === NEIGHBOUR_3_EMAIL);

  // ── Profiles
  const profileRows = [
    {
      id: demoUserId,
      full_name: "Pak Ali (Demo)",
      phone: "+60 12-3456789",
      district: DEMO_DISTRICT,
      state: DEMO_STATE,
    },
    {
      id: neighbourUserId,
      full_name: "Pak Hassan",
      phone: "+60 12-2233445",
      district: DEMO_DISTRICT,
      state: DEMO_STATE,
    },
  ];
  if (neighbour2) {
    profileRows.push({
      id: neighbour2.id,
      full_name: "Pak Lim",
      phone: "+60 12-4455667",
      district: DEMO_DISTRICT,
      state: DEMO_STATE,
    });
  }
  if (neighbour3) {
    profileRows.push({
      id: neighbour3.id,
      full_name: "Mak Cik Salmah",
      phone: "+60 12-9988776",
      district: DEMO_DISTRICT,
      state: DEMO_STATE,
    });
  }
  await supabase.from("profiles").upsert(profileRows, { onConflict: "id" });

  // ── Farms
  const { data: demoFarm } = await supabase
    .from("farms")
    .insert({
      user_id: demoUserId,
      name: "Kebun Demo Pak Ali",
      district: DEMO_DISTRICT,
      state: DEMO_STATE,
      area_acres: 2.5,
      grid_size: 8,
      soil_type: "Loam (clay-loam mix)",
      water_source: "Sungai + reservoir",
      onboarding_done: true,
      terrain_type: "hilly",
      total_parcels: 1,
    })
    .select("id")
    .single();
  if (!demoFarm) throw new Error("seed demo farm failed");
  const demoFarmId = demoFarm.id;

  const { data: hassanFarm } = await supabase
    .from("farms")
    .insert({
      user_id: neighbourUserId,
      name: "Kebun Pak Hassan",
      district: DEMO_DISTRICT,
      state: DEMO_STATE,
      area_acres: 1.8,
      grid_size: 6,
      soil_type: "Loam",
      water_source: "Sungai",
      onboarding_done: true,
      terrain_type: "hilly",
      total_parcels: 1,
    })
    .select("id")
    .single();
  if (!hassanFarm) throw new Error("seed neighbour farm failed");
  const hassanFarmId = hassanFarm.id;

  let limFarmId: string | null = null;
  if (neighbour2) {
    const { data } = await supabase
      .from("farms")
      .insert({
        user_id: neighbour2.id,
        name: "Lim Family Farm",
        district: DEMO_DISTRICT,
        state: DEMO_STATE,
        area_acres: 3.2,
        grid_size: 8,
        soil_type: "Sandy loam",
        water_source: "Borewell",
        onboarding_done: true,
        terrain_type: "hilly",
        total_parcels: 1,
      })
      .select("id")
      .single();
    limFarmId = data?.id ?? null;
  }

  let salmahFarmId: string | null = null;
  if (neighbour3) {
    const { data } = await supabase
      .from("farms")
      .insert({
        user_id: neighbour3.id,
        name: "Kebun Mak Cik Salmah",
        district: DEMO_DISTRICT,
        state: DEMO_STATE,
        area_acres: 1.2,
        grid_size: 5,
        soil_type: "Loam",
        water_source: "Sungai",
        onboarding_done: true,
        terrain_type: "flat",
        total_parcels: 1,
      })
      .select("id")
      .single();
    salmahFarmId = data?.id ?? null;
  }

  // ── 4 plots for the demo farm
  const today = new Date();
  const dayOff = (d: number) => {
    const t = new Date(today);
    t.setDate(t.getDate() + d);
    return t.toISOString().split("T")[0];
  };
  const tsOff = (d: number) => {
    const t = new Date(today);
    t.setDate(t.getDate() + d);
    return t.toISOString();
  };

  const { data: plotRows } = await supabase
    .from("plots")
    .insert([
      {
        farm_id: demoFarmId,
        label: "Plot A",
        crop_name: "chilli",
        crop_variety: "MC11",
        growth_stage: "fruiting",
        planted_date: dayOff(-42),
        expected_harvest: dayOff(28),
        warning_level: "yellow",
        warning_reason: "4 rainy days last week — anthracnose risk elevated",
        risk_score: 0.55,
        is_active: true,
        colour_hex: "#dc2626",
      },
      {
        farm_id: demoFarmId,
        label: "Plot B",
        crop_name: "paddy",
        crop_variety: "MR297",
        growth_stage: "tillering",
        planted_date: dayOff(-28),
        expected_harvest: dayOff(75),
        warning_level: "none",
        risk_score: 0.15,
        is_active: true,
        colour_hex: "#facc15",
      },
      {
        farm_id: demoFarmId,
        label: "Plot C",
        crop_name: "kangkung",
        crop_variety: "Local variety",
        growth_stage: "rapid_growth",
        planted_date: dayOff(-14),
        expected_harvest: dayOff(7),
        warning_level: "none",
        risk_score: 0.1,
        is_active: true,
        colour_hex: "#22c55e",
      },
      {
        farm_id: demoFarmId,
        label: "Plot D",
        crop_name: "banana",
        crop_variety: "Cavendish",
        growth_stage: "fruiting",
        planted_date: dayOff(-180),
        expected_harvest: dayOff(30),
        warning_level: "orange",
        warning_reason: "Black sigatoka risk elevated — humid + leaf wetness",
        risk_score: 0.65,
        is_active: true,
        colour_hex: "#fb923c",
      },
    ])
    .select("id, label, crop_name");
  if (!plotRows) throw new Error("seed plots failed");
  const plotByLabel = new Map(plotRows.map((p) => [p.label, p.id]));
  const plotA = plotByLabel.get("Plot A")!;
  const plotB = plotByLabel.get("Plot B")!;
  const plotC = plotByLabel.get("Plot C")!;
  const plotD = plotByLabel.get("Plot D")!;

  // ── 8 inventory items
  const { data: itemRows } = await supabase
    .from("inventory_items")
    .insert([
      { farm_id: demoFarmId, item_name: "Mancozeb 80% WP", item_type: "pesticide",   current_quantity: 1.5, unit: "kg", reorder_threshold: 0.5, reorder_quantity: 2,    last_purchase_price_rm: 12.0, supplier_name: "Kedai Pertanian Ah Kow" },
      { farm_id: demoFarmId, item_name: "NPK 15-15-15",     item_type: "fertilizer", current_quantity: 12,  unit: "kg", reorder_threshold: 3,   reorder_quantity: 25,   last_purchase_price_rm: 4.5,  supplier_name: "Kedai Pertanian Ah Kow" },
      { farm_id: demoFarmId, item_name: "Urea",             item_type: "fertilizer", current_quantity: 5,   unit: "kg", reorder_threshold: 2,   reorder_quantity: 10,   last_purchase_price_rm: 3.5,  supplier_name: "Pertanian Selatan" },
      { farm_id: demoFarmId, item_name: "TSP (Triple Super Phosphate)", item_type: "fertilizer", current_quantity: 3, unit: "kg", reorder_threshold: 1, reorder_quantity: 5, last_purchase_price_rm: 5.2, supplier_name: "Kedai Pertanian Ah Kow" },
      { farm_id: demoFarmId, item_name: "Antracol 70% WP",  item_type: "pesticide",  current_quantity: 0.4, unit: "kg", reorder_threshold: 0.5, reorder_quantity: 1,    last_purchase_price_rm: 28.0, supplier_name: "Kedai Pertanian Sungai Ruil" },
      { farm_id: demoFarmId, item_name: "Glyphosate 41% (Roundup)", item_type: "pesticide", current_quantity: 2, unit: "L", reorder_threshold: 0.5, reorder_quantity: 2, last_purchase_price_rm: 22.0, supplier_name: "Kedai Pertanian Sungai Ruil" },
      { farm_id: demoFarmId, item_name: "Chilli seed (MC11)", item_type: "seed", current_quantity: 0.2, unit: "kg", reorder_threshold: 0.05, reorder_quantity: 0.25, last_purchase_price_rm: 60.0, supplier_name: "Mardi Direct" },
      { farm_id: demoFarmId, item_name: "Knapsack sprayer 16L", item_type: "tool",   current_quantity: 1,   unit: "unit", reorder_threshold: null, reorder_quantity: null, last_purchase_price_rm: 145.0, supplier_name: "Pertanian Selatan" },
    ])
    .select("id, item_name");
  if (!itemRows) throw new Error("seed inventory failed");
  const itemByName = new Map(itemRows.map((i) => [i.item_name, i.id]));

  // ── 18 inventory movements
  const movements = [
    { item: "Mancozeb 80% WP",            type: "purchase", qty: 2.0,  unit: "kg", plot: null,    note: "Receipt scan: Kedai Ah Kow", days: -49 },
    { item: "Mancozeb 80% WP",            type: "usage",    qty: 0.4,  unit: "kg", plot: plotA,   note: "Sprayed for Cercospora 4 weeks ago", days: -28 },
    { item: "Mancozeb 80% WP",            type: "usage",    qty: 0.6,  unit: "kg", plot: plotA,   note: "Sprayed for anthracnose 12 days ago", days: -12 },
    { item: "NPK 15-15-15",               type: "purchase", qty: 25.0, unit: "kg", plot: null,    note: "Receipt scan: Kedai Ah Kow", days: -40 },
    { item: "NPK 15-15-15",               type: "usage",    qty: 4.0,  unit: "kg", plot: plotA,   note: "Side-dressed chilli", days: -35 },
    { item: "NPK 15-15-15",               type: "usage",    qty: 5.0,  unit: "kg", plot: plotB,   note: "Top-dressed paddy at tillering", days: -14 },
    { item: "NPK 15-15-15",               type: "usage",    qty: 4.0,  unit: "kg", plot: plotD,   note: "Banana monthly feed", days: -7 },
    { item: "Urea",                       type: "purchase", qty: 10.0, unit: "kg", plot: null,    note: "Receipt scan: Pertanian Selatan", days: -30 },
    { item: "Urea",                       type: "usage",    qty: 3.0,  unit: "kg", plot: plotB,   note: "Nitrogen boost for paddy", days: -14 },
    { item: "Urea",                       type: "usage",    qty: 2.0,  unit: "kg", plot: plotC,   note: "Light urea on kangkung", days: -7 },
    { item: "TSP (Triple Super Phosphate)", type: "purchase", qty: 5.0, unit: "kg", plot: null,  note: "Receipt scan: Kedai Ah Kow", days: -25 },
    { item: "TSP (Triple Super Phosphate)", type: "usage",    qty: 2.0, unit: "kg", plot: plotA, note: "Phosphorus deficiency suspected, applied", days: -20 },
    { item: "Antracol 70% WP",            type: "purchase", qty: 1.0,  unit: "kg", plot: null,    note: "Receipt scan: Kedai Sungai Ruil", days: -15 },
    { item: "Antracol 70% WP",            type: "usage",    qty: 0.6,  unit: "kg", plot: plotD,   note: "Sigatoka prevention spray banana", days: -10 },
    { item: "Glyphosate 41% (Roundup)",   type: "purchase", qty: 2.0,  unit: "L",  plot: null,    note: "Receipt scan: Kedai Sungai Ruil", days: -15 },
    { item: "Chilli seed (MC11)",         type: "purchase", qty: 0.25, unit: "kg", plot: null,    note: "Mardi Direct order", days: -50 },
    { item: "Chilli seed (MC11)",         type: "usage",    qty: 0.05, unit: "kg", plot: plotA,   note: "Initial planting Plot A", days: -42 },
    { item: "Knapsack sprayer 16L",       type: "purchase", qty: 1.0,  unit: "unit", plot: null,  note: "Pertanian Selatan, RM 145", days: -60 },
  ];
  await supabase.from("inventory_movements").insert(
    movements.map((m) => ({
      farm_id: demoFarmId,
      item_id: itemByName.get(m.item)!,
      movement_type: m.type,
      quantity: m.qty,
      unit: m.unit,
      plot_id: m.plot,
      notes: m.note,
      created_at: tsOff(m.days),
    }))
  );

  // ── 5 diagnosis sessions
  const sessions: { plotId: string; row: Record<string, unknown> }[] = [
    {
      plotId: plotB,
      row: {
        crop: "paddy", pattern: "few_plants", photo_quality: "good",
        observations: ["Wavy yellow lesions on leaf margins", "Milky bacterial ooze in early morning"],
        candidates: [
          { diseaseId: "paddy_bacterial_blight", name: "Bacterial Blight", probability: 0.88, ruledOut: false },
          { diseaseId: "paddy_blast", name: "Rice Blast", probability: 0.05, ruledOut: true, ruleOutReason: "No spindle-shaped lesions" },
        ],
        history_answers: [{ questionId: "weather", question: "Recent weather?", answer: "rainy" }],
        physical_test: { test: "lesion_margin_check", result: "wavy" },
        result: { outcome: "confirmed", confidence: 0.88 },
        outcome: "confirmed", confidence: 0.88,
        diagnosis_id: "paddy_bacterial_blight", diagnosis_name: "Bacterial Blight",
        finalised_at: tsOff(-42), closed_at: tsOff(-32),
      },
    },
    {
      plotId: plotA,
      row: {
        crop: "chilli", pattern: "few_plants", photo_quality: "good",
        observations: ["Frog-eye lesions with pale centre on chilli leaves", "Yellow halo around spots"],
        candidates: [{ diseaseId: "chilli_cercospora", name: "Cercospora Leaf Spot", probability: 0.92, ruledOut: false }],
        history_answers: [{ questionId: "weather", question: "Recent weather?", answer: "rainy" }],
        physical_test: { test: "lesion_margin_check", result: "frog_eye" },
        result: { outcome: "confirmed", confidence: 0.92 },
        outcome: "confirmed", confidence: 0.92,
        diagnosis_id: "chilli_cercospora", diagnosis_name: "Cercospora Leaf Spot",
        finalised_at: tsOff(-28), closed_at: tsOff(-20),
      },
    },
    {
      plotId: plotA,
      row: {
        crop: "chilli", pattern: "few_plants", photo_quality: "good",
        observations: ["Sunken dark concentric lesions on fruit", "Some fruit rotting from tip"],
        candidates: [{ diseaseId: "chilli_anthracnose", name: "Anthracnose", probability: 0.91, ruledOut: false }],
        history_answers: [{ questionId: "weather", question: "Recent weather?", answer: "rainy" }],
        physical_test: { test: "cut_fruit_inspect_smell", result: "sour" },
        result: { outcome: "confirmed", confidence: 0.91 },
        outcome: "confirmed", confidence: 0.91,
        diagnosis_id: "chilli_anthracnose", diagnosis_name: "Anthracnose",
        finalised_at: tsOff(-12), closed_at: tsOff(-5),
      },
    },
    {
      plotId: plotA,
      row: {
        crop: "chilli", pattern: "one_plant", photo_quality: "acceptable",
        observations: ["Small dark spots on a few lower leaves", "Possible early frog-eye pattern"],
        candidates: [
          { diseaseId: "chilli_cercospora", name: "Cercospora Leaf Spot", probability: 0.72, ruledOut: false },
          { diseaseId: "chilli_anthracnose", name: "Anthracnose", probability: 0.18, ruledOut: false },
        ],
        history_answers: [],
        physical_test: null,
        result: { outcome: "uncertain", confidence: 0.72 },
        outcome: "uncertain", confidence: 0.72,
        diagnosis_id: "chilli_cercospora", diagnosis_name: "Cercospora Leaf Spot",
        finalised_at: tsOff(-4), closed_at: null,
      },
    },
    {
      plotId: plotD,
      row: {
        crop: "banana", pattern: "few_plants", photo_quality: "good",
        observations: ["Dark brown streaks parallel to leaf veins", "Lower (older) leaves more affected"],
        candidates: [{ diseaseId: "banana_sigatoka", name: "Black Sigatoka", probability: 0.85, ruledOut: false }],
        history_answers: [{ questionId: "weather", question: "Recent weather?", answer: "humid" }],
        physical_test: { test: "lesion_margin_check", result: "none_match" },
        result: { outcome: "confirmed", confidence: 0.85 },
        outcome: "confirmed", confidence: 0.85,
        diagnosis_id: "banana_sigatoka", diagnosis_name: "Black Sigatoka",
        finalised_at: tsOff(-1), closed_at: null,
      },
    },
  ];
  const sessionIds: string[] = [];
  for (const s of sessions) {
    const { data } = await supabase
      .from("doctor_diagnosis_sessions")
      .insert({
        farm_id: demoFarmId,
        plot_id: s.plotId,
        user_id: demoUserId,
        ...s.row,
      })
      .select("id, closed_at, diagnosis_name")
      .single();
    if (data) {
      sessionIds.push(data.id);
      // Schedule a follow-up only for OPEN sessions
      if (!data.closed_at) {
        const dueDays = data.diagnosis_name === "Black Sigatoka" ? 4 : 1;
        await supabase.from("doctor_treatment_followup").insert({
          session_id: data.id,
          farm_id: demoFarmId,
          user_id: demoUserId,
          scheduled_for: dayOff(dueDays),
        });
      }
    }
  }

  // ── 12 farmer sales over 8 weeks (chilli weekly + 1 paddy + 2 kangkung + 1 restaurant)
  const sales: { crop: string; days: number; qty: number; price: number; buyer: string; note?: string }[] = [
    { crop: "chilli",   days: -56, qty: 8.0,    price: 3.50, buyer: "middleman" },
    { crop: "chilli",   days: -49, qty: 11.0,   price: 3.60, buyer: "middleman" },
    { crop: "chilli",   days: -42, qty: 14.0,   price: 3.90, buyer: "middleman" },
    { crop: "chilli",   days: -35, qty: 12.0,   price: 4.00, buyer: "middleman" },
    { crop: "chilli",   days: -28, qty: 16.0,   price: 4.10, buyer: "middleman" },
    { crop: "chilli",   days: -21, qty: 12.0,   price: 3.80, buyer: "middleman" },
    { crop: "chilli",   days: -14, qty: 15.0,   price: 4.00, buyer: "middleman" },
    { crop: "chilli",   days: -7,  qty: 10.0,   price: 3.90, buyer: "middleman", note: "Lower than usual — buyer claimed market dip" },
    { crop: "paddy",    days: -60, qty: 1100.0, price: 2.55, buyer: "middleman", note: "Last paddy harvest, sold to Bernas agent" },
    { crop: "kangkung", days: -14, qty: 6.0,    price: 1.80, buyer: "market_stall", note: "Weekly pasar tani" },
    { crop: "kangkung", days: -7,  qty: 8.0,    price: 2.00, buyer: "market_stall", note: "Weekly pasar tani — better price" },
    { crop: "chilli",   days: -10, qty: 5.0,    price: 5.00, buyer: "restaurant",   note: "Restaurant Setapak — premium price for direct sale" },
  ];
  await supabase.from("farmer_sales").insert(
    sales.map((s) => ({
      farm_id: demoFarmId,
      user_id: demoUserId,
      crop: s.crop,
      district: DEMO_DISTRICT,
      sale_date: dayOff(s.days),
      quantity_kg: s.qty,
      price_rm_per_kg: s.price,
      buyer_type: s.buyer,
      buyer_note: s.note ?? null,
    }))
  );

  // ── Group buys (varied states + initiators)
  const groupBuyIds: string[] = [];

  // 1. Demo's NPK — open, 2/5
  const { data: gbNpk } = await supabase
    .from("pact_group_buys")
    .insert({
      initiator_user_id: demoUserId,
      initiator_farm_id: demoFarmId,
      district: DEMO_DISTRICT,
      item_name: "NPK 15-15-15 (50kg sack)",
      item_category: "fertilizer",
      unit: "sack",
      individual_price_rm: 95,
      bulk_price_rm: 78,
      min_participants: 5,
      closes_at: tsOff(5),
      supplier_name: "Kedai Pertanian Ah Kow",
      status: "open",
    })
    .select("id")
    .single();
  if (gbNpk) {
    groupBuyIds.push(gbNpk.id);
    await supabase.from("pact_group_buy_participants").insert([
      { group_buy_id: gbNpk.id, user_id: demoUserId, farm_id: demoFarmId, quantity_committed: 1 },
      { group_buy_id: gbNpk.id, user_id: neighbourUserId, farm_id: hassanFarmId, quantity_committed: 2 },
    ]);
  }

  // 2. Hassan's Mancozeb — open, 1/4 (demo can join)
  const { data: gbManc } = await supabase
    .from("pact_group_buys")
    .insert({
      initiator_user_id: neighbourUserId,
      initiator_farm_id: hassanFarmId,
      district: DEMO_DISTRICT,
      item_name: "Mancozeb 80% WP (1kg packet)",
      item_category: "pesticide",
      unit: "packet",
      individual_price_rm: 28,
      bulk_price_rm: 18,
      min_participants: 4,
      closes_at: tsOff(3),
      supplier_name: "Kedai Pertanian Sungai Ruil",
      status: "open",
    })
    .select("id")
    .single();
  if (gbManc) {
    groupBuyIds.push(gbManc.id);
    await supabase.from("pact_group_buy_participants").insert({
      group_buy_id: gbManc.id, user_id: neighbourUserId, farm_id: hassanFarmId, quantity_committed: 3,
    });
  }

  // 3. Lim's Roundup — met_minimum, demo joined
  if (limFarmId && neighbour2 && salmahFarmId && neighbour3) {
    const { data: gbRound } = await supabase
      .from("pact_group_buys")
      .insert({
        initiator_user_id: neighbour2.id,
        initiator_farm_id: limFarmId,
        district: DEMO_DISTRICT,
        item_name: "Glyphosate 41% (5L can)",
        item_category: "pesticide",
        unit: "can",
        individual_price_rm: 110,
        bulk_price_rm: 88,
        min_participants: 4,
        closes_at: tsOff(6),
        supplier_name: "Pertanian Selatan",
        status: "met_minimum",
      })
      .select("id")
      .single();
    if (gbRound) {
      groupBuyIds.push(gbRound.id);
      await supabase.from("pact_group_buy_participants").insert([
        { group_buy_id: gbRound.id, user_id: neighbour2.id, farm_id: limFarmId, quantity_committed: 1 },
        { group_buy_id: gbRound.id, user_id: neighbourUserId, farm_id: hassanFarmId, quantity_committed: 1 },
        { group_buy_id: gbRound.id, user_id: neighbour3.id, farm_id: salmahFarmId, quantity_committed: 1 },
        { group_buy_id: gbRound.id, user_id: demoUserId, farm_id: demoFarmId, quantity_committed: 1 },
      ]);
    }

    // 4. Salmah's chilli seedlings — open, 1/3
    const { data: gbSeed } = await supabase
      .from("pact_group_buys")
      .insert({
        initiator_user_id: neighbour3.id,
        initiator_farm_id: salmahFarmId,
        district: DEMO_DISTRICT,
        item_name: "Chilli seedling tray (200 cells, MC11)",
        item_category: "seed",
        unit: "tray",
        individual_price_rm: 65,
        bulk_price_rm: 45,
        min_participants: 3,
        closes_at: tsOff(4),
        supplier_name: "Mardi Direct",
        status: "open",
      })
      .select("id")
      .single();
    if (gbSeed) {
      groupBuyIds.push(gbSeed.id);
      await supabase.from("pact_group_buy_participants").insert({
        group_buy_id: gbSeed.id, user_id: neighbour3.id, farm_id: salmahFarmId, quantity_committed: 2,
      });
    }

    // 5. Demo's fulfilled urea — closed/fulfilled
    const { data: gbUrea } = await supabase
      .from("pact_group_buys")
      .insert({
        initiator_user_id: demoUserId,
        initiator_farm_id: demoFarmId,
        district: DEMO_DISTRICT,
        item_name: "Urea (10kg bag)",
        item_category: "fertilizer",
        unit: "bag",
        individual_price_rm: 38,
        bulk_price_rm: 32,
        min_participants: 4,
        closes_at: tsOff(-1),
        supplier_name: "Kedai Pertanian Ah Kow",
        status: "fulfilled",
        closed_at: tsOff(-1),
      })
      .select("id")
      .single();
    if (gbUrea) {
      groupBuyIds.push(gbUrea.id);
      await supabase.from("pact_group_buy_participants").insert([
        { group_buy_id: gbUrea.id, user_id: demoUserId, farm_id: demoFarmId, quantity_committed: 1 },
        { group_buy_id: gbUrea.id, user_id: neighbourUserId, farm_id: hassanFarmId, quantity_committed: 1 },
        { group_buy_id: gbUrea.id, user_id: neighbour2.id, farm_id: limFarmId, quantity_committed: 1 },
        { group_buy_id: gbUrea.id, user_id: neighbour3.id, farm_id: salmahFarmId, quantity_committed: 1 },
      ]);
    }

    // 6. Hassan's failed TSP — cancelled (didn't reach minimum)
    const { data: gbTsp } = await supabase
      .from("pact_group_buys")
      .insert({
        initiator_user_id: neighbourUserId,
        initiator_farm_id: hassanFarmId,
        district: DEMO_DISTRICT,
        item_name: "TSP 50kg sack",
        item_category: "fertilizer",
        unit: "sack",
        individual_price_rm: 110,
        bulk_price_rm: 95,
        min_participants: 5,
        closes_at: tsOff(-2),
        supplier_name: "Pertanian Selatan",
        status: "cancelled",
        closed_at: tsOff(-2),
      })
      .select("id")
      .single();
    if (gbTsp) {
      groupBuyIds.push(gbTsp.id);
      await supabase.from("pact_group_buy_participants").insert([
        { group_buy_id: gbTsp.id, user_id: neighbourUserId, farm_id: hassanFarmId, quantity_committed: 1 },
        { group_buy_id: gbTsp.id, user_id: neighbour2.id, farm_id: limFarmId, quantity_committed: 1 },
      ]);
    }
  }

  // ── 8 tasks (5 pending, 3 completed)
  const tasks: { plot: string | null; title: string; description: string; type: string; priority: string; due: number; completed: boolean; auto: boolean; trigger: string | null }[] = [
    { plot: "Plot A", title: "Inspect Plot A — anthracnose risk", description: "Recent rain + high humidity. Look for sunken dark spots on chilli fruit.", type: "inspection", priority: "urgent", due: 0, completed: false, auto: true, trigger: "weather_pattern" },
    { plot: "Plot C", title: "Water Plot C kangkung", description: "Light watering, kangkung absorbs quickly in hot weather.", type: "watering", priority: "normal", due: 0, completed: false, auto: false, trigger: null },
    { plot: "Plot A", title: "Spray Mancozeb on Plot A", description: "Second application after first spray a week ago. 2.5g/L water.", type: "treatment", priority: "normal", due: 1, completed: false, auto: true, trigger: "treatment_followup_cron" },
    { plot: null,    title: "Pick up shared NPK order", description: "Group buy meets minimum on Friday. Pick up your sack at Kedai Ah Kow.", type: "errand", priority: "normal", due: 5, completed: false, auto: false, trigger: null },
    { plot: "Plot C", title: "Harvest kangkung", description: "Plot C is ready for harvest — 14 days from planting.", type: "harvest", priority: "normal", due: 7, completed: false, auto: false, trigger: null },
    { plot: "Plot D", title: "Spray Antracol on banana", description: "Sigatoka prevention spray.", type: "treatment", priority: "normal", due: -1, completed: true, auto: true, trigger: "risk_alert" },
    { plot: "Plot B", title: "Top-dress urea on paddy", description: "Tillering stage — 3kg of urea broadcast over Plot B.", type: "fertilizing", priority: "normal", due: -3, completed: true, auto: false, trigger: null },
    { plot: "Plot A", title: "Treatment follow-up — anthracnose", description: "Better, same, or worse? Tap to record.", type: "inspection", priority: "urgent", due: -5, completed: true, auto: true, trigger: "treatment_followup_cron" },
  ];
  const plotByLabelLookup = new Map([
    ["Plot A", plotA],
    ["Plot B", plotB],
    ["Plot C", plotC],
    ["Plot D", plotD],
  ]);
  await supabase.from("tasks").insert(
    tasks.map((t) => ({
      farm_id: demoFarmId,
      plot_id: t.plot ? plotByLabelLookup.get(t.plot) : null,
      title: t.title,
      description: t.description,
      task_type: t.type,
      priority: t.priority,
      due_date: dayOff(t.due),
      completed: t.completed,
      completed_at: t.completed ? tsOff(t.due) : null,
      auto_generated: t.auto,
      triggered_by: t.trigger,
    }))
  );

  // ── 14 plot events
  const plotEvents: { plot: string; type: string; disease?: string; severity?: string; notes: string; days: number }[] = [
    { plot: "Plot A", type: "planted",     notes: "Planted MC11 chilli, 200 cells transplanted.", days: -42 },
    { plot: "Plot A", type: "fertilized",  notes: "NPK 15-15-15 side-dressed at 4kg.", days: -35 },
    { plot: "Plot A", type: "diagnosed",   disease: "Cercospora Leaf Spot", severity: "mild", notes: "Diagnosed via doctor flow. Frog-eye lesions confirmed.", days: -28 },
    { plot: "Plot A", type: "treated",     disease: "Cercospora Leaf Spot", severity: "mild", notes: "Sprayed Mancozeb 0.4kg.", days: -28 },
    { plot: "Plot A", type: "observation", notes: "Treatment worked. New leaves clean.", days: -20 },
    { plot: "Plot A", type: "diagnosed",   disease: "Anthracnose", severity: "moderate", notes: "Diagnosed via doctor flow. Sour smell + concentric lesions.", days: -12 },
    { plot: "Plot A", type: "treated",     disease: "Anthracnose", severity: "moderate", notes: "Sprayed Mancozeb 0.6kg.", days: -12 },
    { plot: "Plot A", type: "follow_up",   notes: "Better — treatment worked, case closed.", days: -5 },
    { plot: "Plot B", type: "planted",     notes: "Planted MR297 paddy.", days: -28 },
    { plot: "Plot B", type: "diagnosed",   disease: "Bacterial Blight", severity: "moderate", notes: "Diagnosed via doctor flow. Wavy yellow lesions confirmed.", days: -42 },
    { plot: "Plot B", type: "fertilized",  notes: "NPK + urea top-dressed at tillering stage.", days: -14 },
    { plot: "Plot C", type: "planted",     notes: "Planted kangkung — fast-growing 21-day variety.", days: -14 },
    { plot: "Plot D", type: "planted",     notes: "Planted Cavendish banana sucker.", days: -180 },
    { plot: "Plot D", type: "diagnosed",   disease: "Black Sigatoka", severity: "mild", notes: "Diagnosed via doctor flow. Streak lesions parallel to veins.", days: -1 },
  ];
  await supabase.from("plot_events").insert(
    plotEvents.map((e) => ({
      plot_id: plotByLabelLookup.get(e.plot)!,
      farm_id: demoFarmId,
      event_type: e.type,
      disease_name: e.disease ?? null,
      severity: e.severity ?? null,
      notes: e.notes,
      created_at: tsOff(e.days),
    }))
  );

  // ── District disease aggregates (Cameron Highlands)
  await supabase.from("district_disease_aggregate").insert([
    { district: DEMO_DISTRICT, crop: "chilli",  diagnosis_id: "chilli_anthracnose",     confirmed_count: 4, first_seen_at: dayOff(-14), last_seen_at: dayOff(-2) },
    { district: DEMO_DISTRICT, crop: "chilli",  diagnosis_id: "chilli_cercospora",      confirmed_count: 3, first_seen_at: dayOff(-28), last_seen_at: dayOff(-4) },
    { district: DEMO_DISTRICT, crop: "chilli",  diagnosis_id: "chilli_bacterial_wilt",  confirmed_count: 1, first_seen_at: dayOff(-7),  last_seen_at: dayOff(-7) },
    { district: DEMO_DISTRICT, crop: "banana",  diagnosis_id: "banana_sigatoka",        confirmed_count: 2, first_seen_at: dayOff(-5),  last_seen_at: dayOff(-1) },
    { district: DEMO_DISTRICT, crop: "paddy",   diagnosis_id: "paddy_bacterial_blight", confirmed_count: 3, first_seen_at: dayOff(-42), last_seen_at: dayOff(-10) },
  ]);

  // ── Weather snapshots (past 7 days)
  await supabase.from("weather_snapshots").insert([
    { farm_id: demoFarmId, fetched_at: tsOff(-6), condition: "rainy",    temp_celsius: 24.0, humidity_pct: 88.0, rainfall_mm: 18.0, wind_kmh: 8.0 },
    { farm_id: demoFarmId, fetched_at: tsOff(-5), condition: "rainy",    temp_celsius: 23.5, humidity_pct: 90.0, rainfall_mm: 22.0, wind_kmh: 6.0 },
    { farm_id: demoFarmId, fetched_at: tsOff(-4), condition: "overcast", temp_celsius: 25.0, humidity_pct: 82.0, rainfall_mm: 3.0,  wind_kmh: 10.0 },
    { farm_id: demoFarmId, fetched_at: tsOff(-3), condition: "rainy",    temp_celsius: 24.5, humidity_pct: 87.0, rainfall_mm: 15.0, wind_kmh: 9.0 },
    { farm_id: demoFarmId, fetched_at: tsOff(-2), condition: "overcast", temp_celsius: 26.0, humidity_pct: 78.0, rainfall_mm: 2.0,  wind_kmh: 11.0 },
    { farm_id: demoFarmId, fetched_at: tsOff(-1), condition: "sunny",    temp_celsius: 28.0, humidity_pct: 72.0, rainfall_mm: 0.0,  wind_kmh: 12.0 },
    { farm_id: demoFarmId, fetched_at: tsOff(0),  condition: "sunny",    temp_celsius: 28.5, humidity_pct: 75.0, rainfall_mm: 0.0,  wind_kmh: 12.0 },
  ]);

  // ── Activity feed
  await supabase.from("activity_feed").insert([
    { farm_id: demoFarmId, plot_id: plotA, event_type: "diagnosis",   title: "Anthracnose confirmed on Plot A",  description: "AgroSim ruled out 4 alternatives, recommended Mancozeb.",  created_at: tsOff(-12) },
    { farm_id: demoFarmId, plot_id: plotA, event_type: "treatment",   title: "Sprayed Mancozeb on Plot A",        description: "2.5g per litre, 3 applications planned.",                  created_at: tsOff(-12) },
    { farm_id: demoFarmId, plot_id: plotD, event_type: "diagnosis",   title: "Black Sigatoka risk on Plot D",     description: "Banana leaves showing streak lesions — early intervention.", created_at: tsOff(-1) },
    { farm_id: demoFarmId, plot_id: null,  event_type: "group_buy",   title: "NPK group buy met minimum",         description: "Demo + 4 neighbours pooled for bulk price RM 32/bag.",     created_at: tsOff(-1) },
    { farm_id: demoFarmId, plot_id: plotB, event_type: "fertilizing", title: "Top-dressed paddy with urea",       description: "3kg of urea, tillering stage feed.",                       created_at: tsOff(-14) },
    { farm_id: demoFarmId, plot_id: plotC, event_type: "planting",    title: "Planted kangkung in Plot C",        description: "Fast-growing 21-day variety.",                             created_at: tsOff(-14) },
  ]);

  return {
    demoFarmId,
    neighbourFarmId: hassanFarmId,
    plotIds: Array.from(plotByLabel.values()),
    inventoryItemIds: Array.from(itemByName.values()),
    diagnosisSessionIds: sessionIds,
    groupBuyIds,
    farmerSalesCount: sales.length,
    movementsCount: movements.length,
    tasksCount: tasks.length,
    plotEventsCount: plotEvents.length,
  };
}
