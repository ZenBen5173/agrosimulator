/**
 * AgroSim 2.1 — Group buy cron tick.
 *
 * Hit this endpoint on a schedule (Vercel cron / Cloud Scheduler / pg_cron
 * net.http_post). For every group buy whose deadline has passed but is
 * still open or met_minimum:
 *   1. Lock it (status → closed, locked_at = now)
 *   2. Ask the AI to draft the consolidated PO message + delivery notes
 *   3. Append the draft as a `consolidated_po_draft` message on the
 *      originating restock chat (so the farmer sees "PO is ready" next
 *      time they open the app)
 *
 * The PO PDF itself is NOT generated here — the farmer triggers that
 * download from the chat (so we get a fresh URL/blob in their browser).
 *
 * AUTH: Bearer ${CRON_SECRET}. The secret never goes to the client.
 *
 * Recommended schedule: every 15 min (matches deadline granularity).
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  listEndedAwaitingPo,
  listParticipations,
  tallyGroupBuy,
  transitionGroupBuyStatus,
} from "@/services/groupBuy/service";
import {
  appendMessage,
  getRestockRequest,
} from "@/services/restock/service";
import { draftConsolidatedPoFlow } from "@/flows/restockChat";

export async function POST(request: Request) {
  // Auth check
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 503 }
    );
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  const ended = await listEndedAwaitingPo(supabase);
  const processed: Array<{ groupBuyId: string; ok: boolean; error?: string }> = [];

  for (const buy of ended) {
    try {
      const [tally, participations] = await Promise.all([
        tallyGroupBuy(supabase, buy.id),
        listParticipations(supabase, buy.id),
      ]);

      // If no one joined, just cancel the buy quietly.
      if (participations.length === 0) {
        await transitionGroupBuyStatus(supabase, buy.id, "cancelled");
        if (buy.restockRequestId) {
          const req = await getRestockRequest(supabase, buy.restockRequestId);
          if (req) {
            await appendMessage(supabase, {
              restockRequestId: req.id,
              farmId: req.farmId,
              role: "system",
              content:
                "Group buy deadline passed with no other participants. Cancelled — open another to retry.",
            });
          }
        }
        processed.push({ groupBuyId: buy.id, ok: true });
        continue;
      }

      await transitionGroupBuyStatus(supabase, buy.id, "closed", {
        lockedAt: new Date().toISOString(),
      });

      const itemSummary = tally
        .filter((t) => t.totalCommittedQty > 0 && t.bulkPriceRm != null)
        .map((t) => ({
          itemName: t.itemName,
          totalQuantity: t.totalCommittedQty,
          unit: t.unit,
          pricePerUnitRm: t.bulkPriceRm ?? 0,
        }));
      const grandTotal = itemSummary.reduce(
        (s, i) => s + i.totalQuantity * i.pricePerUnitRm,
        0
      );

      const farmIds = Array.from(new Set(participations.map((p) => p.farmId)));
      const { data: farms } = await supabase
        .from("farms")
        .select("id, name, district")
        .in("id", farmIds);
      const farmById = new Map(
        (farms ?? []).map((f) => [
          f.id,
          `${f.name ?? "Farm"} (${f.district ?? "—"})`,
        ])
      );

      const addresses: string[] =
        buy.deliveryMode === "shared_pickup"
          ? [buy.meetingPoint ?? `${buy.district} (meeting point pending)`]
          : participations
              .filter((p) => p.deliveryMode === "deliver_to_farm")
              .map(
                (p) =>
                  p.deliveryAddress ??
                  farmById.get(p.farmId) ??
                  "(address pending)"
              );

      const draft = await draftConsolidatedPoFlow({
        supplierName: buy.supplierName ?? undefined,
        itemSummary,
        participantCount: new Set(participations.map((p) => p.userId)).size,
        grandTotalRm: grandTotal,
        addressMode:
          buy.deliveryMode === "per_farmer_delivery" ? "per_farmer" : "shared",
        addresses: addresses.length > 0 ? addresses : ["(address pending)"],
      });

      if (buy.restockRequestId) {
        const req = await getRestockRequest(supabase, buy.restockRequestId);
        if (req) {
          await appendMessage(supabase, {
            restockRequestId: req.id,
            farmId: req.farmId,
            role: "ai",
            content: `${draft.summary}. The deadline passed — PO draft is ready. Tap "Download consolidated PO PDF" when you're ready to send to ${buy.supplierName ?? "the supplier"}.`,
            attachments: {
              kind: "consolidated_po_draft",
              groupBuyId: buy.id,
              itemSummary,
              grandTotalRm: grandTotal,
              copyToClipboardMessage: draft.copyToClipboardMessage,
              deliveryInstructions: draft.deliveryInstructions,
            },
          });
        }
      }

      processed.push({ groupBuyId: buy.id, ok: true });
    } catch (err) {
      processed.push({
        groupBuyId: buy.id,
        ok: false,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  return NextResponse.json({
    tickedAt: new Date().toISOString(),
    processed,
  });
}
