import { Graphics, Container, RenderTexture, Sprite, Application } from "pixi.js";

/**
 * Programmatic isometric crop sprites drawn with PixiJS Graphics.
 * Each crop × growth stage gets a unique vector illustration cached as a texture.
 */

const spriteCache = new Map<string, RenderTexture>();

// Colour palettes per crop
const PALETTES = {
  paddy: { stem: 0x6b8e23, leaf: 0x7cba3f, fruit: 0xdaa520, ripe: 0xffd700 },
  chilli: { stem: 0x4a7c3f, leaf: 0x5da84e, fruit: 0xe74c3c, ripe: 0xc0392b },
  kangkung: { stem: 0x3a7d44, leaf: 0x27ae60, fruit: 0x2ecc71, ripe: 0x27ae60 },
  tomato: { stem: 0x5a8a4a, leaf: 0x6ab04c, fruit: 0xe74c3c, ripe: 0xff6348 },
  corn: { stem: 0x6b8e23, leaf: 0x7cba3f, fruit: 0xf1c40f, ripe: 0xf39c12 },
  banana: { stem: 0x8b6914, leaf: 0x2ecc71, fruit: 0xf1c40f, ripe: 0xffd700 },
  sweetpotato: { stem: 0x6b8e23, leaf: 0x27ae60, fruit: 0xd35400, ripe: 0xe67e22 },
  default: { stem: 0x6b8e23, leaf: 0x7cba3f, fruit: 0x95a5a6, ripe: 0xbdc3c7 },
};

function getPalette(cropName: string) {
  const key = cropName.toLowerCase().replace(/\s+/g, "");
  if (key.includes("paddy") || key.includes("rice")) return PALETTES.paddy;
  if (key.includes("chilli") || key.includes("cili")) return PALETTES.chilli;
  if (key.includes("kangkung")) return PALETTES.kangkung;
  if (key.includes("tomato")) return PALETTES.tomato;
  if (key.includes("corn")) return PALETTES.corn;
  if (key.includes("banana") || key.includes("pisang")) return PALETTES.banana;
  if (key.includes("potato") || key.includes("ubi")) return PALETTES.sweetpotato;
  return PALETTES.default;
}

function drawSeedling(g: Graphics, w: number, h: number, pal: typeof PALETTES.default) {
  const cx = w / 2;
  const ground = h * 0.85;

  // Soil mound
  g.ellipse(cx, ground, w * 0.2, h * 0.06);
  g.fill({ color: 0x8b6914, alpha: 0.5 });

  // Stem
  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.3);
  g.stroke({ color: pal.stem, width: 2, alpha: 1 });

  // Two tiny leaves
  g.ellipse(cx - w * 0.06, ground - h * 0.28, w * 0.07, h * 0.04);
  g.fill({ color: pal.leaf, alpha: 0.9 });
  g.ellipse(cx + w * 0.06, ground - h * 0.32, w * 0.07, h * 0.04);
  g.fill({ color: pal.leaf, alpha: 0.9 });
}

function drawGrowing(g: Graphics, w: number, h: number, pal: typeof PALETTES.default) {
  const cx = w / 2;
  const ground = h * 0.85;

  // Stem
  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.5);
  g.stroke({ color: pal.stem, width: 2.5, alpha: 1 });

  // Multiple leaves
  const leaves = [
    { x: -0.1, y: -0.35, rx: 0.1, ry: 0.045 },
    { x: 0.1, y: -0.4, rx: 0.1, ry: 0.045 },
    { x: -0.08, y: -0.48, rx: 0.08, ry: 0.04 },
    { x: 0.08, y: -0.44, rx: 0.09, ry: 0.04 },
  ];
  for (const l of leaves) {
    g.ellipse(cx + w * l.x, ground + h * l.y, w * l.rx, h * l.ry);
    g.fill({ color: pal.leaf, alpha: 0.85 });
  }
}

function drawPaddyMature(g: Graphics, w: number, h: number, pal: typeof PALETTES.paddy, ripe: boolean) {
  const cx = w / 2;
  const ground = h * 0.85;
  const col = ripe ? pal.ripe : pal.fruit;

  // Multiple rice stalks
  for (const offset of [-0.12, 0, 0.12]) {
    const sx = cx + w * offset;
    g.moveTo(sx, ground);
    g.lineTo(sx, ground - h * 0.55);
    g.stroke({ color: ripe ? 0xbfa33a : pal.stem, width: 2, alpha: 1 });

    // Grain head (drooping)
    g.moveTo(sx, ground - h * 0.55);
    g.quadraticCurveTo(sx + w * 0.08, ground - h * 0.6, sx + w * 0.12, ground - h * 0.5);
    g.stroke({ color: col, width: 3, alpha: 0.9 });

    // Grain dots
    for (let i = 0; i < 3; i++) {
      g.circle(sx + w * (0.04 + i * 0.03), ground - h * (0.52 + i * 0.02), 1.5);
      g.fill({ color: col, alpha: 1 });
    }
  }
}

