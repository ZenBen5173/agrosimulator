/**
 * AgroSim 2.0 — Diagnosis report PDF generator.
 *
 * AI provides the data (diagnosis, candidates, prescription, reasoning).
 * This module turns that data into a formal, bilingual (Bahasa Malaysia
 * + English) A4 PDF that:
 *   1. A Malaysian smallholder can read at a glance
 *   2. A MARDI extension officer can verify against the photos
 *   3. A kedai pertanian can read to issue the right chemical
 *
 * Design choices (researched + opinionated):
 *
 *  Bilingual          BM primary headings, English secondary in italic.
 *                     Most Malaysian farmers are bilingual but BM feels
 *                     more official. Big section dividers in BM.
 *  Plantwise          Two-part prescription (Stop it now / Stop it
 *                     coming back) is the WHO-endorsed plant-clinic
 *                     pattern. Already baked into the rules table.
 *  A4 portrait        Universal print size in Malaysia (DOA / MARDI
 *                     use A4 exclusively for extension materials).
 *  Helvetica          pdf-lib's built-in standard font — works without
 *                     embedding a custom font (smaller PDF, no Unicode
 *                     mojibake risk on Cloud Run).
 *  Colour-coded       Green confirmed / amber uncertain / grey
 *                     cannot_determine — matches the in-app outcome
 *                     banding. Still readable when printed B&W.
 *  Disclaimer         Bottom of every page: AI-generated, get MARDI
 *                     to confirm before destroying plants.
 *  Reference ID       AS-YYYYMMDD-XXXX so farmers can quote it when
 *                     calling the kedai / MARDI hotline.
 *
 * NB: This file runs server-side only. pdf-lib has zero native deps so
 * it builds cleanly inside the Cloud Run Next.js standalone container.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { DiagnosisResult, DiagnosisSession } from "./types";
import { ruleById } from "./malaysiaRules";

// ─── Layout constants (A4 in points) ─────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Colour palette (matches in-app tokens) ──────────────────────
const COLOR_INK = rgb(0.12, 0.12, 0.12);
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);
const COLOR_LINE = rgb(0.88, 0.88, 0.88);
const COLOR_EMERALD = rgb(0.0, 0.6, 0.4);
const COLOR_AMBER = rgb(0.92, 0.65, 0.0);
const COLOR_STONE = rgb(0.62, 0.62, 0.55);
const COLOR_BG_EMERALD = rgb(0.93, 0.98, 0.95);
const COLOR_BG_AMBER = rgb(0.99, 0.96, 0.88);
const COLOR_BG_STONE = rgb(0.96, 0.96, 0.94);

// ─── Public API ──────────────────────────────────────────────────

/**
 * Build a complete bilingual diagnosis PDF from a finalised session.
 * Returns the raw bytes — the API route streams these back as
 * application/pdf with a sensible filename.
 */
