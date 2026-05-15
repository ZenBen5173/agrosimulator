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
  // 2.1 additions
  restockRequestCount: number;
  restockMessageCount: number;
  restockDocumentCount: number;
  groupBuyItemCount: number;
  journalEntryCount: number;
  journalLineCount: number;
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

  // ─── AgroSim 2.1 additions ────────────────────────────────────
  //
  // Three sections that exercise the chat-to-action loop end-to-end:
  //   A. Multi-item rows + delivery preferences for the group buys above
  //   B. Six restock chats covering every status of the workflow
  //   C. Full double-entry trail in Books (GRNs, sales, treatments,
  //      payments, wastage)

  // ── A. Group-buy items + delivery upgrades ─────────────────────
  let groupBuyItemCount = 0;
  // Look up the group buys we just made by item_name so we can attach items
  const { data: gbAll } = await supabase
    .from("pact_group_buys")
    .select("id, item_name, item_category, unit, individual_price_rm, bulk_price_rm")
    .in("id", groupBuyIds);
  const gbByItemName = new Map((gbAll ?? []).map((g) => [g.item_name as string, g]));

  // Always seed a sort_order=0 row mirroring the parent — one stable
  // place for the items list to read from.
  const itemRowsPayload: Array<Record<string, unknown>> = [];
  for (const g of gbAll ?? []) {
    itemRowsPayload.push({
      group_buy_id: g.id,
      item_name: g.item_name,
      item_category: g.item_category,
      unit: g.unit,
      individual_price_rm: g.individual_price_rm,
      bulk_price_rm: g.bulk_price_rm,
      sort_order: 0,
    });
  }

  // Add a SECOND item to the NPK buy to show the multi-item shape.
  const gbNpkRow = gbByItemName.get("NPK 15-15-15 (50kg sack)");
  if (gbNpkRow) {
    itemRowsPayload.push({
      group_buy_id: gbNpkRow.id,
      item_name: "Borate micronutrient (1kg)",
      item_category: "fertilizer",
      unit: "packet",
      individual_price_rm: 18,
      bulk_price_rm: 14,
      sort_order: 1,
    });
  }
  // And a second item to the Roundup buy.
  const gbRoundRow = gbByItemName.get("Glyphosate 41% (5L can)");
  if (gbRoundRow) {
    itemRowsPayload.push({
      group_buy_id: gbRoundRow.id,
      item_name: "Sticker / wetting agent (1L)",
      item_category: "pesticide",
      unit: "bottle",
      individual_price_rm: 24,
      bulk_price_rm: 19,
      sort_order: 1,
    });
  }
  if (itemRowsPayload.length > 0) {
    await supabase.from("pact_group_buy_items").insert(itemRowsPayload);
    groupBuyItemCount = itemRowsPayload.length;
  }

  // Sprinkle delivery preferences on the existing participations so the
  // consolidated PO PDF has both pickup and per-farmer delivery rows.
  if (gbRoundRow) {
    // Pak Ali wants delivery to his farm (so the PDF shows both modes)
    await supabase
      .from("pact_group_buy_participants")
      .update({
        delivery_mode: "deliver_to_farm",
        delivery_address: "Lot 224, Jalan Sungai Ruil, Cameron Highlands",
      })
      .eq("group_buy_id", gbRoundRow.id)
      .eq("user_id", demoUserId);
    // Hassan does shared pickup
    await supabase
      .from("pact_group_buy_participants")
      .update({ delivery_mode: "pickup" })
      .eq("group_buy_id", gbRoundRow.id)
      .eq("user_id", neighbourUserId);
  }

  // ── B. Restock chats — six in different states ─────────────────
  //
  // Case ref format: RR-YYYYMMDD-NNNN (chronological per day per farm).
  // We seed in date order so the day counter stays sane.
  const refForDay = (offsetDays: number, seq: number): string => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `RR-${yyyymmdd}-${String(seq).padStart(4, "0")}`;
  };

  type RestockSeed = {
    /** Days offset from today for opened_at */
    daysAgo: number;
    seq: number;
    inventoryItem: string;
    status:
      | "draft"
      | "awaiting_supplier"
      | "quote_received"
      | "group_buy_live"
      | "po_sent"
      | "closed";
    supplierName?: string;
    requestedQty?: number;
    unit?: string;
    totalValueRm?: number;
    /** Link to one of the group buys by item_name (resolved from gbByItemName) */
    linkedGroupBuyItemName?: string;
    /** Trigger: how the chat opened — drives the system message wording */
    trigger: "manual" | "auto_low_stock";
    closedDaysAgo?: number;
    /** Conversation transcript to lay down */
    messages: Array<{
      role: "ai" | "farmer" | "system";
      daysAgo: number;
      content: string;
      attachments?: Record<string, unknown>;
    }>;
    documents?: Array<{
      kind: "rfq" | "supplier_quote" | "po" | "grn";
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      daysAgo: number;
      parsedData?: Record<string, unknown>;
    }>;
  };

  const restockSeeds: RestockSeed[] = [
    // 1. Antracol — auto-detected low stock 2 days ago, RFQ drafted, awaiting supplier reply
    {
      daysAgo: -2,
      seq: 1,
      inventoryItem: "Antracol 70% WP",
      status: "awaiting_supplier",
      supplierName: "Kedai Pertanian Sungai Ruil",
      requestedQty: 1,
      unit: "kg",
      trigger: "auto_low_stock",
      messages: [
        {
          role: "system",
          daysAgo: -2,
          content: "Detected low stock — opening a restock request automatically.",
        },
        {
          role: "ai",
          daysAgo: -2,
          content:
            "Drafted RFQ for 1 kg Antracol 70% WP (with bulk tiers). Tap \"Generate RFQ PDF\" — I'll create it, you copy the message and download the PDF, then send both to your supplier.",
          attachments: {
            kind: "rfq_draft",
            itemName: "Antracol 70% WP",
            requestedQuantity: 1,
            unit: "kg",
            quantityTiers: [
              { qty: 1, label: "Just for me" },
              { qty: 5, label: "Group of 5 farmers" },
              { qty: 10, label: "Group of 10 farmers" },
            ],
            supplierName: "Kedai Pertanian Sungai Ruil",
            copyToClipboardMessage:
              "Salam tuan,\n\nSaya nak tanya harga untuk Antracol 70% WP:\n- 1 kg (sendiri)\n- 5 kg (group 5 orang)\n- 10 kg (group 10 orang)\n\nTuan ada bulk discount? Terima kasih.\n\n[Pak Ali]",
          },
        },
        {
          role: "system",
          daysAgo: -2,
          content: "RFQ drafted — awaiting supplier reply",
          attachments: { kind: "status_change", from: "draft", to: "awaiting_supplier" },
        },
      ],
      documents: [
        {
          kind: "rfq",
          fileName: "RFQ-RR-DEMO-0001.pdf",
          mimeType: "application/pdf",
          sizeBytes: 18432,
          daysAgo: -2,
        },
      ],
    },
    // 2. NPK 15-15-15 — quote received with bulk discount, group buy is live (linked to gbNpk)
    {
      daysAgo: -3,
      seq: 1,
      inventoryItem: "NPK 15-15-15",
      status: "group_buy_live",
      supplierName: "Kedai Pertanian Ah Kow",
      requestedQty: 5,
      unit: "sack",
      linkedGroupBuyItemName: "NPK 15-15-15 (50kg sack)",
      trigger: "manual",
      messages: [
        {
          role: "system",
          daysAgo: -3,
          content: "Restock request opened from inventory.",
        },
        {
          role: "ai",
          daysAgo: -3,
          content:
            "Drafted RFQ for 5 sack NPK 15-15-15 (with bulk tiers). Tap \"Generate RFQ PDF\" — I'll create it, you copy the message and download the PDF, then send both to your supplier.",
          attachments: {
            kind: "rfq_draft",
            itemName: "NPK 15-15-15",
            requestedQuantity: 5,
            unit: "sack",
            quantityTiers: [
              { qty: 1, label: "Just for me" },
              { qty: 5, label: "Group of 5 farmers" },
              { qty: 10, label: "Group of 10 farmers" },
            ],
            supplierName: "Kedai Pertanian Ah Kow",
            copyToClipboardMessage:
              "Salam tuan,\n\nSaya nak tanya harga NPK 15-15-15 (50kg sack):\n- 1 sack (sendiri)\n- 5 sack (group 5 orang)\n- 10 sack (group 10 orang)\n\nTuan ada bulk discount? Terima kasih.\n\n[Pak Ali]",
          },
        },
        {
          role: "system",
          daysAgo: -3,
          content: "RFQ drafted — awaiting supplier reply",
          attachments: { kind: "status_change", from: "draft", to: "awaiting_supplier" },
        },
        {
          role: "farmer",
          daysAgo: -2,
          content: "Sudah hantar ke Ah Kow di WhatsApp.",
        },
        {
          role: "ai",
          daysAgo: -1,
          content:
            "Got the supplier's reply. Discount of 18% at 5+ sacks — meaningful saving. Want to start a group buy with neighbours so everyone shares the bulk price?",
          attachments: {
            kind: "supplier_quote_parsed",
            vendorName: "Kedai Pertanian Ah Kow",
            tiers: [
              { qty: 1, unit: "sack", pricePerUnitRm: 95 },
              { qty: 5, unit: "sack", pricePerUnitRm: 78 },
              { qty: 10, unit: "sack", pricePerUnitRm: 72 },
            ],
            bulkDiscountDetected: true,
            bulkDiscountReasoning: "Discount of 18% at 5+ sacks vs single sack price",
            raw: "1 sack @ RM 95.00, 5 sack @ RM 78.00, 10 sack @ RM 72.00",
          },
        },
        {
          role: "system",
          daysAgo: -1,
          content: "Supplier quote uploaded + parsed",
          attachments: { kind: "status_change", from: "awaiting_supplier", to: "quote_received" },
        },
        {
          role: "ai",
          daysAgo: -1,
          content:
            "Group buy opened: target 5 sack, closes in 5 days. Share the join link with neighbours in your district WhatsApp group.",
          attachments: {
            kind: "group_buy_proposal",
            itemName: "NPK 15-15-15",
            targetTotalQty: 5,
            unit: "sack",
            bulkPricePerUnitRm: 78,
            individualPriceRm: 95,
            minParticipants: 5,
            supplierName: "Kedai Pertanian Ah Kow",
            closesAtIso: tsOff(5),
            pitch:
              "Group buy NPK 15-15-15 — RM 17 less per sack kalau cukup 5 orang. Tutup Jumaat depan.",
          },
        },
        {
          role: "system",
          daysAgo: -1,
          content: "Group buy opened",
          attachments: { kind: "status_change", from: "quote_received", to: "group_buy_live" },
        },
      ],
      documents: [
        {
          kind: "rfq",
          fileName: "RFQ-RR-DEMO-0002.pdf",
          mimeType: "application/pdf",
          sizeBytes: 19112,
          daysAgo: -3,
        },
        {
          kind: "supplier_quote",
          fileName: "ah-kow-npk-quote.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 142336,
          daysAgo: -1,
          parsedData: {
            vendorName: "Kedai Pertanian Ah Kow",
            tiers: [
              { qty: 1, unit: "sack", pricePerUnitRm: 95 },
              { qty: 5, unit: "sack", pricePerUnitRm: 78 },
              { qty: 10, unit: "sack", pricePerUnitRm: 72 },
            ],
            bulkDiscountDetected: true,
          },
        },
      ],
    },
    // 3. Glyphosate Roundup — Lim's group buy that Pak Ali joined; consolidated PO sent
    {
      daysAgo: -8,
      seq: 1,
      inventoryItem: "Glyphosate 41% (Roundup)",
      status: "po_sent",
      supplierName: "Pertanian Selatan",
      requestedQty: 1,
      unit: "can",
      linkedGroupBuyItemName: "Glyphosate 41% (5L can)",
      trigger: "manual",
      messages: [
        {
          role: "system",
          daysAgo: -8,
          content: "Restock request opened from inventory.",
        },
        {
          role: "ai",
          daysAgo: -8,
          content:
            "Pak Lim already started a Roundup group buy in Cameron Highlands (RM 88/can vs RM 110 solo). I've added you to it.",
          attachments: {
            kind: "group_buy_proposal",
            itemName: "Glyphosate 41% (5L can)",
            targetTotalQty: 4,
            unit: "can",
            bulkPricePerUnitRm: 88,
            individualPriceRm: 110,
            minParticipants: 4,
            supplierName: "Pertanian Selatan",
            closesAtIso: tsOff(-2),
            pitch: "Joined Pak Lim's Roundup group buy — RM 22 saving per can.",
          },
        },
        {
          role: "system",
          daysAgo: -8,
          content: "Group buy joined",
          attachments: { kind: "status_change", from: "draft", to: "group_buy_live" },
        },
        {
          role: "ai",
          daysAgo: -2,
          content:
            "Group buy PO: 4 farmers, RM 352 total. Tap \"Generate PO PDF\" — I'll create it, you copy the message and send to Pertanian Selatan.",
          attachments: {
            kind: "consolidated_po_draft",
            groupBuyId: gbRoundRow?.id ?? "00000000-0000-0000-0000-000000000000",
            itemSummary: [
              { itemName: "Glyphosate 41% (5L can)", totalQuantity: 4, unit: "can", pricePerUnitRm: 88 },
              { itemName: "Sticker / wetting agent (1L)", totalQuantity: 0, unit: "bottle", pricePerUnitRm: 19 },
            ],
            grandTotalRm: 352,
            copyToClipboardMessage:
              "Salam tuan Pertanian Selatan,\n\nKami nak confirm order group buy:\n- Glyphosate 41% (5L can): 4 can @ RM 88.00/can\n\nTotal: RM 352.00 untuk 4 orang petani.\n\nDeliveries to 4 farms:\n1. Lot 224 Sungai Ruil (Pak Ali)\n2. Lim Family Farm\n3. Kebun Pak Hassan\n4. Kebun Mak Cik Salmah\n\nBoleh tuan confirm + bagi tarikh delivery? Terima kasih.\n\n[Pak Lim]",
            deliveryInstructions:
              "Deliveries to 4 farms:\n1. Lot 224 Sungai Ruil (Pak Ali)\n2. Lim Family Farm\n3. Kebun Pak Hassan\n4. Kebun Mak Cik Salmah",
          },
        },
        {
          role: "system",
          daysAgo: -2,
          content: "Consolidated PO PDF generated",
          attachments: { kind: "status_change", from: "group_buy_live", to: "po_sent" },
        },
      ],
      documents: [
        {
          kind: "po",
          fileName: "PO-RR-DEMO-0003.pdf",
          mimeType: "application/pdf",
          sizeBytes: 27840,
          daysAgo: -2,
        },
      ],
    },
    // 4. Urea — fully closed, goods received + paid (drives the books trail)
    {
      daysAgo: -14,
      seq: 1,
      inventoryItem: "Urea",
      status: "closed",
      supplierName: "Kedai Pertanian Ah Kow",
      requestedQty: 4,
      unit: "bag",
      totalValueRm: 128,
      linkedGroupBuyItemName: "Urea (10kg bag)",
      trigger: "manual",
      closedDaysAgo: -1,
      messages: [
        {
          role: "system",
          daysAgo: -14,
          content: "Restock request opened from inventory.",
        },
        {
          role: "ai",
          daysAgo: -14,
          content:
            "Drafted RFQ for 4 bag Urea (with bulk tiers). I'll generate the PDF for you.",
          attachments: {
            kind: "rfq_draft",
            itemName: "Urea",
            requestedQuantity: 4,
            unit: "bag",
            quantityTiers: [
              { qty: 1, label: "Just for me" },
              { qty: 4, label: "Group of 4 farmers" },
              { qty: 8, label: "Group of 8 farmers" },
            ],
            supplierName: "Kedai Pertanian Ah Kow",
            copyToClipboardMessage:
              "Salam tuan, harga urea 10kg untuk 1 / 4 / 8 bag? Terima kasih. [Pak Ali]",
          },
        },
        {
          role: "ai",
          daysAgo: -10,
          content:
            "Got the supplier's reply. 16% saving at 4 bags — let's do a group buy.",
          attachments: {
            kind: "supplier_quote_parsed",
            vendorName: "Kedai Pertanian Ah Kow",
            tiers: [
              { qty: 1, unit: "bag", pricePerUnitRm: 38 },
              { qty: 4, unit: "bag", pricePerUnitRm: 32 },
            ],
            bulkDiscountDetected: true,
            bulkDiscountReasoning: "16% off at 4+ bags",
          },
        },
        {
          role: "ai",
          daysAgo: -3,
          content: "PO drafted + sent. Goods due tomorrow.",
          attachments: {
            kind: "consolidated_po_draft",
            groupBuyId: gbByItemName.get("Urea (10kg bag)")?.id ?? "00000000-0000-0000-0000-000000000000",
            itemSummary: [
              { itemName: "Urea (10kg bag)", totalQuantity: 4, unit: "bag", pricePerUnitRm: 32 },
            ],
            grandTotalRm: 128,
            copyToClipboardMessage:
              "Salam tuan Ah Kow,\n\nConfirm group buy urea 10kg: 4 bag @ RM 32 = RM 128 total. Pickup di kedai esok pagi. Terima kasih. [Pak Ali]",
            deliveryInstructions: "Shared pickup at Kedai Pertanian Ah Kow, Brinchang.",
          },
        },
        {
          role: "farmer",
          daysAgo: -1,
          content: "Marked 1 item as received. Posted to Books — Accounts Payable now reflects this purchase.",
        },
        {
          role: "system",
          daysAgo: -1,
          content: "Goods received + journal posted",
          attachments: { kind: "status_change", from: "po_sent", to: "closed" },
        },
        {
          role: "farmer",
          daysAgo: -1,
          content: "Marked supplier paid: RM 128.00 to Kedai Pertanian Ah Kow. Cash decreased + AP cleared in Books.",
        },
      ],
      documents: [
        { kind: "rfq", fileName: "RFQ-RR-DEMO-0004.pdf", mimeType: "application/pdf", sizeBytes: 17222, daysAgo: -14 },
        { kind: "po", fileName: "PO-RR-DEMO-0004.pdf", mimeType: "application/pdf", sizeBytes: 22118, daysAgo: -3 },
        { kind: "grn", fileName: "GRN-RR-DEMO-0004.txt", mimeType: "text/plain", sizeBytes: 412, daysAgo: -1 },
      ],
    },
    // 5. Chilli seedling tray — fresh today, draft state (no RFQ yet)
    {
      daysAgo: 0,
      seq: 1,
      inventoryItem: "Chilli seed (MC11)",
      status: "draft",
      supplierName: "Mardi Direct",
      trigger: "manual",
      messages: [
        {
          role: "system",
          daysAgo: 0,
          content: "Restock request opened from inventory.",
        },
      ],
    },
    // 6. Mancozeb — earlier purchase, fully closed (drives older book entries)
    {
      daysAgo: -49,
      seq: 1,
      inventoryItem: "Mancozeb 80% WP",
      status: "closed",
      supplierName: "Kedai Pertanian Ah Kow",
      requestedQty: 2,
      unit: "kg",
      totalValueRm: 24,
      trigger: "manual",
      closedDaysAgo: -47,
      messages: [
        { role: "system", daysAgo: -49, content: "Restock request opened from inventory." },
        {
          role: "ai",
          daysAgo: -49,
          content: "Drafted RFQ for 2 kg Mancozeb 80% WP. Sent to Ah Kow on WhatsApp.",
          attachments: {
            kind: "rfq_draft",
            itemName: "Mancozeb 80% WP",
            requestedQuantity: 2,
            unit: "kg",
            quantityTiers: [{ qty: 2, label: "Just for me" }],
            supplierName: "Kedai Pertanian Ah Kow",
            copyToClipboardMessage: "Salam tuan, 2 kg Mancozeb berapa? [Pak Ali]",
          },
        },
        {
          role: "farmer",
          daysAgo: -48,
          content: "Quoted RM 12/kg, total RM 24. Already collected from kedai semalam.",
        },
        {
          role: "system",
          daysAgo: -47,
          content: "Goods received + journal posted",
          attachments: { kind: "status_change", from: "po_sent", to: "closed" },
        },
      ],
      documents: [
        { kind: "rfq", fileName: "RFQ-RR-OLD-0001.pdf", mimeType: "application/pdf", sizeBytes: 16884, daysAgo: -49 },
      ],
    },
  ];

  let restockRequestCount = 0;
  let restockMessageCount = 0;
  let restockDocumentCount = 0;
  for (const seed of restockSeeds) {
    const itemId = itemByName.get(seed.inventoryItem);
    if (!itemId) continue;
    const linkedGroupBuyId = seed.linkedGroupBuyItemName
      ? gbByItemName.get(seed.linkedGroupBuyItemName)?.id
      : null;

    const { data: req } = await supabase
      .from("restock_requests")
      .insert({
        farm_id: demoFarmId,
        user_id: demoUserId,
        inventory_item_id: itemId,
        case_ref: refForDay(seed.daysAgo, seed.seq),
        status: seed.status,
        supplier_name: seed.supplierName ?? null,
        group_buy_id: linkedGroupBuyId ?? null,
        total_value_rm: seed.totalValueRm ?? null,
        requested_quantity: seed.requestedQty ?? null,
        unit: seed.unit ?? null,
        opened_at: tsOff(seed.daysAgo),
        closed_at: seed.closedDaysAgo != null ? tsOff(seed.closedDaysAgo) : null,
      })
      .select("id")
      .single();
    if (!req) continue;
    restockRequestCount += 1;

    if (seed.messages.length > 0) {
      const msgPayload = seed.messages.map((m) => ({
        restock_request_id: req.id,
        farm_id: demoFarmId,
        role: m.role,
        content: m.content,
        attachments: m.attachments ?? null,
        created_at: tsOff(m.daysAgo),
      }));
      await supabase.from("restock_chat_messages").insert(msgPayload);
      restockMessageCount += msgPayload.length;
    }

    if (seed.documents && seed.documents.length > 0) {
      const docPayload = seed.documents.map((d) => ({
        restock_request_id: req.id,
        farm_id: demoFarmId,
        kind: d.kind,
        // Storage path is fictitious — the demo PDFs aren't actually
        // uploaded; the documents tab still surfaces the metadata.
        storage_path: `${demoUserId}/${req.id}/${d.kind}/${d.fileName}`,
        file_name: d.fileName,
        mime_type: d.mimeType,
        size_bytes: d.sizeBytes,
        parsed_data: d.parsedData ?? null,
        created_at: tsOff(d.daysAgo),
      }));
      await supabase.from("restock_documents").insert(docPayload);
      restockDocumentCount += docPayload.length;
    }
  }

  // ── C. Full accounting trail ───────────────────────────────────
  //
  // The chart of accounts was auto-seeded by the AFTER INSERT trigger
  // when we created demoFarm above. We resolve every account by code
  // into a Map, then post backdated journal entries that mirror the
  // farm's real history.
  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, code")
    .eq("farm_id", demoFarmId);
  const accountIdByCode = new Map(
    (accountRows ?? []).map((a) => [a.code as string, a.id as string])
  );
  const acc = (code: string): string => {
    const id = accountIdByCode.get(code);
    if (!id) throw new Error(`Demo seed: account ${code} not seeded for demo farm`);
    return id;
  };

  // Helper: insert one journal entry with its lines. Validates balance
  // up-front so a typo in the seed doesn't silently land an unbalanced
  // entry in the Books.
  type JLine = {
    accountCode: string;
    debit?: number;
    credit?: number;
    description?: string;
  };
  let journalEntryCount = 0;
  let journalLineCount = 0;
  async function postJournal(args: {
    daysAgo: number;
    sourceKind:
      | "restock_grn"
      | "restock_payment"
      | "diagnosis_treatment"
      | "sale"
      | "inventory_wastage"
      | "manual";
    reference: string;
    description?: string;
    supplierName?: string;
    sourceId?: string;
    lines: JLine[];
  }) {
    const debits = args.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const credits = args.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(debits - credits) > 0.005) {
      throw new Error(
        `Demo seed journal unbalanced (${args.reference}): debits=${debits.toFixed(2)} credits=${credits.toFixed(2)}`
      );
    }
    const postedAt = (() => {
      const d = new Date(today);
      d.setDate(d.getDate() + args.daysAgo);
      return d.toISOString().slice(0, 10);
    })();
    const { data: header } = await supabase
      .from("journal_entries")
      .insert({
        farm_id: demoFarmId,
        posted_at: postedAt,
        reference: args.reference,
        description: args.description ?? null,
        source_kind: args.sourceKind,
        source_id: args.sourceId ?? null,
        supplier_name: args.supplierName ?? null,
        total_rm: debits,
        created_by: demoUserId,
        created_at: tsOff(args.daysAgo),
      })
      .select("id")
      .single();
    if (!header) return;
    journalEntryCount += 1;
    const linesPayload = args.lines.map((l) => ({
      journal_entry_id: header.id,
      farm_id: demoFarmId,
      account_id: acc(l.accountCode),
      debit_rm: l.debit ?? 0,
      credit_rm: l.credit ?? 0,
      description: l.description ?? null,
    }));
    await supabase.from("journal_entry_lines").insert(linesPayload);
    journalLineCount += linesPayload.length;
  }

  // 1. Initial owner equity — seed money the farmer started the season with
  await postJournal({
    daysAgo: -90,
    sourceKind: "manual",
    reference: "Opening capital",
    description: "Season-opening cash injection from savings",
    lines: [
      { accountCode: "1100", debit: 2000, description: "Cash on hand" },
      { accountCode: "3100", credit: 2000, description: "Owner contributed capital" },
    ],
  });

  // 2. GRNs — one journal per historical purchase movement.
  const purchaseGrns: Array<{
    daysAgo: number;
    supplier: string;
    invCode: string;
    amount: number;
    desc: string;
    paid?: boolean; // true = also create the payment entry alongside
  }> = [
    { daysAgo: -60, supplier: "Pertanian Selatan",                 invCode: "1230", amount: 145.0, desc: "1 unit Knapsack sprayer 16L", paid: true },
    { daysAgo: -50, supplier: "Mardi Direct",                      invCode: "1220", amount: 15.0,  desc: "0.25 kg Chilli seed (MC11)", paid: true },
    { daysAgo: -49, supplier: "Kedai Pertanian Ah Kow",            invCode: "1210", amount: 24.0,  desc: "2 kg Mancozeb 80% WP" },
    { daysAgo: -40, supplier: "Kedai Pertanian Ah Kow",            invCode: "1200", amount: 112.5, desc: "25 kg NPK 15-15-15", paid: true },
    { daysAgo: -30, supplier: "Pertanian Selatan",                 invCode: "1200", amount: 35.0,  desc: "10 kg Urea" },
    { daysAgo: -25, supplier: "Kedai Pertanian Ah Kow",            invCode: "1200", amount: 26.0,  desc: "5 kg TSP" },
    { daysAgo: -15, supplier: "Kedai Pertanian Sungai Ruil",       invCode: "1210", amount: 28.0,  desc: "1 kg Antracol 70% WP" },
    { daysAgo: -15, supplier: "Kedai Pertanian Sungai Ruil",       invCode: "1210", amount: 44.0,  desc: "2 L Glyphosate 41% (Roundup)" },
  ];
  for (const g of purchaseGrns) {
    await postJournal({
      daysAgo: g.daysAgo,
      sourceKind: "restock_grn",
      reference: `GRN — ${g.supplier}`,
      description: g.desc,
      supplierName: g.supplier,
      lines: [
        { accountCode: g.invCode, debit: g.amount, description: g.desc },
        { accountCode: "2100", credit: g.amount, description: g.supplier },
      ],
    });
    if (g.paid) {
      // Pay the invoice the same day (cash sale through the kedai)
      await postJournal({
        daysAgo: g.daysAgo,
        sourceKind: "restock_payment",
        reference: `Payment — ${g.supplier}`,
        description: `Paid ${g.supplier} RM ${g.amount.toFixed(2)}`,
        supplierName: g.supplier,
        lines: [
          { accountCode: "2100", debit: g.amount, description: g.supplier },
          { accountCode: "1100", credit: g.amount, description: "Cash" },
        ],
      });
    }
  }

  // 3. Urea group buy — closed, goods received + paid (mirror RR-DEMO-0004)
  await postJournal({
    daysAgo: -1,
    sourceKind: "restock_grn",
    reference: "GRN — Urea group buy",
    description: "4 bag Urea (10kg) at bulk RM 32",
    supplierName: "Kedai Pertanian Ah Kow",
    lines: [
      { accountCode: "1200", debit: 128.0, description: "4 bag Urea (10kg)" },
      { accountCode: "2100", credit: 128.0, description: "Kedai Pertanian Ah Kow" },
    ],
  });
  await postJournal({
    daysAgo: -1,
    sourceKind: "restock_payment",
    reference: "Payment — Urea group buy",
    description: "Settled Ah Kow for the urea consolidated PO",
    supplierName: "Kedai Pertanian Ah Kow",
    lines: [
      { accountCode: "2100", debit: 128.0, description: "Kedai Pertanian Ah Kow" },
      { accountCode: "1100", credit: 128.0, description: "Cash on hand" },
    ],
  });

  // 4. Treatment costs — pull from confirmed diagnoses
  const treatmentCosts: Array<{ daysAgo: number; ref: string; desc: string; cost: number }> = [
    { daysAgo: -42, ref: "Treatment — Bacterial Blight", desc: "Plot B paddy, copper-based spray",         cost: 18.0 },
    { daysAgo: -28, ref: "Treatment — Cercospora",       desc: "Plot A chilli, Mancozeb at 0.4 kg",        cost: 4.8 },
    { daysAgo: -12, ref: "Treatment — Anthracnose",      desc: "Plot A chilli, Mancozeb at 0.6 kg",        cost: 7.2 },
    { daysAgo: -10, ref: "Treatment — Sigatoka prevent.", desc: "Plot D banana, Antracol at 0.6 kg",       cost: 16.8 },
  ];
  for (const t of treatmentCosts) {
    await postJournal({
      daysAgo: t.daysAgo,
      sourceKind: "diagnosis_treatment",
      reference: t.ref,
      description: t.desc,
      lines: [
        { accountCode: "5100", debit: t.cost, description: t.desc },
        { accountCode: "1210", credit: t.cost, description: "Pesticide drawn from inventory" },
      ],
    });
  }

  // 5. Sales — post the chilli + paddy + kangkung sales as cash receipts.
  //    (Maps roughly to the farmer_sales rows but uses round numbers.)
  const salePostings: Array<{ daysAgo: number; crop: string; qty: number; price: number; method?: "cash" | "bank" }> = [
    { daysAgo: -56, crop: "chilli",   qty: 8.0,   price: 3.50, method: "cash" },
    { daysAgo: -49, crop: "chilli",   qty: 11.0,  price: 3.60, method: "cash" },
    { daysAgo: -42, crop: "chilli",   qty: 14.0,  price: 3.90, method: "cash" },
    { daysAgo: -35, crop: "chilli",   qty: 12.0,  price: 4.00, method: "cash" },
    { daysAgo: -28, crop: "chilli",   qty: 16.0,  price: 4.10, method: "cash" },
    { daysAgo: -21, crop: "chilli",   qty: 12.0,  price: 3.80, method: "cash" },
    { daysAgo: -14, crop: "chilli",   qty: 15.0,  price: 4.00, method: "cash" },
    { daysAgo: -10, crop: "chilli",   qty: 5.0,   price: 5.00, method: "bank" },
    { daysAgo: -7,  crop: "chilli",   qty: 10.0,  price: 3.90, method: "cash" },
    { daysAgo: -60, crop: "paddy",    qty: 1100.0, price: 2.55, method: "bank" },
    { daysAgo: -14, crop: "kangkung", qty: 6.0,   price: 1.80, method: "cash" },
    { daysAgo: -7,  crop: "kangkung", qty: 8.0,   price: 2.00, method: "cash" },
  ];
  for (const s of salePostings) {
    const total = Math.round(s.qty * s.price * 100) / 100;
    const dr = s.method === "bank" ? "1110" : "1100";
    await postJournal({
      daysAgo: s.daysAgo,
      sourceKind: "sale",
      reference: `Sale: ${s.qty} kg ${s.crop}`,
      description: `Sold ${s.qty} kg ${s.crop} @ RM ${s.price.toFixed(2)}/kg`,
      lines: [
        { accountCode: dr, debit: total, description: `${s.qty} kg ${s.crop}` },
        { accountCode: "4100", credit: total, description: `${s.crop} sales revenue` },
      ],
    });
  }

  // 6. Wastage — a little Mancozeb expired in storage
  await postJournal({
    daysAgo: -20,
    sourceKind: "inventory_wastage",
    reference: "Wastage — expired Mancozeb",
    description: "0.1 kg Mancozeb past its shelf life — written off",
    lines: [
      { accountCode: "5300", debit: 1.2, description: "Wasted Mancozeb (0.1 kg)" },
      { accountCode: "1210", credit: 1.2, description: "Inventory written off" },
    ],
  });

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
    restockRequestCount,
    restockMessageCount,
    restockDocumentCount,
    groupBuyItemCount,
    journalEntryCount,
    journalLineCount,
  };
}
