/**
 * AgroSim 2.1 — Books service.
 *
 * DB layer for accounts + journal_entries + journal_entry_lines. Strict
 * double-entry posting: createJournalEntry validates that debits=credits
 * before inserting and rolls back if anything fails.
 *
 * Convenience helpers (postReceiveGoods, postSupplierPayment,
 * postDiagnosisTreatment, postSaleRevenue) live in postings.ts so this
 * file stays focused on raw DB operations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Account,
  AccountKind,
  JournalEntry,
  JournalEntryLine,
  JournalSourceKind,
  SupplierSummary,
} from "@/lib/books/types";

// ─── Row converters ─────────────────────────────────────────────

interface AccountRow {
  id: string;
  farm_id: string;
  code: string;
  name: string;
  kind: AccountKind;
  parent_account_id: string | null;
  is_system: boolean;
  notes: string | null;
  created_at: string;
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    farmId: row.farm_id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    parentAccountId: row.parent_account_id,
    isSystem: row.is_system,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

interface JournalEntryRow {
  id: string;
  farm_id: string;
  posted_at: string;
  reference: string | null;
  description: string | null;
  source_kind: JournalSourceKind;
  source_id: string | null;
  supplier_name: string | null;
  total_rm: string | number | null;
  created_by: string | null;
  created_at: string;
}

function rowToEntry(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    farmId: row.farm_id,
    postedAt: row.posted_at,
    reference: row.reference,
    description: row.description,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    supplierName: row.supplier_name,
    totalRm: row.total_rm == null ? null : Number(row.total_rm),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

interface LineRow {
  id: string;
  journal_entry_id: string;
  farm_id: string;
  account_id: string;
  debit_rm: string | number;
  credit_rm: string | number;
  description: string | null;
  created_at: string;
}

function rowToLine(row: LineRow): JournalEntryLine {
  return {
    id: row.id,
    journalEntryId: row.journal_entry_id,
    farmId: row.farm_id,
    accountId: row.account_id,
    debitRm: Number(row.debit_rm),
    creditRm: Number(row.credit_rm),
    description: row.description,
    createdAt: row.created_at,
  };
}

// ─── Accounts ────────────────────────────────────────────────────

export async function listAccounts(
  supabase: SupabaseClient,
  farmId: string
): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select()
    .eq("farm_id", farmId)
    .order("code", { ascending: true });
  if (error || !data) return [];
  return (data as AccountRow[]).map(rowToAccount);
}

/**
 * Returns accounts with their current balance (debit-positive for
 * asset/expense, credit-positive for liability/equity/income).
 */
export async function listAccountsWithBalances(
  supabase: SupabaseClient,
  farmId: string,
  asOf?: string
): Promise<Account[]> {
  const accounts = await listAccounts(supabase, farmId);

  // Pull all lines (limited to asOf if provided) and roll up.
  let q = supabase
    .from("journal_entry_lines")
    .select("account_id, debit_rm, credit_rm, journal_entries!inner(posted_at, farm_id)")
    .eq("farm_id", farmId);
  if (asOf) {
    q = q.lte("journal_entries.posted_at", asOf);
  }
  const { data: lines } = await q;

  const totals = new Map<string, { debit: number; credit: number }>();
  for (const ln of (lines ?? []) as Array<{
    account_id: string;
    debit_rm: number | string;
    credit_rm: number | string;
  }>) {
    const t = totals.get(ln.account_id) ?? { debit: 0, credit: 0 };
    t.debit += Number(ln.debit_rm ?? 0);
    t.credit += Number(ln.credit_rm ?? 0);
    totals.set(ln.account_id, t);
  }

  return accounts.map((acc) => {
    const t = totals.get(acc.id);
    if (!t) return { ...acc, balanceRm: 0 };
    // Asset & expense are debit-positive; liability/equity/income are credit-positive.
    const isDebitPositive =
      acc.kind === "asset" || acc.kind === "expense";
    const balance = isDebitPositive ? t.debit - t.credit : t.credit - t.debit;
    return { ...acc, balanceRm: Math.round(balance * 100) / 100 };
  });
}

export async function findAccountByCode(
  supabase: SupabaseClient,
  farmId: string,
  code: string
): Promise<Account | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select()
    .eq("farm_id", farmId)
    .eq("code", code)
    .maybeSingle();
  if (error || !data) return null;
  return rowToAccount(data as AccountRow);
}

/**
 * Look up an inventory account by item type. Maps item_type ->
 * Inventory subaccount code. Falls back to "Inventory - Other".
 */
export function inventoryAccountCodeForItemType(itemType?: string | null): string {
  switch (itemType) {
    case "fertilizer":
      return "1200";
    case "pesticide":
      return "1210";
    case "seed":
      return "1220";
    case "tool":
      return "1230";
    default:
      return "1290";
  }
}

// ─── Journal entries ────────────────────────────────────────────

export interface CreateJournalEntryInput {
  farmId: string;
  postedAt?: string; // YYYY-MM-DD; defaults to today
  reference?: string;
  description?: string;
  sourceKind: JournalSourceKind;
  sourceId?: string;
  supplierName?: string;
  createdBy?: string;
  lines: Array<{
    accountId: string;
    debitRm?: number;
    creditRm?: number;
    description?: string;
  }>;
}

/**
 * Atomically (best-effort — Supabase doesn't expose true txns over
 * REST, but we delete the header on line failure) create a journal
 * entry + its lines. Validates debits = credits before inserting.
 */
