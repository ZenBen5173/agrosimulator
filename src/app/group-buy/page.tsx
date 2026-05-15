"use client";

/**
 * AgroSim 2.1 — Group buy discovery list.
 *
 * Surfaces every group buy in the farmer's district that's still
 * accepting joins (open / met_minimum). Plus a "your buys" section for
 * the ones the farmer initiated themselves.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users, Clock, ChevronRight, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { GroupBuy } from "@/lib/groupBuy/types";

const STATUS_COLOURS: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800",
  met_minimum: "bg-amber-100 text-amber-800",
  closed: "bg-stone-200 text-stone-700",
  fulfilled: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function GroupBuyListPage() {
  const router = useRouter();
  const [district, setDistrict] = useState<string | null>(null);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [districtBuys, setDistrictBuys] = useState<GroupBuy[]>([]);
  const [myBuys, setMyBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve the user's farm + district
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { data: farm } = await supabase
        .from("farms")
        .select("id, district")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (farm) {
        setFarmId(farm.id);
        setDistrict(farm.district ?? null);
      }
    });
  }, [router]);

  // Fetch when farm resolved
  useEffect(() => {
    if (!farmId) return;
    setLoading(true);
    Promise.all([
      district
        ? fetch("/api/group-buy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              step: "list",
              district,
              statusFilter: ["open", "met_minimum"],
            }),
          })
            .then((r) => r.json())
            .then((d) => (d.groupBuys ?? []) as GroupBuy[])
            .catch(() => [])
        : Promise.resolve([]),
      fetch("/api/group-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "list",
          initiatorFarmId: farmId,
        }),
      })
        .then((r) => r.json())
        .then((d) => (d.groupBuys ?? []) as GroupBuy[])
        .catch(() => []),
    ]).then(([districtList, mineList]) => {
      // Don't show "my buys" twice — strip them out of the district view
      const mineIds = new Set(mineList.map((b) => b.id));
      setDistrictBuys(districtList.filter((b) => !mineIds.has(b.id)));
      setMyBuys(mineList);
      setLoading(false);
    });
  }, [farmId, district]);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">
              Group buys
            </h1>
            <p className="text-[11px] leading-none text-stone-500">
              {district
                ? `Open in ${district} + your own initiatives`
                : "Loading…"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 p-4">
        {loading && districtBuys.length === 0 && myBuys.length === 0 && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            Loading group buys…
          </div>
        )}

        {/* District section */}
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            In your district
          </h2>
          {districtBuys.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
              No open group buys nearby.
            </div>
          ) : (
            <ul className="space-y-2">
              {districtBuys.map((b) => (
                <BuyCard key={b.id} buy={b} />
              ))}
            </ul>
          )}
        </section>

        {/* Your buys section */}
        {myBuys.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Yours
            </h2>
            <ul className="space-y-2">
              {myBuys.map((b) => (
                <BuyCard key={b.id} buy={b} mine />
              ))}
            </ul>
          </section>
        )}

        {/* Empty state nudge */}
        {!loading && myBuys.length === 0 && (
          <Link
            href="/inventory"
            className="block rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center"
          >
            <Sparkles size={18} className="mx-auto text-emerald-700" />
            <p className="mt-2 text-sm font-medium text-emerald-900">
              Start a group buy
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-700">
              Open an inventory item → restock → get a supplier quote → propose
              a group buy
            </p>
          </Link>
        )}
      </main>
    </div>
  );
}

function BuyCard({ buy, mine }: { buy: GroupBuy; mine?: boolean }) {
  const closes = new Date(buy.closesAt);
  const closesIn = Math.max(0, Math.ceil((closes.getTime() - Date.now()) / 86400000));
  return (
    <li>
      <Link
        href={`/group-buy/${buy.id}`}
        className="block rounded-xl border border-stone-200 bg-white p-3 hover:border-emerald-400 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOURS[buy.status] ?? "bg-stone-100 text-stone-600"}`}
              >
                {buy.status.replace("_", " ")}
              </span>
              {mine && (
                <span className="text-[10px] text-emerald-700 font-medium">
                  YOU STARTED
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-stone-900">
              {buy.itemName}
              {buy.itemCount && buy.itemCount > 1 && (
                <span className="text-stone-500 font-normal">
                  {" "}
                  + {buy.itemCount - 1} more item{buy.itemCount === 2 ? "" : "s"}
                </span>
              )}
            </p>
            {buy.bulkPriceRm != null && (
              <p className="mt-0.5 text-[12px] text-stone-700">
                RM {buy.bulkPriceRm.toFixed(2)}/{buy.unit}
                {buy.individualPriceRm != null && (
                  <span className="text-stone-400 line-through ml-1.5">
                    RM {buy.individualPriceRm.toFixed(2)}
                  </span>
                )}
                {buy.supplierName && (
                  <span className="text-stone-500"> · {buy.supplierName}</span>
                )}
              </p>
            )}
            <p className="mt-1 text-[10px] text-stone-400 flex items-center gap-2">
              <Clock size={10} />
              {closesIn === 0
                ? "Closes today"
                : closesIn === 1
                  ? "Closes tomorrow"
                  : `Closes in ${closesIn} days`}
              <span>·</span>
              <Users size={10} />
              {buy.participantCount ?? 0}/{buy.minParticipants} farmers
              {buy.totalCommittedQty ? (
                <>
                  <span>·</span>
                  {buy.totalCommittedQty} {buy.unit} total
                </>
              ) : null}
            </p>
          </div>
          <ChevronRight size={16} className="text-stone-300 mt-1" />
        </div>
      </Link>
    </li>
  );
}
