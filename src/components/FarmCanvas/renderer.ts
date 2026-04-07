import { Application, Graphics, Container } from "pixi.js";
import type { GridJson } from "@/types/farm";
import { generateTilePositions } from "./gridGenerator";
import { addWarningOverlay, removeWarningOverlay } from "./tileSprites";
import {
  createCropSprite,
  clearCropSpriteCache,
  loadCropSpriteSheet,
} from "./cropSprites";
import { WeatherLayer } from "./weatherEffects";

export interface RendererOptions {
  weatherCondition?: string;
  plotStages?: Record<string, { cropName: string; growthStage: string }>;
  plotWarnings?: Record<
    string,
    { warningLevel: string; warningReason: string }
  >;
}

// ─── Hex helpers ─────────────────────────────────────────────────

const SQRT3_2 = Math.sqrt(3) / 2;

/** Return the 6 vertices of a pointy-top hex centred at (cx, cy) with outer radius r. */
function hexVertices(
  cx: number,
  cy: number,
  r: number
): { x: number; y: number }[] {
  return [
    { x: cx, y: cy - r }, //               0  top
    { x: cx + r * SQRT3_2, y: cy - r / 2 }, // 1  top-right
    { x: cx + r * SQRT3_2, y: cy + r / 2 }, // 2  bottom-right
    { x: cx, y: cy + r }, //               3  bottom
    { x: cx - r * SQRT3_2, y: cy + r / 2 }, // 4  bottom-left
    { x: cx - r * SQRT3_2, y: cy - r / 2 }, // 5  top-left
  ];
}

/** Draw a filled hex path on a Graphics object. */
function drawHexPath(g: Graphics, verts: { x: number; y: number }[]) {
  g.moveTo(verts[0].x, verts[0].y);
  for (let i = 1; i < 6; i++) g.lineTo(verts[i].x, verts[i].y);
  g.closePath();
}

/**
 * Pointy-top hex neighbor for even-r offset coordinates.
 * Direction 0 = top-right, going clockwise.
 * Edge *dir* connects vertex[dir] → vertex[(dir+1)%6].
 */
const EVEN_OFFSETS = [
  [-1, 0], // 0 top-right
  [0, 1], //  1 right
  [1, 0], //  2 bottom-right
  [1, -1], // 3 bottom-left
  [0, -1], // 4 left
  [-1, -1], // 5 top-left
];
const ODD_OFFSETS = [
  [-1, 1], // 0 top-right
  [0, 1], //  1 right
  [1, 1], //  2 bottom-right
  [1, 0], //  3 bottom-left
  [0, -1], // 4 left
  [-1, 0], // 5 top-left
];

function hexNeighbor(
  row: number,
  col: number,
  dir: number
): [number, number] {
  const off = row % 2 === 0 ? EVEN_OFFSETS[dir] : ODD_OFFSETS[dir];
  return [row + off[0], col + off[1]];
}

// ─── Renderer ────────────────────────────────────────────────────

