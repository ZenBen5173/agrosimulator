"use client";

/**
 * AgroSim 2.1 — Group buy detail + join page.
 *
 * Two audiences share this page:
 *   1. The initiator — sees the live tally, can lock the buy, generate
 *      the consolidated PO PDF.
 *   2. Other district farmers — see the items, pick per-item qty, choose
 *      pickup vs delivery, and join.
 *
 * Live cost calc is done client-side off the tally returned by the API
 * (which itself sums the participations). When the farmer adjusts qty
 * the savings/total numbers update instantly.
 */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Package,
  Users,
  Clock,
  Check,
  Lock,
  Copy as CopyIcon,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  GroupBuy,
  GroupBuyItem,
  GroupBuyParticipation,
  GroupBuyTally,
  ParticipantDeliveryMode,
} from "@/lib/groupBuy/types";

type DetailResponse = {
  groupBuy: GroupBuy;
  items: GroupBuyItem[];
  participations: GroupBuyParticipation[];
  tally: GroupBuyTally[];
};

export default function GroupBuyDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(props.params);
  const router = useRouter();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "join" | "withdraw" | "lock" | "po">(
    null
  );
  const [me, setMe] = useState<{ userId: string; farmId: string } | null>(null);

  // Pickup vs delivery state for the join form
  const [joinByItem, setJoinByItem] = useState<
    Record<string, { qty: string; mode: ParticipantDeliveryMode; address: string }>
  >({});

  async function refetch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/group-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "get", groupBuyId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load failed");
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refetch();
    // Resolve current user + farm
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: farm } = await supabase
        .from("farms")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (farm) setMe({ userId: user.id, farmId: farm.id });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const { groupBuy, items, participations, tally } = detail ?? {
    groupBuy: null as GroupBuy | null,
    items: [] as GroupBuyItem[],
    participations: [] as GroupBuyParticipation[],
    tally: [] as GroupBuyTally[],
  };

  const isInitiator = !!(me && groupBuy && me.userId === groupBuy.initiatorUserId);
  const myParticipations = participations.filter(
    (p) => me && p.userId === me.userId
  );
  const canJoin =
    !!groupBuy &&
    (groupBuy.status === "open" || groupBuy.status === "met_minimum") &&
    !!me;

  // Live preview of what the farmer's join would total
  const previewTotalRm = useMemo(() => {
    let total = 0;
    for (const it of items) {
      const j = joinByItem[it.id];
      if (!j) continue;
      const qty = Number(j.qty);
      if (!isFinite(qty) || qty <= 0) continue;
      total += qty * (it.bulkPriceRm ?? 0);
    }
    return total;
  }, [joinByItem, items]);

  async function joinAll() {
    if (!me || !groupBuy) return;
    setBusy("join");
    setError(null);
    try {
      // One POST per item the farmer entered a qty for
      const calls: Promise<Response>[] = [];
      for (const it of items) {
        const j = joinByItem[it.id];
        if (!j) continue;
        const qty = Number(j.qty);
        if (!isFinite(qty) || qty <= 0) continue;
        if (j.mode === "deliver_to_farm" && !j.address.trim()) {
          throw new Error(`Address required for ${it.itemName} (delivery mode).`);
        }
        calls.push(
          fetch("/api/group-buy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              step: "join",
              groupBuyId: groupBuy.id,
              groupBuyItemId: it.id,
              farmId: me.farmId,
              quantityCommitted: qty,
              deliveryMode: j.mode,
              deliveryAddress: j.address || undefined,
            }),
          })
        );
      }
      if (calls.length === 0) throw new Error("Enter at least one quantity.");
      const results = await Promise.all(calls);
      for (const r of results) {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || "Join failed");
        }
      }
      setJoinByItem({});
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setBusy(null);
    }
  }

  async function withdrawMine(participationId: string) {
    setBusy("withdraw");
    try {
      await fetch("/api/group-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "withdraw",
          participationId,
        }),
      });
      await refetch();
    } finally {
      setBusy(null);
    }
  }

  async function copyShareLink() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/group-buy/${id}`;
    await navigator.clipboard.writeText(url);
    alert("Link copied. Paste into your village WhatsApp group.");
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-sm font-semibold text-stone-900">
              {groupBuy?.itemName ?? "Group buy"}
            </h1>
            <p className="truncate text-[11px] leading-none text-stone-500">
              {groupBuy
                ? `${groupBuy.district} · ${groupBuy.status.replace("_", " ")}`
                : "Loading…"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-3 p-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading && !detail && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            <Loader2 size={16} className="mx-auto animate-spin" />
            <p className="mt-2">Loading…</p>
          </div>
        )}

        {groupBuy && (
          <>
            {/* Headline tally card */}
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">
                    Group buy
                  </p>
                  <p className="text-lg font-bold text-stone-900">
                    {groupBuy.itemName}
                    {items.length > 1 && (
                      <span className="text-sm font-normal text-stone-500">
                        {" "}
                        + {items.length - 1} more item
                        {items.length === 2 ? "" : "s"}
                      </span>
                    )}
                  </p>
                  {groupBuy.supplierName && (
                    <p className="text-[11px] text-stone-600">
                      Supplier: {groupBuy.supplierName}
                    </p>
                  )}
                </div>
                <button
                  onClick={copyShareLink}
                  className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] text-emerald-700 hover:border-emerald-500 flex items-center gap-1"
                >
                  <CopyIcon size={11} />
                  Share
                </button>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-stone-700">
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  {new Set(participations.map((p) => p.userId)).size}/
                  {groupBuy.minParticipants} farmers
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  Closes{" "}
                  {new Date(groupBuy.closesAt).toLocaleDateString("en-MY", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            </section>

            {/* Per-item tally + join inputs */}
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Items
              </h2>
              <ul className="space-y-2">
                {items.map((it) => {
                  const t = tally.find((x) => x.itemId === it.id);
                  const j = joinByItem[it.id] ?? {
                    qty: "",
                    mode: "pickup" as ParticipantDeliveryMode,
                    address: "",
                  };
                  return (
                    <li
                      key={it.id}
                      className="rounded-xl border border-stone-200 bg-white p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-stone-900">
                            {it.itemName}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            {it.bulkPriceRm != null && (
                              <>
                                Bulk: <strong>RM {it.bulkPriceRm.toFixed(2)}</strong>
                                /{it.unit}
                              </>
                            )}
                            {it.individualPriceRm != null && (
                              <span className="ml-2 text-stone-400 line-through">
                                RM {it.individualPriceRm.toFixed(2)}
                              </span>
                            )}
                          </p>
                        </div>
                        <Package
                          size={20}
                          className="text-stone-300 flex-shrink-0"
                        />
                      </div>
                      {t && (
                        <div className="text-[11px] text-emerald-700">
                          So far: {t.totalCommittedQty} {t.unit} from{" "}
                          {t.participantCount} farmer{t.participantCount === 1 ? "" : "s"}
                          {t.savingRm != null && t.savingRm > 0 && (
                            <span className="text-stone-500">
                              {" "}
                              · saving RM {t.savingRm.toFixed(2)} vs solo
                            </span>
                          )}
                        </div>
                      )}
                      {canJoin && (
                        <div className="rounded-lg border border-stone-100 bg-stone-50 p-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step="0.5"
                              placeholder="0"
                              value={j.qty}
                              onChange={(e) =>
                                setJoinByItem((prev) => ({
                                  ...prev,
                                  [it.id]: { ...j, qty: e.target.value },
                                }))
                              }
                              className="w-20 rounded border border-stone-300 bg-white px-2 py-1 text-sm focus:border-emerald-400 focus:outline-none"
                            />
                            <span className="text-[11px] text-stone-500">
                              {it.unit}
                            </span>
                            <select
                              value={j.mode}
                              onChange={(e) =>
                                setJoinByItem((prev) => ({
                                  ...prev,
                                  [it.id]: {
                                    ...j,
                                    mode: e.target.value as ParticipantDeliveryMode,
                                  },
                                }))
                              }
                              className="ml-auto rounded border border-stone-300 bg-white px-2 py-1 text-[11px] focus:border-emerald-400 focus:outline-none"
                            >
                              <option value="pickup">Shared pickup</option>
                              <option value="deliver_to_farm">
                                Deliver to my farm
                              </option>
                            </select>
                          </div>
                          {j.mode === "deliver_to_farm" && (
                            <input
                              type="text"
                              placeholder="Farm address (kampung, lot no.)"
                              value={j.address}
                              onChange={(e) =>
                                setJoinByItem((prev) => ({
                                  ...prev,
                                  [it.id]: { ...j, address: e.target.value },
                                }))
                              }
                              className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-[11px] focus:border-emerald-400 focus:outline-none"
                            />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Live preview + join button */}
            {canJoin &&
              Object.values(joinByItem).some((j) => Number(j.qty) > 0) && (
                <section className="rounded-xl border border-emerald-300 bg-white p-3 space-y-2">
                  <p className="text-sm font-medium text-stone-800">
                    Your commitment so far:{" "}
                    <span className="text-emerald-700 font-semibold">
                      RM {previewTotalRm.toFixed(2)}
                    </span>
                  </p>
                  <button
                    onClick={joinAll}
                    disabled={busy !== null}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {busy === "join" ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Joining…
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        Confirm + join group buy
                      </>
                    )}
                  </button>
                </section>
              )}

            {/* My current commitments (with withdraw) */}
            {myParticipations.length > 0 && (
              <section className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Your commitments
                </h2>
                <ul className="space-y-1.5">
                  {myParticipations.map((p) => {
                    const item = items.find((it) => it.id === p.groupBuyItemId);
                    return (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 text-[12px]"
                      >
                        <span className="text-stone-800">
                          {item?.itemName ?? "(item)"} · {p.quantityCommitted}{" "}
                          {item?.unit ?? ""}{" "}
                          <span className="text-stone-500">
                            ({p.deliveryMode === "deliver_to_farm" ? "deliver" : "pickup"})
                          </span>
                        </span>
                        <button
                          onClick={() => withdrawMine(p.id)}
                          disabled={busy !== null || groupBuy.status !== "open"}
                          className="text-[11px] text-red-600 hover:underline disabled:opacity-40"
                        >
                          Withdraw
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Initiator-only controls */}
            {isInitiator &&
              (groupBuy.status === "open" || groupBuy.status === "met_minimum") && (
                <section className="space-y-2">
                  <button
                    onClick={async () => {
                      setBusy("lock");
                      setError(null);
                      try {
                        const r = await fetch("/api/group-buy", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            step: "lock",
                            groupBuyId: groupBuy.id,
                          }),
                        });
                        if (!r.ok) {
                          const d = await r.json().catch(() => ({}));
                          throw new Error(d.error || "Lock failed");
                        }
                        // Auto-draft PO so the next step is one click
                        await fetch("/api/group-buy", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            step: "draft_po",
                            groupBuyId: groupBuy.id,
                          }),
                        });
                        if (groupBuy.restockRequestId) {
                          router.push(`/restock/${groupBuy.restockRequestId}`);
                          return;
                        }
                        await refetch();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Unknown");
                      } finally {
                        setBusy(null);
                      }
                    }}
                    disabled={busy !== null}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {busy === "lock" ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Locking + drafting PO…
                      </>
                    ) : (
                      <>
                        <Lock size={14} />
                        Lock buy + draft consolidated PO
                      </>
                    )}
                  </button>
                </section>
              )}

            {/* Closed / fulfilled — show PO download if persisted */}
            {(groupBuy.status === "closed" ||
              groupBuy.status === "fulfilled") && (
              <section className="rounded-xl border border-stone-200 bg-white p-3 text-sm space-y-2">
                <p className="text-stone-700">
                  Group buy {groupBuy.status === "fulfilled" ? "fulfilled" : "closed"}.
                </p>
                {groupBuy.restockRequestId && (
                  <Link
                    href={`/restock/${groupBuy.restockRequestId}`}
                    className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"
                  >
                    <Sparkles size={12} />
                    Open the restock chat for the PO PDF
                  </Link>
                )}
              </section>
            )}

            {/* Read-only state for non-initiator non-joiner */}
            {!canJoin &&
              !isInitiator &&
              participations.every((p) => !me || p.userId !== me.userId) && (
                <p className="text-center text-[11px] text-stone-400">
                  Joining closed.
                </p>
              )}
          </>
        )}
      </main>
    </div>
  );
}