export async function buildDiagnosisReportPdf(
  session: DiagnosisSession,
  opts?: { farmerName?: string; farmDistrict?: string }
): Promise<Uint8Array> {
  if (!session.result) {
    throw new Error("buildDiagnosisReportPdf: session has no result");
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const ctx: ReportContext = {
    doc,
    font,
    fontBold,
    fontItalic,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    pageNumber: 1,
    totalPages: 1, // patched after layout
    session,
    result: session.result,
    farmerName: opts?.farmerName,
    farmDistrict: opts?.farmDistrict,
  };

  // Layout order = the order a Malaysian farmer + MARDI officer want to
  // read it. Verdict first, action second, evidence third, audit trail
  // last. This is the opposite of the original "form-style" ordering
  // (case ref → patient → history → diagnosis) which buried the actual
  // answer behind 4 sections of preamble.
  drawHeader(ctx);
  drawDiagnosisHero(ctx);   // 1. THE ANSWER — huge, top of page
  drawPrescription(ctx);    // 2. WHAT TO DO — bordered "action" boxes
  drawReasoning(ctx);       // 3. WHY — confidence + ruled out
  drawCaseStrip(ctx);       // 4. CASE FACTS — compact one-line strip
  drawHistoryBlock(ctx);    // 5. WHAT THE FARMER SAID — for the MARDI officer
  drawFollowUp(ctx);        // 6. WHEN TO CHECK BACK
  drawTechnicalReference(ctx); // 7. AUDIT TRAIL — small, lightest

  // Page-number stamps + footer — done in a second pass so all pages
  // know the final total.
  const pages = doc.getPages();
  ctx.totalPages = pages.length;
  for (let i = 0; i < pages.length; i++) {
    drawFooter(pages[i], ctx, i + 1);
  }

  return await doc.save();
}

// ─── Internal layout types ───────────────────────────────────────

interface ReportContext {
  doc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  fontItalic: PDFFont;
  page: PDFPage;
  y: number; // cursor: top of next thing to draw
  pageNumber: number;
  totalPages: number;
  session: DiagnosisSession;
  result: DiagnosisResult;
  farmerName?: string;
  farmDistrict?: string;
}

// ─── Drawing primitives ──────────────────────────────────────────

function newPageIfNeeded(ctx: ReportContext, neededHeight: number) {
  if (ctx.y - neededHeight < MARGIN + 60 /* footer */) {
    ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    ctx.pageNumber += 1;
    ctx.y = PAGE_H - MARGIN;
  }
}

function drawText(
  ctx: ReportContext,
  text: string,
  opts: {
    size?: number;
    font?: PDFFont;
    color?: RGB;
    x?: number;
    indent?: number;
    bottomGap?: number;
    maxWidth?: number;
    italics?: boolean;
  } = {}
) {
  const size = opts.size ?? 11;
  const fnt = opts.font ?? (opts.italics ? ctx.fontItalic : ctx.font);
  const color = opts.color ?? COLOR_INK;
  const x = opts.x ?? MARGIN + (opts.indent ?? 0);
  const maxW = opts.maxWidth ?? CONTENT_W - (opts.indent ?? 0);

  const lines = wrapText(text, fnt, size, maxW);
  const lineHeight = size * 1.5; // was 1.35 — more breathing room between lines
  newPageIfNeeded(ctx, lines.length * lineHeight + (opts.bottomGap ?? 0));

  for (const line of lines) {
    ctx.page.drawText(line, {
      x,
      y: ctx.y - size,
      size,
      font: fnt,
      color,
    });
    ctx.y -= lineHeight;
  }
  ctx.y -= opts.bottomGap ?? 0;
}

function drawDivider(ctx: ReportContext, color = COLOR_LINE, gap = 6) {
  newPageIfNeeded(ctx, gap * 2 + 1);
  ctx.y -= gap;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.5,
    color,
  });
  ctx.y -= gap;
}

function drawSectionHeading(ctx: ReportContext, en: string, bm?: string) {
  newPageIfNeeded(ctx, 44);
  ctx.y -= 32; // was 18 — much bigger gap before each section heading so
  // adjacent sections aren't visually mashed together
  // English first (primary, larger), optional BM in parens (smaller, muted).
  // Heavy bilingual headers (TANAMAN · Crop & plot) doubled the visual
  // weight of every section — most farmers + judges scan the English
  // first; BM on row labels is overkill.
  ctx.page.drawText(safe(en), {
    x: MARGIN,
    y: ctx.y,
    size: 12,
    font: ctx.fontBold,
    color: COLOR_INK,
  });
  if (bm) {
    const enW = ctx.fontBold.widthOfTextAtSize(safe(en), 12);
    ctx.page.drawText(safe(`  (${bm})`), {
      x: MARGIN + enW,
      y: ctx.y,
      size: 9,
      font: ctx.fontItalic,
      color: COLOR_MUTED,
    });
  }
  ctx.y -= 8;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.6,
    color: COLOR_LINE,
  });
  ctx.y -= 14; // was 10 — more space between rule and the first body line
}

function drawLabelValueRow(ctx: ReportContext, label: string, value: string) {
  const size = 10;
  newPageIfNeeded(ctx, size * 1.9);
  ctx.page.drawText(safe(label), {
    x: MARGIN,
    y: ctx.y - size,
    size,
    font: ctx.fontBold,
    color: COLOR_MUTED,
  });
  ctx.page.drawText(safe(value), {
    x: MARGIN + 140,
    y: ctx.y - size,
    size,
    font: ctx.font,
    color: COLOR_INK,
  });
  ctx.y -= size * 1.9; // was 1.6 — more breathing room between rows
}

function drawColouredCard(
  ctx: ReportContext,
  height: number,
  bg: RGB,
  border: RGB,
  draw: (cardTop: number, cardBottom: number) => void
) {
  newPageIfNeeded(ctx, height + 24);
  const top = ctx.y;
  const bottom = ctx.y - height;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: CONTENT_W,
    height,
    color: bg,
    borderColor: border,
    borderWidth: 1,
  });
  draw(top, bottom);
  ctx.y = bottom - 24; // was 10 — much bigger gap after the diagnosis
  // hero so the next section doesn't crowd it
}

