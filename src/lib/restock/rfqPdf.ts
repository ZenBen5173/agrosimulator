/**
 * AgroSim 2.1 — Request for Quotation (RFQ) PDF generator.
 *
 * Mail-merge style: AI provides the field VALUES (recommended quantity,
 * tier ladder, message body), code does the layout. Same architectural
 * principle as the diagnosis PDF: AI = language, code = layout.
 *
 * Output is a one-page A4 PDF the farmer can print, photograph, or
 * attach to a WhatsApp message to their kedai. The case ref + item
 * line + tier table are the only things the supplier needs to quote
 * against.
 *
 * Reuses the safe-text wrapper + drawing primitives from the diagnosis
 * PDF where possible — duplicates are intentional to keep both PDF
 * generators independently editable for the demo.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

// ─── Layout constants (A4 in points) ─────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Colour palette (matches in-app) ─────────────────────────────
const COLOR_INK = rgb(0.12, 0.12, 0.12);
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);
const COLOR_LINE = rgb(0.88, 0.88, 0.88);
const COLOR_EMERALD = rgb(0.0, 0.6, 0.4);
const COLOR_BG_EMERALD = rgb(0.93, 0.98, 0.95);

// ─── Public API ──────────────────────────────────────────────────

export interface RfqPdfInput {
  /** Case ref (RR-YYYYMMDD-NNNN) — printed prominently for cross-reference */
  caseRef: string;
  /** Today's date for the RFQ header */
  date: Date;
  farmerName?: string;
  farmDistrict?: string;
  itemName: string;
  itemType?: string;
  unit: string;
  recommendedQuantity: number;
  /** Tier ladder for the supplier to quote against */
  quantityTiers: { qty: number; label: string }[];
  supplierName?: string;
  /** The AI-drafted message body (what the farmer copies to send) */
  messageBody: string;
}

/**
 * Build a complete one-page RFQ PDF. Returns raw bytes — the API route
 * streams them back as application/pdf.
 */
