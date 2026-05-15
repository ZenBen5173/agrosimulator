"use client";

/**
 * AgroSim 2.1 — Restock chat thread.
 *
 * One persistent thread per restock_request. The AI drives most of the
 * messages (drafted RFQ, parsed supplier quote, group-buy proposal, PO
 * draft); the farmer mostly taps actions. Inline upload for the supplier
 * reply (PDF / image / text). Generate-RFQ-PDF triggers a download.
 *
 * The chat is the WORKFLOW — not a free-form chatbot. Every AI message
 * either presents an action or records a state transition.
 */

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Sparkles,
  Upload,
  Download,
  Camera,
  Send,
  Loader2,
  Users,
  Lock,
  ExternalLink,
  Check,
  Copy as CopyIcon,
} from "lucide-react";
import {
  type RestockChatMessage,
  type RestockDocument,
  type RestockMessageAttachments,
  type RestockRequest,
  statusLabel,
} from "@/lib/restock/types";
import { createClient } from "@/lib/supabase/client";

export default function RestockChatPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(props.params);
  const router = useRouter();

  const [restock, setRestock] = useState<RestockRequest | null>(null);
  const [messages, setMessages] = useState<RestockChatMessage[]>([]);
  const [documents, setDocuments] = useState<RestockDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<
    | null
    | "draft"
    | "upload"
    | "send"
    | "rfq_pdf"
    | "start_group_buy"
    | "draft_po"
    | "po_pdf"
    | "lock"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [farmerMessage, setFarmerMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch + after every action
  async function refetch() {
    setLoading(true);
    try {
      const res = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "get", restockRequestId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load failed");
      setRestock(data.restock);
      setMessages(data.messages ?? []);
      setDocuments(data.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function draftRfq() {
    setBusy("draft");
    setError(null);
    try {
      const res = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "draft_rfq", restockRequestId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setBusy(null);
    }
  }

  async function downloadRfqPdf() {
    setBusy("rfq_pdf");
    setError(null);
    try {
      const res = await fetch("/api/restock/rfq-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restockRequestId: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `RFQ PDF failed (${res.status})`);
      }
      const dispo = res.headers.get("content-disposition") ?? "";
      const m = dispo.match(/filename="?([^"]+)"?/);
      const fileName = m?.[1] ?? `RFQ-${restock?.caseRef ?? "AgroSim"}.pdf`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await refetch(); // pull in the new rfq document row
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setBusy(null);
    }
  }

  async function uploadSupplierQuote(file: File) {
    setBusy("upload");
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "upload_quote",
          restockRequestId: id,
          fileBase64: base64,
          fileMimeType: file.type,
          fileName: file.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setBusy(null);
    }
  }

  async function pasteSupplierText() {
    const text = window.prompt(
      "Paste the supplier's reply text (WhatsApp message, SMS, etc.):"
    );
    if (!text || !text.trim()) return;
    setBusy("upload");
    setError(null);
    try {
      const res = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "upload_quote",
          restockRequestId: id,
          textBody: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setBusy(null);
    }
  }

  async function sendFarmerMessage() {
    const text = farmerMessage.trim();
    if (!text) return;
    setBusy("send");
    try {
      await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "send_message",
          restockRequestId: id,
          content: text,
        }),
      });
      setFarmerMessage("");
      await refetch();
    } finally {
      setBusy(null);
    }
  }

  // Start a group buy from the most recent supplier_quote_parsed message.
  // Picks the deepest discount tier, sets a 5-day deadline, and routes the
  // farmer to the new group-buy detail page.
  async function startGroupBuy() {
    setBusy("start_group_buy");
    setError(null);
    try {
      if (!restock) throw new Error("Restock not loaded");
      const parsedMsg = [...messages]
        .reverse()
        .find((m) => m.attachments?.kind === "supplier_quote_parsed");
      const parsed = parsedMsg?.attachments;
      if (!parsed || parsed.kind !== "supplier_quote_parsed") {
        throw new Error("No parsed supplier quote in this chat yet.");
      }
      // Resolve farm
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: farm } = await supabase
        .from("farms")
        .select("id, district")
        .eq("id", restock.farmId)
        .maybeSingle();
      if (!farm) throw new Error("Farm not found");

      // Pick the cheapest per-unit tier as the bulk target
      const sortedTiers = [...parsed.tiers].sort(
        (a, b) => a.pricePerUnitRm - b.pricePerUnitRm
      );
      const bestTier = sortedTiers[0];
      if (!bestTier) throw new Error("No tier pricing in the parsed quote.");
      const aloneTier = parsed.tiers.find((t) => t.qty <= bestTier.qty / 2) ??
        parsed.tiers[parsed.tiers.length - 1] ??
        bestTier;

      const closesAt = new Date();
      closesAt.setDate(closesAt.getDate() + 5);

      const res = await fetch("/api/group-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "create",
          createInput: {
            initiatorFarmId: farm.id,
            district: farm.district ?? "Unknown",
            itemName: restock.itemName ?? "(item)",
            unit: bestTier.unit ?? restock.unit ?? "unit",
            individualPriceRm: aloneTier.pricePerUnitRm,
            bulkPriceRm: bestTier.pricePerUnitRm,
            minParticipants: 3,
            closesAt: closesAt.toISOString(),
            supplierName: parsed.vendorName ?? restock.supplierName ?? undefined,
            restockRequestId: restock.id,
            deliveryMode: "shared_pickup",
            tierPricing: parsed.tiers.map((t) => ({
              qty: t.qty,
              unit: t.unit,
              pricePerUnitRm: t.pricePerUnitRm,
            })),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.groupBuy?.id) {
        throw new Error(data.error || "Group buy creation failed");
      }
      router.push(`/group-buy/${data.groupBuy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setBusy(null);
    }
  }

  // Lock the group buy + ask the AI to draft the consolidated PO message.
  async function lockAndDraftPo() {
    if (!restock?.groupBuyId) return;
    setBusy("lock");
    setError(null);
    try {
      const lockRes = await fetch("/api/group-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "lock",
          groupBuyId: restock.groupBuyId,
        }),
      });
      if (!lockRes.ok) {
        const d = await lockRes.json().catch(() => ({}));
        throw new Error(d.error || "Lock failed");
      }
      setBusy("draft_po");
      const draftRes = await fetch("/api/group-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "draft_po",
          groupBuyId: restock.groupBuyId,
        }),
      });
      if (!draftRes.ok) {
        const d = await draftRes.json().catch(() => ({}));
        throw new Error(d.error || "Draft PO failed");
      }
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setBusy(null);
    }
  }

  // Generate + download the consolidated PO PDF.
  async function downloadConsolidatedPoPdf() {
    if (!restock?.groupBuyId) return;
    setBusy("po_pdf");
    setError(null);
    try {
      const res = await fetch("/api/group-buy/po-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupBuyId: restock.groupBuyId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `PO PDF failed (${res.status})`);
      }
      const dispo = res.headers.get("content-disposition") ?? "";
      const m = dispo.match(/filename="?([^"]+)"?/);
      const fileName = m?.[1] ?? `PO-${restock?.caseRef ?? "AgroSim"}.pdf`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown");
    } finally {
      setBusy(null);
    }
  }

  // Has the AI already produced a draft RFQ? (used to swap "Draft RFQ" → "Download RFQ PDF")
  const hasRfqDraft = messages.some((m) => m.attachments?.kind === "rfq_draft");
  const hasConsolidatedPoDraft = messages.some(
    (m) => m.attachments?.kind === "consolidated_po_draft"
  );

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-sm font-semibold text-stone-900">
              {restock?.caseRef ?? "Loading…"}
            </h1>
            <p className="truncate text-[11px] leading-none text-stone-500">
              {restock
                ? `${statusLabel(restock.status)}${restock.supplierName ? ` · ${restock.supplierName}` : ""}`
                : "Fetching chat…"}
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

        {loading && messages.length === 0 && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            <Loader2 size={16} className="mx-auto animate-spin" />
            <p className="mt-2">Loading chat…</p>
          </div>
        )}

        {/* Messages */}
        {messages.map((m) => (
          <MessageCard key={m.id} message={m} />
        ))}

        <div ref={messagesEndRef} />

        {/* Action zone */}
        {restock && (
          <ActionZone
            restock={restock}
            hasRfqDraft={hasRfqDraft}
            hasConsolidatedPoDraft={hasConsolidatedPoDraft}
            busy={busy}
            onDraftRfq={draftRfq}
            onDownloadRfqPdf={downloadRfqPdf}
            onUploadFile={uploadSupplierQuote}
            onPasteText={pasteSupplierText}
            onStartGroupBuy={startGroupBuy}
            onLockAndDraftPo={lockAndDraftPo}
            onDownloadConsolidatedPoPdf={downloadConsolidatedPoPdf}
          />
        )}

        {/* Document list */}
        {documents.length > 0 && (
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
              Documents in this restock
            </p>
            <ul className="space-y-1">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-2 text-xs text-stone-700"
                >
                  <FileText size={12} className="text-stone-400 flex-shrink-0" />
                  <span className="truncate">{d.fileName ?? d.kind}</span>
                  <span className="ml-auto text-[10px] text-stone-400">
                    {labelForKind(d.kind)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Farmer free-text input — for any clarifying notes */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-stone-200 bg-white p-3">
          <div className="mx-auto flex max-w-xl gap-2">
            <input
              type="text"
              value={farmerMessage}
              onChange={(e) => setFarmerMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendFarmerMessage();
              }}
              placeholder="Add a note to this thread…"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              disabled={busy === "send"}
            />
            <button
              onClick={sendFarmerMessage}
              disabled={!farmerMessage.trim() || busy === "send"}
              className="rounded-lg bg-emerald-600 px-3 text-white hover:bg-emerald-700 disabled:opacity-50"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Message card ───────────────────────────────────────────────

function MessageCard({ message }: { message: RestockChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="text-center">
        <span className="inline-block rounded-full bg-stone-100 px-3 py-1 text-[10px] text-stone-500">
          {message.content}
        </span>
      </div>
    );
  }
  const isAi = message.role === "ai";
  const bg = isAi ? "bg-emerald-50 border-emerald-200" : "bg-white border-stone-200";
  const label = isAi ? "Plant doctor / supply assistant" : "You";
  return (
    <div className={`rounded-xl border ${bg} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        {isAi && <Sparkles size={12} className="text-emerald-700" />}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
          {label}
        </span>
      </div>
      <p className="text-sm text-stone-800 whitespace-pre-wrap">
        {message.content}
      </p>
      {message.attachments && (
        <AttachmentRender attachments={message.attachments} />
      )}
    </div>
  );
}

// ─── Attachment renderers (one per discriminator) ──────────────

function AttachmentRender({
  attachments,
}: {
  attachments: RestockMessageAttachments;
}) {
  switch (attachments.kind) {
    case "rfq_draft":
      return <RfqDraftAttachment a={attachments} />;
    case "supplier_quote_parsed":
      return <ParsedQuoteAttachment a={attachments} />;
    case "group_buy_proposal":
      return <GroupBuyProposalAttachment a={attachments} />;
    case "consolidated_po_draft":
      return <ConsolidatedPoDraftAttachment a={attachments} />;
    case "po_draft":
    case "document_uploaded":
    case "status_change":
      return null; // these render their own info via the message text
    default:
      return null;
  }
}

function RfqDraftAttachment({
  a,
}: {
  a: Extract<RestockMessageAttachments, { kind: "rfq_draft" }>;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(a.copyToClipboardMessage).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-2 space-y-2">
      <div className="text-[11px] text-stone-600">
        Recommended order: <strong>{a.requestedQuantity} {a.unit}</strong> {a.itemName}
      </div>
      <div className="text-[10px] text-stone-500">
        Tier ladder: {a.quantityTiers.map((t) => `${t.qty}`).join(" / ")} {a.unit}
      </div>
      <details className="text-[11px]">
        <summary className="cursor-pointer text-stone-600">
          Preview supplier message
        </summary>
        <pre className="mt-1 whitespace-pre-wrap rounded bg-stone-50 p-2 text-[10px] text-stone-700">
          {a.copyToClipboardMessage}
        </pre>
      </details>
      <button
        onClick={copy}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
          copied
            ? "bg-emerald-600 text-white"
            : "bg-stone-100 text-stone-700 hover:bg-stone-200"
        }`}
      >
        {copied ? <Check size={11} /> : <CopyIcon size={11} />}
        {copied ? "Copied — paste to supplier" : "Copy supplier message"}
      </button>
    </div>
  );
}

function ParsedQuoteAttachment({
  a,
}: {
  a: Extract<RestockMessageAttachments, { kind: "supplier_quote_parsed" }>;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-2 space-y-1">
      {a.vendorName && (
        <div className="text-[11px] text-stone-600">
          Supplier: <strong>{a.vendorName}</strong>
        </div>
      )}
      {a.tiers.length > 0 && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-stone-500">
              <th className="font-medium">Qty</th>
              <th className="font-medium">Price/unit</th>
            </tr>
          </thead>
          <tbody>
            {a.tiers.map((t, i) => (
              <tr key={i}>
                <td>
                  {t.qty} {t.unit}
                </td>
                <td>RM {t.pricePerUnitRm.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div
        className={`mt-1 rounded px-2 py-1 text-[10px] ${
          a.bulkDiscountDetected
            ? "bg-emerald-50 text-emerald-800"
            : "bg-stone-50 text-stone-600"
        }`}
      >
        {a.bulkDiscountReasoning}
      </div>
    </div>
  );
}

function GroupBuyProposalAttachment({
  a,
}: {
  a: Extract<RestockMessageAttachments, { kind: "group_buy_proposal" }>;
}) {
  const closes = new Date(a.closesAtIso);
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 space-y-1.5 text-[11px]">
      <div>
        <strong>{a.itemName}</strong> · target {a.targetTotalQty} {a.unit} @ RM{" "}
        {a.bulkPricePerUnitRm.toFixed(2)}/{a.unit}
      </div>
      {a.individualPriceRm != null && (
        <div className="text-stone-600">
          Solo price: RM {a.individualPriceRm.toFixed(2)}/{a.unit} · saving{" "}
          <strong className="text-emerald-700">
            {Math.round(
              (1 - a.bulkPricePerUnitRm / a.individualPriceRm) * 100
            )}
            %
          </strong>
        </div>
      )}
      <div className="text-stone-600">
        Closes {closes.toLocaleDateString("en-MY")}
        {a.minParticipants ? ` · min ${a.minParticipants} farmers` : ""}
      </div>
      <p className="text-stone-700 italic">{a.pitch}</p>
      {a.groupBuyId && (
        <Link
          href={`/group-buy/${a.groupBuyId}`}
          className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"
        >
          Open group buy <ExternalLink size={10} />
        </Link>
      )}
    </div>
  );
}

function ConsolidatedPoDraftAttachment({
  a,
}: {
  a: Extract<RestockMessageAttachments, { kind: "consolidated_po_draft" }>;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 space-y-1.5 text-[11px]">
      <div className="font-semibold text-emerald-900">
        Consolidated PO ready · RM {a.grandTotalRm.toFixed(2)} total
      </div>
      <ul className="space-y-0.5 text-stone-700">
        {a.itemSummary.map((it, i) => (
          <li key={i}>
            • {it.itemName}: {it.totalQuantity} {it.unit} @ RM{" "}
            {it.pricePerUnitRm.toFixed(2)}/{it.unit}
          </li>
        ))}
      </ul>
      <details className="mt-1">
        <summary className="cursor-pointer text-emerald-700 font-medium">
          Show drafted message
        </summary>
        <pre className="mt-1 rounded bg-white border border-stone-200 p-2 text-[10px] whitespace-pre-wrap text-stone-700">
          {a.copyToClipboardMessage}
        </pre>
      </details>
    </div>
  );
}

// ─── Action zone (the buttons at the bottom of the messages) ───

function ActionZone({
  restock,
  hasRfqDraft,
  hasConsolidatedPoDraft,
  busy,
  onDraftRfq,
  onDownloadRfqPdf,
  onUploadFile,
  onPasteText,
  onStartGroupBuy,
  onLockAndDraftPo,
  onDownloadConsolidatedPoPdf,
}: {
  restock: RestockRequest;
  hasRfqDraft: boolean;
  hasConsolidatedPoDraft: boolean;
  busy:
    | null
    | "draft"
    | "upload"
    | "send"
    | "rfq_pdf"
    | "start_group_buy"
    | "draft_po"
    | "po_pdf"
    | "lock";
  onDraftRfq: () => void;
  onDownloadRfqPdf: () => void;
  onUploadFile: (f: File) => void;
  onPasteText: () => void;
  onStartGroupBuy: () => void;
  onLockAndDraftPo: () => void;
  onDownloadConsolidatedPoPdf: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Stage 1: no RFQ drafted yet → primary CTA = "Draft RFQ"
  if (!hasRfqDraft && restock.status === "draft") {
    return (
      <button
        onClick={onDraftRfq}
        disabled={busy !== null}
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy === "draft" ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Drafting RFQ…
          </>
        ) : (
          <>
            <Sparkles size={14} />
            Draft RFQ for me
          </>
        )}
      </button>
    );
  }

  // Stage 2: RFQ drafted → primary actions = download PDF + upload supplier reply
  if (
    hasRfqDraft &&
    (restock.status === "awaiting_supplier" ||
      restock.status === "draft")
  ) {
    return (
      <div className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.docx,.xlsx,.doc,.xls,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadFile(f);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <button
          onClick={onDownloadRfqPdf}
          disabled={busy !== null}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy === "rfq_pdf" ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Building PDF…
            </>
          ) : (
            <>
              <Download size={14} />
              Download RFQ PDF
            </>
          )}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium text-stone-700 hover:border-emerald-400 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Upload size={12} />
            Upload supplier reply
          </button>
          <button
            onClick={onPasteText}
            disabled={busy !== null}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium text-stone-700 hover:border-emerald-400 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Camera size={12} />
            Paste reply text
          </button>
        </div>
        {busy === "upload" && (
          <p className="text-center text-[11px] text-stone-500">
            <Loader2 size={11} className="inline animate-spin" /> Parsing
            supplier reply…
          </p>
        )}
      </div>
    );
  }

  // Stage 3: quote received → either start a group buy or skip to direct PO.
  if (restock.status === "quote_received") {
    return (
      <div className="space-y-2">
        <button
          onClick={onStartGroupBuy}
          disabled={busy !== null}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy === "start_group_buy" ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Opening group buy…
            </>
          ) : (
            <>
              <Users size={14} />
              Start a group buy with neighbours
            </>
          )}
        </button>
        <p className="text-[11px] text-stone-500 text-center">
          Or paste another supplier reply to compare quotes.
        </p>
      </div>
    );
  }

  // Stage 4: group buy live → manage participants, then lock + draft PO.
  if (restock.status === "group_buy_live" && restock.groupBuyId) {
    return (
      <div className="space-y-2">
        <Link
          href={`/group-buy/${restock.groupBuyId}`}
          className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 hover:border-emerald-500 flex items-center justify-center gap-2"
        >
          <Users size={14} />
          Open group buy page
        </Link>
        <button
          onClick={onLockAndDraftPo}
          disabled={busy !== null}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy === "lock" || busy === "draft_po" ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {busy === "lock" ? "Locking buy…" : "Drafting PO…"}
            </>
          ) : (
            <>
              <Lock size={14} />
              Lock + draft consolidated PO
            </>
          )}
        </button>
        {hasConsolidatedPoDraft && (
          <button
            onClick={onDownloadConsolidatedPoPdf}
            disabled={busy !== null}
            className="w-full rounded-xl border border-emerald-400 bg-white px-4 py-3 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy === "po_pdf" ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Building PO PDF…
              </>
            ) : (
              <>
                <Download size={14} />
                Download consolidated PO PDF
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  // Stage 5: PO sent → minimal nudge to mark closed when goods arrive.
  if (restock.status === "po_sent") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
        PO sent. When the goods arrive, mark this restock closed from the
        documents list (coming next: GRN scan).
      </div>
    );
  }

  return null;
}

function labelForKind(k: string): string {
  switch (k) {
    case "rfq":
      return "Request for Quotation";
    case "supplier_quote":
      return "Supplier reply";
    case "po":
      return "Purchase Order";
    case "grn":
      return "Goods received";
    default:
      return k;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