function drawBulletList(ctx: ReportContext, items: string[], indent = 16) {
  for (const item of items) {
    newPageIfNeeded(ctx, 18);
    ctx.page.drawText("•", {
      x: MARGIN + 4,
      y: ctx.y - 11,
      size: 11,
      font: ctx.fontBold,
      color: COLOR_MUTED,
    });
    drawText(ctx, item, {
      size: 10,
      indent,
      maxWidth: CONTENT_W - indent,
      bottomGap: 6, // was 2 — gap between bullet items
    });
  }
}

// ─── Sections ────────────────────────────────────────────────────

function drawHeader(ctx: ReportContext) {
  // Brand mark — top left. Plain ASCII so we don't risk a "WinAnsi
  // cannot encode" runtime error from pdf-lib's Helvetica.
  ctx.page.drawText("AGROSIM 2.0", {
    x: MARGIN,
    y: PAGE_H - MARGIN,
    size: 11,
    font: ctx.fontBold,
    color: COLOR_EMERALD,
  });

  // Title block — right side
  const titleBm = "LAPORAN DIAGNOSIS TANAMAN";
  const titleEn = "Plant Diagnosis Report";
  const tBmW = ctx.fontBold.widthOfTextAtSize(titleBm, 13);
  ctx.page.drawText(titleBm, {
    x: PAGE_W - MARGIN - tBmW,
    y: PAGE_H - MARGIN,
    size: 13,
    font: ctx.fontBold,
    color: COLOR_INK,
  });
  const tEnW = ctx.fontItalic.widthOfTextAtSize(titleEn, 10);
  ctx.page.drawText(titleEn, {
    x: PAGE_W - MARGIN - tEnW,
    y: PAGE_H - MARGIN - 16,
    size: 10,
    font: ctx.fontItalic,
    color: COLOR_MUTED,
  });

  ctx.y = PAGE_H - MARGIN - 36;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 1.2,
    color: COLOR_INK,
  });
  ctx.y -= 8;
}

/**
 * Compact one-line "case facts" strip — replaces the old drawCaseBlock
 * which used 4 separate label/value rows. Now reads as a single muted
 * line of metadata so it doesn't compete with the diagnosis hero or
 * treatment box for attention.
 */
function drawCaseStrip(ctx: ReportContext) {
  const date = new Date(ctx.session.startedAt);
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const ref = makeCaseRef(ctx.session);

  const parts: string[] = [];
  parts.push(`Ref: ${ref}`);
  parts.push(`Date: ${dateStr}`);
  parts.push(`Crop: ${cropDisplay(ctx.session.crop)}`);
  if (ctx.session.plotLabel) parts.push(`Plot: ${ctx.session.plotLabel}`);
  if (ctx.farmerName) parts.push(`Farmer: ${ctx.farmerName}`);
  if (ctx.farmDistrict) parts.push(`District: ${ctx.farmDistrict}`);
  const stage = ctx.session.historyAnswers.find(
    (h) => h.questionId === "plant_stage"
  );
  if (stage) parts.push(`Stage: ${stage.answer}`);
  if (ctx.session.pattern) parts.push(`Pattern: ${patternDisplay(ctx.session.pattern)}`);

  drawSectionHeading(ctx, "Case facts", "Maklumat kes");
  drawText(ctx, parts.join("   ·   "), {
    size: 9,
    color: COLOR_MUTED,
    bottomGap: 4,
  });
}

function drawHistoryBlock(ctx: ReportContext) {
  if (ctx.session.historyAnswers.length === 0) return;
  drawSectionHeading(ctx, "What the farmer reported", "Sejarah");
  for (const ha of ctx.session.historyAnswers) {
    drawText(ctx, `Q: ${ha.question}`, {
      size: 10,
      font: ctx.fontItalic,
      color: COLOR_MUTED,
      bottomGap: 1,
    });
    drawText(ctx, `A: ${ha.answer}`, {
      size: 10,
      indent: 14,
      bottomGap: 4,
    });
  }
}

