/**
 * AgroSim 2.1 — Books / accounting types.
 *
 * Mirrors the schema in supabase migration v2_1_double_entry_accounts.
 * Strict double-entry: every JournalEntry has N JournalEntryLine rows
 * whose debit_rm/credit_rm sum to the same number.
 */

export type AccountKind =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense";

export interface Account {
  id: string;
  farmId: string;
  code: string; // "1100", "5100" etc.
  name: string;
  kind: AccountKind;
  parentAccountId: string | null;
  isSystem: boolean;
  notes: string | null;
  createdAt: string;
  // Computed (when listed-with-balances)
  balanceRm?: number;
}

export type JournalSourceKind =
  | "restock_grn" // goods received from a supplier (debit Inventory, credit AP)
  | "restock_payment" // farmer paid the supplier (debit AP, credit Cash)
  | "diagnosis_treatment" // treatment applied via the AI Doctor (debit Crop Health, credit Inventory)
  | "inspection_treatment" // farmer-initiated plant inspection treatment
  | "sale" // crop sold (debit Cash/AR, credit Sales Revenue)
  | "inventory_adjustment" // count corrections
  | "inventory_wastage" // wasted stock
  | "manual"; // farmer wrote a freeform entry

export interface JournalEntry {
  id: string;
  farmId: string;
  postedAt: string; // ISO date
  reference: string | null;
  description: string | null;
  sourceKind: JournalSourceKind;
  sourceId: string | null;
  supplierName: string | null;
  totalRm: number | null;
  createdBy: string | null;
  createdAt: string;
  // Joined for UI:
  lines?: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  farmId: string;
  accountId: string;
  debitRm: number;
  creditRm: number;
  description: string | null;
  createdAt: string;
  // Joined for UI:
  accountCode?: string;
  accountName?: string;
  accountKind?: AccountKind;
}

/**
 * Per-supplier rollup used by the Books "Suppliers" tab. Computed by
 * aggregating journal_entries grouped by supplier_name.
 */
export interface SupplierSummary {
  supplierName: string;
  totalPurchasedRm: number;
  totalPaidRm: number;
  outstandingApRm: number;
  lastActivityAt: string | null;
  documentCount: number;
}