export async function buildRfqPdf(input: RfqPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // ─── Header bar ──────────────────────────────────────────────
  page.drawText("AGROSIM 2.1", {
    x: MARGIN,
    y,
    size: 11,
    font: fontBold,
    color: COLOR_EMERALD,
  });

  const titleEn = "REQUEST FOR QUOTATION";
  const titleW = fontBold.widthOfTextAtSize(titleEn, 13);
  page.drawText(titleEn, {
    x: PAGE_W - MARGIN - titleW,
    y,
    size: 13,
    font: fontBold,
    color: COLOR_INK,
  });
  const titleBm = "Permohonan Sebut Harga";
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

  // ─── Case ref strip + meta ─────────────────────────────────
  const dateStr = input.date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const metaParts: string[] = [`Ref: ${input.caseRef}`, `Date: ${dateStr}`];
  if (input.farmerName) metaParts.push(`From: ${input.farmerName}`);
  if (input.farmDistrict) metaParts.push(`District: ${input.farmDistrict}`);
  if (input.supplierName) metaParts.push(`To: ${input.supplierName}`);

  page.drawText(safe(metaParts.join("   ·   ")), {
    x: MARGIN,
    y,
    size: 10,
    font,
    color: COLOR_MUTED,
  });
  y -= 28;

  // ─── Big "ITEM" + name block ───────────────────────────────
  drawCard(page, y, 70, COLOR_BG_EMERALD, COLOR_EMERALD);
  page.drawText("ITEM TO QUOTE", {
    x: MARGIN + 18,
    y: y - 22,
    size: 9,
    font: fontBold,
    color: COLOR_EMERALD,
  });
  page.drawText(safe(input.itemName), {
    x: MARGIN + 18,
    y: y - 46,
    size: 18,
    font: fontBold,
    color: COLOR_INK,
  });
  if (input.itemType) {
    page.drawText(safe(`(${input.itemType})`), {
      x: MARGIN + 18,
      y: y - 62,
      size: 9,
      font: fontItalic,
      color: COLOR_MUTED,
    });
  }
  y -= 70 + 28;

  // ─── Tier table (the heart of the RFQ) ─────────────────────
  y = drawTierTable(
    page,
    y,
    font,
    fontBold,
    input.quantityTiers,
    input.unit,
    input.recommendedQuantity
  );
  y -= 24;

  // ─── Message body (what the farmer sent) ───────────────────
  y = drawSectionLabel(
    page,
    y,
    fontBold,
    fontItalic,
    "Message sent to supplier",
    "Mesej yang dihantar"
  );

  const wrappedBody = wrapText(safe(input.messageBody), font, 10, CONTENT_W - 24);
  // Subtle background box for the message
  const msgHeight = wrappedBody.length * 14 + 20;
  page.drawRectangle({
    x: MARGIN,
    y: y - msgHeight,
    width: CONTENT_W,
    height: msgHeight,
    color: rgb(0.97, 0.97, 0.95),
    borderColor: COLOR_LINE,
    borderWidth: 0.6,
  });
  let msgY = y - 14;
  for (const line of wrappedBody) {
    page.drawText(line, {
      x: MARGIN + 12,
      y: msgY,
      size: 10,
      font,
      color: COLOR_INK,
    });
    msgY -= 14;
  }
  y -= msgHeight + 24;

  // ─── Supplier reply box (placeholder for them to fill) ────
  y = drawSectionLabel(
    page,
    y,
    fontBold,
    fontItalic,
    "Supplier — please fill in your prices below",
    "Sila isi harga"
  );

  // 4 blank lines for the supplier to write their reply
  for (let i = 0; i < 4; i++) {
    page.drawLine({
      start: { x: MARGIN + 12, y: y - 18 },
      end: { x: PAGE_W - MARGIN - 12, y: y - 18 },
      thickness: 0.4,
      color: COLOR_LINE,
    });
    y -= 22;
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
      "Generated by AgroSim 2.1 — quote this case ref when replying. Dijana oleh AgroSim — sila guna nombor ref di atas."
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

// ─── Drawing primitives ──────────────────────────────────────────

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

function drawTierTable(
  page: PDFPage,
  y: number,
  font: PDFFont,
  fontBold: PDFFont,
  tiers: { qty: number; label: string }[],
  unit: string,
  recommendedQty: number
): number {
  // 3 columns: Quantity | Description | Price (RM) — supplier fills the price
  const c1 = 100;
  const c2 = 240;
  const c3 = CONTENT_W - c1 - c2;
  const rowH = 32;
  const headerH = 26;
  const totalH = headerH + tiers.length * rowH;
  const top = y;
  const bottom = y - totalH;

  // Outer border
  page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: CONTENT_W,
    height: totalH,
    borderColor: COLOR_LINE,
    borderWidth: 0.8,
  });

  // Header row
  page.drawRectangle({
    x: MARGIN,
    y: top - headerH,
    width: CONTENT_W,
    height: headerH,
    color: COLOR_BG_EMERALD,
  });

  // Column dividers
  page.drawLine({
    start: { x: MARGIN + c1, y: top },
    end: { x: MARGIN + c1, y: bottom },
    thickness: 0.5,
    color: COLOR_LINE,
  });
  page.drawLine({
    start: { x: MARGIN + c1 + c2, y: top },
    end: { x: MARGIN + c1 + c2, y: bottom },
    thickness: 0.5,
    color: COLOR_LINE,
  });

  // Header text
  page.drawText("Quantity", {
    x: MARGIN + 10,
    y: top - 17,
    size: 10,
    font: fontBold,
    color: COLOR_INK,
  });
  page.drawText("Tier", {
    x: MARGIN + c1 + 10,
    y: top - 17,
    size: 10,
    font: fontBold,
    color: COLOR_INK,
  });
  page.drawText("Price per unit (RM)", {
    x: MARGIN + c1 + c2 + 10,
    y: top - 17,
    size: 10,
    font: fontBold,
    color: COLOR_INK,
  });

  // Body rows
  let rowY = top - headerH;
  for (const tier of tiers) {
    const isRecommended = tier.qty === recommendedQty;
    if (isRecommended) {
      // Light highlight on the recommended row
      page.drawRectangle({
        x: MARGIN + 1,
        y: rowY - rowH + 1,
        width: CONTENT_W - 2,
        height: rowH - 2,
        color: rgb(0.99, 0.97, 0.88),
      });
    }
    page.drawText(safe(`${tier.qty} ${unit}`), {
      x: MARGIN + 10,
      y: rowY - 20,
      size: 11,
      font: isRecommended ? fontBold : font,
      color: COLOR_INK,
    });
    page.drawText(safe(tier.label), {
      x: MARGIN + c1 + 10,
      y: rowY - 20,
      size: 10,
      font,
      color: isRecommended ? COLOR_INK : COLOR_MUTED,
    });
    if (isRecommended) {
      page.drawText("(my order)", {
        x: MARGIN + c1 + 10,
        y: rowY - 30,
        size: 8,
        font: fontBold,
        color: COLOR_EMERALD,
      });
    }
    // Empty box for the supplier to write the price into
    page.drawText("RM ____________", {
      x: MARGIN + c1 + c2 + 10,
      y: rowY - 20,
      size: 10,
      font,
      color: COLOR_MUTED,
    });
    rowY -= rowH;
    // Inter-row horizontal divider
    if (tier !== tiers[tiers.length - 1]) {
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

// ─── Text helpers (defensive WinAnsi-safe wrap) ─────────────────

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
  // Honour explicit \n in the message body
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