function drawChilliMature(g: Graphics, w: number, h: number, pal: typeof PALETTES.chilli, ripe: boolean) {
  const cx = w / 2;
  const ground = h * 0.85;

  // Bush stem
  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.45);
  g.stroke({ color: pal.stem, width: 2.5, alpha: 1 });

  // Leaves
  g.ellipse(cx - w * 0.12, ground - h * 0.35, w * 0.1, h * 0.04);
  g.fill({ color: pal.leaf, alpha: 0.8 });
  g.ellipse(cx + w * 0.12, ground - h * 0.4, w * 0.1, h * 0.04);
  g.fill({ color: pal.leaf, alpha: 0.8 });

  // Chilli peppers (hanging down)
  const col = ripe ? pal.ripe : pal.fruit;
  for (const pos of [{ x: -0.06, y: -0.42 }, { x: 0.08, y: -0.38 }, { x: 0.0, y: -0.5 }]) {
    g.roundRect(cx + w * pos.x - 2, ground + h * pos.y, 4, h * 0.12, 2);
    g.fill({ color: col, alpha: 0.95 });
  }
}

function drawTomatoMature(g: Graphics, w: number, h: number, pal: typeof PALETTES.tomato, ripe: boolean) {
  const cx = w / 2;
  const ground = h * 0.85;

  // Stem/stake
  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.55);
  g.stroke({ color: 0x8b6914, width: 2, alpha: 0.7 });

  // Vine
  g.moveTo(cx, ground - h * 0.3);
  g.lineTo(cx, ground - h * 0.5);
  g.stroke({ color: pal.stem, width: 2.5, alpha: 1 });

  // Leaves
  g.ellipse(cx - w * 0.1, ground - h * 0.4, w * 0.09, h * 0.035);
  g.fill({ color: pal.leaf, alpha: 0.8 });
  g.ellipse(cx + w * 0.1, ground - h * 0.45, w * 0.09, h * 0.035);
  g.fill({ color: pal.leaf, alpha: 0.8 });

  // Tomatoes
  const col = ripe ? pal.ripe : pal.fruit;
  g.circle(cx - w * 0.05, ground - h * 0.32, w * 0.06);
  g.fill({ color: col, alpha: 0.95 });
  g.circle(cx + w * 0.07, ground - h * 0.36, w * 0.055);
  g.fill({ color: col, alpha: 0.95 });
}

function drawCornMature(g: Graphics, w: number, h: number, pal: typeof PALETTES.corn, ripe: boolean) {
  const cx = w / 2;
  const ground = h * 0.85;

  // Tall stalk
  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.65);
  g.stroke({ color: pal.stem, width: 3, alpha: 1 });

  // Long leaves
  g.moveTo(cx, ground - h * 0.3);
  g.quadraticCurveTo(cx - w * 0.2, ground - h * 0.35, cx - w * 0.22, ground - h * 0.25);
  g.stroke({ color: pal.leaf, width: 2.5, alpha: 0.8 });

  g.moveTo(cx, ground - h * 0.4);
  g.quadraticCurveTo(cx + w * 0.18, ground - h * 0.45, cx + w * 0.2, ground - h * 0.35);
  g.stroke({ color: pal.leaf, width: 2.5, alpha: 0.8 });

  // Corn ear
  const col = ripe ? pal.ripe : pal.fruit;
  g.roundRect(cx - 3, ground - h * 0.55, 6, h * 0.14, 3);
  g.fill({ color: col, alpha: 0.95 });

  // Tassel on top
  g.moveTo(cx, ground - h * 0.65);
  g.lineTo(cx - 3, ground - h * 0.72);
  g.moveTo(cx, ground - h * 0.65);
  g.lineTo(cx + 3, ground - h * 0.72);
  g.moveTo(cx, ground - h * 0.65);
  g.lineTo(cx, ground - h * 0.73);
  g.stroke({ color: 0xbfa33a, width: 1.5, alpha: 0.8 });
}

function drawBananaMature(g: Graphics, w: number, h: number, pal: typeof PALETTES.banana, ripe: boolean) {
  const cx = w / 2;
  const ground = h * 0.85;

  // Trunk
  g.roundRect(cx - 3, ground - h * 0.6, 6, h * 0.6, 2);
  g.fill({ color: pal.stem, alpha: 0.9 });

  // Large drooping leaves
  g.moveTo(cx, ground - h * 0.55);
  g.quadraticCurveTo(cx - w * 0.25, ground - h * 0.65, cx - w * 0.2, ground - h * 0.45);
  g.stroke({ color: pal.leaf, width: 3, alpha: 0.85 });
  g.moveTo(cx, ground - h * 0.55);
  g.quadraticCurveTo(cx + w * 0.25, ground - h * 0.68, cx + w * 0.2, ground - h * 0.48);
  g.stroke({ color: pal.leaf, width: 3, alpha: 0.85 });
  g.moveTo(cx, ground - h * 0.58);
  g.quadraticCurveTo(cx, ground - h * 0.75, cx - w * 0.05, ground - h * 0.7);
  g.stroke({ color: pal.leaf, width: 2.5, alpha: 0.85 });

  // Banana bunch
  const col = ripe ? pal.ripe : 0x7cba3f;
  g.ellipse(cx, ground - h * 0.4, w * 0.08, h * 0.06);
  g.fill({ color: col, alpha: 0.9 });
}

