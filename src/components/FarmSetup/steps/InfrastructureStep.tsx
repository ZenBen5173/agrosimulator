"use client";

import { useCallback, useEffect, useState } from "react";
import L from "leaflet";
import {
  useOnboardingStore,
  type FeatureType,
  type DrawnFeature,
} from "../useOnboardingStore";

const INFRA_TYPES: { type: FeatureType; label: string; icon: string }[] = [
  { type: "greenhouse", label: "Greenhouse", icon: "🏗️" },
  { type: "shelter", label: "Shelter", icon: "🏠" },
  { type: "storage", label: "Storage", icon: "📦" },
  { type: "house", label: "House", icon: "🏡" },
];

const INFRA_ICONS: Record<string, string> = {
  greenhouse: "🏗️",
  shelter: "🏠",
  storage: "📦",
  house: "🏡",
};

interface Props {
  map: L.Map;
  drawnItems: L.FeatureGroup;
  onTypeChange?: (type: string) => void;
}

export default function InfrastructureStep({ map, drawnItems, onTypeChange }: Props) {
  const {
    infrastructure,
    addInfrastructure,
    removeInfrastructure,
    nextStep,
    prevStep,
  } = useOnboardingStore();
  const [activeType, setActiveType] = useState<FeatureType>("greenhouse");

  // Notify orchestrator of default type on mount
  useEffect(() => {
    onTypeChange?.("greenhouse");
  }, [onTypeChange]);

  const startDrawing = useCallback(() => {
    const emoji = INFRA_ICONS[activeType] || "📍";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = new L.Draw.Marker(map as any, {
      icon: L.divIcon({
        className: "",
        html: `<div style="font-size:28px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">${emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
    });
    handler.enable();
  }, [map, activeType]);

  const handleRemove = useCallback(
    (id: string) => {
      removeInfrastructure(id);
      drawnItems.eachLayer((layer) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((layer as any)._featureId === id) drawnItems.removeLayer(layer);
      });
    },
    [removeInfrastructure, drawnItems]
  );

  return (
    <div className="absolute right-0 bottom-0 left-0 z-[1000]">
      <div className="rounded-t-2xl bg-white/95 px-4 pt-4 pb-6 shadow-2xl backdrop-blur-sm">
        <h3 className="mb-2 text-center text-sm font-semibold text-gray-800">
          Mark any structures on your farm
        </h3>

        {/* Type chips */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {INFRA_TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => {
                setActiveType(t.type);
                onTypeChange?.(t.type);
              }}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activeType === t.type
                  ? "bg-amber-500 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Feature list */}
        {infrastructure.length > 0 && (
          <div className="mb-3 max-h-20 space-y-1 overflow-y-auto">
            {infrastructure.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-1.5"
              >
                <span className="text-xs font-medium capitalize text-gray-700">
                  {INFRA_ICONS[f.type] || "📍"} {f.type}{" "}
                  {f.label ? `- ${f.label}` : ""}
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
        <div className="flex gap-3">
          <button
            onClick={prevStep}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600"
          >
            Back
          </button>
          <button
            onClick={startDrawing}
            className="flex-1 rounded-xl border-2 border-dashed border-amber-300 py-3 text-sm font-semibold text-amber-600"
          >
            + Place {INFRA_TYPES.find((t) => t.type === activeType)?.label}
          </button>
          <button
            onClick={nextStep}
            className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white"
          >
            {infrastructure.length === 0 ? "Skip" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Convert Leaflet marker layer to DrawnFeature */
export function leafletLayerToInfraFeature(
  layer: L.Layer,
  type: FeatureType
): DrawnFeature | null {
  if (!(layer instanceof L.Marker)) return null;

  const id = `infra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const ll = layer.getLatLng();

  return {
    id,
    type,
    geojson: { type: "Point", coordinates: [ll.lng, ll.lat] },
  };
}
