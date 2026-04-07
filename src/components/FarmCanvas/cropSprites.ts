import {
  Graphics,
  RenderTexture,
  Sprite,
  Application,
  Texture,
} from "pixi.js";

/**
 * Crop sprite system — uses a 16×16 sprite sheet (CC0 by josehzz)
 * with vector-drawn fallback for crops not in the sheet.
 *
 * Sprite sheet: /sprites/crops.png — 192×160, 12 cols × 10 rows
 * Layout: 2 crops per row, 6 frames each (portrait + 5 growth stages)
 *   Left crop:  col 0 = portrait, cols 1-5 = growth stages
 *   Right crop: col 6 = portrait, cols 7-11 = growth stages
 */

// ─── Sprite Sheet Constants ──────────────────────────────────────

const TILE = 16; // pixels per frame in the sheet

interface SheetPos {
  row: number;
  side: "left" | "right";
}

// Crop positions in the sprite sheet (from README)
// Row order: Turnip/Rose, Cucumber/Tulip, Tomato/Melon, Eggplant/Lemon,
//   Pineapple/Rice, Wheat/Grapes, Strawberry/Cassava, Potato/Coffee,
//   Orange/Avocado, Corn/Sunflower
const SHEET_MAP: Record<string, SheetPos> = {
  // Direct matches
  rice:       { row: 4, side: "right" },
  paddy:      { row: 4, side: "right" },
  tomato:     { row: 2, side: "left" },
  corn:       { row: 9, side: "left" },
  potato:     { row: 7, side: "left" },
  wheat:      { row: 5, side: "left" },
  cucumber:   { row: 1, side: "left" },
  eggplant:   { row: 3, side: "left" },
  pineapple:  { row: 4, side: "left" },
  cassava:    { row: 6, side: "right" },
  sunflower:  { row: 9, side: "right" },
  melon:      { row: 2, side: "right" },
  strawberry: { row: 6, side: "left" },
  // Substitutes for Malaysian crops
  chilli:      { row: 3, side: "left" },   // eggplant shape
  cili:        { row: 3, side: "left" },
  chili:       { row: 3, side: "left" },
  sweetpotato: { row: 6, side: "right" },  // cassava (root crop)
  ubi:         { row: 6, side: "right" },
};

// Map our growth stages → frame index (0-4) in the 5-stage strip
const STAGE_FRAME: Record<string, number> = {
  seedling:      0,
  growing:       2,
  mature:        3,
  harvest_ready: 4,
  harvested:     0, // re-use seedling frame, shown faded
  diseased:      3, // mature frame, shown tinted
};

// ─── Sheet Loading ───────────────────────────────────────────────

let sheetImage: HTMLImageElement | null = null;
const frameCache = new Map<string, Texture>();

/** Pre-load the sprite sheet image. Call once before creating sprites. */
export async function loadCropSpriteSheet(): Promise<void> {
  if (sheetImage) return;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = "/sprites/crops.png";
    });
    sheetImage = img;
  } catch (e) {
    console.warn("Crop sprite sheet not found, using vector fallback:", e);
  }
}

