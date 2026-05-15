"use client";

/**
 * AgroSim 2.1 — Books page.
 *
 * Five tabs surface the same farm-scoped accounting data from different
 * angles:
 *   1. Ledger          → chronological journal entries (the source of truth)
 *   2. Balances        → chart of accounts with current balances
 *   3. Suppliers       → per-supplier purchase / payment / outstanding AP
 *   4. Items           → inventory items with current valuation
 *   5. Documents       → all RFQ / supplier-quote / PO / GRN documents
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  BookOpen,
  Coins,
  Users,
  Package,
  FileText,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  Account,
  JournalEntry,
  SupplierSummary,
} from "@/lib/books/types";

type TabKey = "ledger" | "balances" | "suppliers" | "items" | "documents";

export default function BooksPage() {
  const router = useRouter();
  const [farmId, setFarmId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("balances");
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);

  // Resolve farm
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { data: farm } = await supabase
        .from("farms")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (farm) setFarmId(farm.id);
    });
  }, [router]);

  // Fetch data when tab or farm changes
  useEffect(() => {
    if (!farmId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const stepByTab: Record<TabKey, string> = {
      ledger: "list_entries",
      balances: "list_accounts",
      suppliers: "list_suppliers",
      items: "list_inventory_value",
      documents: "list_documents",
    };
    fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepByTab[tab], farmId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (tab === "ledger") setEntries(d.entries ?? []);
        if (tab === "balances") setAccounts(d.accounts ?? []);
        if (tab === "suppliers") setSuppliers(d.suppliers ?? []);
        if (tab === "items") setItems(d.items ?? []);
        if (tab === "documents") setDocuments(d.documents ?? []);
      })
      .finally(() => setLoading(false));
  }, [tab, farmId]);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Books</h1>
            <p className="text-[11px] leading-none text-stone-500">
              Your full farm accounting — auto-posted from every action.
            </p>
          </div>
        </div>
      </header>

      <nav className="border-b border-stone-200 bg-white px-2">
        <div className="mx-auto flex max-w-xl gap-1 overflow-x-auto">
          {([
            ["balances", Coins, "Balances"],
            ["ledger", BookOpen, "Ledger"],
            ["suppliers", Users, "Suppliers"],
            ["items", Package, "Items"],
            ["documents", FileText, "Documents"],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px ${
                tab === key
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-xl space-y-3 p-4">
        {loading && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            <Loader2 size={16} className="mx-auto animate-spin" />
          </div>
        )}

        {!loading && tab === "balances" && <BalancesTab accounts={accounts} />}
        {!loading && tab === "ledger" && <LedgerTab entries={entries} />}
        {!loading && tab === "suppliers" && (
          <SuppliersTab suppliers={suppliers} />
        )}
        {!loading && tab === "items" && <ItemsTab items={items} />}
        {!loading && tab === "documents" && (
          <DocumentsTab documents={documents} />
        )}
      </main>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────

function BalancesTab({ accounts }: { accounts: Account[] }) {
  const grouped = useMemo(() => {
    const groups: Record<string, Account[]> = {
      asset: [],
      liability: [],
      equity: [],
      income: [],
      expense: [],
    };
    for (const a of accounts) groups[a.kind]?.push(a);
    return groups;
  }, [accounts]);

  // Compute headline totals
  const totalAssets = sum(grouped.asset);
  const totalLiabilities = sum(grouped.liability);
  const totalEquity = sum(grouped.equity);
  const totalIncome = sum(grouped.income);
  const totalExpense = sum(grouped.expense);
  const netIncome = totalIncome - totalExpense;

  return (
    <>
      <section className="grid grid-cols-2 gap-2">
        <Stat label="Assets" value={totalAssets} tone="pos" />
        <Stat label="Liabilities" value={totalLiabilities} tone="neg" />
        <Stat label="Equity" value={totalEquity} tone="neutral" />
        <Stat label="Net income" value={netIncome} tone={netIncome >= 0 ? "pos" : "neg"} />
      </section>

      <AccountGroup title="Assets" accounts={grouped.asset} />
      <AccountGroup title="Liabilities" accounts={grouped.liability} />
      <AccountGroup title="Equity" accounts={grouped.equity} />
      <AccountGroup title="Income" accounts={grouped.income} />
      <AccountGroup title="Expenses" accounts={grouped.expense} />
    </>
  );
}

function AccountGroup({
  title,
  accounts,
}: {
  title: string;
  accounts: Account[];
}) {
  if (accounts.length === 0) return null;
  return (
    <section className="rounded-xl border border-stone-200 bg-white">
      <h2 className="border-b border-stone-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h2>
      <ul className="divide-y divide-stone-100">
        {accounts.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between px-4 py-2.5 text-sm"
          >
            <span className="text-stone-700">
              <span className="font-mono text-[11px] text-stone-400 mr-2">
                {a.code}
              </span>
              {a.name}
            </span>
            <span
              className={`font-semibold ${
                (a.balanceRm ?? 0) >= 0 ? "text-stone-900" : "text-red-700"
              }`}
            >
              RM {(a.balanceRm ?? 0).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pos" | "neg" | "neutral";
}) {
  const colour =
    tone === "pos"
      ? "text-emerald-700"
      : tone === "neg"
        ? "text-red-700"
        : "text-stone-800";
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-wide text-stone-400">
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-semibold ${colour}`}>
        RM {value.toFixed(2)}
      </p>
    </div>
  );
}

function LedgerTab({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
        No journal entries yet. They&apos;ll appear here as you receive goods,
        pay suppliers, and apply treatments.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li
          key={e.id}
          className="rounded-xl border border-stone-200 bg-white p-3 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-stone-400">
                {new Date(e.postedAt).toLocaleDateString("en-MY", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}{" "}
                · {sourceKindLabel(e.sourceKind)}
                {e.supplierName && ` · ${e.supplierName}`}
              </p>
              <p className="text-sm font-medium text-stone-900">
                {e.description ?? e.reference ?? "(no description)"}
              </p>
            </div>
            <span className="text-sm font-semibold text-stone-900">
              RM {(e.totalRm ?? 0).toFixed(2)}
            </span>
          </div>
          <ul className="space-y-0.5 text-[11px]">
            {e.lines?.map((ln) => (
              <li key={ln.id} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-stone-400">
                  {ln.accountCode ?? "—"}
                </span>
                <span className="text-stone-700 flex-1 truncate">
                  {ln.accountName ?? "(unknown account)"}
                </span>
                {ln.debitRm > 0 ? (
                  <span className="text-stone-700">
                    Dr RM {ln.debitRm.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-stone-700">
                    Cr RM {ln.creditRm.toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function SuppliersTab({ suppliers }: { suppliers: SupplierSummary[] }) {
  if (suppliers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
        No supplier activity yet.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {suppliers.map((s) => (
        <li
          key={s.supplierName}
          className="rounded-xl border border-stone-200 bg-white p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-stone-900">
                {s.supplierName}
              </p>
              <p className="text-[10px] text-stone-500">
                Last activity:{" "}
                {s.lastActivityAt
                  ? new Date(s.lastActivityAt).toLocaleDateString("en-MY")
                  : "—"}
              </p>
            </div>
            <span
              className={`text-sm font-semibold ${
                s.outstandingApRm > 0 ? "text-red-700" : "text-stone-900"
              }`}
            >
              {s.outstandingApRm > 0
                ? `Owe RM ${s.outstandingApRm.toFixed(2)}`
                : "Paid up"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded bg-stone-50 px-2 py-1">
              Purchased: RM {s.totalPurchasedRm.toFixed(2)}
            </div>
            <div className="rounded bg-stone-50 px-2 py-1">
              Paid: RM {s.totalPaidRm.toFixed(2)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface InventoryRow {
  id: string;
  item_name: string;
  item_type: string;
  current_quantity: number | string;
  unit: string;
  last_purchase_price_rm: number | string | null;
  supplier_name: string | null;
  reorder_threshold: number | string | null;
}

function ItemsTab({ items }: { items: InventoryRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
        No inventory items.
      </div>
    );
  }
  const grandTotal = items.reduce(
    (sum, it) =>
      sum +
      Number(it.current_quantity ?? 0) *
        Number(it.last_purchase_price_rm ?? 0),
    0
  );
  return (
    <>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-emerald-700">
          Total inventory value
        </p>
        <p className="text-xl font-semibold text-stone-900 mt-0.5">
          RM {grandTotal.toFixed(2)}
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((it) => {
          const value =
            Number(it.current_quantity ?? 0) *
            Number(it.last_purchase_price_rm ?? 0);
          const isLow =
            it.reorder_threshold != null &&
            Number(it.current_quantity ?? 0) <=
              Number(it.reorder_threshold ?? 0);
          return (
            <li
              key={it.id}
              className="rounded-xl border border-stone-200 bg-white p-3 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-900 truncate">
                  {it.item_name}
                </p>
                <p className="text-[11px] text-stone-500">
                  {Number(it.current_quantity).toFixed(1)} {it.unit}
                  {it.supplier_name && ` · ${it.supplier_name}`}
                  {isLow && (
                    <span className="ml-1 text-red-600 font-medium">
                      LOW
                    </span>
                  )}
                </p>
              </div>
              <span className="text-sm font-semibold text-stone-900">
                RM {value.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

interface DocumentRow {
  id: string;
  kind: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  restock_request_id: string;
  restock_requests?: { case_ref: string; supplier_name: string | null };
}

function DocumentsTab({ documents }: { documents: DocumentRow[] }) {
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
        No documents yet.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {documents.map((d) => (
        <li key={d.id}>
          <a
            href={`/restock/${d.restock_request_id}`}
            className="block rounded-xl border border-stone-200 bg-white p-3 hover:border-emerald-400"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-stone-900">
                  {d.file_name ?? d.kind}
                </p>
                <p className="text-[11px] text-stone-500">
                  {labelForKind(d.kind)}
                  {d.restock_requests?.case_ref &&
                    ` · ${d.restock_requests.case_ref}`}
                  {d.restock_requests?.supplier_name &&
                    ` · ${d.restock_requests.supplier_name}`}
                </p>
                <p className="text-[10px] text-stone-400">
                  {new Date(d.created_at).toLocaleDateString("en-MY", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
              <ChevronRight size={16} className="text-stone-300 mt-1" />
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function sum(accounts: Account[] | undefined): number {
  return (accounts ?? []).reduce((s, a) => s + (a.balanceRm ?? 0), 0);
}

function sourceKindLabel(k: string): string {
  switch (k) {
    case "restock_grn":
      return "Goods received";
    case "restock_payment":
      return "Supplier payment";
    case "diagnosis_treatment":
      return "Treatment";
    case "inspection_treatment":
      return "Inspection";
    case "sale":
      return "Sale";
    case "inventory_adjustment":
      return "Stock adjustment";
    case "inventory_wastage":
      return "Wastage";
    case "manual":
      return "Manual";
    default:
      return k;
  }
}

function labelForKind(k: string): string {
  switch (k) {
    case "rfq":
      return "Request for Quotation";
    case "supplier_quote":
      return "Supplier reply";
    case "po":
      return "Purchase Order";
    case "grn":
      return "Goods received";
    default:
      return k;
  }
}
