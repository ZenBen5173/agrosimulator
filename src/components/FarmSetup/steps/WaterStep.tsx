"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  useOnboardingStore,
  type FeatureType,
  type DrawnFeature,
} from "../useOnboardingStore";

const WATER_TYPES: { type: FeatureType; label: string; icon: string }[] = [
  { type: "canal", label: "Canal", icon: "🔵" },
  { type: "bund", label: "Bund", icon: "🟤" },
  { type: "stream", label: "Stream", icon: "🌊" },
  { type: "well", label: "Well/Pump", icon: "💧" },
  { type: "pond", label: "Pond", icon: "🏞️" },
];

const LINE_STYLES: Record<string, { color: string; dashArray?: string }> = {
  canal: { color: "#3b82f6", dashArray: "8,4" },
  bund: { color: "#92400e" },
  stream: { color: "#0ea5e9", dashArray: "4,4" },
};

interface Props {
  map: L.Map;
  drawnItems: L.FeatureGroup;
  onTypeChange?: (type: string) => void;
}

export default function WaterStep({ map, drawnItems, onTypeChange }: Props) {
  const { waterFeatures, removeWaterFeature, nextStep, prevStep } =
    useOnboardingStore();
  const [activeType, setActiveType] = useState<FeatureType>("canal");
  const [isDrawing, setIsDrawing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlerRef = useRef<any>(null);

  // Notify orchestrator of default type on mount
  useEffect(() => {
    onTypeChange?.("canal");
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
    if (activeType === "well") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = new L.Draw.Marker(map as any, {
        icon: L.divIcon({
          className: "",
          html: `<div style="font-size:24px;text-align:center">💧</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      });
      handlerRef.current = handler;
      handler.enable();
      setIsDrawing(true);
    } else if (activeType === "pond") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = new L.Draw.Polygon(map as any, {
        allowIntersection: false,
        shapeOptions: { color: "#0ea5e9", weight: 2, fillOpacity: 0.3 },
      });
      handlerRef.current = handler;
      handler.enable();
      setIsDrawing(true);
    } else {
      const style = LINE_STYLES[activeType] || { color: "#3b82f6" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = new L.Draw.Polyline(map as any, {
        shapeOptions: {
          color: style.color,
          weight: 3,
          dashArray: style.dashArray,
        },
      });
      handlerRef.current = handler;
      handler.enable();
      setIsDrawing(true);
    }
  }, [map, activeType]);

  const finishDrawing = useCallback(() => {
    const handler = handlerRef.current;
    if (!handler) return;
    // Polyline/Polygon: complete the shape
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
    if (handler) {
      handler.disable();
    }
    setIsDrawing(false);
  }, []);

  const handleRemove = useCallback(
    (id: string) => {
      removeWaterFeature(id);
      drawnItems.eachLayer((layer) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((layer as any)._featureId === id) drawnItems.removeLayer(layer);
      });
    },
    [removeWaterFeature, drawnItems]
  );

  return (
    <div className="absolute right-0 bottom-0 left-0 z-[1000]">
      {/* Drawing hint */}
      {isDrawing && (
        <div className="pointer-events-none absolute bottom-44 left-1/2 -translate-x-1/2">
          <div className="rounded-xl bg-black/70 px-5 py-3 text-center text-sm font-medium text-white backdrop-blur-sm">
            {activeType === "well"
              ? "Tap to place the well"
              : activeType === "pond"
                ? "Tap corners of the pond. Tap first point to close."
                : "Tap points along the line. Press Finish when done."}
          </div>
        </div>
      )}

      <div className="rounded-t-2xl bg-white/95 px-4 pt-4 pb-6 shadow-2xl backdrop-blur-sm">
        <h3 className="mb-2 text-center text-sm font-semibold text-gray-800">
          Where does water flow on your farm?
        </h3>

        {/* Type chips */}
        {!isDrawing && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {WATER_TYPES.map((w) => (
              <button
                key={w.type}
                onClick={() => {
                  setActiveType(w.type);
                  onTypeChange?.(w.type);
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  activeType === w.type
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <span>{w.icon}</span>
                {w.label}
              </button>
            ))}
          </div>
        )}

        {/* Feature list */}
        {waterFeatures.length > 0 && !isDrawing && (
          <div className="mb-3 max-h-20 space-y-1 overflow-y-auto">
            {waterFeatures.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-1.5"
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

        {/* Actions — changes when drawing */}
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
              className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white"
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
              className="flex-1 rounded-xl border-2 border-dashed border-blue-300 py-3 text-sm font-semibold text-blue-600"
            >
              + Draw {WATER_TYPES.find((w) => w.type === activeType)?.label}
            </button>
            <button
              onClick={nextStep}
              className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white"
            >
              {waterFeatures.length === 0 ? "Skip" : "Next"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Convert Leaflet layer to DrawnFeature based on geometry type */
export function leafletLayerToWaterFeature(
  layer: L.Layer,
  type: FeatureType
): DrawnFeature | null {
  const id = `water-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (layer instanceof L.Marker) {
    const ll = layer.getLatLng();
    return {
      id,
      type,
      geojson: { type: "Point", coordinates: [ll.lng, ll.lat] },
    };
  }

  if (layer instanceof L.Polygon) {
    const latlngs = layer.getLatLngs()[0] as L.LatLng[];
    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    coords.push(coords[0]);
    return {
      id,
      type,
      geojson: { type: "Polygon", coordinates: [coords] },
    };
  }

  if (layer instanceof L.Polyline) {
    const latlngs = layer.getLatLngs() as L.LatLng[];
    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    return {
      id,
      type,
      geojson: { type: "LineString", coordinates: coords },
    };
  }

  return null;
}