function resolveSheet(cropName: string): SheetPos | null {
  const key = cropName.toLowerCase().replace(/\s+/g, "");
  if (SHEET_MAP[key]) return SHEET_MAP[key];
  // Fuzzy: check if any key is contained in the crop name or vice versa
  for (const [k, v] of Object.entries(SHEET_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

/** Slice a single 16×16 frame from the sheet via Canvas 2D. */
function getFrame(row: number, col: number): Texture | null {
  if (!sheetImage) return null;
  const k = `${row}_${col}`;
  let t = frameCache.get(k);
  if (t) return t;

  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false; // crisp pixel art
  ctx.drawImage(
    sheetImage,
    col * TILE, row * TILE, TILE, TILE,
    0, 0, TILE, TILE
  );

  t = Texture.from(canvas);
  frameCache.set(k, t);
  return t;
}

function createSheetSprite(
  cropName: string,
  growthStage: string,
  size: number
): Sprite | null {
  const info = resolveSheet(cropName);
  if (!info || !sheetImage) return null;

  const frameIdx = STAGE_FRAME[growthStage] ?? 0;
  const baseCol = info.side === "left" ? 1 : 7; // skip portrait column
  const col = baseCol + frameIdx;

  const tex = getFrame(info.row, col);
  if (!tex) return null;

  const sprite = new Sprite(tex);
  sprite.width = size;
  sprite.height = size;
  sprite.anchor.set(0.5);

  // ── State-based visual adjustments ──
  if (growthStage === "harvested") {
    sprite.alpha = 0.35;
    sprite.tint = 0x8b7355; // earthy brown
  } else if (growthStage === "diseased") {
    sprite.tint = 0x8b5e3c; // sick brown
    sprite.alpha = 0.75;
  }

  // ── Substitute crop tinting (only at fruiting stages) ──
  const key = cropName.toLowerCase().replace(/\s+/g, "");
  const isFruiting =
    growthStage === "mature" || growthStage === "harvest_ready";

  if ((key.includes("chilli") || key.includes("cili") || key.includes("chili")) && isFruiting) {
    sprite.tint = 0xff6b6b; // red tint for chilli
  } else if ((key.includes("sweetpotato") || key.includes("ubi")) && isFruiting) {
    sprite.tint = 0xe8975c; // orange tint for sweet potato
  }

  return sprite;
}

// ─── Main Entry Point ────────────────────────────────────────────

/**
 * Create a crop sprite. Tries the sprite sheet first, falls back to
 * vector-drawn graphics for crops not in the sheet (banana, kangkung).
 */
export function createCropSprite(
  app: Application,
  cropName: string,
  growthStage: string,
  size: number
): Sprite | null {
  // Try sprite sheet first
  const sheetSprite = createSheetSprite(cropName, growthStage, size);
  if (sheetSprite) return sheetSprite;

  // Fall back to vector drawing
  return createVectorSprite(app, cropName, growthStage, size);
}

/** Clear all caches (call on cleanup). */
export function clearCropSpriteCache() {
  for (const t of frameCache.values()) t.destroy(true);
  frameCache.clear();
  for (const t of vectorCache.values()) t.destroy(true);
  vectorCache.clear();
}

// ─── Vector Fallback System ──────────────────────────────────────

const vectorCache = new Map<string, RenderTexture>();

const PALETTES = {
  banana:   { stem: 0x8b6914, leaf: 0x2ecc71, fruit: 0xf1c40f, ripe: 0xffd700 },
  kangkung: { stem: 0x3a7d44, leaf: 0x27ae60, fruit: 0x2ecc71, ripe: 0x27ae60 },
  default:  { stem: 0x6b8e23, leaf: 0x7cba3f, fruit: 0x95a5a6, ripe: 0xbdc3c7 },
};

type Pal = (typeof PALETTES)["default"];

function getVectorPalette(cropName: string): Pal {
  const k = cropName.toLowerCase();
  if (k.includes("banana") || k.includes("pisang")) return PALETTES.banana;
  if (k.includes("kangkung")) return PALETTES.kangkung;
  return PALETTES.default;
}

// ── Drawing helpers ──

function drawSeedling(g: Graphics, w: number, h: number, pal: Pal) {
  const cx = w / 2, ground = h * 0.85;
  g.ellipse(cx, ground, w * 0.2, h * 0.06);
  g.fill({ color: 0x8b6914, alpha: 0.5 });
  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.3);
  g.stroke({ color: pal.stem, width: 2, alpha: 1 });
  g.ellipse(cx - w * 0.06, ground - h * 0.28, w * 0.07, h * 0.04);
  g.fill({ color: pal.leaf, alpha: 0.9 });
  g.ellipse(cx + w * 0.06, ground - h * 0.32, w * 0.07, h * 0.04);
  g.fill({ color: pal.leaf, alpha: 0.9 });
}

function drawGrowing(g: Graphics, w: number, h: number, pal: Pal) {
  const cx = w / 2, ground = h * 0.85;
  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.5);
  g.stroke({ color: pal.stem, width: 2.5, alpha: 1 });
  for (const l of [
    { x: -0.1, y: -0.35, rx: 0.1, ry: 0.045 },
    { x: 0.1, y: -0.4, rx: 0.1, ry: 0.045 },
    { x: -0.08, y: -0.48, rx: 0.08, ry: 0.04 },
    { x: 0.08, y: -0.44, rx: 0.09, ry: 0.04 },
  ]) {
    g.ellipse(cx + w * l.x, ground + h * l.y, w * l.rx, h * l.ry);
    g.fill({ color: pal.leaf, alpha: 0.85 });
  }
}

function drawBananaMature(g: Graphics, w: number, h: number, pal: Pal, ripe: boolean) {
  const cx = w / 2, ground = h * 0.85;
  g.roundRect(cx - 3, ground - h * 0.6, 6, h * 0.6, 2);
  g.fill({ color: pal.stem, alpha: 0.9 });
  g.moveTo(cx, ground - h * 0.55);
  g.quadraticCurveTo(cx - w * 0.25, ground - h * 0.65, cx - w * 0.2, ground - h * 0.45);
  g.stroke({ color: pal.leaf, width: 3, alpha: 0.85 });
  g.moveTo(cx, ground - h * 0.55);
  g.quadraticCurveTo(cx + w * 0.25, ground - h * 0.68, cx + w * 0.2, ground - h * 0.48);
  g.stroke({ color: pal.leaf, width: 3, alpha: 0.85 });
  g.moveTo(cx, ground - h * 0.58);
  g.quadraticCurveTo(cx, ground - h * 0.75, cx - w * 0.05, ground - h * 0.7);
  g.stroke({ color: pal.leaf, width: 2.5, alpha: 0.85 });
  const col = ripe ? pal.ripe : 0x7cba3f;
  g.ellipse(cx, ground - h * 0.4, w * 0.08, h * 0.06);
  g.fill({ color: col, alpha: 0.9 });
}

function drawKangkungMature(g: Graphics, w: number, h: number, pal: Pal, ripe: boolean) {
  const cx = w / 2, ground = h * 0.85;
  // Dense leafy bush
  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.4);
  g.stroke({ color: pal.stem, width: 2, alpha: 1 });
  const col = ripe ? pal.ripe : pal.leaf;
  for (const l of [
    { x: 0, y: -0.5, rx: 0.14, ry: 0.06 },
    { x: -0.1, y: -0.42, rx: 0.12, ry: 0.05 },
    { x: 0.1, y: -0.44, rx: 0.12, ry: 0.05 },
    { x: -0.06, y: -0.36, rx: 0.1, ry: 0.045 },
    { x: 0.08, y: -0.38, rx: 0.1, ry: 0.045 },
  ]) {
    g.ellipse(cx + w * l.x, ground + h * l.y, w * l.rx, h * l.ry);
    g.fill({ color: col, alpha: 0.8 });
  }
}

