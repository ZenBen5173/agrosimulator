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

  drawHeader(ctx);
  drawCaseBlock(ctx);
  drawPatientBlock(ctx);
  drawHistoryBlock(ctx);
  drawDiagnosisHero(ctx);
  drawReasoning(ctx);
  drawPrescription(ctx);
  drawFollowUp(ctx);
  drawTechnicalReference(ctx);

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
  } = {}
) {
  const size = opts.size ?? 11;
  const fnt = opts.font ?? ctx.font;
  const color = opts.color ?? COLOR_INK;
  const x = opts.x ?? MARGIN + (opts.indent ?? 0);
  const maxW = opts.maxWidth ?? CONTENT_W - (opts.indent ?? 0);

  const lines = wrapText(text, fnt, size, maxW);
  const lineHeight = size * 1.35;
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

function drawSectionHeading(ctx: ReportContext, bm: string, en: string) {
  newPageIfNeeded(ctx, 26);
  ctx.y -= 14;
  // BM label (bigger, primary) + English (smaller, italic, secondary)
  ctx.page.drawText(bm.toUpperCase(), {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: ctx.fontBold,
    color: COLOR_INK,
  });
  const bmW = ctx.fontBold.widthOfTextAtSize(bm.toUpperCase(), 9);
  ctx.page.drawText(`  ·  ${en}`, {
    x: MARGIN + bmW,
    y: ctx.y,
    size: 9,
    font: ctx.fontItalic,
    color: COLOR_MUTED,
  });
  ctx.y -= 8;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 1,
    color: COLOR_INK,
  });
  ctx.y -= 8;
}

function drawLabelValueRow(ctx: ReportContext, label: string, value: string) {
  const size = 10;
  newPageIfNeeded(ctx, size * 1.4);
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
  ctx.y -= size * 1.6;
}

function drawColouredCard(
  ctx: ReportContext,
  height: number,
  bg: RGB,
  border: RGB,
  draw: (cardTop: number, cardBottom: number) => void
) {
  newPageIfNeeded(ctx, height + 12);
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
  ctx.y = bottom - 10;
}