export async function initRenderer(
  container: HTMLDivElement,
  gridJson: GridJson,
  onTileClick?: (plotLabel: string) => void,
  options?: RendererOptions
): Promise<Application> {
  const app = new Application();

  await app.init({
    background: "#87CEEB",
    resizeTo: container,
    antialias: true,
  });

  container.appendChild(app.canvas);
  app.ticker.maxFPS = 30;

  await loadCropSpriteSheet();

  const tileContainer = new Container();
  const spriteContainer = new Container();
  const warningContainer = new Container();
  app.stage.addChild(tileContainer);
  app.stage.addChild(spriteContainer);
  app.stage.addChild(warningContainer);

  let weatherLayer: WeatherLayer | null = null;
  if (options?.weatherCondition) {
    weatherLayer = new WeatherLayer(app, options.weatherCondition);
  }

  const warningOverlays: Container[] = [];

  function draw() {
    tileContainer.removeChildren();
    spriteContainer.removeChildren();
    for (const wo of warningOverlays) removeWarningOverlay(wo, app.ticker);
    warningOverlays.length = 0;
    warningContainer.removeChildren();

    const { tiles, tileWidth, tileHeight } = generateTilePositions(
      gridJson,
      app.screen.width,
      app.screen.height
    );

    const hexR = tileHeight / 2; // outer radius
    const gridSize = gridJson.grid.length;

    function plotAt(r: number, c: number): string {
      if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return "__edge__";
      return gridJson.grid[r][c];
    }

    // Deterministic hash for sprite scattering
    function tileHash(r: number, c: number): number {
      return ((r * 2654435761) ^ (c * 2246822519)) >>> 0;
    }

    for (const tile of tiles) {
      const g = new Graphics();
      const verts = hexVertices(tile.centerX, tile.centerY, hexR);

      if (tile.isActive) {
        const stage = options?.plotStages?.[tile.plotLabel];
        const isHarvested = stage?.growthStage === "harvested";
        const fillAlpha = isHarvested ? 0.6 : 0.92;

        // Filled hex with subtle internal border
        drawHexPath(g, verts);
        g.fill({ color: tile.colour, alpha: fillAlpha });
        g.stroke({ color: tile.colour, width: 1, alpha: 0.5 });

        // Thicker border at plot boundaries (6 hex edges)
        let hasBorder = false;
        for (let dir = 0; dir < 6; dir++) {
          const [nr, nc] = hexNeighbor(tile.row, tile.col, dir);
          if (plotAt(nr, nc) !== tile.plotLabel) {
            const v1 = verts[dir];
            const v2 = verts[(dir + 1) % 6];
            g.moveTo(v1.x, v1.y);
            g.lineTo(v2.x, v2.y);
            hasBorder = true;
          }
        }
        if (hasBorder) {
          g.stroke({ color: 0x1a3d12, width: 2, alpha: 0.5 });
        }
      } else {
        // Inactive — very subtle
        drawHexPath(g, verts);
        g.fill({ color: 0xcccccc, alpha: 0.15 });
        g.stroke({ color: 0xaaaaaa, width: 0.5, alpha: 0.2 });
      }

      // Click interaction
      if (tile.isActive && onTileClick) {
        g.eventMode = "static";
        g.cursor = "pointer";
        const oc = tile.colour;

        g.on("pointerdown", () => {
          onTileClick(tile.plotLabel);
          g.clear();
          drawHexPath(g, verts);
          g.fill({ color: 0xffffff, alpha: 0.4 });
          g.stroke({ color: oc, width: 2, alpha: 0.8 });
        });

        const restore = () => {
          g.clear();
          const st = options?.plotStages?.[tile.plotLabel];
          const harv = st?.growthStage === "harvested";
          drawHexPath(g, verts);
          g.fill({ color: oc, alpha: harv ? 0.6 : 0.92 });
        };
        g.on("pointerup", restore);
        g.on("pointerupoutside", restore);
      }

      tileContainer.addChild(g);

      // Crop sprites — scattered on ~55% of tiles
      if (tile.isActive && options?.plotStages) {
        const stage = options.plotStages[tile.plotLabel];
        if (stage) {
          const h = tileHash(tile.row, tile.col);
          if ((h % 100) < 55) {
            const warning = options.plotWarnings?.[tile.plotLabel];
            const effectiveStage =
              warning?.warningLevel === "red" ? "diseased" : stage.growthStage;
            const spriteSize = Math.max(16, Math.round(tileWidth * 0.5));
            const sprite = createCropSprite(
              app,
              stage.cropName,
              effectiveStage,
              spriteSize
            );
            if (sprite) {
              const jx = ((h % 7) - 3) * tileWidth * 0.03;
              const jy = (((h >> 3) % 5) - 2) * tileHeight * 0.03;
              sprite.x = tile.centerX + jx;
              sprite.y = tile.centerY + jy;
              spriteContainer.addChild(sprite);
            }
          }
        }
      }

      // Warning overlays
      if (tile.isActive && options?.plotWarnings) {
        const warning = options.plotWarnings[tile.plotLabel];
        if (warning && warning.warningLevel !== "none") {
          const overlay = addWarningOverlay(
            warningContainer,
            tile.screenX,
            tile.screenY,
            tileWidth,
            tileHeight,
            warning.warningLevel,
            app.ticker
          );
          warningOverlays.push(overlay);
        }
      }
    }
  }

  draw();

  const resizeObserver = new ResizeObserver(() => draw());
  resizeObserver.observe(container);

  const meta = app as unknown as Record<string, unknown>;
  meta._resizeObserver = resizeObserver;
  meta._weatherLayer = weatherLayer;
  meta._warningOverlays = warningOverlays;
  meta._clearCropSpriteCache = clearCropSpriteCache;

  return app;
}