function drawGenericMature(g: Graphics, w: number, h: number, pal: typeof PALETTES.default, ripe: boolean) {
  const cx = w / 2;
  const ground = h * 0.85;

  g.moveTo(cx, ground);
  g.lineTo(cx, ground - h * 0.5);
  g.stroke({ color: pal.stem, width: 2.5, alpha: 1 });

  // Leafy top
  const col = ripe ? pal.ripe : pal.leaf;
  g.circle(cx, ground - h * 0.52, w * 0.14);
  g.fill({ color: col, alpha: 0.8 });
  g.circle(cx - w * 0.08, ground - h * 0.45, w * 0.1);
  g.fill({ color: col, alpha: 0.7 });
  g.circle(cx + w * 0.08, ground - h * 0.45, w * 0.1);
  g.fill({ color: col, alpha: 0.7 });
}

function drawHarvested(g: Graphics, w: number, h: number) {
  const cx = w / 2;
  const ground = h * 0.85;

  // Bare soil with stubble
  g.ellipse(cx, ground, w * 0.25, h * 0.06);
  g.fill({ color: 0x8b6914, alpha: 0.4 });

  // Small stubble marks
  for (const ox of [-0.08, 0, 0.08]) {
    g.moveTo(cx + w * ox, ground);
    g.lineTo(cx + w * ox, ground - h * 0.06);
    g.stroke({ color: 0xa0855a, width: 1.5, alpha: 0.5 });
  }
}

function drawDiseased(g: Graphics, w: number, h: number) {
  const cx = w / 2;
  const ground = h * 0.85;

  // Wilted stem
  g.moveTo(cx, ground);
  g.quadraticCurveTo(cx + w * 0.05, ground - h * 0.25, cx - w * 0.02, ground - h * 0.4);
  g.stroke({ color: 0x8b6c42, width: 2.5, alpha: 0.8 });

  // Brown wilted leaves
  g.ellipse(cx - w * 0.08, ground - h * 0.32, w * 0.08, h * 0.035);
  g.fill({ color: 0xa0522d, alpha: 0.7 });
  g.ellipse(cx + w * 0.06, ground - h * 0.38, w * 0.07, h * 0.03);
  g.fill({ color: 0x8b4513, alpha: 0.6 });

  // Spots
  g.circle(cx - w * 0.04, ground - h * 0.35, 2);
  g.fill({ color: 0x4a2810, alpha: 0.8 });
  g.circle(cx + w * 0.05, ground - h * 0.3, 1.5);
  g.fill({ color: 0x4a2810, alpha: 0.7 });
}

function drawCropGraphics(
  g: Graphics,
  cropName: string,
  growthStage: string,
  w: number,
  h: number
) {
  const pal = getPalette(cropName);
  const crop = cropName.toLowerCase().replace(/\s+/g, "");

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
      if (crop.includes("paddy") || crop.includes("rice"))
        drawPaddyMature(g, w, h, pal as typeof PALETTES.paddy, ripe);
      else if (crop.includes("chilli") || crop.includes("cili"))
        drawChilliMature(g, w, h, pal as typeof PALETTES.chilli, ripe);
      else if (crop.includes("tomato"))
        drawTomatoMature(g, w, h, pal as typeof PALETTES.tomato, ripe);
      else if (crop.includes("corn"))
        drawCornMature(g, w, h, pal as typeof PALETTES.corn, ripe);
      else if (crop.includes("banana") || crop.includes("pisang"))
        drawBananaMature(g, w, h, pal as typeof PALETTES.banana, ripe);
      else drawGenericMature(g, w, h, pal, ripe);
      break;
    }
    default:
      drawSeedling(g, w, h, pal);
  }
}

/**
 * Creates a cached sprite for a given crop + growth stage at the given size.
 * Uses RenderTexture for GPU-efficient rendering.
 */
export function createCropSprite(
  app: Application,
  cropName: string,
  growthStage: string,
  size: number
): Sprite | null {
  if (growthStage === "harvested") {
    // Still show stubble for harvested
  }

  const cacheKey = `${cropName}_${growthStage}_${size}`;
  let texture = spriteCache.get(cacheKey);

  if (!texture) {
    const g = new Graphics();
    drawCropGraphics(g, cropName, growthStage, size, size);

    texture = RenderTexture.create({ width: size, height: size });
    app.renderer.render({ container: g, target: texture });
    spriteCache.set(cacheKey, texture);
    g.destroy();
  }

  const sprite = new Sprite(texture);
  sprite.width = size;
  sprite.height = size;
  sprite.anchor.set(0.5);
  return sprite;
}

/** Clear the sprite cache (call on cleanup) */
export function clearCropSpriteCache() {
  for (const tex of spriteCache.values()) {
    tex.destroy(true);
  }
  spriteCache.clear();
}