function drawGenericMature(g: Graphics, w: number, h: number, pal: Pal, ripe: boolean) {
  const cx = w / 2, ground = h * 0.85;
  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.5);
  g.stroke({ color: pal.stem, width: 2.5, alpha: 1 });
  const col = ripe ? pal.ripe : pal.leaf;
  g.circle(cx, ground - h * 0.52, w * 0.14);
  g.fill({ color: col, alpha: 0.8 });
  g.circle(cx - w * 0.08, ground - h * 0.45, w * 0.1);
  g.fill({ color: col, alpha: 0.7 });
  g.circle(cx + w * 0.08, ground - h * 0.45, w * 0.1);
  g.fill({ color: col, alpha: 0.7 });
}

function drawHarvested(g: Graphics, w: number, h: number) {
  const cx = w / 2, ground = h * 0.85;
  g.ellipse(cx, ground, w * 0.25, h * 0.06);
  g.fill({ color: 0x8b6914, alpha: 0.4 });
  for (const ox of [-0.08, 0, 0.08]) {
    g.moveTo(cx + w * ox, ground);
    g.lineTo(cx + w * ox, ground - h * 0.06);
    g.stroke({ color: 0xa0855a, width: 1.5, alpha: 0.5 });
  }
}

function drawDiseased(g: Graphics, w: number, h: number) {
  const cx = w / 2, ground = h * 0.85;
  g.moveTo(cx, ground);
  g.quadraticCurveTo(cx + w * 0.05, ground - h * 0.25, cx - w * 0.02, ground - h * 0.4);
  g.stroke({ color: 0x8b6c42, width: 2.5, alpha: 0.8 });
  g.ellipse(cx - w * 0.08, ground - h * 0.32, w * 0.08, h * 0.035);
  g.fill({ color: 0xa0522d, alpha: 0.7 });
  g.ellipse(cx + w * 0.06, ground - h * 0.38, w * 0.07, h * 0.03);
  g.fill({ color: 0x8b4513, alpha: 0.6 });
  g.circle(cx - w * 0.04, ground - h * 0.35, 2);
  g.fill({ color: 0x4a2810, alpha: 0.8 });
  g.circle(cx + w * 0.05, ground - h * 0.3, 1.5);
  g.fill({ color: 0x4a2810, alpha: 0.7 });
}

function drawVectorCrop(g: Graphics, cropName: string, growthStage: string, w: number, h: number) {
  const pal = getVectorPalette(cropName);
  const crop = cropName.toLowerCase();

  switch (growthStage) {
    case "seedling":
      drawSeedling(g, w, h, pal);
      break;
    case "growing":
      drawGrowing(g, w, h, pal);
      break;
    case "harvested":
      drawHarvested(g, w, h);
      break;
    case "diseased":
      drawDiseased(g, w, h);
      break;
    case "mature":
    case "harvest_ready": {
      const ripe = growthStage === "harvest_ready";
      if (crop.includes("banana") || crop.includes("pisang"))
        drawBananaMature(g, w, h, pal, ripe);
      else if (crop.includes("kangkung"))
        drawKangkungMature(g, w, h, pal, ripe);
      else drawGenericMature(g, w, h, pal, ripe);
      break;
    }
    default:
      drawSeedling(g, w, h, pal);
  }
}

function createVectorSprite(
  app: Application,
  cropName: string,
  growthStage: string,
  size: number
): Sprite | null {
  const cacheKey = `vec_${cropName}_${growthStage}_${size}`;
  let texture = vectorCache.get(cacheKey);

  if (!texture) {
    const g = new Graphics();
    drawVectorCrop(g, cropName, growthStage, size, size);
    texture = RenderTexture.create({ width: size, height: size });
    app.renderer.render({ container: g, target: texture });
    vectorCache.set(cacheKey, texture);
    g.destroy();
  }

  const sprite = new Sprite(texture);
  sprite.width = size;
  sprite.height = size;
  sprite.anchor.set(0.5);
  return sprite;
}
