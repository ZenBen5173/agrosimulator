/**
 * AgroSim 2.1 — Group buy service.
 *
 * DB layer for pact_group_buys + pact_group_buy_items + pact_group_buy_participants.
 * Pure(-ish) — orchestration (AI flows, PDF generation, cron triggers)
 * lives one layer up.
 *
 * Live cost is computed here (not stored) so the source of truth is
 * always the current participations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GroupBuy,
  GroupBuyDeliveryMode,
  GroupBuyItem,
  GroupBuyParticipation,
  GroupBuyStatus,
  GroupBuyTally,
  GroupBuyTier,
  ParticipantDeliveryMode,
} from "@/lib/groupBuy/types";

// ─── Row converters ─────────────────────────────────────────────

interface GroupBuyRow {
  id: string;
  initiator_user_id: string;
  initiator_farm_id: string;
  district: string;
  item_name: string;
  item_category: string | null;
  unit: string;
  individual_price_rm: string | number | null;
  bulk_price_rm: string | number | null;
  min_participants: number;
  max_participants: number | null;
  closes_at: string;
  supplier_name: string | null;
  supplier_whatsapp: string | null;
  status: GroupBuyStatus;
  restock_request_id: string | null;
  delivery_mode: GroupBuyDeliveryMode;
  meeting_point: string | null;
  tier_pricing: GroupBuyTier[] | null;
  po_pdf_path: string | null;
  po_sent_at: string | null;
  locked_at: string | null;
  created_at: string;
  closed_at: string | null;
}

function rowToGroupBuy(row: GroupBuyRow): GroupBuy {
  return {
    id: row.id,
    initiatorUserId: row.initiator_user_id,
    initiatorFarmId: row.initiator_farm_id,
    district: row.district,
    itemName: row.item_name,
    itemCategory: row.item_category,
    unit: row.unit,
    individualPriceRm:
      row.individual_price_rm === null ? null : Number(row.individual_price_rm),
    bulkPriceRm: row.bulk_price_rm === null ? null : Number(row.bulk_price_rm),
    minParticipants: row.min_participants,
    maxParticipants: row.max_participants,
    closesAt: row.closes_at,
    supplierName: row.supplier_name,
    supplierWhatsapp: row.supplier_whatsapp,
    status: row.status,
    restockRequestId: row.restock_request_id,
    deliveryMode: row.delivery_mode,
    meetingPoint: row.meeting_point,
    tierPricing: row.tier_pricing,
    poPdfPath: row.po_pdf_path,
    poSentAt: row.po_sent_at,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

interface ItemRow {
  id: string;
  group_buy_id: string;
  item_name: string;
  item_category: string | null;
  unit: string;
  individual_price_rm: string | number | null;
  bulk_price_rm: string | number | null;
  reference_inventory_item_id: string | null;
  sort_order: number;
  created_at: string;
}

function rowToItem(row: ItemRow): GroupBuyItem {
  return {
    id: row.id,
    groupBuyId: row.group_buy_id,
    itemName: row.item_name,
    itemCategory: row.item_category,
    unit: row.unit,
    individualPriceRm:
      row.individual_price_rm === null ? null : Number(row.individual_price_rm),
    bulkPriceRm: row.bulk_price_rm === null ? null : Number(row.bulk_price_rm),
    referenceInventoryItemId: row.reference_inventory_item_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

interface ParticipationRow {
  id: string;
  group_buy_id: string;
  group_buy_item_id: string | null;
  user_id: string;
  farm_id: string;
  quantity_committed: string | number;
  delivery_mode: ParticipantDeliveryMode | null;
  delivery_address: string | null;
  notes: string | null;
  joined_at: string;
  withdrawn_at: string | null;
}

function rowToParticipation(row: ParticipationRow): GroupBuyParticipation {
  return {
    id: row.id,
    groupBuyId: row.group_buy_id,
    groupBuyItemId: row.group_buy_item_id,
    userId: row.user_id,
    farmId: row.farm_id,
    quantityCommitted: Number(row.quantity_committed),
    deliveryMode: row.delivery_mode,
    deliveryAddress: row.delivery_address,
    notes: row.notes,
    joinedAt: row.joined_at,
    withdrawnAt: row.withdrawn_at,
  };
}

// ─── Group buy CRUD ─────────────────────────────────────────────

export interface CreateGroupBuyInput {
  initiatorUserId: string;
  initiatorFarmId: string;
  district: string;
  itemName: string; // lead item
  itemCategory?: string;
  unit: string;
  individualPriceRm?: number;
  bulkPriceRm?: number;
  minParticipants?: number;
  maxParticipants?: number;
  closesAt: string;
  supplierName?: string;
  supplierWhatsapp?: string;
  restockRequestId?: string;
  deliveryMode?: GroupBuyDeliveryMode;
  meetingPoint?: string;
  tierPricing?: GroupBuyTier[];
  /** Additional items beyond the lead. */
  additionalItems?: Array<{
    itemName: string;
    itemCategory?: string;
    unit: string;
    individualPriceRm?: number;
    bulkPriceRm?: number;
    referenceInventoryItemId?: string;
  }>;
}

