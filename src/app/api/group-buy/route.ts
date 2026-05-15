/**
 * AgroSim 2.1 — Group buy workflow API.
 *
 * Single POST endpoint with `step` discriminator (matches /api/restock).
 * Each step does one chunk:
 *
 *   - "create"        → host opens a new group buy (manual OR from a parsed
 *                        supplier quote in a restock chat)
 *   - "list"          → district-scoped list of open / met-minimum buys
 *   - "get"           → fetch buy + items + participations + tally
 *   - "join"          → another farmer commits a qty (+ delivery preference)
 *                        for one item in the buy
 *   - "withdraw"      → soft-withdraw a participation
 *   - "lock"          → manually lock the buy (stop accepting joins)
 *   - "draft_po"      → AI drafts the consolidated PO message; persists
 *                        the draft on the parent restock chat
 *   - "transition"    → manual status nudge (cancel / fulfilled)
 *
 * All steps require an authenticated user. RLS handles multi-tenancy:
 * - reads are public (district visibility is implicit because the join
 *   discovery surfaces only the user's own district)
 * - writes are gated by initiator_user_id / auth.uid()
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createGroupBuy,
  getGroupBuy,
  joinGroupBuy,
  listEndedAwaitingPo,
  listGroupBuys,
  listItems,
  listParticipations,
  tallyGroupBuy,
  transitionGroupBuyStatus,
  withdrawParticipation,
  type CreateGroupBuyInput,
} from "@/services/groupBuy/service";
import {
  appendMessage,
  getRestockRequest,
  transitionStatus as transitionRestockStatus,
  updateRequestMetadata,
} from "@/services/restock/service";
import { draftConsolidatedPoFlow } from "@/flows/restockChat";
import type {
  GroupBuyStatus,
  ParticipantDeliveryMode,
} from "@/lib/groupBuy/types";

interface RequestBody {
  step:
    | "create"
    | "list"
    | "get"
    | "join"
    | "withdraw"
    | "lock"
    | "draft_po"
    | "transition"
    | "list_ended_awaiting_po";
  // create
  createInput?: Omit<CreateGroupBuyInput, "initiatorUserId">;
  // list
  district?: string;
  initiatorFarmId?: string;
  statusFilter?: GroupBuyStatus[];
  // get / join / withdraw / lock / draft_po / transition
  groupBuyId?: string;
  // join
  groupBuyItemId?: string;
  farmId?: string;
  quantityCommitted?: number;
  deliveryMode?: ParticipantDeliveryMode;
  deliveryAddress?: string;
  notes?: string;
  // withdraw
  participationId?: string;
  // transition
  toStatus?: GroupBuyStatus;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    switch (body.step) {
      case "create": {
        if (!body.createInput) return badRequest("`createInput` required");
        if (!body.createInput.initiatorFarmId)
          return badRequest("`createInput.initiatorFarmId` required");
        const buy = await createGroupBuy(supabase, {
          ...body.createInput,
          initiatorUserId: user.id,
        });

        // If this group buy was opened from a restock chat, mirror the
        // event back into that chat so the farmer sees one continuous
        // story (and the chat status flips to group_buy_live).
        if (buy.restockRequestId) {
          const req = await getRestockRequest(supabase, buy.restockRequestId);
          if (req) {
            await appendMessage(supabase, {
              restockRequestId: req.id,
              farmId: req.farmId,
              role: "ai",
              content: `Group buy opened: target ${body.createInput.tierPricing?.[0]?.qty ?? "(qty)"} ${buy.unit}, closes ${new Date(buy.closesAt).toLocaleDateString("en-MY")}. Share the join link with neighbours in your district WhatsApp group.`,
              attachments: {
                kind: "group_buy_proposal",
                groupBuyId: buy.id,
                itemName: buy.itemName,
                targetTotalQty: body.createInput.tierPricing?.[0]?.qty ?? 0,
                unit: buy.unit,
                bulkPricePerUnitRm: buy.bulkPriceRm ?? 0,
                closesAtIso: buy.closesAt,
                pitch: `Group buy ${buy.itemName} — ${body.createInput.minParticipants ?? 3} orang minimum. Tutup ${new Date(buy.closesAt).toLocaleDateString("en-MY")}.`,
              },
            });
            await transitionRestockStatus(supabase, {
              restockRequestId: req.id,
              farmId: req.farmId,
              from: req.status,
              to: "group_buy_live",
              reason: "Group buy opened",
            });
            await updateRequestMetadata(supabase, req.id, {
              groupBuyId: buy.id,
            });
          }
        }

        return NextResponse.json({ groupBuy: buy });
      }

      case "list": {
        const buys = await listGroupBuys(supabase, {
          district: body.district,
          initiatorFarmId: body.initiatorFarmId,
          status: body.statusFilter,
        });
        return NextResponse.json({ groupBuys: buys });
      }

      case "get": {
        if (!body.groupBuyId) return badRequest("`groupBuyId` required");
        const buy = await getGroupBuy(supabase, body.groupBuyId);
        if (!buy) return badRequest("Group buy not found");
        const [items, participations, tally] = await Promise.all([
          listItems(supabase, buy.id),
          listParticipations(supabase, buy.id),
          tallyGroupBuy(supabase, buy.id),
        ]);
        return NextResponse.json({
          groupBuy: buy,
          items,
          participations,
          tally,
        });
      }

      case "join": {
        if (!body.groupBuyId || !body.farmId || !body.quantityCommitted) {
          return badRequest(
            "`groupBuyId`, `farmId`, `quantityCommitted` required"
          );
        }
        if (body.quantityCommitted <= 0) {
          return badRequest("`quantityCommitted` must be > 0");
        }
        const buy = await getGroupBuy(supabase, body.groupBuyId);
        if (!buy) return badRequest("Group buy not found");
        if (buy.status !== "open" && buy.status !== "met_minimum") {
          return badRequest(
            `Group buy is ${buy.status} — joins closed`
          );
        }
        if (
          body.deliveryMode === "deliver_to_farm" &&
          (!body.deliveryAddress || !body.deliveryAddress.trim())
        ) {
          return badRequest(
            "`deliveryAddress` required when deliveryMode = deliver_to_farm"
          );
        }
        const participation = await joinGroupBuy(supabase, {
          groupBuyId: body.groupBuyId,
          groupBuyItemId: body.groupBuyItemId,
          userId: user.id,
          farmId: body.farmId,
          quantityCommitted: body.quantityCommitted,
          deliveryMode: body.deliveryMode,
          deliveryAddress: body.deliveryAddress,
          notes: body.notes,
        });

        // Re-tally and bump status to met_minimum if applicable.
        const allParts = await listParticipations(supabase, body.groupBuyId);
        const uniqueParts = new Set(allParts.map((p) => p.userId)).size;
        if (
          buy.status === "open" &&
          uniqueParts >= buy.minParticipants
        ) {
          await transitionGroupBuyStatus(
            supabase,
            buy.id,
            "met_minimum"
          );
        }

        return NextResponse.json({ participation });
      }

      case "withdraw": {
        if (!body.participationId)
          return badRequest("`participationId` required");
        await withdrawParticipation(supabase, body.participationId);
        return NextResponse.json({ ok: true });
      }

      case "lock": {
        if (!body.groupBuyId) return badRequest("`groupBuyId` required");
        const buy = await getGroupBuy(supabase, body.groupBuyId);
        if (!buy) return badRequest("Group buy not found");
        if (buy.initiatorUserId !== user.id) {
          return NextResponse.json(
            { error: "Only the initiator can lock this buy" },
            { status: 403 }
          );
        }
        await transitionGroupBuyStatus(supabase, buy.id, "closed", {
          lockedAt: new Date().toISOString(),
        });
        return NextResponse.json({ ok: true });
      }

      case "draft_po": {
        if (!body.groupBuyId) return badRequest("`groupBuyId` required");
        const buy = await getGroupBuy(supabase, body.groupBuyId);
        if (!buy) return badRequest("Group buy not found");
        const [tally, participations] = await Promise.all([
          tallyGroupBuy(supabase, buy.id),
          listParticipations(supabase, buy.id),
        ]);

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

        // Resolve farmer addresses (best-effort — district is the fallback)
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

        // Mirror into the originating restock chat (if any) so the
        // farmer can review the PO + tap "Generate PO PDF".
        if (buy.restockRequestId) {
          const req = await getRestockRequest(supabase, buy.restockRequestId);
          if (req) {
            await appendMessage(supabase, {
              restockRequestId: req.id,
              farmId: req.farmId,
              role: "ai",
              content: `${draft.summary}. Tap "Generate PO PDF" — I'll create it, you copy the message + send to ${buy.supplierName ?? "the supplier"}.`,
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

        return NextResponse.json({ draft, itemSummary, grandTotal });
      }

      case "transition": {
        if (!body.groupBuyId || !body.toStatus)
          return badRequest("`groupBuyId` and `toStatus` required");
        const buy = await getGroupBuy(supabase, body.groupBuyId);
        if (!buy) return badRequest("Group buy not found");
        if (buy.initiatorUserId !== user.id) {
          return NextResponse.json(
            { error: "Only the initiator can transition this buy" },
            { status: 403 }
          );
        }
        await transitionGroupBuyStatus(supabase, buy.id, body.toStatus);
        return NextResponse.json({ ok: true });
      }

      case "list_ended_awaiting_po": {
        // Mostly used by the cron tick — returns buys whose deadline
        // has passed but PO hasn't been generated yet.
        const buys = await listEndedAwaitingPo(supabase);
        return NextResponse.json({ groupBuys: buys });
      }

      default:
        return badRequest(`Unknown step: ${body.step}`);
    }
  } catch (err) {
    console.error("/api/group-buy error:", err);
    return NextResponse.json(
      {
        error: "Group buy pipeline error",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
