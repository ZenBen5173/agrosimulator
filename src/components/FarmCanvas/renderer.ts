import { Application, Graphics, Container } from "pixi.js";
import type { GridJson } from "@/types/farm";
import { generateTilePositions } from "./gridGenerator";
import { getCropEmoji, createEmojiSprite, addWarningOverlay, removeWarningOverlay } from "./tileSprites";
import { WeatherLayer } from "./weatherEffects";

export interface RendererOptions {
  weatherCondition?: string;
  /** Map of plot label → { cropName, growthStage } for sprite rendering */
  plotStages?: Record<string, { cropName: string; growthStage: string }>;
  /** Map of plot label → { warningLevel, warningReason } for warning overlays */
  plotWarnings?: Record<string, { warningLevel: string; warningReason: string }>;
}

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

  const tileContainer = new Container();
  const spriteContainer = new Container();
  const warningContainer = new Container();
  app.stage.addChild(tileContainer);
  app.stage.addChild(spriteContainer);
  app.stage.addChild(warningContainer);

  // Weather layer — added on top of everything
  let weatherLayer: WeatherLayer | null = null;
  if (options?.weatherCondition) {
    weatherLayer = new WeatherLayer(app, options.weatherCondition);
  }

  // Track warning overlay containers for cleanup
  const warningOverlays: Container[] = [];

  function draw() {
    tileContainer.removeChildren();
    spriteContainer.removeChildren();
    // Clean up warning overlays (remove ticker callbacks)
    for (const w of warningOverlays) {
      removeWarningOverlay(w, app.ticker);
    }
    warningOverlays.length = 0;
    warningContainer.removeChildren();

    const w = app.screen.width;
    const h = app.screen.height;
    const { tiles, tileWidth, tileHeight } = generateTilePositions(
      gridJson,
      w,
      h
    );

    for (const tile of tiles) {
      const g = new Graphics();

      // Diamond vertices
      const topX = tile.screenX + tileWidth / 2;
      const topY = tile.screenY;
      const rightX = tile.screenX + tileWidth;
      const rightY = tile.screenY + tileHeight / 2;
      const bottomX = tile.screenX + tileWidth / 2;
      const bottomY = tile.screenY + tileHeight;
      const leftX = tile.screenX;
      const leftY = tile.screenY + tileHeight / 2;

      // Draw diamond
      g.moveTo(topX, topY);
      g.lineTo(rightX, rightY);
      g.lineTo(bottomX, bottomY);
      g.lineTo(leftX, leftY);
      g.closePath();

      if (tile.isActive) {
        const stage = options?.plotStages?.[tile.plotLabel];
        const isHarvested = stage?.growthStage === "harvested";
        const fillAlpha = isHarvested ? 0.5 : 0.85;

        g.fill({ color: tile.colour, alpha: fillAlpha });
        g.stroke({ color: tile.colour, width: 1.5, alpha: 0.7 });
      } else {
        g.fill({ color: 0xcccccc, alpha: 0.3 });
        g.stroke({ color: 0xaaaaaa, width: 1, alpha: 0.4 });
      }

      if (tile.isActive && onTileClick) {
        g.eventMode = "static";
        g.cursor = "pointer";

        const originalColour = tile.colour;

        g.on("pointerdown", () => {
          onTileClick(tile.plotLabel);
          g.clear();
          g.moveTo(topX, topY);
          g.lineTo(rightX, rightY);
          g.lineTo(bottomX, bottomY);
          g.lineTo(leftX, leftY);
          g.closePath();
          g.fill({ color: 0xffffff, alpha: 0.5 });
          g.stroke({ color: originalColour, width: 2, alpha: 1 });
        });

        g.on("pointerup", () => {
          g.clear();
          g.moveTo(topX, topY);
          g.lineTo(rightX, rightY);
          g.lineTo(bottomX, bottomY);
          g.lineTo(leftX, leftY);
          g.closePath();
          g.fill({ color: originalColour, alpha: 0.85 });
          g.stroke({ color: originalColour, width: 1.5, alpha: 0.7 });
        });

        g.on("pointerupoutside", () => {
          g.clear();
          g.moveTo(topX, topY);
          g.lineTo(rightX, rightY);
          g.lineTo(bottomX, bottomY);
          g.lineTo(leftX, leftY);
          g.closePath();
          g.fill({ color: originalColour, alpha: 0.85 });
          g.stroke({ color: originalColour, width: 1.5, alpha: 0.7 });
        });
      }

      tileContainer.addChild(g);

      // Add crop emoji sprite for active tiles
      if (tile.isActive && options?.plotStages) {
        const stage = options.plotStages[tile.plotLabel];
        if (stage) {
          // Use diseased emoji if warning_level is red
          const warning = options.plotWarnings?.[tile.plotLabel];
          const effectiveStage =
            warning?.warningLevel === "red" ? "diseased" : stage.growthStage;
          const emoji = getCropEmoji(stage.cropName, effectiveStage);
          if (emoji) {
            const spriteSize = Math.max(16, tileWidth * 0.4);
            const sprite = createEmojiSprite(emoji, spriteSize);
            if (sprite) {
              sprite.x = tile.screenX + tileWidth / 2;
              sprite.y =
                tile.screenY + tileHeight / 2 - tileHeight * 0.15;
              spriteContainer.addChild(sprite);
            }
          }
        }
      }

      // Add warning overlay for active tiles with warnings
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

  // Redraw on resize
  const resizeObserver = new ResizeObserver(() => {
    draw();
  });
  resizeObserver.observe(container);

  // Store cleanup refs
  const meta = app as unknown as Record<string, unknown>;
  meta._resizeObserver = resizeObserver;
  meta._weatherLayer = weatherLayer;
  meta._warningOverlays = warningOverlays;

  return app;
}