function drawDiagnosisHero(ctx: ReportContext) {
  // No section heading — this IS the headline. Bigger, simpler, immediate.
  ctx.y -= 12;
  const r = ctx.result;
  const outcome = r.outcome;

  const bg =
    outcome === "confirmed"
      ? COLOR_BG_EMERALD
      : outcome === "uncertain"
      ? COLOR_BG_AMBER
      : COLOR_BG_STONE;
  const border =
    outcome === "confirmed"
      ? COLOR_EMERALD
      : outcome === "uncertain"
      ? COLOR_AMBER
      : COLOR_STONE;

  const name = r.diagnosis?.name ?? "Cannot determine";
  const sci = r.diagnosis?.scientificName ?? "";
  const conf = Math.round(r.confidence * 100);
  const statusEn =
    outcome === "confirmed"
      ? "CONFIRMED"
      : outcome === "uncertain"
      ? "UNCERTAIN"
      : "CANNOT DETERMINE";
  const statusBm =
    outcome === "confirmed"
      ? "Disahkan"
      : outcome === "uncertain"
      ? "Tidak pasti"
      : "Tidak boleh tentukan";

  // Card 160pt tall (was 130) so we have 20pt+ breathing room around
  // every text element inside. Padding 24pt on the inside instead of 18pt.
  drawColouredCard(ctx, 160, bg, border, () => {
    const PAD = 24;
    // STATUS pill — top, with breathing room from the card edge
    ctx.page.drawText(safe(`${statusEn}  ·  ${statusBm}`), {
      x: MARGIN + PAD,
      y: ctx.y - 28,
      size: 10,
      font: ctx.fontBold,
      color: border,
    });

    // DIAGNOSIS NAME — huge, dominates the card. 28pt below status pill.
    ctx.page.drawText(safe(name), {
      x: MARGIN + PAD,
      y: ctx.y - 70,
      size: 26,
      font: ctx.fontBold,
      color: COLOR_INK,
    });

    // SCIENTIFIC NAME — italic, muted, generous gap below the name
    if (sci) {
      ctx.page.drawText(safe(sci), {
        x: MARGIN + PAD,
        y: ctx.y - 96,
        size: 11,
        font: ctx.fontItalic,
        color: COLOR_MUTED,
      });
    }

    // CONFIDENCE NUMBER — top-right, big and obvious
    const confText = `${conf}%`;
    const confW = ctx.fontBold.widthOfTextAtSize(confText, 36);
    ctx.page.drawText(confText, {
      x: PAGE_W - MARGIN - PAD - confW,
      y: ctx.y - 70,
      size: 36,
      font: ctx.fontBold,
      color: border,
    });
    const confLbl = "confidence";
    const confLblW = ctx.font.widthOfTextAtSize(confLbl, 9);
    ctx.page.drawText(confLbl, {
      x: PAGE_W - MARGIN - PAD - confLblW,
      y: ctx.y - 86,
      size: 9,
      font: ctx.font,
      color: COLOR_MUTED,
    });

    // Plain-language outcome statement at the bottom of the card
    const outcomeLine =
      outcome === "confirmed"
        ? "We're confident — proceed with the treatment below."
        : outcome === "uncertain"
        ? "Best assessment — consider the second-opinion options at the bottom."
        : "Not enough evidence to name a diagnosis. See suggestions below.";
    ctx.page.drawText(safe(outcomeLine), {
      x: MARGIN + PAD,
      y: ctx.y - 138,
      size: 10,
      font: ctx.fontItalic,
      color: COLOR_INK,
    });
  });
}

function drawReasoning(ctx: ReportContext) {
  const r = ctx.result;
  if (r.reasoning.whySure.length > 0) {
    drawSectionHeading(ctx, "Why I'm confident", "Bukti yang menyokong");
    drawBulletList(ctx, r.reasoning.whySure);
  }

  if (r.reasoning.whatRuledOut.length > 0) {
    drawSectionHeading(ctx, "What I ruled out", "Yang sudah disingkirkan");
    // Cap at top 5 — past that the list is too long to scan and we already
    // print the full set in the technical reference at the back of the doc.
    for (const item of r.reasoning.whatRuledOut.slice(0, 5)) {
      drawText(ctx, `${item.name}`, {
        size: 10,
        font: ctx.fontBold,
        bottomGap: 1,
      });
      drawText(ctx, item.because, {
        size: 10,
        indent: 14,
        color: COLOR_MUTED,
        bottomGap: 4,
      });
    }
    if (r.reasoning.whatRuledOut.length > 5) {
      drawText(
        ctx,
        `+ ${r.reasoning.whatRuledOut.length - 5} more (full list in technical reference)`,
        { size: 9, italics: true, color: COLOR_MUTED, bottomGap: 4 }
      );
    }
  }

  if (r.reasoning.whatStillUncertain.length > 0) {
    drawSectionHeading(ctx, "Still uncertain about", "Yang masih tidak pasti");
    drawBulletList(ctx, r.reasoning.whatStillUncertain);
  }
}

