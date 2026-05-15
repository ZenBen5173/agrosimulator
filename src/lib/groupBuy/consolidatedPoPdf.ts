/**
 * AgroSim 2.1 — Consolidated Purchase Order PDF.
 *
 * Generated when a group buy ends. Mail-merge style: AI flow drafts the
 * supplier message + delivery instructions; THIS file just lays out the
 * formal PO document the supplier signs.
 *
 * One-page A4. Same visual language as the RFQ PDF (matching header bar,
 * emerald accent, bordered tables).
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

// ─── Layout constants ───────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Colours ────────────────────────────────────────────────────
const COLOR_INK = rgb(0.12, 0.12, 0.12);
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);
const COLOR_LINE = rgb(0.88, 0.88, 0.88);
const COLOR_EMERALD = rgb(0.0, 0.6, 0.4);
const COLOR_BG_EMERALD = rgb(0.93, 0.98, 0.95);
const COLOR_BG_AMBER = rgb(0.99, 0.97, 0.88);

// ─── Public API ─────────────────────────────────────────────────

export interface PoLineItem {
  itemName: string;
  totalQty: number;
  unit: string;
  pricePerUnitRm: number;
  /** Computed: totalQty * pricePerUnitRm */
  lineTotalRm: number;
}

export interface PoParticipantRow {
  farmerName: string;
  farmDistrict?: string;
  /** Per-item lines for this farmer (matches PoLineItem.itemName) */
  items: { itemName: string; qty: number; unit: string }[];
  deliveryMode: "pickup" | "deliver_to_farm";
  deliveryAddress?: string;
}

export interface ConsolidatedPoInput {
  /** Group-buy case ref (we use GB-YYYYMMDD-NNNN — same shape as RR-) */
  caseRef: string;
  date: Date;
  supplierName?: string;
  supplierContact?: string;
  initiatorName?: string;
  initiatorDistrict?: string;
  meetingPoint?: string;
  deliveryMode: "shared_pickup" | "per_farmer_delivery" | "mixed";
  /** Aggregated line items across all participants */
  lineItems: PoLineItem[];
  /** Per-farmer breakdown for the delivery section */
  participants: PoParticipantRow[];
  /** Sum of all lineTotalRm — already computed by the caller (avoids
   *  re-deriving it in two places) */
  grandTotalRm: number;
  /** AI-drafted supplier message body */
  supplierMessage: string;
  /** AI-drafted delivery instructions block */
  deliveryInstructions: string;
}

