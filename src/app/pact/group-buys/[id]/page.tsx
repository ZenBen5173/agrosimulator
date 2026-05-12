"use client";

/**
 * AgroSim 2.0 — Pact: Group buy detail.
 * Lets a farmer see who's in, commit a quantity, or leave.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { GroupBuyStatus } from "@/lib/pact/types";

export default function GroupBuyDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(props.params);
  const router = useRouter();

  const [farmId, setFarmId] = useState<string | null>(null);
  const [district, setDistrict] = useState<string>("Cameron Highlands");
  const [groupBuy, setGroupBuy] = useState<GroupBuyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState("1");
  const [acting, setActing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: farm } = await supabase
        .from("farms")
        .select("id, district")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (farm) {
        setFarmId(farm.id);
        if (farm.district) setDistrict(farm.district);
      }
    });
  }, []);

  // Fetch group buy data via the list endpoint (filtered by district later)
  useEffect(() => {
    setLoading(true);
    fetch(`/api/pact/group-buy?district=${encodeURIComponent(district)}`)
      .then((r) => r.json())
      .then((d) => {
        const found =
          (d.groupBuys ?? []).find((g: GroupBuyStatus) => g.groupBuyId === id) ?? null;
        setGroupBuy(found);
      })
      .catch(() => setGroupBuy(null))
      .finally(() => setLoading(false));
  }, [id, district]);

  async function join() {
    if (!farmId) {
      setErr("Sign in and create a farm first");
      return;
    }
    setActing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/pact/group-buy/${id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmId,
          quantityCommitted: parseFloat(quantity) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Join failed");
      // Refresh
      const refreshed = await fetch(`/api/pact/group-buy?district=${encodeURIComponent(district)}`)
        .then((r) => r.json());
      const updated =
        (refreshed.groupBuys ?? []).find((g: GroupBuyStatus) => g.groupBuyId === id) ?? null;
      setGroupBuy(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown");
    } finally {
      setActing(false);
    }
  }

  async function leave() {
    setActing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/pact/group-buy/${id}/leave`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Leave failed");
      const refreshed = await fetch(`/api/pact/group-buy?district=${encodeURIComponent(district)}`)
        .then((r) => r.json());
      const updated =
        (refreshed.groupBuys ?? []).find((g: GroupBuyStatus) => g.groupBuyId === id) ?? null;
      setGroupBuy(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b bg-white px-4 py-3 flex items-center gap-2">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold">Group buy</h1>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {loading && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            <Loader2 size={18} className="animate-spin inline mr-2" /> Loading…
          </div>
        )}

        {!loading && !groupBuy && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            Group buy not found, closed, or in a different district.
          </div>
        )}

        {!loading && groupBuy && (
          <>
            <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
              <h2 className="text-base font-semibold">{groupBuy.itemName}</h2>
              <p className="text-xs text-stone-500">{groupBuy.district}</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                <div>
                  <p className="text-[11px] text-stone-500">Bulk price</p>
                  <p className="font-medium text-emerald-700">
                    RM {groupBuy.bulkPriceRm.toFixed(2)}/{groupBuy.unit}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-500">Alone</p>
                  <p className="font-medium text-stone-700 line-through">
                    RM {groupBuy.individualPriceRm.toFixed(2)}/{groupBuy.unit}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-500">You save</p>
                  <p className="font-medium text-emerald-700">
                    RM {groupBuy.savingsRm.toFixed(2)}/{groupBuy.unit}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-500">Closes</p>
                  <p className="font-medium">
                    {new Date(groupBuy.closesAt).toLocaleString("en-MY", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 font-medium">
                  <Users size={14} /> Participants
                </span>
                <span>
                  {groupBuy.participantsJoined}/{groupBuy.participantsTarget}
                </span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (groupBuy.participantsJoined / groupBuy.participantsTarget) * 100
                      )
                    )}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-stone-500">
                {groupBuy.participantsJoined >= groupBuy.participantsTarget
                  ? "Minimum reached — order can be sent to supplier."
                  : `${
                      groupBuy.participantsTarget - groupBuy.participantsJoined
                    } more needed to unlock the bulk price.`}
              </p>
            </section>

            {err && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {err}
              </div>
            )}

            {groupBuy.farmerCommitted ? (
              <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-2">
                <p className="text-sm flex items-center gap-2 text-emerald-800">
                  <Check size={16} /> You&apos;re in this group buy.
                </p>
                <button
                  onClick={leave}
                  disabled={acting}
                  className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                >
                  {acting ? "Working…" : "Leave the group buy"}
                </button>
              </section>
            ) : (
              <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
                <label className="block text-xs">
                  <span className="block text-stone-500 mb-1">
                    How much do you want? ({groupBuy.unit})
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  onClick={join}
                  disabled={acting}
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {acting ? "Joining…" : "Join the group buy"}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