function drawBulletList(ctx: ReportContext, items: string[], indent = 14) {
  for (const item of items) {
    newPageIfNeeded(ctx, 14);
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
      bottomGap: 2,
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

function drawCaseBlock(ctx: ReportContext) {
  const date = new Date(ctx.session.startedAt);
  const dateBm = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const ref = makeCaseRef(ctx.session);

  drawLabelValueRow(ctx, "Rujukan / Ref:", ref);
  drawLabelValueRow(ctx, "Tarikh / Date:", dateBm);
  if (ctx.farmerName) drawLabelValueRow(ctx, "Petani / Farmer:", ctx.farmerName);
  if (ctx.farmDistrict) drawLabelValueRow(ctx, "Daerah / District:", ctx.farmDistrict);
}

function drawPatientBlock(ctx: ReportContext) {
  drawSectionHeading(ctx, "Tanaman", "Crop & plot");
  drawLabelValueRow(ctx, "Jenis / Type:", cropDisplay(ctx.session.crop));
  if (ctx.session.plotLabel) {
    drawLabelValueRow(ctx, "Plot:", ctx.session.plotLabel);
  }
  const stage = ctx.session.historyAnswers.find((h) => h.questionId === "plant_stage");
  if (stage) {
    drawLabelValueRow(ctx, "Tahap / Stage:", stage.answer);
  }
  const pattern = ctx.session.pattern;
  if (pattern) {
    drawLabelValueRow(ctx, "Pattern:", patternDisplay(pattern));
  }
}

function drawHistoryBlock(ctx: ReportContext) {
  if (ctx.session.historyAnswers.length === 0) return;
  drawSectionHeading(ctx, "Sejarah", "What the farmer reported");
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
  drawSectionHeading(ctx, "Diagnosis", "The verdict");
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

  const name = r.diagnosis?.name ?? "Tidak pasti / Cannot determine";
  const sci = r.diagnosis?.scientificName ?? "";
  const conf = Math.round(r.confidence * 100);
  const statusBm =
    outcome === "confirmed"
      ? "DISAHKAN"
      : outcome === "uncertain"
      ? "TIDAK PASTI"
      : "TIDAK BOLEH TENTUKAN";
  const statusEn =
    outcome === "confirmed"
      ? "CONFIRMED"
      : outcome === "uncertain"
      ? "UNCERTAIN"
      : "CANNOT DETERMINE";

  drawColouredCard(ctx, 78, bg, border, () => {
    ctx.page.drawText(safe(name), {
      x: MARGIN + 14,
      y: ctx.y - 22,
      size: 16,
      font: ctx.fontBold,
      color: COLOR_INK,
    });
    if (sci) {
      ctx.page.drawText(safe(sci), {
        x: MARGIN + 14,
        y: ctx.y - 40,
        size: 10,
        font: ctx.fontItalic,
        color: COLOR_MUTED,
      });
    }
    ctx.page.drawText(`Keyakinan / Confidence:  ${conf}%`, {
      x: MARGIN + 14,
      y: ctx.y - 60,
      size: 10,
      font: ctx.font,
      color: COLOR_INK,
    });
    const statusText = `${statusBm}  ·  ${statusEn}`;
    const statusW = ctx.fontBold.widthOfTextAtSize(statusText, 10);
    ctx.page.drawText(statusText, {
      x: PAGE_W - MARGIN - 14 - statusW,
      y: ctx.y - 22,
      size: 10,
      font: ctx.fontBold,
      color: border,
    });
  });
}

function drawReasoning(ctx: ReportContext) {
  const r = ctx.result;
  if (r.reasoning.whySure.length > 0) {
    drawSectionHeading(ctx, "Bukti yang menyokong", "Why I'm confident");
    drawBulletList(ctx, r.reasoning.whySure);
  }

  if (r.reasoning.whatRuledOut.length > 0) {
    drawSectionHeading(ctx, "Yang sudah disingkirkan", "What I ruled out");
    for (const item of r.reasoning.whatRuledOut.slice(0, 6)) {
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
  }

  if (r.reasoning.whatStillUncertain.length > 0) {
    drawSectionHeading(ctx, "Yang masih tidak pasti", "Still uncertain about");
    drawBulletList(ctx, r.reasoning.whatStillUncertain);
  }
}

function drawPrescription(ctx: ReportContext) {
  const p = ctx.result.prescription;
  if (!p) return;

  // Stop it NOW (treatment)
  drawSectionHeading(ctx, "Rawatan segera", "Stop it now");

  if (p.controlNow.chemical) {
    const c = p.controlNow.chemical;
    drawLabelValueRow(ctx, "Bahan kimia / Chemical:", c.name);
    if (c.brand) drawLabelValueRow(ctx, "Jenama / Brand:", c.brand);
    drawLabelValueRow(ctx, "Dos / Dose:", c.dose);
    drawLabelValueRow(ctx, "Kekerapan / Frequency:", c.frequency);
    if (c.estCostRm !== undefined) {
      drawLabelValueRow(ctx, "Anggaran kos / Cost:", `RM ${c.estCostRm}`);
    }
    ctx.y -= 4;
  } else {
    drawText(ctx, "Tiada rawatan kimia — cultural / preventive only.", {
      size: 10,
      font: ctx.fontItalic,
      color: COLOR_MUTED,
      bottomGap: 6,
    });
  }

  if (p.controlNow.cultural.length > 0) {
    drawText(ctx, "Langkah amalan / Cultural steps:", {
      size: 10,
      font: ctx.fontBold,
      bottomGap: 2,
    });
    drawBulletList(ctx, p.controlNow.cultural);
  }

  // Stop it COMING BACK (prevention)
  if (p.preventRecurrence.length > 0) {
    drawSectionHeading(ctx, "Pencegahan", "Stop it coming back");
    drawBulletList(ctx, p.preventRecurrence);
  }
}

function drawFollowUp(ctx: ReportContext) {
  if (ctx.result.outcome === "cannot_determine") return;
  drawSectionHeading(ctx, "Pemeriksaan semula", "Follow-up");
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + 5);
  const formatted = followUpDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  drawText(
    ctx,
    `AgroSim akan tanya pada ${formatted}: "Tanaman dah okay?" / AgroSim will check in on ${formatted} to ask how the plant is doing.`,
    { size: 10, bottomGap: 4 }
  );

  if (ctx.result.escalation?.suggested) {
    drawText(ctx, "Jika masih sakit / If still sick:", {
      size: 10,
      font: ctx.fontBold,
      bottomGap: 2,
    });
    drawBulletList(ctx, [
      "Hantar laporan ini + sampel tanaman ke pejabat MARDI tempatan / Bring this report + a plant sample to your nearest MARDI office.",
      "Atau hubungi Pegawai Pengembangan Pertanian (Extension Officer) Jabatan Pertanian / Or contact your Department of Agriculture Extension Officer.",
    ]);
  }
}

function drawTechnicalReference(ctx: ReportContext) {
  drawSectionHeading(ctx, "Data teknikal", "For the MARDI officer");
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