export async function createGroupBuy(
  supabase: SupabaseClient,
  input: CreateGroupBuyInput
): Promise<GroupBuy> {
  const { data, error } = await supabase
    .from("pact_group_buys")
    .insert({
      initiator_user_id: input.initiatorUserId,
      initiator_farm_id: input.initiatorFarmId,
      district: input.district,
      item_name: input.itemName,
      item_category: input.itemCategory ?? null,
      unit: input.unit,
      individual_price_rm: input.individualPriceRm ?? null,
      bulk_price_rm: input.bulkPriceRm ?? null,
      min_participants: input.minParticipants ?? 3,
      max_participants: input.maxParticipants ?? null,
      closes_at: input.closesAt,
      supplier_name: input.supplierName ?? null,
      supplier_whatsapp: input.supplierWhatsapp ?? null,
      restock_request_id: input.restockRequestId ?? null,
      delivery_mode: input.deliveryMode ?? "shared_pickup",
      meeting_point: input.meetingPoint ?? null,
      tier_pricing: input.tierPricing ?? null,
      status: "open",
    })
    .select()
    .single();
  if (error || !data)
    throw new Error(`createGroupBuy failed: ${error?.message ?? "unknown"}`);

  const buy = rowToGroupBuy(data as GroupBuyRow);

  // Always create a row for the lead item so the items table is the
  // single source of truth for "what's in this buy".
  await supabase.from("pact_group_buy_items").insert({
    group_buy_id: buy.id,
    item_name: input.itemName,
    item_category: input.itemCategory ?? null,
    unit: input.unit,
    individual_price_rm: input.individualPriceRm ?? null,
    bulk_price_rm: input.bulkPriceRm ?? null,
    sort_order: 0,
  });

  if (input.additionalItems && input.additionalItems.length > 0) {
    const rows = input.additionalItems.map((it, idx) => ({
      group_buy_id: buy.id,
      item_name: it.itemName,
      item_category: it.itemCategory ?? null,
      unit: it.unit,
      individual_price_rm: it.individualPriceRm ?? null,
      bulk_price_rm: it.bulkPriceRm ?? null,
      reference_inventory_item_id: it.referenceInventoryItemId ?? null,
      sort_order: idx + 1,
    }));
    await supabase.from("pact_group_buy_items").insert(rows);
  }

  return buy;
}

export async function getGroupBuy(
  supabase: SupabaseClient,
  id: string
): Promise<GroupBuy | null> {
  const { data, error } = await supabase
    .from("pact_group_buys")
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToGroupBuy(data as GroupBuyRow);
}