export async function buildConsolidatedPoPdf(
  input: ConsolidatedPoInput
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // ─── Header bar ────────────────────────────────────────────
  page.drawText("AGROSIM 2.1", {
    x: MARGIN,
    y,
    size: 11,
    font: fontBold,
    color: COLOR_EMERALD,
  });

  const titleEn = "CONSOLIDATED PURCHASE ORDER";
  const titleW = fontBold.widthOfTextAtSize(titleEn, 13);
  page.drawText(titleEn, {
    x: PAGE_W - MARGIN - titleW,
    y,
    size: 13,
    font: fontBold,
    color: COLOR_INK,
  });
  const titleBm = "Pesanan Pembelian Berkumpulan";
  const titleBmW = fontItalic.widthOfTextAtSize(titleBm, 10);
  page.drawText(titleBm, {
    x: PAGE_W - MARGIN - titleBmW,
    y: y - 16,
    size: 10,
    font: fontItalic,
    color: COLOR_MUTED,
  });

  y -= 36;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1.2,
    color: COLOR_INK,
  });
  y -= 24;

  // ─── Meta strip ────────────────────────────────────────────
  const dateStr = input.date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const meta: string[] = [`Ref: ${input.caseRef}`, `Date: ${dateStr}`];
  if (input.initiatorName) meta.push(`Coordinator: ${input.initiatorName}`);
  if (input.initiatorDistrict) meta.push(`District: ${input.initiatorDistrict}`);
  if (input.supplierName) meta.push(`Supplier: ${input.supplierName}`);
  if (input.supplierContact) meta.push(`Contact: ${input.supplierContact}`);

  // Wrap meta if it's too long for one line
  const metaLines = wrapText(safe(meta.join("   ·   ")), font, 10, CONTENT_W);
  for (const line of metaLines) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: COLOR_MUTED,
    });
    y -= 14;
  }
  y -= 14;

  // ─── Grand total card ──────────────────────────────────────
  const cardH = 70;
  drawCard(page, y, cardH, COLOR_BG_EMERALD, COLOR_EMERALD);
  page.drawText("GRAND TOTAL", {
    x: MARGIN + 18,
    y: y - 22,
    size: 9,
    font: fontBold,
    color: COLOR_EMERALD,
  });
  page.drawText(`RM ${input.grandTotalRm.toFixed(2)}`, {
    x: MARGIN + 18,
    y: y - 50,
    size: 22,
    font: fontBold,
    color: COLOR_INK,
  });
  const partyLine = `${input.participants.length} farmer${input.participants.length === 1 ? "" : "s"} · ${input.lineItems.length} item${input.lineItems.length === 1 ? "" : "s"}`;
  const partyLineW = font.widthOfTextAtSize(partyLine, 10);
  page.drawText(safe(partyLine), {
    x: PAGE_W - MARGIN - 18 - partyLineW,
    y: y - 22,
    size: 10,
    font,
    color: COLOR_MUTED,
  });
  y -= cardH + 22;

  // ─── Aggregated items table ────────────────────────────────
  y = drawSectionLabel(
    page,
    y,
    fontBold,
    fontItalic,
    "Items to supply",
    "Item untuk dibekalkan"
  );
  y = drawItemsTable(page, y, font, fontBold, input.lineItems);
  y -= 22;

  // ─── Delivery section ──────────────────────────────────────
  y = drawSectionLabel(
    page,
    y,
    fontBold,
    fontItalic,
    `Delivery — ${prettyDeliveryMode(input.deliveryMode)}`,
    "Penghantaran"
  );

  const deliveryLines = wrapText(
    safe(input.deliveryInstructions),
    font,
    10,
    CONTENT_W - 24
  );
  const deliveryH = deliveryLines.length * 14 + 20;
  page.drawRectangle({
    x: MARGIN,
    y: y - deliveryH,
    width: CONTENT_W,
    height: deliveryH,
    color: rgb(0.97, 0.97, 0.95),
    borderColor: COLOR_LINE,
    borderWidth: 0.6,
  });
  let dY = y - 14;
  for (const line of deliveryLines) {
    page.drawText(line, {
      x: MARGIN + 12,
      y: dY,
      size: 10,
      font,
      color: COLOR_INK,
    });
    dY -= 14;
  }
  y -= deliveryH + 22;

  // ─── Per-farmer breakdown (compact) ─────────────────────────
  if (input.participants.length > 0 && y > 200) {
    y = drawSectionLabel(
      page,
      y,
      fontBold,
      fontItalic,
      "Per-farmer breakdown",
      "Pecahan per petani"
    );
    y = drawParticipantsList(
      page,
      y,
      font,
      fontBold,
      input.participants
    );
    y -= 16;
  }

  // ─── Footer ────────────────────────────────────────────────
  const footerY = MARGIN;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 26 },
    end: { x: PAGE_W - MARGIN, y: footerY + 26 },
    thickness: 0.5,
    color: COLOR_LINE,
  });
  page.drawText(
    safe(
      "Generated by AgroSim 2.1 — please confirm receipt + delivery date. Sila sahkan pesanan + tarikh penghantaran."
    ),
    {
      x: MARGIN,
      y: footerY + 10,
      size: 8,
      font: fontItalic,
      color: COLOR_MUTED,
      maxWidth: CONTENT_W,
    }
  );

  return await doc.save();
}

// ─── Drawing primitives ─────────────────────────────────────────

function drawCard(
  page: PDFPage,
  topY: number,
  height: number,
  bg: RGB,
  border: RGB
): void {
  page.drawRectangle({
    x: MARGIN,
    y: topY - height,
    width: CONTENT_W,
    height,
    color: bg,
    borderColor: border,
    borderWidth: 1,
  });
}

function drawSectionLabel(
  page: PDFPage,
  y: number,
  fontBold: PDFFont,
  fontItalic: PDFFont,
  en: string,
  bm: string
): number {
  page.drawText(safe(en.toUpperCase()), {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
    color: COLOR_INK,
  });
  const enW = fontBold.widthOfTextAtSize(safe(en.toUpperCase()), 10);
  page.drawText(safe(`  (${bm})`), {
    x: MARGIN + enW,
    y,
    size: 9,
    font: fontItalic,
    color: COLOR_MUTED,
  });
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color: COLOR_LINE,
  });
  return y - 14;
}

