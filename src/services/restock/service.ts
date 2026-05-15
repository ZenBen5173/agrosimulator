/**
 * AgroSim 2.1 — Restock service.
 *
 * Pure(-ish) wrapper around restock_requests / restock_chat_messages /
 * restock_documents tables. The orchestration (AI flows, PDF generation,
 * group-buy creation) lives one layer up; this file is the only thing
 * that touches Supabase for restock data.
 *
 * All methods take a SupabaseClient — the caller wires up the right one
 * (server-component client for routes, service-role for cron jobs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCaseRef,
  type RestockChatMessage,
  type RestockDocument,
  type RestockDocumentKind,
  type RestockMessageAttachments,
  type RestockMessageRole,
  type RestockRequest,
  type RestockSearchQuery,
  type RestockStatus,
} from "@/lib/restock/types";

// ─── Helpers ─────────────────────────────────────────────────────

interface RestockRequestRow {
  id: string;
  farm_id: string;
  user_id: string;
  inventory_item_id: string;
  case_ref: string;
  status: RestockStatus;
  supplier_name: string | null;
  supplier_contact: string | null;
  group_buy_id: string | null;
  total_value_rm: string | number | null;
  requested_quantity: string | number | null;
  unit: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRequest(row: RestockRequestRow): RestockRequest {
  return {
    id: row.id,
    farmId: row.farm_id,
    userId: row.user_id,
    inventoryItemId: row.inventory_item_id,
    caseRef: row.case_ref,
    status: row.status,
    supplierName: row.supplier_name,
    supplierContact: row.supplier_contact,
    groupBuyId: row.group_buy_id,
    totalValueRm: row.total_value_rm === null ? null : Number(row.total_value_rm),
    requestedQuantity:
      row.requested_quantity === null ? null : Number(row.requested_quantity),
    unit: row.unit,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface MessageRow {
  id: string;
  restock_request_id: string;
  farm_id: string;
  role: RestockMessageRole;
  content: string;
  attachments: RestockMessageAttachments | null;
  action_taken: string | null;
  created_at: string;
}

function rowToMessage(row: MessageRow): RestockChatMessage {
  return {
    id: row.id,
    restockRequestId: row.restock_request_id,
    farmId: row.farm_id,
    role: row.role,
    content: row.content,
    attachments: row.attachments,
    actionTaken: row.action_taken,
    createdAt: row.created_at,
  };
}

interface DocumentRow {
  id: string;
  restock_request_id: string;
  farm_id: string;
  kind: RestockDocumentKind;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  parsed_data: Record<string, unknown> | null;
  created_at: string;
}

function rowToDocument(row: DocumentRow): RestockDocument {
  return {
    id: row.id,
    restockRequestId: row.restock_request_id,
    farmId: row.farm_id,
    kind: row.kind,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    parsedData: row.parsed_data,
    createdAt: row.created_at,
  };
}

// ─── Create + retrieve restock requests ─────────────────────────

/**
 * Create a new restock_request. Generates a unique case ref by counting
 * today's existing restocks for this farm. Inserts an opening system
 * message so the chat thread isn't empty.
 */
