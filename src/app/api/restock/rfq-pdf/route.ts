/**
 * AgroSim 2.1 — RFQ PDF endpoint.
 *
 * POST /api/restock/rfq-pdf
 * Body: { restockRequestId: string }
 *
 * Pulls the restock request + the most recent rfq_draft AI message
 * payload, builds the PDF in code, returns application/pdf bytes.
 * Also persists the PDF to the restock-docs storage bucket and
 * records the document in restock_documents (kind='rfq').
 *
 * Mail-merge style: the AI's draftRfqFlow already produced the field
 * VALUES (recommended quantity, tiers, message body). This endpoint
 * just slots them into the code-built layout — no second AI call.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  attachDocument,
  getRestockRequest,
  listMessages,
} from "@/services/restock/service";
import { buildRfqPdf } from "@/lib/restock/rfqPdf";
import type { RestockMessageAttachments } from "@/lib/restock/types";

export async function POST(request: Request) {
  let body: { restockRequestId?: string };
  try {
    body = (await request.json()) as { restockRequestId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.restockRequestId) {
    return NextResponse.json(
      { error: "`restockRequestId` required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const req = await getRestockRequest(supabase, body.restockRequestId);
  if (!req) return NextResponse.json({ error: "Restock not found" }, { status: 404 });

  // Find the most recent rfq_draft message — that's the AI's drafted payload
  const messages = await listMessages(supabase, req.id);
  const rfqMessage = [...messages]
    .reverse()
    .find(
      (m): m is typeof m & { attachments: Extract<RestockMessageAttachments, { kind: "rfq_draft" }> } =>
        m.attachments?.kind === "rfq_draft"
    );
  if (!rfqMessage || !rfqMessage.attachments) {
    return NextResponse.json(
      {
        error: "No drafted RFQ found in this chat — call /api/restock with step:'draft_rfq' first",
      },
      { status: 400 }
    );
  }
  const draft = rfqMessage.attachments;

  // Pull farmer + district for the PDF header (best effort — non-fatal)
  let farmerName: string | undefined;
  let farmDistrict: string | undefined;
  try {
    farmerName =
      (user.user_metadata?.full_name as string | undefined) ??
      user.email?.split("@")[0];
    const { data: farm } = await supabase
      .from("farms")
      .select("district")
      .eq("id", req.farmId)
      .maybeSingle();
    farmDistrict = farm?.district ?? undefined;
  } catch {
    // optional fields, ignore
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildRfqPdf({
      caseRef: req.caseRef,
      date: new Date(),
      farmerName,
      farmDistrict,
      itemName: draft.itemName,
      unit: draft.unit,
      recommendedQuantity: draft.requestedQuantity,
      quantityTiers: draft.quantityTiers,
      supplierName: draft.supplierName,
      messageBody: draft.copyToClipboardMessage,
    });
  } catch (err) {
    console.error("RFQ PDF generation failed:", err);
    return NextResponse.json(
      {
        error: "PDF generation failed",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }

  // Persist the PDF to storage + record the document
  const fileName = `RFQ-${req.caseRef}.pdf`;
  const storagePath = `${user.id}/${req.id}/rfq/${fileName}`;
  try {
    const { error: uploadErr } = await supabase.storage
      .from("restock-docs")
      .upload(storagePath, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: true, // idempotent — regenerating an RFQ overwrites the prior copy
      });
    if (!uploadErr) {
      await attachDocument(supabase, {
        restockRequestId: req.id,
        farmId: req.farmId,
        kind: "rfq",
        storagePath,
        fileName,
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
      });
    }
  } catch (persistErr) {
    console.warn("RFQ PDF persistence skipped:", persistErr);
    // Don't fail the response — the user still gets their PDF.
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
