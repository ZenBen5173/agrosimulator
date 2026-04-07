"use client";

import { useEffect, useRef } from "react";
import type { Application } from "pixi.js";
import type { GridJson } from "@/types/farm";

interface FarmCanvasProps {
  gridJson: GridJson;
  onTileClick?: (plotLabel: string) => void;
  weatherCondition?: string;
  plotStages?: Record<string, { cropName: string; growthStage: string }>;
  plotWarnings?: Record<string, { warningLevel: string; warningReason: string }>;
  className?: string;
}

export default function FarmCanvas({
  gridJson,
  onTileClick,
  weatherCondition,
  plotStages,
  plotWarnings,
  className,
}: FarmCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;

    async function setup() {
      const { initRenderer } = await import("./renderer");

      if (destroyed || !container) return;

      const app = await initRenderer(container, gridJson, onTileClick, {
        weatherCondition,
        plotStages,
        plotWarnings,
      });
      if (destroyed) {
        // Cleanup weather layer
        const meta = app as unknown as Record<string, unknown>;
        const wl = meta._weatherLayer as { destroy: () => void } | undefined;
        wl?.destroy();
        app.destroy(true);
        return;
      }
      appRef.current = app;
    }

    setup();

    return () => {
      destroyed = true;
      if (appRef.current) {
        const meta = appRef.current as unknown as Record<string, unknown>;
        const obs = meta._resizeObserver as ResizeObserver | undefined;
        obs?.disconnect();
        const wl = meta._weatherLayer as { destroy: () => void } | undefined;
        wl?.destroy();

        appRef.current.destroy(true);
        appRef.current = null;
      }
      if (container) container.innerHTML = "";
    };
  }, [gridJson, onTileClick, weatherCondition, plotStages, plotWarnings]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    />
  );
}
