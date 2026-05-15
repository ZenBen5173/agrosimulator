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

export default function RestockChatPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(props.params);
  const router = useRouter();

  const [restock, setRestock] = useState<RestockRequest | null>(null);
  const [messages, setMessages] = useState<RestockChatMessage[]>([]);
  const [documents, setDocuments] = useState<RestockDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "draft" | "upload" | "send" | "rfq_pdf">(null);
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

  // Has the AI already produced a draft RFQ? (used to swap "Draft RFQ" → "Download RFQ PDF")
  const hasRfqDraft = messages.some((m) => m.attachments?.kind === "rfq_draft");

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
            busy={busy}
            onDraftRfq={draftRfq}
            onDownloadRfqPdf={downloadRfqPdf}
            onUploadFile={uploadSupplierQuote}
            onPasteText={pasteSupplierText}
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
    case "po_draft":
    case "consolidated_po_draft":
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
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 space-y-1 text-[11px]">
      <div>
        <strong>{a.itemName}</strong> · alone RM {a.individualPriceRm.toFixed(2)} /
        bulk RM {a.bulkPriceRm.toFixed(2)} · save{" "}
        <strong>{a.savingsPercent}%</strong>
      </div>
      <div className="text-stone-600">Min participants: {a.minParticipants}</div>
    </div>
  );
}

// ─── Action zone (the buttons at the bottom of the messages) ───

function ActionZone({
  restock,
  hasRfqDraft,
  busy,
  onDraftRfq,
  onDownloadRfqPdf,
  onUploadFile,
  onPasteText,
}: {
  restock: RestockRequest;
  hasRfqDraft: boolean;
  busy: null | "draft" | "upload" | "send" | "rfq_pdf";
  onDraftRfq: () => void;
  onDownloadRfqPdf: () => void;
  onUploadFile: (f: File) => void;
  onPasteText: () => void;
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

  // Stage 3: quote received — TODO: group buy / direct PO actions (Phase 2)
  if (restock.status === "quote_received") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        Group buy / direct PO actions coming next — review the parsed quote
        above for now.
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
