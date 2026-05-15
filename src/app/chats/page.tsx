"use client";

/**
 * AgroSim 2.1 — Chats inbox.
 *
 * The Claude-style chat list for every supply restock conversation. Each
 * card opens a thread at /chats/[id]. Search runs full-text against case
 * ref / item name / supplier name; filter chips slice by status (Active
 * = anything not closed/cancelled).
 *
 * One-line summary line per cell uses the chat's status as the preview —
 * cheaper than fetching the latest message and good enough for triage.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  Package,
  Beaker,
  Sprout,
  Wrench,
  Boxes,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  type RestockRequest,
  type RestockStatus,
  statusLabel,
} from "@/lib/restock/types";

const STATUS_COLOURS: Record<RestockStatus, string> = {
  draft: "bg-stone-100 text-stone-700",
  awaiting_supplier: "bg-amber-100 text-amber-800",
  quote_received: "bg-blue-100 text-blue-800",
  group_buy_live: "bg-emerald-100 text-emerald-800",
  po_sent: "bg-violet-100 text-violet-800",
  closed: "bg-stone-200 text-stone-600",
  cancelled: "bg-red-100 text-red-800",
};

// Avatar icon by inventory item type (falls back to Sparkles for AI tone)
function avatarIconFor(itemType?: string) {
  switch (itemType) {
    case "fertilizer":
      return Sprout;
    case "pesticide":
      return Beaker;
    case "seed":
      return Boxes;
    case "tool":
      return Wrench;
    default:
      return Package;
  }
}

// One-liner preview text from the chat status — what the farmer needs to
// know at a glance without opening the thread.
function previewLineFor(status: RestockStatus): string {
  switch (status) {
    case "draft":
      return "Draft — tap to start drafting an RFQ";
    case "awaiting_supplier":
      return "RFQ sent — waiting for supplier reply";
    case "quote_received":
      return "Quote received — review + decide on group buy";
    case "group_buy_live":
      return "Group buy live — locking soon";
    case "po_sent":
      return "PO sent — confirm goods on arrival";
    case "closed":
      return "Closed — see Books for the journal entry";
    case "cancelled":
      return "Cancelled";
  }
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default function ChatsListPage() {
  const router = useRouter();
  const [farmId, setFarmId] = useState<string | null>(null);
  const [items, setItems] = useState<RestockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // Resolve the farm
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

  // Refetch on farm / search changes
  useEffect(() => {
    if (!farmId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch("/api/restock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: "list",
        farmId,
        searchText: debounced || undefined,
      }),
    })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [farmId, debounced]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "closed")
      return items.filter(
        (r) => r.status === "closed" || r.status === "cancelled"
      );
    // active = everything else
    return items.filter(
      (r) => r.status !== "closed" && r.status !== "cancelled"
    );
  }, [items, filter]);

  const counts = useMemo(() => {
    const all = items.length;
    const closed = items.filter(
      (r) => r.status === "closed" || r.status === "cancelled"
    ).length;
    return { all, closed, active: all - closed };
  }, [items]);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
            <Sparkles size={16} className="text-emerald-700" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-stone-900">Chats</h1>
            <p className="text-[11px] leading-none text-stone-500">
              Every supply restock conversation in one place.
            </p>
          </div>
          <Link
            href="/inventory"
            className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-700 hover:border-emerald-400"
          >
            New
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-3 p-4">
        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by item, supplier, or ref (e.g. NPK or RR-2026)"
            className="w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-stone-400 focus:border-emerald-400 focus:outline-none"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            const count =
              f.key === "all"
                ? counts.all
                : f.key === "active"
                  ? counts.active
                  : counts.closed;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-stone-600 border border-stone-300 hover:border-emerald-400"
                }`}
              >
                {f.label}
                <span
                  className={`ml-1.5 text-[10px] ${
                    isActive ? "text-emerald-100" : "text-stone-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {loading && items.length === 0 && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            Loading chats…
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            {debounced
              ? `No chats match "${debounced}". Try a different search.`
              : filter === "closed"
                ? "No closed chats yet."
                : "No chats yet. Open Inventory and tap an item to start one."}
          </div>
        )}

        {/* Chat list — Claude-style cells */}
        <ul className="overflow-hidden rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
          {visible.map((r) => {
            const Avatar = avatarIconFor(r.itemType);
            return (
              <li key={r.id}>
                <Link
                  href={`/chats/${r.id}`}
                  className="flex items-start gap-3 px-3 py-3 hover:bg-stone-50 transition-colors"
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50">
                    <Avatar size={16} className="text-emerald-700" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-stone-900">
                        {r.itemName ?? "(item)"}
                      </p>
                      <span className="flex-shrink-0 text-[10px] text-stone-400">
                        {timeAgo(r.openedAt)}
                      </span>
                    </div>
                    <p className="truncate text-[12px] text-stone-600 mt-0.5">
                      {previewLineFor(r.status)}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOURS[r.status]}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                      <span className="font-mono text-[10px] text-stone-400">
                        {r.caseRef}
                      </span>
                      {r.supplierName && (
                        <span className="truncate text-[10px] text-stone-400">
                          · {r.supplierName}
                        </span>
                      )}
                      {r.documentCount != null && r.documentCount > 0 && (
                        <span className="text-[10px] text-stone-400">
                          · {r.documentCount} doc{r.documentCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className="mt-1 flex-shrink-0 text-stone-300"
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Empty-state nudge */}
        {!loading && items.length === 0 && !debounced && (
          <Link
            href="/inventory"
            className="block rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center"
          >
            <Package size={20} className="mx-auto text-emerald-700" />
            <p className="mt-2 text-sm font-medium text-emerald-900">
              Open Inventory
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-700">
              Tap any item to start a restock chat
            </p>
          </Link>
        )}
      </main>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