export async function listGroupBuys(
  supabase: SupabaseClient,
  query: {
    district?: string;
    status?: GroupBuyStatus[];
    initiatorFarmId?: string;
    limit?: number;
  } = {}
): Promise<GroupBuy[]> {
  let q = supabase
    .from("pact_group_buys")
    .select(
      "*, pact_group_buy_items(id), pact_group_buy_participants(id, quantity_committed)"
    )
    .order("created_at", { ascending: false })
    .limit(query.limit ?? 50);

  if (query.district) q = q.eq("district", query.district);
  if (query.status && query.status.length > 0) q = q.in("status", query.status);
  if (query.initiatorFarmId)
    q = q.eq("initiator_farm_id", query.initiatorFarmId);

  const { data, error } = await q;
  if (error || !data) return [];

  return (
    data as Array<
      GroupBuyRow & {
        pact_group_buy_items?: { id: string }[];
        pact_group_buy_participants?: {
          id: string;
          quantity_committed: number | string;
        }[];
      }
    >
  ).map((row) => {
    const base = rowToGroupBuy(row);
    return {
      ...base,
      itemCount: row.pact_group_buy_items?.length ?? 0,
      participantCount: row.pact_group_buy_participants?.length ?? 0,
      totalCommittedQty:
        row.pact_group_buy_participants?.reduce(
          (s, p) => s + Number(p.quantity_committed ?? 0),
          0
        ) ?? 0,
    };
  });
}

export async function transitionGroupBuyStatus(
  supabase: SupabaseClient,
  id: string,
  to: GroupBuyStatus,
  extra: { lockedAt?: string; closedAt?: string; poSentAt?: string; poPdfPath?: string } = {}
): Promise<void> {
  const update: Record<string, unknown> = { status: to };
  if (extra.lockedAt) update.locked_at = extra.lockedAt;
  if (extra.closedAt || to === "closed" || to === "fulfilled" || to === "cancelled")
    update.closed_at = extra.closedAt ?? new Date().toISOString();
  if (extra.poSentAt) update.po_sent_at = extra.poSentAt;
  if (extra.poPdfPath) update.po_pdf_path = extra.poPdfPath;
  await supabase.from("pact_group_buys").update(update).eq("id", id);
}

// ─── Items ──────────────────────────────────────────────────────

export async function listItems(
  supabase: SupabaseClient,
  groupBuyId: string
): Promise<GroupBuyItem[]> {
  const { data, error } = await supabase
    .from("pact_group_buy_items")
    .select()
    .eq("group_buy_id", groupBuyId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as ItemRow[]).map(rowToItem);
}

// ─── Participations ─────────────────────────────────────────────

export interface JoinGroupBuyInput {
  groupBuyId: string;
  groupBuyItemId?: string; // optional for multi-item: which SKU
  userId: string;
  farmId: string;
  quantityCommitted: number;
  deliveryMode?: ParticipantDeliveryMode;
  deliveryAddress?: string;
  notes?: string;
}

export async function joinGroupBuy(
  supabase: SupabaseClient,
  input: JoinGroupBuyInput
): Promise<GroupBuyParticipation> {
  const { data, error } = await supabase
    .from("pact_group_buy_participants")
    .insert({
      group_buy_id: input.groupBuyId,
      group_buy_item_id: input.groupBuyItemId ?? null,
      user_id: input.userId,
      farm_id: input.farmId,
      quantity_committed: input.quantityCommitted,
      delivery_mode: input.deliveryMode ?? null,
      delivery_address: input.deliveryAddress ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error || !data)
    throw new Error(`joinGroupBuy failed: ${error?.message ?? "unknown"}`);
  return rowToParticipation(data as ParticipationRow);
}

export async function withdrawParticipation(
  supabase: SupabaseClient,
  participationId: string
): Promise<void> {
  await supabase
    .from("pact_group_buy_participants")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("id", participationId);
}

export async function listParticipations(
  supabase: SupabaseClient,
  groupBuyId: string,
  opts: { includeWithdrawn?: boolean } = {}
): Promise<GroupBuyParticipation[]> {
  let q = supabase
    .from("pact_group_buy_participants")
    .select()
    .eq("group_buy_id", groupBuyId)
    .order("joined_at", { ascending: true });
  if (!opts.includeWithdrawn) q = q.is("withdrawn_at", null);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as ParticipationRow[]).map(rowToParticipation);
}

