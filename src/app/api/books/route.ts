/**
 * AgroSim 2.1 — Books API.
 *
 * Single POST endpoint with `step` discriminator. All farm-scoped reads
 * + all manual postings flow through here so the orchestration is in
 * one place.
 *
 *   - "list_accounts"     → chart of accounts with current balances
 *   - "list_entries"      → journal entries (filtered by date / source / supplier)
 *   - "list_suppliers"    → per-supplier purchase / payment / AP rollup
 *   - "list_documents"    → all restock_documents across the farm
 *   - "list_inventory_value" → inventory items with valuation (qty * last cost)
 *   - "post_grn"          → mark goods received (debit Inventory, credit AP)
 *   - "post_payment"      → pay supplier (debit AP, credit Cash)
 *   - "post_wastage"      → write off inventory (debit Wastage, credit Inventory)
 *   - "post_manual"       → freeform double-entry (advanced)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listAccountsWithBalances,
  listJournalEntries,
  listSupplierSummaries,
  createJournalEntry,
  findAccountByCode,
} from "@/services/books/service";
import {
  postReceiveGoods,
  postSupplierPayment,
  postInventoryWastage,
  type ReceiveGoodsLineItem,
} from "@/services/books/postings";
import type { JournalSourceKind } from "@/lib/books/types";

interface RequestBody {
  step:
    | "list_accounts"
    | "list_entries"
    | "list_suppliers"
    | "list_documents"
    | "list_inventory_value"
    | "post_grn"
    | "post_payment"
    | "post_wastage"
    | "post_manual";
  farmId?: string;
  // list_entries filters
  fromDate?: string;
  toDate?: string;
  sourceKindFilter?: JournalSourceKind[];
  supplierName?: string;
  // post_grn
  reference?: string;
  lineItems?: ReceiveGoodsLineItem[];
  sourceId?: string;
  // post_payment
  amountRm?: number;
  paymentMethod?: "cash" | "bank";
  // post_wastage
  itemName?: string;
  itemType?: string;
  qtyWasted?: number;
  unit?: string;
  unitCostRm?: number;
  reason?: string;
  // post_manual
  description?: string;
  manualLines?: Array<{
    accountCode: string;
    debitRm?: number;
    creditRm?: number;
    description?: string;
  }>;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.farmId) return badRequest("`farmId` required");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    switch (body.step) {
      case "list_accounts": {
        const accounts = await listAccountsWithBalances(supabase, body.farmId);
        return NextResponse.json({ accounts });
      }

      case "list_entries": {
        const entries = await listJournalEntries(supabase, body.farmId, {
          fromDate: body.fromDate,
          toDate: body.toDate,
          sourceKind: body.sourceKindFilter,
          supplierName: body.supplierName,
        });
        return NextResponse.json({ entries });
      }

      case "list_suppliers": {
        const suppliers = await listSupplierSummaries(supabase, body.farmId);
        return NextResponse.json({ suppliers });
      }

      case "list_documents": {
        const { data } = await supabase
          .from("restock_documents")
          .select(
            "id, kind, file_name, mime_type, size_bytes, created_at, restock_request_id, restock_requests(case_ref, supplier_name)"
          )
          .eq("farm_id", body.farmId)
          .order("created_at", { ascending: false })
          .limit(200);
        return NextResponse.json({ documents: data ?? [] });
      }

      case "list_inventory_value": {
        const { data } = await supabase
          .from("inventory_items")
          .select(
            "id, item_name, item_type, current_quantity, unit, last_purchase_price_rm, supplier_name, reorder_threshold"
          )
          .eq("farm_id", body.farmId)
          .order("item_name", { ascending: true });
        return NextResponse.json({ items: data ?? [] });
      }

      case "post_grn": {
        if (!body.lineItems || body.lineItems.length === 0) {
          return badRequest("`lineItems` required");
        }
        if (!body.reference) return badRequest("`reference` required");
        await postReceiveGoods(supabase, {
          farmId: body.farmId,
          createdBy: user.id,
          supplierName: body.supplierName,
          reference: body.reference,
          sourceId: body.sourceId,
          lineItems: body.lineItems,
        });
        return NextResponse.json({ ok: true });
      }

      case "post_payment": {
        if (!body.supplierName || body.amountRm == null) {
          return badRequest("`supplierName` and `amountRm` required");
        }
        await postSupplierPayment(supabase, {
          farmId: body.farmId,
          createdBy: user.id,
          supplierName: body.supplierName,
          amountRm: body.amountRm,
          paymentMethod: body.paymentMethod,
          reference: body.reference,
          sourceId: body.sourceId,
        });
        return NextResponse.json({ ok: true });
      }

      case "post_wastage": {
        if (
          !body.itemName ||
          body.qtyWasted == null ||
          !body.unit ||
          body.unitCostRm == null
        ) {
          return badRequest(
            "`itemName`, `qtyWasted`, `unit`, `unitCostRm` required"
          );
        }
        await postInventoryWastage(supabase, {
          farmId: body.farmId,
          createdBy: user.id,
          itemName: body.itemName,
          itemType: body.itemType,
          qtyWasted: body.qtyWasted,
          unit: body.unit,
          unitCostRm: body.unitCostRm,
          reason: body.reason,
        });
        return NextResponse.json({ ok: true });
      }

      case "post_manual": {
        if (!body.manualLines || body.manualLines.length === 0)
          return badRequest("`manualLines` required");
        // Resolve account_id from code
        const lines: Array<{
          accountId: string;
          debitRm?: number;
          creditRm?: number;
          description?: string;
        }> = [];
        for (const ml of body.manualLines) {
          const acc = await findAccountByCode(
            supabase,
            body.farmId,
            ml.accountCode
          );
          if (!acc)
            return badRequest(`Account code ${ml.accountCode} not found`);
          lines.push({
            accountId: acc.id,
            debitRm: ml.debitRm,
            creditRm: ml.creditRm,
            description: ml.description,
          });
        }
        await createJournalEntry(supabase, {
          farmId: body.farmId,
          sourceKind: "manual",
          reference: body.reference,
          description: body.description,
          supplierName: body.supplierName,
          createdBy: user.id,
          lines,
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return badRequest(`Unknown step: ${body.step}`);
    }
  } catch (err) {
    console.error("/api/books error:", err);
    return NextResponse.json(
      {
        error: "Books error",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
