"use client";

import { useEffect, useRef, useState } from "react";

const CROPS = [
  "Paddy",
  "Chilli",
  "Kangkung",
  "Tomato",
  "Corn",
  "Banana",
  "Sweet Potato",
  "Lettuce",
];

const STAGES = [
  "seedling",
  "growing",
  "mature",
  "harvest_ready",
  "harvested",
  "diseased",
];

const STAGE_LABELS: Record<string, string> = {
  seedling: "Seedling",
  growing: "Growing",
  mature: "Mature",
  harvest_ready: "Harvest Ready",
  harvested: "Harvested",
  diseased: "Diseased",
};

const SIZES = [32, 48, 64, 96];

export default function SpriteGalleryPage() {
  const [selectedSize, setSelectedSize] = useState(64);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let destroyed = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    async function render() {
      const { Application, Container, Graphics, Text, TextStyle } = await import("pixi.js");
      const { createCropSprite, clearCropSpriteCache, loadCropSpriteSheet } = await import(
        "@/components/FarmCanvas/cropSprites"
      );

      if (destroyed || !container) return;

      // Load the sprite sheet before rendering
      await loadCropSpriteSheet();
      if (destroyed) return;

      const cellSize = selectedSize + 24;
      const labelWidth = 120;
      const gap = 8;
      const headerHeight = 30;
      const totalWidth = labelWidth + STAGES.length * (cellSize + gap);
      const totalHeight = headerHeight + CROPS.length * (cellSize + gap) + 20;

      const app = new Application();
      await app.init({
        background: "#111318",
        width: Math.max(totalWidth, 600),
        height: totalHeight,
        antialias: true,
      });

      if (destroyed) {
        app.destroy(true);
        return;
      }

      container.appendChild(app.canvas);

      // Column headers
      for (let s = 0; s < STAGES.length; s++) {
        const label = new Text({
          text: STAGE_LABELS[STAGES[s]],
          style: new TextStyle({
            fontSize: 11,
            fill: "#9ca3af",
            fontFamily: "sans-serif",
          }),
        });
        label.x = labelWidth + s * (cellSize + gap) + cellSize / 2;
        label.y = 8;
        label.anchor.set(0.5, 0);
        app.stage.addChild(label);
      }

      // Rows
      for (let c = 0; c < CROPS.length; c++) {
        const crop = CROPS[c];
        const rowY = headerHeight + c * (cellSize + gap);

        // Crop name label
        const nameLabel = new Text({
          text: crop,
          style: new TextStyle({
            fontSize: 13,
            fill: "#4ade80",
            fontWeight: "bold",
            fontFamily: "sans-serif",
          }),
        });
        nameLabel.x = 8;
        nameLabel.y = rowY + cellSize / 2;
        nameLabel.anchor.set(0, 0.5);
        app.stage.addChild(nameLabel);

        // Each stage cell
        for (let s = 0; s < STAGES.length; s++) {
          const stage = STAGES[s];
          const cellX = labelWidth + s * (cellSize + gap);

          // Cell background
          const bg = new Graphics();
          bg.roundRect(cellX, rowY, cellSize, cellSize, 6);
          const bgColor = stage === "diseased" ? 0x3a2020 : 0x1a2a1a;
          bg.fill({ color: bgColor, alpha: 1 });
          bg.stroke({ color: 0x374151, width: 1, alpha: 0.6 });
          app.stage.addChild(bg);

          // Crop sprite
          const sprite = createCropSprite(app, crop, stage, selectedSize);
          if (sprite) {
            sprite.x = cellX + cellSize / 2;
            sprite.y = rowY + cellSize / 2;
            app.stage.addChild(sprite);
          }
        }
      }

      setReady(true);

      return () => {
        clearCropSpriteCache();
        app.destroy(true);
      };
    }

    const cleanup = render();

    return () => {
      destroyed = true;
      cleanup.then((fn) => fn?.());
      if (container) container.innerHTML = "";
    };
  }, [selectedSize]);

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold">Crop Sprite Gallery</h1>
        <p className="mb-6 text-sm text-gray-400">
          All crops x growth stages rendered with PixiJS Graphics. Temporary dev page.
        </p>

        {/* Size selector */}
        <div className="mb-6 flex items-center gap-3">
          <span className="text-sm text-gray-400">Sprite size:</span>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSize(s)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedSize === s
                  ? "bg-green-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {s}px
            </button>
          ))}
        </div>

        {/* Single PixiJS canvas */}
        <div
          ref={containerRef}
          className="overflow-x-auto rounded-xl border border-gray-800"
        />

        {!ready && (
          <div className="mt-8 text-center text-sm text-gray-500">
            Rendering sprites...
          </div>
        )}

        {/* Legend */}
        <div className="mt-8 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-2 text-sm font-bold text-gray-300">How it works</h3>
          <ul className="space-y-1 text-xs text-gray-500">
            <li><strong className="text-gray-400">Sprite sheet</strong>: 16x16 pixel art (CC0 by josehzz) for Rice, Corn, Tomato, Chilli, Sweet Potato</li>
            <li><strong className="text-gray-400">Vector fallback</strong>: PixiJS Graphics for Banana, Kangkung, and unknown crops</li>
            <li>Chilli uses eggplant frames with red tint at mature/harvest stages</li>
            <li>Sweet Potato uses cassava frames with orange tint</li>
            <li><strong className="text-gray-400">Harvested</strong>: faded seedling frame</li>
            <li><strong className="text-gray-400">Diseased</strong>: mature frame with brown tint</li>
          </ul>
        </div>

        <div className="mt-4 text-center">
          <a href="/home" className="text-sm text-green-500 underline hover:text-green-400">
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