export async function createRestockRequest(
  supabase: SupabaseClient,
  args: {
    farmId: string;
    userId: string;
    inventoryItemId: string;
    triggerKind: "manual" | "auto_low_stock" | "resume";
  }
): Promise<RestockRequest> {
  // Compute case ref: count today's restocks for this farm
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("restock_requests")
    .select("id", { count: "exact", head: true })
    .eq("farm_id", args.farmId)
    .gte("opened_at", startOfDay.toISOString());

  const caseRef = buildCaseRef(new Date(), (count ?? 0) + 1);

  // Pull item name for the opening message
  const { data: item } = await supabase
    .from("inventory_items")
    .select("item_name")
    .eq("id", args.inventoryItemId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("restock_requests")
    .insert({
      farm_id: args.farmId,
      user_id: args.userId,
      inventory_item_id: args.inventoryItemId,
      case_ref: caseRef,
      status: "draft",
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `createRestockRequest failed: ${error?.message ?? "unknown"}`
    );
  }

  // Opening system message — sets the scene for the chat thread
  const triggerNote =
    args.triggerKind === "auto_low_stock"
      ? "Detected low stock — opening a restock request automatically."
      : args.triggerKind === "resume"
      ? "Resumed restock chat."
      : "Restock request opened from inventory.";

  await appendMessage(supabase, {
    restockRequestId: (data as RestockRequestRow).id,
    farmId: args.farmId,
    role: "system",
    content: `${caseRef} · ${item?.item_name ?? "item"} · ${triggerNote}`,
  });

  return rowToRequest(data as RestockRequestRow);
}

export async function getRestockRequest(
  supabase: SupabaseClient,
  id: string
): Promise<RestockRequest | null> {
  const { data, error } = await supabase
    .from("restock_requests")
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToRequest(data as RestockRequestRow);
}

/**
 * List + search restock requests for a farm. Joins inventory_items for
 * the item name (used in the search index + display) and counts linked
 * documents for the list-card badge.
 */
export async function listRestockRequests(
  supabase: SupabaseClient,
  farmId: string,
  query: RestockSearchQuery = {}
): Promise<RestockRequest[]> {
  let q = supabase
    .from("restock_requests")
    .select(
      "*, inventory_items!inner(item_name, item_type), restock_documents(id)"
    )
    .eq("farm_id", farmId)
    .order("opened_at", { ascending: false })
    .limit(query.limit ?? 50);

  if (query.status && query.status.length > 0) {
    q = q.in("status", query.status);
  }
  if (query.inventoryItemId) {
    q = q.eq("inventory_item_id", query.inventoryItemId);
  }
  // Free-text search: case_ref, item_name, supplier_name. We fan out to
  // multiple ILIKE clauses via Supabase's `or` syntax.
  if (query.text && query.text.trim().length > 0) {
    const t = query.text.trim().replace(/[%_]/g, "");
    q = q.or(
      `case_ref.ilike.%${t}%,supplier_name.ilike.%${t}%,inventory_items.item_name.ilike.%${t}%`
    );
  }

  const { data, error } = await q;
  if (error || !data) return [];

  return (data as Array<RestockRequestRow & {
    inventory_items?: { item_name: string; item_type: string };
    restock_documents?: { id: string }[];
  }>).map((row) => {
    const base = rowToRequest(row);
    return {
      ...base,
      itemName: row.inventory_items?.item_name,
      itemType: row.inventory_items?.item_type,
      documentCount: row.restock_documents?.length ?? 0,
    };
  });
}

// ─── Chat messages ─────────────────────────────────────────────

export async function appendMessage(
  supabase: SupabaseClient,
  args: {
    restockRequestId: string;
    farmId: string;
    role: RestockMessageRole;
    content: string;
    attachments?: RestockMessageAttachments;
    actionTaken?: string;
  }
): Promise<RestockChatMessage> {
  const { data, error } = await supabase
    .from("restock_chat_messages")
    .insert({
      restock_request_id: args.restockRequestId,
      farm_id: args.farmId,
      role: args.role,
      content: args.content,
      attachments: args.attachments ?? null,
      action_taken: args.actionTaken ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`appendMessage failed: ${error?.message ?? "unknown"}`);
  }
  return rowToMessage(data as MessageRow);
}

export async function listMessages(
  supabase: SupabaseClient,
  restockRequestId: string
): Promise<RestockChatMessage[]> {
  const { data, error } = await supabase
    .from("restock_chat_messages")
    .select()
    .eq("restock_request_id", restockRequestId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as MessageRow[]).map(rowToMessage);
}

// ─── Status transitions ────────────────────────────────────────

/**
 * Transition the restock_request to a new status. Appends a system
 * message documenting the change so the chat thread shows the journey.
 */
export async function transitionStatus(
  supabase: SupabaseClient,
  args: {
    restockRequestId: string;
    farmId: string;
    from: RestockStatus;
    to: RestockStatus;
    reason?: string;
  }
): Promise<void> {
  const update: Record<string, unknown> = { status: args.to };
  if (args.to === "closed" || args.to === "cancelled") {
    update.closed_at = new Date().toISOString();
  }
  await supabase
    .from("restock_requests")
    .update(update)
    .eq("id", args.restockRequestId);

  await appendMessage(supabase, {
    restockRequestId: args.restockRequestId,
    farmId: args.farmId,
    role: "system",
    content: args.reason ?? `Status: ${args.from} → ${args.to}`,
    attachments: { kind: "status_change", from: args.from, to: args.to },
  });
}

// ─── Documents ─────────────────────────────────────────────────

/**
 * Record a document linked to a restock request. The actual file should
 * already be uploaded to Supabase Storage at `storagePath` before
 * calling this — we just record the metadata + parsed payload.
 */
export async function attachDocument(
  supabase: SupabaseClient,
  args: {
    restockRequestId: string;
    farmId: string;
    kind: RestockDocumentKind;
    storagePath: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    parsedData?: Record<string, unknown>;
  }
): Promise<RestockDocument> {
  const { data, error } = await supabase
    .from("restock_documents")
    .insert({
      restock_request_id: args.restockRequestId,
      farm_id: args.farmId,
      kind: args.kind,
      storage_path: args.storagePath,
      file_name: args.fileName ?? null,
      mime_type: args.mimeType ?? null,
      size_bytes: args.sizeBytes ?? null,
      parsed_data: args.parsedData ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`attachDocument failed: ${error?.message ?? "unknown"}`);
  }
  return rowToDocument(data as DocumentRow);
}

export async function listDocuments(
  supabase: SupabaseClient,
  restockRequestId: string
): Promise<RestockDocument[]> {
  const { data, error } = await supabase
    .from("restock_documents")
    .select()
    .eq("restock_request_id", restockRequestId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as DocumentRow[]).map(rowToDocument);
}

/**
 * Update the convenience tally fields (requested_quantity, unit,
 * total_value_rm, supplier_name) — typically called when AI drafts a
 * RFQ or after a quote is parsed so the list-card preview is accurate.
 */
export async function updateRequestMetadata(
  supabase: SupabaseClient,
  restockRequestId: string,
  patch: {
    requestedQuantity?: number;
    unit?: string;
    totalValueRm?: number;
    supplierName?: string;
    supplierContact?: string;
    groupBuyId?: string;
  }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.requestedQuantity !== undefined)
    update.requested_quantity = patch.requestedQuantity;
  if (patch.unit !== undefined) update.unit = patch.unit;
  if (patch.totalValueRm !== undefined) update.total_value_rm = patch.totalValueRm;
  if (patch.supplierName !== undefined) update.supplier_name = patch.supplierName;
  if (patch.supplierContact !== undefined)
    update.supplier_contact = patch.supplierContact;
  if (patch.groupBuyId !== undefined) update.group_buy_id = patch.groupBuyId;

  if (Object.keys(update).length === 0) return;

  await supabase
    .from("restock_requests")
    .update(update)
    .eq("id", restockRequestId);
}
