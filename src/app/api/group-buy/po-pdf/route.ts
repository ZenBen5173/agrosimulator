/**
 * AgroSim 2.1 — Consolidated PO PDF endpoint.
 *
 * POST /api/group-buy/po-pdf
 * Body: { groupBuyId: string }
 *
 * 1. Pull the group buy + items + participations + tally + the AI-drafted
 *    supplier message (most recent consolidated_po_draft message on the
 *    parent restock chat, if any).
 * 2. Build the PDF in code (mail-merge style — same architecture as the
 *    RFQ).
 * 3. Persist to restock-docs/{user.id}/{restock_request_id}/po/PO-{caseRef}.pdf
 *    (when bound to a restock chat) or {user.id}/group-buys/{group_buy_id}/PO.pdf
 *    (manual group buy).
 * 4. Return application/pdf bytes for direct download.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getGroupBuy,
  listParticipations,
  tallyGroupBuy,
  transitionGroupBuyStatus,
} from "@/services/groupBuy/service";
import {
  attachDocument,
  getRestockRequest,
  listMessages,
  transitionStatus as transitionRestockStatus,
} from "@/services/restock/service";
import { buildConsolidatedPoPdf } from "@/lib/groupBuy/consolidatedPoPdf";
import type { RestockMessageAttachments } from "@/lib/restock/types";

export async function POST(request: Request) {
  let body: { groupBuyId?: string };
  try {
    body = (await request.json()) as { groupBuyId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.groupBuyId)
    return NextResponse.json({ error: "`groupBuyId` required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buy = await getGroupBuy(supabase, body.groupBuyId);
  if (!buy)
    return NextResponse.json({ error: "Group buy not found" }, { status: 404 });

  const [tally, participations] = await Promise.all([
    tallyGroupBuy(supabase, buy.id),
    listParticipations(supabase, buy.id),
  ]);

  // Aggregate the lineItems for the PDF
  const lineItems = tally
    .filter((t) => t.totalCommittedQty > 0 && t.bulkPriceRm != null)
    .map((t) => ({
      itemName: t.itemName,
      totalQty: t.totalCommittedQty,
      unit: t.unit,
      pricePerUnitRm: t.bulkPriceRm ?? 0,
      lineTotalRm: t.totalCommittedQty * (t.bulkPriceRm ?? 0),
    }));
  const grandTotalRm = lineItems.reduce((s, l) => s + l.lineTotalRm, 0);

  // Resolve farmer names + addresses for the participant breakdown
  const userIds = Array.from(new Set(participations.map((p) => p.userId)));
  const farmIds = Array.from(new Set(participations.map((p) => p.farmId)));
  const [{ data: profiles }, { data: farms }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("farms")
      .select("id, name, district")
      .in("id", farmIds.length ? farmIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name as string | null])
  );
  const farmById = new Map(
    (farms ?? []).map((f) => [f.id, { name: f.name, district: f.district }])
  );

  // Group participations by user
  const byUser = new Map<
    string,
    {
      farmerName: string;
      farmDistrict?: string;
      items: { itemName: string; qty: number; unit: string }[];
      deliveryMode: "pickup" | "deliver_to_farm";
      deliveryAddress?: string;
    }
  >();
  for (const p of participations) {
    const farm = farmById.get(p.farmId);
    const key = p.userId;
    const tallyEntry = tally.find(
      (t) =>
        t.itemId === p.groupBuyItemId ||
        (p.groupBuyItemId === null && t.itemId === tally[0]?.itemId)
    );
    const itemName = tallyEntry?.itemName ?? buy.itemName;
    const unit = tallyEntry?.unit ?? buy.unit;

    if (!byUser.has(key)) {
      byUser.set(key, {
        farmerName:
          profileById.get(p.userId) ??
          farm?.name ??
          "Farmer",
        farmDistrict: farm?.district ?? undefined,
        items: [],
        deliveryMode: p.deliveryMode ?? (buy.deliveryMode === "shared_pickup" ? "pickup" : "deliver_to_farm"),
        deliveryAddress: p.deliveryAddress ?? undefined,
      });
    }
    byUser.get(key)!.items.push({
      itemName,
      qty: p.quantityCommitted,
      unit,
    });
  }
  const participantsList = Array.from(byUser.values());

  // Pull the most recent AI-drafted message + delivery instructions, if any
  let supplierMessage = "";
  let deliveryInstructions =
    buy.deliveryMode === "shared_pickup"
      ? `Shared pickup at ${buy.meetingPoint ?? buy.district}.`
      : "Per-farmer delivery — addresses listed below.";
  if (buy.restockRequestId) {
    const messages = await listMessages(supabase, buy.restockRequestId);
    const draftMsg = [...messages].reverse().find(
      (
        m
      ): m is typeof m & {
        attachments: Extract<RestockMessageAttachments, { kind: "consolidated_po_draft" }>;
      } => m.attachments?.kind === "consolidated_po_draft"
    );
    if (draftMsg && draftMsg.attachments) {
      supplierMessage = draftMsg.attachments.copyToClipboardMessage;
      deliveryInstructions = draftMsg.attachments.deliveryInstructions;
    }
  }

  // Initiator name + district for the header strip
  const { data: initiatorProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", buy.initiatorUserId)
    .maybeSingle();
  const { data: initiatorFarm } = await supabase
    .from("farms")
    .select("district")
    .eq("id", buy.initiatorFarmId)
    .maybeSingle();

  // Case ref: use the parent restock case ref if available, else synthesize GB-...
  let caseRef = `GB-${new Date(buy.createdAt).toISOString().slice(0, 10).replace(/-/g, "")}-${buy.id.slice(0, 4).toUpperCase()}`;
  if (buy.restockRequestId) {
    const req = await getRestockRequest(supabase, buy.restockRequestId);
    if (req) caseRef = req.caseRef;
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildConsolidatedPoPdf({
      caseRef,
      date: new Date(),
      supplierName: buy.supplierName ?? undefined,
      supplierContact: buy.supplierWhatsapp ?? undefined,
      initiatorName: initiatorProfile?.full_name ?? undefined,
      initiatorDistrict: initiatorFarm?.district ?? undefined,
      meetingPoint: buy.meetingPoint ?? undefined,
      deliveryMode: buy.deliveryMode,
      lineItems,
      participants: participantsList,
      grandTotalRm,
      supplierMessage,
      deliveryInstructions,
    });
  } catch (err) {
    console.error("PO PDF build failed:", err);
    return NextResponse.json(
      {
        error: "PO PDF build failed",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }

  // Persist
  const fileName = `PO-${caseRef}.pdf`;
  const storagePath = buy.restockRequestId
    ? `${user.id}/${buy.restockRequestId}/po/${fileName}`
    : `${user.id}/group-buys/${buy.id}/${fileName}`;

  try {
    const { error: uploadErr } = await supabase.storage
      .from("restock-docs")
      .upload(storagePath, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (!uploadErr) {
      // Persist alongside the chat (when one exists) so the UI's
      // documents list picks it up next refetch.
      if (buy.restockRequestId) {
        const req = await getRestockRequest(supabase, buy.restockRequestId);
        if (req) {
          await attachDocument(supabase, {
            restockRequestId: req.id,
            farmId: req.farmId,
            kind: "po",
            storagePath,
            fileName,
            mimeType: "application/pdf",
            sizeBytes: pdfBytes.length,
          });
          await transitionRestockStatus(supabase, {
            restockRequestId: req.id,
            farmId: req.farmId,
            from: req.status,
            to: "po_sent",
            reason: "Consolidated PO PDF generated",
          });
        }
      }
      // Mark the group buy as PO-sent
      await transitionGroupBuyStatus(supabase, buy.id, "closed", {
        poPdfPath: storagePath,
        poSentAt: new Date().toISOString(),
      });
    }
  } catch (persistErr) {
    console.warn("PO PDF persistence skipped:", persistErr);
  }

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(pdfBytes.length),
      "Cache-Control": "no-store",
    },
  });
}
