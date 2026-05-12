/**
 * Group-buy persistence service.
 *
 * Wraps the Supabase calls that implement create / list / join / leave /
 * close. The pure logic lives in src/lib/pact/groupBuy.ts and is tested
 * separately.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildStatusForUi,
  deriveStatus,
  validateCreateGroupBuy,
  type CreateGroupBuyInput,
  type GroupBuyDbStatus,
  type ValidationError,
} from "@/lib/pact/groupBuy";
import type { GroupBuyStatus } from "@/lib/pact/types";

// ─── Create ─────────────────────────────────────────────────────

export async function createGroupBuy(
  supabase: SupabaseClient,
  input: CreateGroupBuyInput
): Promise<{ id: string } | { errors: ValidationError[] }> {
  const errors = validateCreateGroupBuy(input);
  if (errors.length > 0) return { errors };

  const { data, error } = await supabase
    .from("pact_group_buys")
    .insert({
      initiator_user_id: input.initiatorUserId,
      initiator_farm_id: input.initiatorFarmId,
      district: input.district,
      item_name: input.itemName,
      item_category: input.itemCategory ?? null,
      unit: input.unit,
      individual_price_rm: input.individualPriceRm,
      bulk_price_rm: input.bulkPriceRm,
      min_participants: input.minParticipants,
      max_participants: input.maxParticipants ?? null,
      closes_at: input.closesAt,
      supplier_name: input.supplierName ?? null,
      // supplier_whatsapp DB column is no longer surfaced via the type/UI —
      // we always insert null. The column is kept on the table so existing
      // rows aren't broken; a future migration can drop it cleanly.
      supplier_whatsapp: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create group buy: ${error?.message ?? "unknown"}`);
  }
  return { id: data.id };
}

// ─── List open in district ──────────────────────────────────────

export async function listOpenGroupBuysInDistrict(
  supabase: SupabaseClient,
  district: string,
  currentUserId: string | null
): Promise<GroupBuyStatus[]> {
  const { data, error } = await supabase
    .from("pact_group_buys")
    .select(
      `
      id, district, item_name, unit,
      individual_price_rm, bulk_price_rm,
      min_participants, max_participants, closes_at, status,
      pact_group_buy_participants ( user_id )
    `
    )
    .eq("district", district)
    .in("status", ["open", "met_minimum"])
    .order("closes_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list group buys: ${error.message}`);
  }

  type Row = {
    id: string;
    district: string;
    item_name: string;
    unit: string;
    individual_price_rm: number;
    bulk_price_rm: number;
    min_participants: number;
    max_participants: number | null;
    closes_at: string;
    status: GroupBuyDbStatus;
    pact_group_buy_participants: { user_id: string }[];
  };

  return (data as unknown as Row[]).map((row) => {
    const participants = row.pact_group_buy_participants?.length ?? 0;
    const live = deriveStatus({
      rawStatus: row.status,
      participants,
      minParticipants: row.min_participants,
      maxParticipants: row.max_participants ?? undefined,
      closesAt: row.closes_at,
    });
    void live; // exposed via DB row.status; live derivation here is informational
    return buildStatusForUi({
      groupBuyId: row.id,
      district: row.district,
      itemName: row.item_name,
      unit: row.unit,
      individualPriceRm: row.individual_price_rm,
      bulkPriceRm: row.bulk_price_rm,
      participants,
      minParticipants: row.min_participants,
      maxParticipants: row.max_participants ?? undefined,
      closesAt: row.closes_at,
      farmerCommitted:
        currentUserId !== null &&
        (row.pact_group_buy_participants?.some((p) => p.user_id === currentUserId) ??
          false),
    });
  });
}

// ─── Join / leave ───────────────────────────────────────────────

export async function joinGroupBuy(
  supabase: SupabaseClient,
  args: {
    groupBuyId: string;
    userId: string;
    farmId: string;
    quantityCommitted: number;
  }
): Promise<{ ok: true } | { error: string }> {
  if (args.quantityCommitted <= 0) {
    return { error: "quantityCommitted must be > 0" };
  }
  const { error } = await supabase.from("pact_group_buy_participants").insert({
    group_buy_id: args.groupBuyId,
    user_id: args.userId,
    farm_id: args.farmId,
    quantity_committed: args.quantityCommitted,
  });
  if (error) {
    if (error.code === "23505") return { error: "Already joined this group buy" };
    return { error: error.message };
  }
  return { ok: true };
}

export async function leaveGroupBuy(
  supabase: SupabaseClient,
  args: { groupBuyId: string; userId: string }
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase
    .from("pact_group_buy_participants")
    .delete()
    .eq("group_buy_id", args.groupBuyId)
    .eq("user_id", args.userId);
  if (error) return { error: error.message };
  return { ok: true };
}