// ─── Tally / live cost ──────────────────────────────────────────

/**
 * Group participations by item and total them against the price tiers.
 * Returns one row per item (lead item + every additional item, even if
 * zero participants — so the join-card UI can render "no one's signed
 * up for this yet" for empty SKUs).
 */
export async function tallyGroupBuy(
  supabase: SupabaseClient,
  groupBuyId: string
): Promise<GroupBuyTally[]> {
  const [items, participations, parent] = await Promise.all([
    listItems(supabase, groupBuyId),
    listParticipations(supabase, groupBuyId),
    getGroupBuy(supabase, groupBuyId),
  ]);

  if (!parent) return [];

  // Build a virtual list of items: every items-table row + a synthetic
  // entry for the parent's lead item if items table is somehow empty
  // (defensive — every buy should have at least the seeded lead row).
  const itemEntries: Array<{
    itemId: string | null;
    itemName: string;
    unit: string;
    bulkPriceRm: number | null;
    individualPriceRm: number | null;
  }> = items.length
    ? items.map((it) => ({
        itemId: it.id,
        itemName: it.itemName,
        unit: it.unit,
        bulkPriceRm: it.bulkPriceRm,
        individualPriceRm: it.individualPriceRm,
      }))
    : [
        {
          itemId: null,
          itemName: parent.itemName,
          unit: parent.unit,
          bulkPriceRm: parent.bulkPriceRm,
          individualPriceRm: parent.individualPriceRm,
        },
      ];

  return itemEntries.map((entry) => {
    // Match this item against participations:
    //   - if participations have group_buy_item_id, match by id
    //   - if null (legacy / lead-item-only), match the first item only
    const matching = participations.filter((p) => {
      if (entry.itemId === null) return p.groupBuyItemId === null;
      if (p.groupBuyItemId === entry.itemId) return true;
      // Lead-item participations (null group_buy_item_id) bind to the
      // first item (sort_order 0) when items exist
      if (p.groupBuyItemId === null && itemEntries[0]?.itemId === entry.itemId)
        return true;
      return false;
    });
    const totalQty = matching.reduce((s, p) => s + p.quantityCommitted, 0);
    const uniqueParticipants = new Set(matching.map((p) => p.userId)).size;
    const totalAtBulk =
      entry.bulkPriceRm != null ? totalQty * entry.bulkPriceRm : null;
    const totalAtIndividual =
      entry.individualPriceRm != null ? totalQty * entry.individualPriceRm : null;
    const saving =
      totalAtBulk != null && totalAtIndividual != null
        ? Math.max(0, totalAtIndividual - totalAtBulk)
        : null;

    return {
      itemId: entry.itemId,
      itemName: entry.itemName,
      unit: entry.unit,
      totalCommittedQty: totalQty,
      participantCount: uniqueParticipants,
      bulkPriceRm: entry.bulkPriceRm,
      individualPriceRm: entry.individualPriceRm,
      totalAtBulkPriceRm: totalAtBulk,
      totalAtIndividualPriceRm: totalAtIndividual,
      savingRm: saving,
    };
  });
}

// ─── Bulk evaluation (cron helper) ──────────────────────────────

/**
 * Returns group buys whose deadline has just passed and are still 'open'
 * or 'met_minimum'. Used by the cron tick to lock buys + trigger PO.
 */
export async function listEndedAwaitingPo(
  supabase: SupabaseClient
): Promise<GroupBuy[]> {
  const { data, error } = await supabase
    .from("pact_group_buys")
    .select()
    .lt("closes_at", new Date().toISOString())
    .in("status", ["open", "met_minimum"]);
  if (error || !data) return [];
  return (data as GroupBuyRow[]).map(rowToGroupBuy);
}
