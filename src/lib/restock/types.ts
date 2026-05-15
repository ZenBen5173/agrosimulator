/**
 * AgroSim 2.1 — Restock request types.
 *
 * One restock_request = one chat thread + one inventory item being
 * restocked. Has a readable case ref, status lifecycle, and linked
 * documents (RFQ, supplier quote, PO, GRN).
 *
 * See supabase/migrations/v2_1_restock_requests.sql for the table
 * definitions these mirror.
 */

export type RestockStatus =
  | "draft"               // AI is drafting the RFQ
  | "awaiting_supplier"   // RFQ generated, farmer is sending it off-platform
  | "quote_received"      // farmer uploaded supplier reply, AI parsed
  | "group_buy_live"      // group buy created, accepting participants
  | "po_sent"             // PO generated and sent
  | "closed"              // goods received OR farmer marked done
  | "cancelled";          // farmer abandoned

export type RestockMessageRole = "ai" | "farmer" | "system";

export type RestockDocumentKind =
  | "rfq"                 // AgroSim-generated Request for Quotation
  | "supplier_quote"      // uploaded by farmer (supplier's reply)
  | "po"                  // AgroSim-generated Purchase Order
  | "grn";                // Goods Received Note

/**
 * The headline restock_requests row + commonly-joined fields.
 */
export interface RestockRequest {
  id: string;
  farmId: string;
  userId: string;
  inventoryItemId: string;
  caseRef: string; // RR-YYYYMMDD-NNNN
  status: RestockStatus;
  supplierName: string | null;
  supplierContact: string | null;
  groupBuyId: string | null;
  totalValueRm: number | null;
  requestedQuantity: number | null;
  unit: string | null;
  openedAt: string; // ISO
  closedAt: string | null; // ISO
  createdAt: string;
  updatedAt: string;
  // Joined for UI:
  itemName?: string;
  itemType?: string;
  documentCount?: number;
  lastMessagePreview?: string;
  lastMessageAt?: string;
}

export interface RestockChatMessage {
  id: string;
  restockRequestId: string;
  farmId: string;
  role: RestockMessageRole;
  content: string;
  /** Structured payload — depends on the message kind */
  attachments: RestockMessageAttachments | null;
  /** When the message embedded an action ([Yes]/[No] etc.) and the farmer tapped */
  actionTaken: string | null;
  createdAt: string;
}

/**
 * Discriminated payload for messages that carry structured data beyond
 * the visible text. Used by the UI to render rich actions
 * ("Generate RFQ", "Yes, start group buy", "Confirm PO").
 */
export type RestockMessageAttachments =
  | {
      kind: "rfq_draft";
      itemName: string;
      requestedQuantity: number;
      unit: string;
      quantityTiers: { qty: number; label: string }[];
      supplierName?: string;
      copyToClipboardMessage: string;
    }
  | {
      kind: "supplier_quote_parsed";
      vendorName?: string;
      tiers: { qty: number; unit: string; pricePerUnitRm: number }[];
      bulkDiscountDetected: boolean;
      bulkDiscountReasoning: string;
      raw?: string;
    }
  | {
      kind: "group_buy_proposal";
      /** Set once the group buy has actually been created */
      groupBuyId?: string;
      itemName: string;
      targetTotalQty: number;
      unit: string;
      bulkPricePerUnitRm: number;
      individualPriceRm?: number;
      minParticipants?: number;
      supplierName?: string;
      closesAtIso: string;
      pitch: string;
    }
  | {
      kind: "po_draft";
      itemName: string;
      quantity: number;
      unit: string;
      pricePerUnitRm: number;
      totalRm: number;
      supplierName?: string;
      deliveryAddress: string;
      copyToClipboardMessage: string;
    }
  | {
      kind: "consolidated_po_draft";
      groupBuyId: string;
      /** Per-item totals (after summing all participations) */
      itemSummary: {
        itemName: string;
        totalQuantity: number;
        unit: string;
        pricePerUnitRm: number;
      }[];
      grandTotalRm: number;
      copyToClipboardMessage: string;
      deliveryInstructions: string;
    }
  | {
      kind: "document_uploaded";
      documentId: string;
      documentKind: RestockDocumentKind;
      fileName: string;
    }
  | {
      kind: "status_change";
      from: RestockStatus;
      to: RestockStatus;
    };

export interface RestockDocument {
  id: string;
  restockRequestId: string;
  farmId: string;
  kind: RestockDocumentKind;
  storagePath: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  parsedData: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Search input for /restock list page. All fields optional; combined with
 * AND. Matches against case ref, item name, supplier name, message body.
 */
export interface RestockSearchQuery {
  text?: string;
  status?: RestockStatus[];
  inventoryItemId?: string;
  limit?: number;
}

/**
 * Build a readable case ref. Format: RR-YYYYMMDD-NNNN where NNNN is a
 * zero-padded sequence number for that day. Caller is responsible for
 * computing NNNN (typically by counting today's restock_requests for
 * this farm).
 */
export function buildCaseRef(date: Date, sequenceForDay: number): string {
  const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const seq = String(sequenceForDay).padStart(4, "0");
  return `RR-${yyyymmdd}-${seq}`;
}

/**
 * Friendly label for each status — used in the chat list / status badges.
 */
export function statusLabel(s: RestockStatus): string {
  switch (s) {
    case "draft":
      return "Draft";
    case "awaiting_supplier":
      return "Awaiting supplier";
    case "quote_received":
      return "Quote received";
    case "group_buy_live":
      return "Group buy live";
    case "po_sent":
      return "PO sent";
    case "closed":
      return "Closed";
    case "cancelled":
      return "Cancelled";
  }
}