export async function createJournalEntry(
  supabase: SupabaseClient,
  input: CreateJournalEntryInput
): Promise<JournalEntry> {
  // Validate
  let debits = 0;
  let credits = 0;
  for (const ln of input.lines) {
    const d = Number(ln.debitRm ?? 0);
    const c = Number(ln.creditRm ?? 0);
    if (d < 0 || c < 0)
      throw new Error("Journal lines must use non-negative amounts");
    if (d > 0 && c > 0)
      throw new Error("Each line is either a debit OR a credit, not both");
    debits += d;
    credits += c;
  }
  if (Math.abs(debits - credits) > 0.005) {
    throw new Error(
      `Journal entry unbalanced: debits=${debits.toFixed(2)} credits=${credits.toFixed(2)}`
    );
  }
  if (debits === 0)
    throw new Error("Journal entry has no non-zero lines");

  // Insert header
  const { data: header, error: headerErr } = await supabase
    .from("journal_entries")
    .insert({
      farm_id: input.farmId,
      posted_at: input.postedAt ?? new Date().toISOString().slice(0, 10),
      reference: input.reference ?? null,
      description: input.description ?? null,
      source_kind: input.sourceKind,
      source_id: input.sourceId ?? null,
      supplier_name: input.supplierName ?? null,
      total_rm: debits,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();

  if (headerErr || !header) {
    throw new Error(
      `Journal header insert failed: ${headerErr?.message ?? "unknown"}`
    );
  }

  // Insert lines
  const linesPayload = input.lines.map((ln) => ({
    journal_entry_id: (header as JournalEntryRow).id,
    farm_id: input.farmId,
    account_id: ln.accountId,
    debit_rm: Number(ln.debitRm ?? 0),
    credit_rm: Number(ln.creditRm ?? 0),
    description: ln.description ?? null,
  }));
  const { error: linesErr } = await supabase
    .from("journal_entry_lines")
    .insert(linesPayload);

  if (linesErr) {
    // Best-effort rollback
    await supabase
      .from("journal_entries")
      .delete()
      .eq("id", (header as JournalEntryRow).id);
    throw new Error(`Journal lines insert failed: ${linesErr.message}`);
  }

  return rowToEntry(header as JournalEntryRow);
}

export async function listJournalEntries(
  supabase: SupabaseClient,
  farmId: string,
  query: {
    fromDate?: string;
    toDate?: string;
    sourceKind?: JournalSourceKind[];
    supplierName?: string;
    limit?: number;
  } = {}
): Promise<JournalEntry[]> {
  let q = supabase
    .from("journal_entries")
    .select(
      "*, journal_entry_lines(id, account_id, debit_rm, credit_rm, description, accounts(code, name, kind))"
    )
    .eq("farm_id", farmId)
    .order("posted_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(query.limit ?? 100);

  if (query.fromDate) q = q.gte("posted_at", query.fromDate);
  if (query.toDate) q = q.lte("posted_at", query.toDate);
  if (query.sourceKind && query.sourceKind.length > 0)
    q = q.in("source_kind", query.sourceKind);
  if (query.supplierName) q = q.eq("supplier_name", query.supplierName);

  const { data, error } = await q;
  if (error || !data) return [];

  return (
    data as Array<
      JournalEntryRow & {
        journal_entry_lines?: Array<
          LineRow & { accounts?: { code: string; name: string; kind: AccountKind } }
        >;
      }
    >
  ).map((row) => {
    const base = rowToEntry(row);
    base.lines = (row.journal_entry_lines ?? []).map((ln) => {
      const lineBase = rowToLine(ln);
      lineBase.accountCode = ln.accounts?.code;
      lineBase.accountName = ln.accounts?.name;
      lineBase.accountKind = ln.accounts?.kind;
      return lineBase;
    });
    return base;
  });
}

// ─── Supplier summary ───────────────────────────────────────────

/**
 * Roll up purchases vs payments per supplier. AP outstanding = total
 * GRN'd value - total payments made. Used by the Books "Suppliers" tab.
 */
export async function listSupplierSummaries(
  supabase: SupabaseClient,
  farmId: string
): Promise<SupplierSummary[]> {
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("supplier_name, source_kind, total_rm, posted_at, created_at")
    .eq("farm_id", farmId)
    .not("supplier_name", "is", null)
    .order("created_at", { ascending: false });

  const map = new Map<string, SupplierSummary>();
  for (const e of (entries ?? []) as Array<{
    supplier_name: string;
    source_kind: JournalSourceKind;
    total_rm: number | string | null;
    posted_at: string;
    created_at: string;
  }>) {
    const key = e.supplier_name;
    const existing = map.get(key) ?? {
      supplierName: key,
      totalPurchasedRm: 0,
      totalPaidRm: 0,
      outstandingApRm: 0,
      lastActivityAt: null,
      documentCount: 0,
    };
    const amount = Number(e.total_rm ?? 0);
    if (e.source_kind === "restock_grn") existing.totalPurchasedRm += amount;
    if (e.source_kind === "restock_payment") existing.totalPaidRm += amount;
    if (
      !existing.lastActivityAt ||
      new Date(e.created_at).getTime() >
        new Date(existing.lastActivityAt).getTime()
    ) {
      existing.lastActivityAt = e.created_at;
    }
    existing.documentCount += 1;
    map.set(key, existing);
  }

  // Compute outstanding AP
  const summaries = Array.from(map.values()).map((s) => ({
    ...s,
    outstandingApRm: Math.max(0, s.totalPurchasedRm - s.totalPaidRm),
  }));
  summaries.sort(
    (a, b) =>
      (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0) -
      (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0)
  );
  return summaries;
}
