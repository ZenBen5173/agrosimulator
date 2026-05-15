"use client";

/**
 * AgroSim 2.1 — Restocks list + search.
 *
 * The "inbox" for all restock chats — current + historical. Search box
 * runs full-text across case ref / item name / supplier name. Each
 * card opens its own chat thread at /restock/[id].
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Package, ChevronRight } from "lucide-react";
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

export default function RestockListPage() {
  const router = useRouter();
  const [farmId, setFarmId] = useState<string | null>(null);
  const [items, setItems] = useState<RestockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce search input — avoid hammering the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // Resolve the user's farm
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

  // Refetch when farm or search query changes
  useEffect(() => {
    if (!farmId) return;
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

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Restocks</h1>
            <p className="text-[11px] leading-none text-stone-500">
              Every supply restock chat in one place.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
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

        {loading && items.length === 0 && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            Loading restocks…
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            {debounced
              ? `No restocks match "${debounced}". Try a different search.`
              : "No restocks yet. Open one from your inventory item page."}
          </div>
        )}

        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/restock/${r.id}`}
                className="block rounded-xl border border-stone-200 bg-white p-3 hover:border-emerald-400 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-stone-500">
                        {r.caseRef}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOURS[r.status]}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-stone-900">
                      {r.itemName ?? "(item)"}
                      {r.requestedQuantity != null && r.unit && (
                        <span className="text-stone-500 font-normal">
                          {" "}
                          — {r.requestedQuantity} {r.unit}
                        </span>
                      )}
                    </p>
                    {r.supplierName && (
                      <p className="mt-0.5 text-[11px] text-stone-500">
                        {r.supplierName}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-stone-400">
                      Opened {timeAgo(r.openedAt)}
                      {r.documentCount != null && r.documentCount > 0 && (
                        <span> · {r.documentCount} document{r.documentCount === 1 ? "" : "s"}</span>
                      )}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-stone-300 mt-1" />
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {/* Hint about creating one — only if list is empty AND no search active */}
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
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
