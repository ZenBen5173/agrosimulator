import { Sprite, Texture, Graphics, Container, Text, TextStyle, Ticker } from "pixi.js";

const CROP_EMOJIS: Record<string, Record<string, string>> = {
  Paddy: {
    seedling: "🌱",
    growing: "🌿",
    mature: "🌾",
    harvest_ready: "🌾",
    harvested: "",
    diseased: "🍂",
  },
  Chilli: {
    seedling: "🌱",
    growing: "🌿",
    mature: "🌶️",
    harvest_ready: "🌶️",
    harvested: "",
    diseased: "🍂",
  },
  Kangkung: {
    seedling: "🌱",
    growing: "🌿",
    mature: "🥬",
    harvest_ready: "🥬",
    harvested: "",
    diseased: "🍂",
  },
  Banana: {
    seedling: "🌱",
    growing: "🌿",
    mature: "🍌",
    harvest_ready: "🍌",
    harvested: "",
    diseased: "🍂",
  },
  Corn: {
    seedling: "🌱",
    growing: "🌿",
    mature: "🌽",
    harvest_ready: "🌽",
    harvested: "",
    diseased: "🍂",
  },
  "Sweet Potato": {
    seedling: "🌱",
    growing: "🌿",
    mature: "🍠",
    harvest_ready: "🍠",
    harvested: "",
    diseased: "🍂",
  },
};

const DEFAULT_EMOJIS: Record<string, string> = {
  seedling: "🌱",
  growing: "🌿",
  mature: "🌾",
  harvest_ready: "🌾",
  harvested: "",
  diseased: "🍂",
};

export function getCropEmoji(cropName: string, growthStage: string): string {
  if (growthStage === "diseased") return "🍂";
  if (growthStage === "harvested") return "";

  const cropMap = CROP_EMOJIS[cropName];
  if (cropMap && cropMap[growthStage]) return cropMap[growthStage];

  return DEFAULT_EMOJIS[growthStage] || "🌱";
}

// Cache textures to avoid re-creating them
const textureCache = new Map<string, Texture>();

export function createEmojiSprite(emoji: string, size: number): Sprite | null {
  if (!emoji) return null;

  const cacheKey = `${emoji}_${size}`;
  let texture = textureCache.get(cacheKey);

  if (!texture) {
    const canvas = document.createElement("canvas");
    const res = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * res;
    canvas.height = size * res;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.scale(res, res);
    ctx.font = `${size * 0.7}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, size / 2, size / 2);

    texture = Texture.from(canvas);
    textureCache.set(cacheKey, texture);
  }

  const sprite = new Sprite(texture);
  sprite.width = size;
  sprite.height = size;
  sprite.anchor.set(0.5);
  return sprite;
}

/**
 * Adds a warning overlay (pulsing dot/badge) on a tile and optionally a red tint.
 * Returns a Container that can be destroyed for cleanup.
 */
export function addWarningOverlay(
  parent: Container,
  tileX: number,
  tileY: number,
  tileWidth: number,
  tileHeight: number,
  warningLevel: string,
  ticker: Ticker
): Container {
  const container = new Container();

  // Position badge in top-right area of the diamond
  const badgeX = tileX + tileWidth * 0.75;
  const badgeY = tileY + tileHeight * 0.15;

  if (warningLevel === "yellow") {
    // Small yellow pulsing dot
    const dot = new Graphics();
    dot.circle(0, 0, 6);
    dot.fill({ color: 0xeab308, alpha: 0.9 });
    dot.x = badgeX;
    dot.y = badgeY;
    container.addChild(dot);

    const tickFn = () => {
      const s = 0.9 + 0.2 * Math.sin(ticker.lastTime * 0.003);
      dot.scale.set(s);
    };
    ticker.add(tickFn);
    // Store cleanup ref
    (container as unknown as Record<string, unknown>)._tickFn = tickFn;
  } else if (warningLevel === "orange") {
    // Glow circle behind
    const glow = new Graphics();
    glow.circle(0, 0, 14);
    glow.fill({ color: 0xf97316, alpha: 0.3 });
    glow.x = badgeX;
    glow.y = badgeY;
    container.addChild(glow);

    // Orange circle with "!"
    const badge = new Graphics();
    badge.circle(0, 0, 8);
    badge.fill({ color: 0xf97316, alpha: 0.95 });
    badge.x = badgeX;
    badge.y = badgeY;
    container.addChild(badge);

    const excl = new Text({
      text: "!",
      style: new TextStyle({
        fontSize: 11,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    excl.anchor.set(0.5);
    excl.x = badgeX;
    excl.y = badgeY;
    container.addChild(excl);

    const tickFn = () => {
      const s = 0.9 + 0.2 * Math.sin(ticker.lastTime * 0.005);
      badge.scale.set(s);
      excl.scale.set(s);
      glow.scale.set(s);
    };
    ticker.add(tickFn);
    (container as unknown as Record<string, unknown>)._tickFn = tickFn;
  } else if (warningLevel === "red") {
    // Red tint overlay on the diamond
    const tint = new Graphics();
    const topX = tileX + tileWidth / 2;
    const topY = tileY;
    const rightX = tileX + tileWidth;
    const rightY = tileY + tileHeight / 2;
    const bottomX = tileX + tileWidth / 2;
    const bottomY = tileY + tileHeight;
    const leftX = tileX;
    const leftY = tileY + tileHeight / 2;

    tint.moveTo(topX, topY);
    tint.lineTo(rightX, rightY);
    tint.lineTo(bottomX, bottomY);
    tint.lineTo(leftX, leftY);
    tint.closePath();
    tint.fill({ color: 0xef4444, alpha: 0.15 });
    container.addChild(tint);

    // Glow behind badge
    const glow = new Graphics();
    glow.circle(0, 0, 16);
    glow.fill({ color: 0xef4444, alpha: 0.3 });
    glow.x = badgeX;
    glow.y = badgeY;
    container.addChild(glow);

    // Red circle with "!"
    const badge = new Graphics();
    badge.circle(0, 0, 10);
    badge.fill({ color: 0xef4444, alpha: 0.95 });
    badge.x = badgeX;
    badge.y = badgeY;
    container.addChild(badge);

    const excl = new Text({
      text: "!",
      style: new TextStyle({
        fontSize: 13,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    excl.anchor.set(0.5);
    excl.x = badgeX;
    excl.y = badgeY;
    container.addChild(excl);

    const tickFn = () => {
      const s = 0.9 + 0.2 * Math.sin(ticker.lastTime * 0.006);
      badge.scale.set(s);
      excl.scale.set(s);
      glow.scale.set(s);
    };
    ticker.add(tickFn);
    (container as unknown as Record<string, unknown>)._tickFn = tickFn;
  }

  parent.addChild(container);
  return container;
}

/**
 * Cleans up a warning overlay container and its ticker callback.
 */
export function removeWarningOverlay(
  container: Container,
  ticker: Ticker
): void {
  const meta = container as unknown as Record<string, unknown>;
  const tickFn = meta._tickFn as ((dt: unknown) => void) | undefined;
  if (tickFn) ticker.remove(tickFn);
  container.destroy({ children: true });
}
