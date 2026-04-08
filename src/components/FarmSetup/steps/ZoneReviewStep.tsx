"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import L from "leaflet";
import { useOnboardingStore, type FarmZone } from "../useOnboardingStore";
import { generateZones, getZoneCenter } from "../ZoneGenerator";

const CROP_OPTIONS = [
  "Paddy",
  "Chilli",
  "Cucumber",
  "Kangkung",
  "Eggplant",
  "Okra",
  "Sweet Corn",
  "Tomato",
  "Long Bean",
  "Watermelon",
  "Banana",
  "Cassava",
  "Sweet Potato",
  "Pineapple",
  "Durian",
];

interface Props {
  map: L.Map;
  drawnItems: L.FeatureGroup;
  onFinish: () => void;
}

export default function ZoneReviewStep({ map, drawnItems, onFinish }: Props) {
  const {
    parcels,
    waterFeatures,
    roadFeatures,
    infrastructure,
    zones,
    setZones,
    updateZoneCrop,
    prevStep,
  } = useOnboardingStore();

  const [generated, setGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const zoneLayers = useRef<L.LayerGroup>(new L.LayerGroup());

  // Generate zones on mount
  useEffect(() => {
    if (generated) return;

    const newZones = generateZones(
      parcels,
      waterFeatures,
      roadFeatures,
      infrastructure
    );
    setZones(newZones);
    setGenerated(true);
  }, [
    parcels,
    waterFeatures,
    roadFeatures,
    infrastructure,
    setZones,
    generated,
  ]);

  // Render zones on map
  useEffect(() => {
    const group = zoneLayers.current;
    group.clearLayers();

    for (const zone of zones) {
      // Swap coordinates: GeoJSON is [lng, lat], Leaflet needs [lat, lng]
      const coords = zone.geojson.coordinates[0].map(
        (c) => [c[1], c[0]] as L.LatLngTuple
      );

      const poly = L.polygon(coords, {
        color: zone.colour,
        weight: 2,
        fillOpacity: 0.35,
        fillColor: zone.colour,
      });

      // Zone label
      const center = getZoneCenter(zone.geojson);
      const label = L.marker([center[1], center[0]], {
        icon: L.divIcon({
          className: "",
          html: `<div style="
            background: ${zone.colour};
            color: white;
            font-weight: bold;
            font-size: 14px;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 4px rgba(0,0,0,.3);
            border: 2px solid white;
          ">${zone.label}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      });

      group.addLayer(poly);
      group.addLayer(label);
    }

    group.addTo(map);

    return () => {
      group.clearLayers();
      map.removeLayer(group);
    };
  }, [zones, map]);

  const handleCropChange = useCallback(
    (zoneId: string, crop: string) => {
      updateZoneCrop(zoneId, crop);
    },
    [updateZoneCrop]
  );

  const handleFinish = useCallback(async () => {
    setSaving(true);
    await onFinish();
    setSaving(false);
  }, [onFinish]);

  const totalArea = zones.reduce((sum, z) => sum + z.areaSqm, 0);
  const totalAcres = totalArea / 4046.86;

  return (
    <div className="absolute right-0 bottom-0 left-0 z-[1000]">
      <div className="rounded-t-2xl bg-white/95 px-4 pt-4 pb-6 shadow-2xl backdrop-blur-sm">
        <h3 className="mb-1 text-center text-sm font-semibold text-gray-800">
          Your Farm Zones
        </h3>
        <p className="mb-3 text-center text-xs text-gray-500">
          {zones.length} zone{zones.length !== 1 ? "s" : ""} detected
          {totalAcres > 0 ? ` ~ ${totalAcres.toFixed(1)} acres total` : ""}
        </p>

        {/* Zone list */}
        <div className="mb-4 max-h-40 space-y-2 overflow-y-auto">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              {/* Colour badge */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: zone.colour }}
              >
                {zone.label}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {(zone.areaSqm / 4046.86).toFixed(2)} ac
                  </span>
                </div>
                {/* Crop selector */}
                <select
                  value={zone.cropOverride || zone.suggestedCrop}
                  aria-label={`Crop for zone ${zone.label}`}
                  onChange={(e) => handleCropChange(zone.id, e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                >
                  {CROP_OPTIONS.map((crop) => (
                    <option key={crop} value={crop}>
                      {crop}
                      {crop === zone.suggestedCrop && !zone.cropOverride
                        ? " (suggested)"
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        {zones.length === 0 && generated && (
          <div className="mb-4 rounded-lg bg-yellow-50 px-3 py-3 text-center text-xs text-yellow-700">
            No zones could be generated. Make sure you have drawn at least one
            farm boundary.
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
            onClick={handleFinish}
            disabled={zones.length === 0 || saving}
            className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white disabled:bg-gray-400"
          >
            {saving ? "Saving..." : "Confirm & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
