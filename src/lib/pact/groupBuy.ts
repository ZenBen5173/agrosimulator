/**
 * Pure logic for the Pact group-buy feature.
 *
 * A group buy is one farmer (the initiator) saying "I want X bags of NPK,
 * the bulk price is RM Y instead of RM Z, who's in?" Other farmers in the
 * same district see it and tap to join. When min_participants is reached,
 * the group buy auto-flips to "met_minimum" — the initiator can then close
 * it and AgroSim sends one combined order to the supplier.
 *
 * This file is pure logic — no I/O. The persistence layer
 * (src/services/pact/groupBuyService.ts) calls these functions.
 */

import type { GroupBuyStatus } from "./types";

export interface CreateGroupBuyInput {
  initiatorUserId: string;
  initiatorFarmId: string;
  district: string;
  itemName: string;
  itemCategory?: string;
  unit: string;
  individualPriceRm: number;
  bulkPriceRm: number;
  minParticipants: number;
  maxParticipants?: number;
  closesAt: string; // ISO datetime
  supplierName?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate group-buy input. Pure — returns list of errors (empty if valid).
 */
export function validateCreateGroupBuy(
  input: CreateGroupBuyInput
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input.itemName.trim()) {
    errors.push({ field: "itemName", message: "Item name is required" });
  }
  if (!input.unit.trim()) {
    errors.push({ field: "unit", message: "Unit is required" });
  }
  if (!input.district.trim()) {
    errors.push({ field: "district", message: "District is required" });
  }
  if (input.individualPriceRm <= 0) {
    errors.push({
      field: "individualPriceRm",
      message: "Individual price must be > 0",
    });
  }
  if (input.bulkPriceRm <= 0) {
    errors.push({ field: "bulkPriceRm", message: "Bulk price must be > 0" });
  }
  if (input.bulkPriceRm >= input.individualPriceRm) {
    errors.push({
      field: "bulkPriceRm",
      message: "Bulk price must be lower than individual price (otherwise no benefit)",
    });
  }
  if (input.minParticipants < 2) {
    errors.push({
      field: "minParticipants",
      message: "A group buy needs at least 2 participants",
    });
  }
  if (
    input.maxParticipants !== undefined &&
    input.maxParticipants < input.minParticipants
  ) {
    errors.push({
      field: "maxParticipants",
      message: "Max participants must be >= min participants",
    });
  }

  // Closes_at must be in the future
  const closesAt = new Date(input.closesAt);
  if (Number.isNaN(closesAt.getTime())) {
    errors.push({ field: "closesAt", message: "closesAt must be a valid ISO datetime" });
  } else if (closesAt.getTime() <= Date.now()) {
    errors.push({ field: "closesAt", message: "closesAt must be in the future" });
  }

  return errors;
}

// ─── Pricing helpers ────────────────────────────────────────────

/** Per-farmer savings vs going alone (RM per unit). */
export function savingsPerUnit(
  individualPriceRm: number,
  bulkPriceRm: number
): number {
  return Math.max(0, individualPriceRm - bulkPriceRm);
}

/** Savings as a percentage (0-100). */
export function savingsPercent(
  individualPriceRm: number,
  bulkPriceRm: number
): number {
  if (individualPriceRm <= 0) return 0;
  return Math.round(
    ((individualPriceRm - bulkPriceRm) / individualPriceRm) * 100
  );
}

// ─── Status logic ───────────────────────────────────────────────

export type GroupBuyDbStatus =
  | "open"
  | "met_minimum"
  | "closed"
  | "fulfilled"
  | "cancelled";

/**
 * Compute the live status of a group buy given its raw row + current
 * participant count. Pure — used by the service to derive status.
 */
export function deriveStatus(args: {
  rawStatus: GroupBuyDbStatus;
  participants: number;
  minParticipants: number;
  maxParticipants?: number;
  closesAt: string;
}): GroupBuyDbStatus {
  if (
    args.rawStatus === "closed" ||
    args.rawStatus === "fulfilled" ||
    args.rawStatus === "cancelled"
  ) {
    return args.rawStatus;
  }

  // Auto-close when capacity hit
  if (
    args.maxParticipants !== undefined &&
    args.participants >= args.maxParticipants
  ) {
    return "closed";
  }

  // Auto-close when window expired
  if (new Date(args.closesAt).getTime() <= Date.now()) {
    if (args.participants >= args.minParticipants) return "closed";
    return "cancelled"; // didn't reach minimum before deadline
  }

  return args.participants >= args.minParticipants ? "met_minimum" : "open";
}

// ─── Surface mapping for UI ─────────────────────────────────────

export function buildStatusForUi(args: {
  groupBuyId: string;
  district: string;
  itemName: string;
  unit: string;
  individualPriceRm: number;
  bulkPriceRm: number;
  participants: number;
  minParticipants: number;
  maxParticipants?: number;
  closesAt: string;
  farmerCommitted: boolean;
}): GroupBuyStatus {
  return {
    groupBuyId: args.groupBuyId,
    district: args.district,
    itemName: args.itemName,
    unit: args.unit,
    bulkPriceRm: args.bulkPriceRm,
    individualPriceRm: args.individualPriceRm,
    savingsRm: savingsPerUnit(args.individualPriceRm, args.bulkPriceRm),
    participantsJoined: args.participants,
    participantsTarget: args.minParticipants,
    closesAt: args.closesAt,
    farmerCommitted: args.farmerCommitted,
  };
}

// ─── Supplier message builder ───────────────────────────────────

/**
 * Build the supplier quote-request message that AgroSim copies to the
 * initiator's clipboard when the group buy closes successfully. They paste
 * it into whichever messaging app they use with that kedai (SMS, Telegram,
 * email, in-app chat — channel-agnostic on purpose). Mirrors how a real
 * Malaysian farmer writes such a message — short, polite, with an order
 * summary.
 */
export function buildSupplierQuoteMessage(args: {
  supplierName?: string;
  district: string;
  itemName: string;
  unit: string;
  totalQuantity: number;
  bulkPriceRm: number;
  participantCount: number;
}): string {
  const greeting = args.supplierName
    ? `Salam ${args.supplierName},`
    : "Salam tuan,";
  return [
    greeting,
    "",
    `Kami ${args.participantCount} orang petani dari kawasan ${args.district} ` +
      `nak buat group order:`,
    "",
    `- ${args.itemName}: ${args.totalQuantity} ${args.unit}`,
    `- Harga bulk yang dipersetujui: RM ${args.bulkPriceRm.toFixed(2)} per ${args.unit}`,
    "",
    "Boleh confirm available + delivery time? Terima kasih.",
    "",
    "(Mesej ini dijana oleh AgroSim untuk koperasi petani.)",
  ].join("\n");
}

/**
 * @deprecated Renamed to buildSupplierQuoteMessage. Kept as an alias so
 * existing callers (notably tests) don't break in one go.
 */
export const buildSupplierRfqMessage = buildSupplierQuoteMessage;
