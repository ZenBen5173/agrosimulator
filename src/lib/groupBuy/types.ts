/**
 * AgroSim 2.1 — Group buy types.
 *
 * Builds on the existing v2.0 PACT group-buy tables. Phase 2 adds:
 *   - multi-item buys (pact_group_buy_items rows)
 *   - per-farmer delivery preference (pickup vs deliver to farm)
 *   - link back to the originating restock chat
 *   - consolidated PO PDF storage path + send timestamp
 *
 * Status lifecycle (from existing schema):
 *   open → met_minimum → closed → fulfilled
 *                                ↘ cancelled
 *
 * "closed" = the join window is shut and we're processing the consolidated
 * PO. "fulfilled" = supplier has been paid + goods received by everyone.
 */

export type GroupBuyStatus =
  | "open"
  | "met_minimum"
  | "closed"
  | "fulfilled"
  | "cancelled";

export type GroupBuyDeliveryMode =
  | "shared_pickup"
  | "per_farmer_delivery"
  | "mixed";

export type ParticipantDeliveryMode = "pickup" | "deliver_to_farm";

export interface GroupBuyTier {
  qty: number; // quantity threshold (in `unit`)
  unit: string;
  pricePerUnitRm: number;
}

/**
 * One row in pact_group_buys. The `item_name`/`unit`/prices on the parent
 * are the *lead item* — for multi-item buys, additional items live in
 * pact_group_buy_items. The list+detail UI surfaces both.
 */
export interface GroupBuy {
  id: string;
  initiatorUserId: string;
  initiatorFarmId: string;
  district: string;
  itemName: string; // lead item
  itemCategory: string | null;
  unit: string;
  individualPriceRm: number | null;
  bulkPriceRm: number | null;
  minParticipants: number;
  maxParticipants: number | null;
  closesAt: string;
  supplierName: string | null;
  supplierWhatsapp: string | null;
  status: GroupBuyStatus;
  // Phase 2 additions
  restockRequestId: string | null;
  deliveryMode: GroupBuyDeliveryMode;
  meetingPoint: string | null;
  tierPricing: GroupBuyTier[] | null;
  poPdfPath: string | null;
  poSentAt: string | null;
  lockedAt: string | null;
  // Timestamps
  createdAt: string;
  closedAt: string | null;
  // Joined-in convenience fields (populated by listGroupBuys)
  itemCount?: number;
  participantCount?: number;
  totalCommittedQty?: number;
}

/**
 * Additional item within a multi-item group buy. The very first item
 * (sort_order=0) typically mirrors the parent's lead item. Each item has
 * its own pricing tiers because suppliers price each SKU separately.
 */
export interface GroupBuyItem {
  id: string;
  groupBuyId: string;
  itemName: string;
  itemCategory: string | null;
  unit: string;
  individualPriceRm: number | null;
  bulkPriceRm: number | null;
  referenceInventoryItemId: string | null;
  sortOrder: number;
  createdAt: string;
}

/**
 * One farmer's commitment to one item. A farmer who wants 3 SKUs from
 * the same group buy has 3 participation rows. `group_buy_item_id` is
 * nullable — null means "the parent's lead item" (back-compat for
 * existing v2.0 PACT data).
 */
export interface GroupBuyParticipation {
  id: string;
  groupBuyId: string;
  groupBuyItemId: string | null;
  userId: string;
  farmId: string;
  quantityCommitted: number;
  deliveryMode: ParticipantDeliveryMode | null;
  deliveryAddress: string | null;
  notes: string | null;
  joinedAt: string;
  withdrawnAt: string | null;
}

/**
 * Live tally for a group buy — computed in code, not stored. Drives the
 * "you save RM X" copy on the join card and the consolidated PO totals.
 */
export interface GroupBuyTally {
  itemId: string | null; // null = lead item
  itemName: string;
  unit: string;
  totalCommittedQty: number;
  participantCount: number;
  bulkPriceRm: number | null;
  individualPriceRm: number | null;
  totalAtBulkPriceRm: number | null;
  totalAtIndividualPriceRm: number | null;
  savingRm: number | null;
}
