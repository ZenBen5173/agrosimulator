/**
 * AgroSim 2.1 — Restock chat workflow API.
 *
 * One stateless endpoint with a `step` discriminator (same pattern as
 * /api/diagnosis/v2). Each step does a small chunk of work:
 *
 *   - "create"          → open a new restock chat for an inventory item
 *   - "draft_rfq"       → AI flow + record the AI message + return rfq details
 *   - "rfq_pdf"         → generate + return RFQ PDF bytes (separate route below)
 *   - "send_message"    → farmer writes a message into the thread
 *   - "upload_quote"    → farmer uploads supplier reply (PDF / image / text);
 *                          parses it, judges bulk discount, posts AI message
 *   - "list"            → farm-scoped restock list with optional search
 *   - "get"             → fetch a restock + its messages + documents
 *   - "transition"      → manually move status (e.g. mark closed)
 *
 * Persistence requires authenticated user. Service role is used by cron
 * (separate path), not here.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  appendMessage,
  attachDocument,
  createRestockRequest,
  getRestockRequest,
  listDocuments,
  listMessages,
  listRestockRequests,
  transitionStatus,
  updateRequestMetadata,
} from "@/services/restock/service";
import {
  draftRfqFlow,
  parseSupplierQuoteFlow,
  replyToFarmerFlow,
} from "@/flows/restockChat";
import type { RestockStatus } from "@/lib/restock/types";

interface RequestBody {
  step:
    | "create"
    | "draft_rfq"
    | "send_message"
    | "upload_quote"
    | "list"
    | "get"
    | "transition";
  // create
  farmId?: string;
  inventoryItemId?: string;
  triggerKind?: "manual" | "auto_low_stock" | "resume";
  // draft_rfq
  restockRequestId?: string;
  // send_message
  content?: string;
  // upload_quote
  uploadKind?: "pdf" | "image" | "text" | "doc" | "spreadsheet";
  fileBase64?: string;
  fileMimeType?: string;
  fileName?: string;
  textBody?: string;
  // list / search
  searchText?: string;
  statusFilter?: RestockStatus[];
  // transition
  toStatus?: RestockStatus;
  reason?: string;
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
        if (!body.farmId || !body.inventoryItemId) {
          return badRequest("`farmId` and `inventoryItemId` required");
        }

        // Idempotency: if there's already an open (non-closed/cancelled)
        // restock chat for this item on this farm, reuse it. Otherwise the
        // farmer ends up with a graveyard of duplicate chats from
        // re-tapping "Restock this".
        const { data: existing } = await supabase
          .from("restock_requests")
          .select("id")
          .eq("farm_id", body.farmId)
          .eq("inventory_item_id", body.inventoryItemId)
          .not("status", "in", "(closed,cancelled)")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          const reused = await getRestockRequest(supabase, existing.id);
          if (reused) return NextResponse.json({ restock: reused, reused: true });
        }

        const req = await createRestockRequest(supabase, {
          farmId: body.farmId,
          userId: user.id,
          inventoryItemId: body.inventoryItemId,
          triggerKind: body.triggerKind ?? "manual",
        });
        return NextResponse.json({ restock: req });
      }

      case "draft_rfq": {
        if (!body.restockRequestId) return badRequest("`restockRequestId` required");
        const req = await getRestockRequest(supabase, body.restockRequestId);
        if (!req) return badRequest("Restock not found");

        // Pull inventory item details for the AI context
        const { data: item } = await supabase
          .from("inventory_items")
          .select(
            "item_name, item_type, current_quantity, reorder_quantity, unit, supplier_name"
          )
          .eq("id", req.inventoryItemId)
          .maybeSingle();
        if (!item) return badRequest("Inventory item not found");

        const { data: farm } = await supabase
          .from("farms")
          .select("district")
          .eq("id", req.farmId)
          .maybeSingle();

        const draft = await draftRfqFlow({
          itemName: item.item_name,
          itemType: item.item_type ?? undefined,
          currentQuantity: Number(item.current_quantity ?? 0),
          reorderQuantity: Number(item.reorder_quantity ?? 1),
          unit: item.unit ?? "unit",
          lastSupplierName: item.supplier_name ?? undefined,
          farmDistrict: farm?.district ?? undefined,
        });

        // Update request metadata so the chat list shows requested qty
        await updateRequestMetadata(supabase, req.id, {
          requestedQuantity: draft.recommendedQuantity,
          unit: draft.unit,
          supplierName: item.supplier_name ?? undefined,
        });

        // Post AI message with the draft + actionable payload
        await appendMessage(supabase, {
          restockRequestId: req.id,
          farmId: req.farmId,
          role: "ai",
          content: `${draft.summary}. Tap "Generate RFQ PDF" below — I'll create it, you copy the message and download the PDF, then send both to your supplier.`,
          attachments: {
            kind: "rfq_draft",
            itemName: item.item_name,
            requestedQuantity: draft.recommendedQuantity,
            unit: draft.unit,
            quantityTiers: draft.quantityTiers,
            supplierName: item.supplier_name ?? undefined,
            copyToClipboardMessage: draft.copyToClipboardMessage,
          },
        });

        // Status: draft → awaiting_supplier (the farmer is now expected
        // to send the RFQ to the supplier off-platform)
        await transitionStatus(supabase, {
          restockRequestId: req.id,
          farmId: req.farmId,
          from: "draft",
          to: "awaiting_supplier",
          reason: "RFQ drafted — awaiting supplier reply",
        });

        return NextResponse.json({ draft });
      }

      case "send_message": {
        if (!body.restockRequestId || !body.content) {
          return badRequest("`restockRequestId` and `content` required");
        }
        const req = await getRestockRequest(supabase, body.restockRequestId);
        if (!req) return badRequest("Restock not found");

        // 1. Save the farmer's message
        const farmerMsg = await appendMessage(supabase, {
          restockRequestId: req.id,
          farmId: req.farmId,
          role: "farmer",
          content: body.content,
        });

        // 2. Generate a contextual AI reply. Best-effort — the farmer's
        //    message is already persisted, so a Gemini failure here just
        //    means the chat doesn't auto-reply this turn.
        let aiMsg: typeof farmerMsg | null = null;
        let actionMsg: typeof farmerMsg | null = null;
        try {
          // Pull the chat history + the inventory item details for context
          const recent = await listMessages(supabase, req.id);
          const { data: itemRow } = await supabase
            .from("inventory_items")
            .select("item_name, item_type, current_quantity, reorder_quantity, unit, supplier_name")
            .eq("id", req.inventoryItemId)
            .maybeSingle();

          const reply = await replyToFarmerFlow({
            farmerMessage: body.content,
            itemName: itemRow?.item_name ?? "this item",
            itemUnit: itemRow?.unit ?? req.unit ?? undefined,
            currentRequestedQty:
              req.requestedQuantity != null
                ? Number(req.requestedQuantity)
                : itemRow?.reorder_quantity != null
                  ? Number(itemRow.reorder_quantity)
                  : undefined,
            status: req.status,
            supplierName: req.supplierName ?? undefined,
            recentMessages: recent.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          });

          if (reply.reply && reply.reply.trim()) {
            aiMsg = await appendMessage(supabase, {
              restockRequestId: req.id,
              farmId: req.farmId,
              role: "ai",
              content: reply.reply.trim(),
            });
          }

          // 3. Dispatch any structured action the AI emitted. Today the
          //    only one is redraft_rfq — re-runs draftRfqFlow with the
          //    farmer's requested overrides + appends a fresh rfq_draft
          //    message so the new buttons (with the new quantity) show
          //    up inline. The chat thread now visibly tells the story:
          //    farmer asked, AI confirmed, AI posted the new draft.
          if (reply.action?.kind === "redraft_rfq" && itemRow) {
            const newQty =
              reply.action.quantityOverride ??
              (req.requestedQuantity != null
                ? Number(req.requestedQuantity)
                : Number(itemRow.reorder_quantity ?? 1));
            const newSupplier =
              reply.action.supplierOverride ??
              req.supplierName ??
              itemRow.supplier_name ??
              undefined;

            const { data: farm } = await supabase
              .from("farms")
              .select("district")
              .eq("id", req.farmId)
              .maybeSingle();

            const draft = await draftRfqFlow({
              itemName: itemRow.item_name,
              itemType: itemRow.item_type ?? undefined,
              currentQuantity: Number(itemRow.current_quantity ?? 0),
              reorderQuantity: newQty,
              unit: itemRow.unit ?? "unit",
              lastSupplierName: newSupplier,
              farmDistrict: farm?.district ?? undefined,
            });

            await updateRequestMetadata(supabase, req.id, {
              requestedQuantity: draft.recommendedQuantity,
              unit: draft.unit,
              supplierName: newSupplier,
            });

            actionMsg = await appendMessage(supabase, {
              restockRequestId: req.id,
              farmId: req.farmId,
              role: "ai",
              content: `Updated RFQ — ${draft.summary}. New buttons below to download or share with ${newSupplier ?? "your supplier"}.`,
              attachments: {
                kind: "rfq_draft",
                itemName: itemRow.item_name,
                requestedQuantity: draft.recommendedQuantity,
                unit: draft.unit,
                quantityTiers: draft.quantityTiers,
                supplierName: newSupplier ?? undefined,
                copyToClipboardMessage: draft.copyToClipboardMessage,
              },
            });
          }
        } catch (err) {
          console.warn("AI reply / action skipped:", err);
        }

        return NextResponse.json({
          message: farmerMsg,
          aiReply: aiMsg,
          aiAction: actionMsg,
        });
      }

      case "upload_quote": {
        if (!body.restockRequestId)
          return badRequest("`restockRequestId` required");
        const req = await getRestockRequest(supabase, body.restockRequestId);
        if (!req) return badRequest("Restock not found");

        // Pull inventory item name for the parser context
        const { data: item } = await supabase
          .from("inventory_items")
          .select("item_name")
          .eq("id", req.inventoryItemId)
          .maybeSingle();
        const itemName = item?.item_name ?? "(unknown item)";

        // Decide path: text vs binary
        let parsed;
        let storagePath: string | null = null;
        if (body.fileBase64 && body.fileMimeType) {
          // Upload to storage first so we have a permanent reference
          const ext = body.fileMimeType.split("/")[1] ?? "bin";
          const fileName =
            body.fileName ?? `quote-${Date.now()}.${ext}`;
          storagePath = `${user.id}/${req.id}/supplier_quote/${fileName}`;
          const buf = Buffer.from(body.fileBase64, "base64");
          const { error: uploadErr } = await supabase.storage
            .from("restock-docs")
            .upload(storagePath, buf, {
              contentType: body.fileMimeType,
              upsert: false,
            });
          if (uploadErr) {
            console.warn("Storage upload failed (continuing anyway):", uploadErr);
            storagePath = null;
          }

          // Parse — only images go through Vision; PDF/Word/Excel get
          // processed as text-mode (Gemini reads PDFs natively). For now:
          // images via Vision, everything else via text mode after
          // best-effort text extraction — for images we pass the bytes,
          // for non-image binary we just inform the model the body is binary.
          if (body.fileMimeType.startsWith("image/")) {
            parsed = await parseSupplierQuoteFlow({
              itemName,
              photoBase64: body.fileBase64,
              photoMimeType: body.fileMimeType,
            });
          } else {
            parsed = await parseSupplierQuoteFlow({
              itemName,
              photoBase64: body.fileBase64,
              photoMimeType: body.fileMimeType,
            });
          }
        } else if (body.textBody) {
          parsed = await parseSupplierQuoteFlow({
            itemName,
            textBody: body.textBody,
          });
        } else {
          return badRequest("Provide either `fileBase64`+`fileMimeType` or `textBody`");
        }

        // Store the document row
        if (storagePath) {
          await attachDocument(supabase, {
            restockRequestId: req.id,
            farmId: req.farmId,
            kind: "supplier_quote",
            storagePath,
            fileName: body.fileName,
            mimeType: body.fileMimeType,
            sizeBytes: body.fileBase64
              ? Math.floor(body.fileBase64.length * 0.75) // base64 → bytes approx
              : undefined,
            parsedData: parsed as unknown as Record<string, unknown>,
          });
        }

        // Post AI summary message + actionable payload
        const tierSummary =
          parsed.tiers.length > 0
            ? parsed.tiers
                .map((t) => `${t.qty} ${t.unit} @ RM ${t.pricePerUnitRm.toFixed(2)}`)
                .join(", ")
            : "(no tiers extracted)";
        await appendMessage(supabase, {
          restockRequestId: req.id,
          farmId: req.farmId,
          role: "ai",
          content: parsed.bulkDiscountDetected
            ? `Got the supplier's reply. ${parsed.bulkDiscountReasoning}. Want to start a group buy with neighbours so everyone shares the bulk price?`
            : `Got the supplier's reply. ${parsed.bulkDiscountReasoning}. No meaningful bulk discount — want me to draft a direct PO for your own quantity?`,
          attachments: {
            kind: "supplier_quote_parsed",
            vendorName: parsed.vendorName ?? undefined,
            tiers: parsed.tiers,
            bulkDiscountDetected: parsed.bulkDiscountDetected,
            bulkDiscountReasoning: parsed.bulkDiscountReasoning,
            raw: tierSummary,
          },
        });

        await transitionStatus(supabase, {
          restockRequestId: req.id,
          farmId: req.farmId,
          from: req.status,
          to: "quote_received",
          reason: "Supplier quote uploaded + parsed",
        });

        return NextResponse.json({ parsed, storagePath });
      }

      case "list": {
        if (!body.farmId) return badRequest("`farmId` required");
        const items = await listRestockRequests(supabase, body.farmId, {
          text: body.searchText,
          status: body.statusFilter,
          limit: 100,
        });
        return NextResponse.json({ items });
      }

      case "get": {
        if (!body.restockRequestId)
          return badRequest("`restockRequestId` required");
        const req = await getRestockRequest(supabase, body.restockRequestId);
        if (!req) return badRequest("Restock not found");
        const messages = await listMessages(supabase, req.id);
        const documents = await listDocuments(supabase, req.id);
        return NextResponse.json({ restock: req, messages, documents });
      }

      case "transition": {
        if (!body.restockRequestId || !body.toStatus) {
          return badRequest("`restockRequestId` and `toStatus` required");
        }
        const req = await getRestockRequest(supabase, body.restockRequestId);
        if (!req) return badRequest("Restock not found");
        await transitionStatus(supabase, {
          restockRequestId: req.id,
          farmId: req.farmId,
          from: req.status,
          to: body.toStatus,
          reason: body.reason,
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return badRequest(`Unknown step: ${body.step}`);
    }
  } catch (err) {
    console.error("/api/restock error:", err);
    return NextResponse.json(
      {
        error: "Restock pipeline error",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