function drawPrescription(ctx: ReportContext) {
  const p = ctx.result.prescription;
  if (!p) return;

  drawSectionHeading(ctx, "Stop it now", "Rawatan segera");

  if (p.controlNow.chemical) {
    const c = p.controlNow.chemical;
    // English-only row labels — value column gets more horizontal space
    // and the row scans cleanly
    drawLabelValueRow(ctx, "Chemical:", c.name);
    if (c.brand) drawLabelValueRow(ctx, "Brand:", c.brand);
    drawLabelValueRow(ctx, "Dose:", c.dose);
    drawLabelValueRow(ctx, "Frequency:", c.frequency);
    if (c.estCostRm !== undefined) {
      drawLabelValueRow(ctx, "Estimated cost:", `RM ${c.estCostRm}`);
    }
    ctx.y -= 4;
  } else {
    drawText(ctx, "No chemical treatment — cultural / preventive steps only.", {
      size: 10,
      italics: true,
      color: COLOR_MUTED,
      bottomGap: 6,
    });
  }

  if (p.controlNow.cultural.length > 0) {
    drawText(ctx, "Cultural steps (Langkah amalan):", {
      size: 10,
      font: ctx.fontBold,
      bottomGap: 2,
    });
    drawBulletList(ctx, p.controlNow.cultural);
  }

  if (p.preventRecurrence.length > 0) {
    drawSectionHeading(ctx, "Stop it coming back", "Pencegahan");
    drawBulletList(ctx, p.preventRecurrence);
  }
}

function drawFollowUp(ctx: ReportContext) {
  if (ctx.result.outcome === "cannot_determine") return;
  drawSectionHeading(ctx, "Follow-up", "Pemeriksaan semula");
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + 5);
  const formatted = followUpDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  drawText(
    ctx,
    `AgroSim will check in on ${formatted} to ask how the plant is doing (Tanaman dah okay?).`,
    { size: 10, bottomGap: 4 }
  );

  if (ctx.result.escalation?.suggested) {
    drawText(ctx, "If still sick (Jika masih sakit):", {
      size: 10,
      font: ctx.fontBold,
      bottomGap: 2,
    });
    drawBulletList(ctx, [
      "Bring this report + a plant sample to your nearest MARDI office.",
      "Or contact the Department of Agriculture Extension Officer (Pegawai Pengembangan Pertanian).",
    ]);
  }
}

function drawTechnicalReference(ctx: ReportContext) {
  drawSectionHeading(ctx, "Technical reference", "For the MARDI officer");
  const cands = ctx.session.candidates
    .filter((c) => !c.ruledOut)
    .sort((a, b) => b.probability - a.probability);

  if (cands.length > 1) {
    drawText(ctx, "Differential (top candidates):", {
      size: 10,
      font: ctx.fontBold,
      bottomGap: 2,
    });
    for (const c of cands.slice(0, 5)) {
      const rule = ruleById(c.diseaseId);
      const sci = rule?.scientificName ?? "";
      drawText(
        ctx,
        `• ${c.name}  ·  ${Math.round(c.probability * 100)}%${sci ? `  ·  ${sci}` : ""}`,
        { size: 9, indent: 4, bottomGap: 1 }
      );
    }
    ctx.y -= 4;
  }

  drawLabelValueRow(
    ctx,
    "Photo(s):",
    `${1 + (ctx.session.extraPhotos?.length ?? 0)} (Layer 1 + ${ctx.session.extraPhotos?.length ?? 0} close-up)`
  );
  if (ctx.session.physicalTest) {
    drawLabelValueRow(
      ctx,
      "Physical test:",
      `${ctx.session.physicalTest.test} → ${ctx.session.physicalTest.result}`
    );
  }
  if (ctx.session.priorBoosts && Object.keys(ctx.session.priorBoosts).length > 0) {
    drawLabelValueRow(
      ctx,
      "Prior boosts:",
      Object.entries(ctx.session.priorBoosts)
        .map(([id, m]) => `${id}=×${m.toFixed(1)}`)
        .join(", ")
    );
  }
  drawLabelValueRow(ctx, "Session ID:", ctx.session.sessionId);
}