function drawItemsTable(
  page: PDFPage,
  y: number,
  font: PDFFont,
  fontBold: PDFFont,
  items: PoLineItem[]
): number {
  // 4 columns: Item | Qty | Unit price | Line total
  const c1 = 240; // item name
  const c2 = 90; // qty
  const c3 = 100; // unit price
  const c4 = CONTENT_W - c1 - c2 - c3; // line total
  const rowH = 26;
  const headerH = 24;
  const totalH = headerH + items.length * rowH;
  const top = y;
  const bottom = y - totalH;

  page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: CONTENT_W,
    height: totalH,
    borderColor: COLOR_LINE,
    borderWidth: 0.8,
  });

  // Header
  page.drawRectangle({
    x: MARGIN,
    y: top - headerH,
    width: CONTENT_W,
    height: headerH,
    color: COLOR_BG_EMERALD,
  });
  page.drawText("Item", {
    x: MARGIN + 10,
    y: top - 16,
    size: 10,
    font: fontBold,
    color: COLOR_INK,
  });
  page.drawText("Total qty", {
    x: MARGIN + c1 + 10,
    y: top - 16,
    size: 10,
    font: fontBold,
    color: COLOR_INK,
  });
  page.drawText("RM/unit", {
    x: MARGIN + c1 + c2 + 10,
    y: top - 16,
    size: 10,
    font: fontBold,
    color: COLOR_INK,
  });
  page.drawText("Line total RM", {
    x: MARGIN + c1 + c2 + c3 + 10,
    y: top - 16,
    size: 10,
    font: fontBold,
    color: COLOR_INK,
  });

  // Column dividers
  for (const x of [c1, c1 + c2, c1 + c2 + c3]) {
    page.drawLine({
      start: { x: MARGIN + x, y: top },
      end: { x: MARGIN + x, y: bottom },
      thickness: 0.5,
      color: COLOR_LINE,
    });
  }

  // Body
  let rowY = top - headerH;
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: MARGIN + 1,
        y: rowY - rowH + 1,
        width: CONTENT_W - 2,
        height: rowH - 2,
        color: COLOR_BG_AMBER,
      });
    }
    page.drawText(safe(it.itemName), {
      x: MARGIN + 10,
      y: rowY - 16,
      size: 10,
      font,
      color: COLOR_INK,
      maxWidth: c1 - 16,
    });
    page.drawText(safe(`${it.totalQty} ${it.unit}`), {
      x: MARGIN + c1 + 10,
      y: rowY - 16,
      size: 10,
      font,
      color: COLOR_INK,
    });
    page.drawText(safe(`RM ${it.pricePerUnitRm.toFixed(2)}`), {
      x: MARGIN + c1 + c2 + 10,
      y: rowY - 16,
      size: 10,
      font,
      color: COLOR_INK,
    });
    page.drawText(safe(`RM ${it.lineTotalRm.toFixed(2)}`), {
      x: MARGIN + c1 + c2 + c3 + 10,
      y: rowY - 16,
      size: 10,
      font: fontBold,
      color: COLOR_INK,
    });
    rowY -= rowH;
    if (idx !== items.length - 1) {
      page.drawLine({
        start: { x: MARGIN, y: rowY },
        end: { x: MARGIN + CONTENT_W, y: rowY },
        thickness: 0.4,
        color: COLOR_LINE,
      });
    }
  }

  return bottom;
}

function drawParticipantsList(
  page: PDFPage,
  y: number,
  font: PDFFont,
  fontBold: PDFFont,
  participants: PoParticipantRow[]
): number {
  // Compact list — one or two lines per participant. Keep tight so we
  // fit on one page even with 10+ farmers.
  for (const p of participants) {
    if (y < MARGIN + 80) break; // out of room
    const head = `${p.farmerName}${p.farmDistrict ? `, ${p.farmDistrict}` : ""} — ${p.deliveryMode === "pickup" ? "shared pickup" : "delivery to farm"}`;
    page.drawText(safe(head), {
      x: MARGIN,
      y,
      size: 10,
      font: fontBold,
      color: COLOR_INK,
    });
    y -= 12;
    const itemsLine = p.items
      .map((i) => `${i.qty} ${i.unit} ${i.itemName}`)
      .join(", ");
    page.drawText(safe(itemsLine), {
      x: MARGIN + 12,
      y,
      size: 9,
      font,
      color: COLOR_MUTED,
      maxWidth: CONTENT_W - 12,
    });
    y -= 12;
    if (p.deliveryMode === "deliver_to_farm" && p.deliveryAddress) {
      page.drawText(safe(`Address: ${p.deliveryAddress}`), {
        x: MARGIN + 12,
        y,
        size: 9,
        font,
        color: COLOR_MUTED,
        maxWidth: CONTENT_W - 12,
      });
      y -= 12;
    }
    y -= 6;
  }
  return y;
}

function prettyDeliveryMode(
  m: "shared_pickup" | "per_farmer_delivery" | "mixed"
): string {
  switch (m) {
    case "shared_pickup":
      return "shared pickup";
    case "per_farmer_delivery":
      return "deliver to each farm";
    case "mixed":
      return "mixed (pickup + delivery)";
  }
}

// ─── Text helpers (mirrored from rfqPdf for independent edits) ──

function safe(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") {
      lines.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let current = "";
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        current = trial;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}
