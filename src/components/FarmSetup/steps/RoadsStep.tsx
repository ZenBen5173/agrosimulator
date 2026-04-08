"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  useOnboardingStore,
  type FeatureType,
  type DrawnFeature,
} from "../useOnboardingStore";

const ROAD_TYPES: { type: FeatureType; label: string; icon: string }[] = [
  { type: "road", label: "Road", icon: "🛣️" },
  { type: "path", label: "Farm Path", icon: "🚶" },
];

const ROAD_STYLES: Record<string, { color: string; weight: number; dashArray?: string }> = {
  road: { color: "#78716c", weight: 4 },
  path: { color: "#a3a3a3", weight: 2, dashArray: "6,6" },
};

interface Props {
  map: L.Map;
  drawnItems: L.FeatureGroup;
  onTypeChange?: (type: string) => void;
}

export default function RoadsStep({ map, drawnItems, onTypeChange }: Props) {
  const { roadFeatures, removeRoadFeature, nextStep, prevStep } =
    useOnboardingStore();
  const [activeType, setActiveType] = useState<FeatureType>("road");
  const [isDrawing, setIsDrawing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlerRef = useRef<any>(null);

  // Notify orchestrator of default type on mount
  useEffect(() => {
    onTypeChange?.("road");
  }, [onTypeChange]);

  // Listen for draw completion to reset isDrawing
  useEffect(() => {
    const onCreated = () => setIsDrawing(false);
    const onStop = () => setIsDrawing(false);
    map.on(L.Draw.Event.CREATED, onCreated);
    map.on("draw:drawstop", onStop);
    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.off("draw:drawstop", onStop);
    };
  }, [map]);

  const startDrawing = useCallback(() => {
    const style = ROAD_STYLES[activeType] || { color: "#78716c", weight: 3 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = new L.Draw.Polyline(map as any, {
      shapeOptions: {
        color: style.color,
        weight: style.weight,
        dashArray: style.dashArray,
      },
    });
    handlerRef.current = handler;
    handler.enable();
    setIsDrawing(true);
  }, [map, activeType]);

  const finishDrawing = useCallback(() => {
    const handler = handlerRef.current;
    if (!handler) return;
    if (handler.completeShape) {
      handler.completeShape();
    } else if (handler._finishShape) {
      handler._finishShape();
    } else {
      handler.disable();
      setIsDrawing(false);
    }
  }, []);

  const cancelDrawing = useCallback(() => {
    const handler = handlerRef.current;
    if (handler) handler.disable();
    setIsDrawing(false);
  }, []);

  const handleRemove = useCallback(
    (id: string) => {
      removeRoadFeature(id);
      drawnItems.eachLayer((layer) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((layer as any)._featureId === id) drawnItems.removeLayer(layer);
      });
    },
    [removeRoadFeature, drawnItems]
  );

  return (
    <div className="absolute right-0 bottom-0 left-0 z-[1000]">
      {/* Drawing hint */}
      {isDrawing && (
        <div className="pointer-events-none absolute bottom-44 left-1/2 -translate-x-1/2">
          <div className="rounded-xl bg-black/70 px-5 py-3 text-center text-sm font-medium text-white backdrop-blur-sm">
            Tap points along the road. Press Finish when done.
          </div>
        </div>
      )}

      <div className="rounded-t-2xl bg-white/95 px-4 pt-4 pb-6 shadow-2xl backdrop-blur-sm">
        <h3 className="mb-2 text-center text-sm font-semibold text-gray-800">
          Draw roads & access paths around your farm
        </h3>

        {/* Type chips */}
        {!isDrawing && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {ROAD_TYPES.map((r) => (
              <button
                key={r.type}
                onClick={() => {
                  setActiveType(r.type);
                  onTypeChange?.(r.type);
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  activeType === r.type
                    ? "bg-gray-700 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <span>{r.icon}</span>
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Feature list */}
        {roadFeatures.length > 0 && !isDrawing && (
          <div className="mb-3 max-h-20 space-y-1 overflow-y-auto">
            {roadFeatures.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5"
              >
                <span className="text-xs font-medium capitalize text-gray-700">
                  {f.type} {f.label ? `- ${f.label}` : ""}
                </span>
                <button
                  onClick={() => handleRemove(f.id)}
                  className="text-xs text-red-500"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {isDrawing ? (
          <div className="flex gap-3">
            <button
              onClick={cancelDrawing}
              className="rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-500"
            >
              Cancel
            </button>
            <button
              onClick={finishDrawing}
              className="flex-1 rounded-xl bg-gray-700 py-3 text-sm font-semibold text-white"
            >
              Finish Line
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={prevStep}
              className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600"
            >
              Back
            </button>
            <button
              onClick={startDrawing}
              className="flex-1 rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-semibold text-gray-600"
            >
              + Draw {ROAD_TYPES.find((r) => r.type === activeType)?.label}
            </button>
            <button
              onClick={nextStep}
              className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white"
            >
              {roadFeatures.length === 0 ? "Skip" : "Next"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Convert Leaflet polyline layer to DrawnFeature */
export function leafletLayerToRoadFeature(
  layer: L.Layer,
  type: FeatureType
): DrawnFeature | null {
  if (!(layer instanceof L.Polyline)) return null;

  const id = `road-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const latlngs = layer.getLatLngs() as L.LatLng[];
  const coords = latlngs.map((ll) => [ll.lng, ll.lat]);

  return {
    id,
    type,
    geojson: { type: "LineString", coordinates: coords },
  };
}