function drawFooter(page: PDFPage, ctx: ReportContext, pageNumber: number) {
  const footerY = MARGIN;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 26 },
    end: { x: PAGE_W - MARGIN, y: footerY + 26 },
    thickness: 0.5,
    color: COLOR_LINE,
  });

  const disclaimerBm =
    "Laporan ini dijana oleh AI. Untuk pengesahan rasmi, sila bawa laporan + sampel tanaman ke pejabat MARDI.";
  const disclaimerEn =
    "This report is AI-generated. For official confirmation, bring this report + plant sample to your nearest MARDI office.";

  page.drawText(safe(disclaimerBm), {
    x: MARGIN,
    y: footerY + 14,
    size: 7.5,
    font: ctx.fontItalic,
    color: COLOR_MUTED,
    maxWidth: CONTENT_W - 100,
  });
  page.drawText(safe(disclaimerEn), {
    x: MARGIN,
    y: footerY + 4,
    size: 7.5,
    font: ctx.fontItalic,
    color: COLOR_MUTED,
    maxWidth: CONTENT_W - 100,
  });

  const pageText = `${pageNumber} / ${ctx.totalPages}`;
  const w = ctx.font.widthOfTextAtSize(pageText, 9);
  page.drawText(pageText, {
    x: PAGE_W - MARGIN - w,
    y: footerY + 9,
    size: 9,
    font: ctx.font,
    color: COLOR_MUTED,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Strip / replace any character pdf-lib's standard Helvetica can't encode
 * (it uses WinAnsi / cp1252). Allow ASCII + Latin-1 supplement (covers
 * BM accented characters and the middle dot · we use as a separator).
 * Replace common typographic glyphs with ASCII equivalents.
 *
 * Used as a defensive wrapper around EVERY user-supplied or rules-table
 * string before it hits page.drawText, so a stray em-dash or smart quote
 * never throws at PDF-generation time. Wrapped text already goes through
 * this via wrapText below.
 */
function safe(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/[''‛]/g, "'")
    .replace(/[""„]/g, '"')
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/✓/g, "v")
    .replace(/✗/g, "x")
    .replace(/✦/g, "*")
    .replace(/→/g, "->")
    // Allow ASCII + Latin-1 supplement (0xA0-0xFF — covers ° é ± · etc.)
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

/**
 * Build a human-readable case reference. Format: AS-YYYYMMDD-XXXX
 * where XXXX is the last 4 chars of the session UUID (stable + short
 * enough to read over the phone to MARDI / kedai).
 */
function makeCaseRef(session: DiagnosisSession): string {
  const d = new Date(session.startedAt);
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const tail = session.sessionId.replace(/-/g, "").slice(-4).toUpperCase();
  return `AS-${yyyymmdd}-${tail}`;
}

function cropDisplay(crop: string): string {
  if (crop === "chilli") return "Pepper / Chilli (Capsicum)";
  return crop.charAt(0).toUpperCase() + crop.slice(1);
}

function patternDisplay(pattern: string): string {
  const map: Record<string, string> = {
    one_plant: "One plant only — single isolated case",
    few_plants: "A few plants in a row — early spread",
    whole_plot: "Whole plot uniformly — advanced or abiotic",
    multiple_crops: "Different crops too — strongly suggests abiotic",
  };
  return map[pattern] ?? pattern;
}

/**
 * Naive word-wrap to fit text within maxWidth at the given font/size.
 * Re-splits on whitespace; doesn't break inside a single word that's
 * already longer than maxWidth (which is fine for our content). Strips
 * non-ASCII just defensively — pdf-lib's Helvetica can't render some
 * unicode glyphs without an embedded font, so we keep things safe.
 */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  // Replace common BM accented chars + smart quotes with ASCII equivalents
  // so pdf-lib doesn't throw "WinAnsi cannot encode" errors.
  const clean = text
    .replace(/[''‛]/g, "'")
    .replace(/[""„]/g, '"')
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/✓/g, "v")
    .replace(/✗/g, "x")
    .replace(/✦/g, "*")
    .replace(/·/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E]/g, ""); // strip any remaining non-ASCII

  const words = clean.split(/\s+/);
  const lines: string[] = [];
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
  return lines.length > 0 ? lines : [""];
}
