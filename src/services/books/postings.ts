/**
 * AgroSim 2.1 — High-level posting helpers.
 *
 * Each function maps a real-world event to its double-entry journal
 * shape. The architectural rule: business code calls these helpers (it
 * never builds journal_entry_lines by hand), so the chart-of-accounts
 * mapping lives in one place.
 *
 * Hooks that call these:
 *   - postReceiveGoods      → /api/restock "mark goods received" action
 *   - postSupplierPayment   → /api/restock "mark paid" action
 *   - postDiagnosisTreatment → /api/doctor when a treatment is finalised
 *   - postSale              → /api/sales (future)
 *   - postInventoryWastage  → inventory page "wastage" button
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createJournalEntry,
  findAccountByCode,
  inventoryAccountCodeForItemType,
} from "@/services/books/service";

// ─── Receive goods (debit Inventory, credit AP) ─────────────────

export interface ReceiveGoodsLineItem {
  inventoryItemId?: string;
  itemName: string;
  itemType?: string; // fertilizer / pesticide / seed / tool / other
  qty: number;
  unit: string;
  totalCostRm: number; // pre-computed line total
}

export async function postReceiveGoods(
  supabase: SupabaseClient,
  args: {
    farmId: string;
    createdBy?: string;
    supplierName?: string;
    reference: string; // e.g. "RR-20260515-0003 GRN"
    sourceKind?: "restock_grn"; // forced
    sourceId?: string;
    lineItems: ReceiveGoodsLineItem[];
    description?: string;
  }
): Promise<void> {
  // AP account: 2100 (we don't auto-create per-supplier subaccounts;
  // supplier_name on the entry header keeps the per-supplier rollup).
  const ap = await findAccountByCode(supabase, args.farmId, "2100");
  if (!ap)
    throw new Error("Accounts Payable (2100) not seeded for this farm");

  const lines: Array<{
    accountId: string;
    debitRm?: number;
    creditRm?: number;
    description?: string;
  }> = [];

  let totalRm = 0;
  for (const li of args.lineItems) {
    const code = inventoryAccountCodeForItemType(li.itemType);
    const inv = await findAccountByCode(supabase, args.farmId, code);
    if (!inv)
      throw new Error(`Inventory account ${code} not seeded for this farm`);
    const amount = round2(li.totalCostRm);
    totalRm += amount;
    lines.push({
      accountId: inv.id,
      debitRm: amount,
      description: `${li.qty} ${li.unit} ${li.itemName}`,
    });
  }
  // Single credit to AP for the whole entry
  lines.push({
    accountId: ap.id,
    creditRm: round2(totalRm),
    description: args.supplierName ?? "Supplier",
  });

  await createJournalEntry(supabase, {
    farmId: args.farmId,
    sourceKind: "restock_grn",
    sourceId: args.sourceId,
    reference: args.reference,
    description:
      args.description ??
      `Received ${args.lineItems.length} item${args.lineItems.length === 1 ? "" : "s"} from ${args.supplierName ?? "supplier"}`,
    supplierName: args.supplierName,
    createdBy: args.createdBy,
    lines,
  });
}

// ─── Supplier payment (debit AP, credit Cash) ───────────────────

export async function postSupplierPayment(
  supabase: SupabaseClient,
  args: {
    farmId: string;
    createdBy?: string;
    supplierName: string;
    amountRm: number;
    paymentMethod?: "cash" | "bank";
    reference?: string;
    sourceId?: string;
  }
): Promise<void> {
  const ap = await findAccountByCode(supabase, args.farmId, "2100");
  if (!ap) throw new Error("Accounts Payable (2100) not seeded");
  const cashCode = args.paymentMethod === "bank" ? "1110" : "1100";
  const cash = await findAccountByCode(supabase, args.farmId, cashCode);
  if (!cash)
    throw new Error(`${cashCode} (cash/bank) not seeded for this farm`);

  await createJournalEntry(supabase, {
    farmId: args.farmId,
    sourceKind: "restock_payment",
    sourceId: args.sourceId,
    reference: args.reference,
    description: `Paid ${args.supplierName} RM ${args.amountRm.toFixed(2)}`,
    supplierName: args.supplierName,
    createdBy: args.createdBy,
    lines: [
      { accountId: ap.id, debitRm: round2(args.amountRm) },
      { accountId: cash.id, creditRm: round2(args.amountRm) },
    ],
  });
}

// ─── Diagnosis / inspection treatment ───────────────────────────
//   Debit Crop Health Costs (5100), credit Inventory subaccount(s).

export interface TreatmentItem {
  itemName: string;
  itemType?: string; // for inventory account mapping
  qtyUsed: number;
  unit: string;
  unitCostRm: number; // book value per unit at time of use
}

export async function postDiagnosisTreatment(
  supabase: SupabaseClient,
  args: {
    farmId: string;
    createdBy?: string;
    diagnosisSessionId: string;
    diagnosisName?: string;
    plotLabel?: string;
    items: TreatmentItem[];
    sourceKind?: "diagnosis_treatment" | "inspection_treatment";
  }
): Promise<void> {
  const cropHealth = await findAccountByCode(supabase, args.farmId, "5100");
  if (!cropHealth)
    throw new Error("Crop Health Costs (5100) not seeded for this farm");

  const lines: Array<{
    accountId: string;
    debitRm?: number;
    creditRm?: number;
    description?: string;
  }> = [];
  let totalRm = 0;
  for (const it of args.items) {
    const invCode = inventoryAccountCodeForItemType(it.itemType);
    const inv = await findAccountByCode(supabase, args.farmId, invCode);
    if (!inv)
      throw new Error(`Inventory account ${invCode} not seeded`);
    const cost = round2(it.qtyUsed * it.unitCostRm);
    if (cost <= 0) continue;
    totalRm += cost;
    lines.push({
      accountId: inv.id,
      creditRm: cost,
      description: `${it.qtyUsed} ${it.unit} ${it.itemName}`,
    });
  }
  if (totalRm === 0) return; // nothing valued — silently skip
  // Single debit to Crop Health Costs
  lines.unshift({
    accountId: cropHealth.id,
    debitRm: round2(totalRm),
    description: args.diagnosisName ?? "Plant treatment",
  });

  await createJournalEntry(supabase, {
    farmId: args.farmId,
    sourceKind: args.sourceKind ?? "diagnosis_treatment",
    sourceId: args.diagnosisSessionId,
    reference: args.diagnosisName ?? "Treatment",
    description: args.plotLabel
      ? `${args.diagnosisName ?? "Treatment"} — ${args.plotLabel}`
      : args.diagnosisName ?? "Treatment",
    createdBy: args.createdBy,
    lines,
  });
}

// ─── Sale (debit Cash/AR, credit Sales Revenue) ─────────────────

export async function postSale(
  supabase: SupabaseClient,
  args: {
    farmId: string;
    createdBy?: string;
    cropName: string;
    qtyKg: number;
    pricePerKgRm: number;
    paymentMethod?: "cash" | "bank" | "credit"; // credit = AR
    buyerNote?: string;
    sourceId?: string;
  }
): Promise<void> {
  const total = round2(args.qtyKg * args.pricePerKgRm);
  const sales = await findAccountByCode(supabase, args.farmId, "4100");
  if (!sales) throw new Error("Sales Revenue (4100) not seeded");

  let dr;
  if (args.paymentMethod === "credit") {
    dr = await findAccountByCode(supabase, args.farmId, "1300"); // AR
  } else if (args.paymentMethod === "bank") {
    dr = await findAccountByCode(supabase, args.farmId, "1110");
  } else {
    dr = await findAccountByCode(supabase, args.farmId, "1100");
  }
  if (!dr) throw new Error("Cash / AR account not seeded");

  await createJournalEntry(supabase, {
    farmId: args.farmId,
    sourceKind: "sale",
    sourceId: args.sourceId,
    reference: `Sale: ${args.qtyKg} kg ${args.cropName}`,
    description: args.buyerNote ?? `Sold ${args.qtyKg} kg ${args.cropName}`,
    createdBy: args.createdBy,
    lines: [
      { accountId: dr.id, debitRm: total },
      { accountId: sales.id, creditRm: total },
    ],
  });
}

// ─── Inventory wastage (debit Wastage, credit Inventory) ────────

export async function postInventoryWastage(
  supabase: SupabaseClient,
  args: {
    farmId: string;
    createdBy?: string;
    itemName: string;
    itemType?: string;
    qtyWasted: number;
    unit: string;
    unitCostRm: number;
    reason?: string;
  }
): Promise<void> {
  const cost = round2(args.qtyWasted * args.unitCostRm);
  if (cost <= 0) return;
  const wastage = await findAccountByCode(supabase, args.farmId, "5300");
  const inv = await findAccountByCode(
    supabase,
    args.farmId,
    inventoryAccountCodeForItemType(args.itemType)
  );
  if (!wastage || !inv)
    throw new Error("Wastage / inventory accounts not seeded");

  await createJournalEntry(supabase, {
    farmId: args.farmId,
    sourceKind: "inventory_wastage",
    description: `Wasted ${args.qtyWasted} ${args.unit} ${args.itemName}${args.reason ? ` — ${args.reason}` : ""}`,
    createdBy: args.createdBy,
    lines: [
      { accountId: wastage.id, debitRm: cost },
      { accountId: inv.id, creditRm: cost },
    ],
  });
}

// ─── Helpers ────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
