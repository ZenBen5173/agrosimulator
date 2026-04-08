"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import { useOnboardingStore } from "../useOnboardingStore";

interface Props {
  map: L.Map;
  drawnItems: L.FeatureGroup;
}

export default function BoundaryStep({ map, drawnItems }: Props) {
  const { parcels, addParcel, removeParcel, nextStep } = useOnboardingStore();
  const [isDrawing, setIsDrawing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlerRef = useRef<any>(null);

  // Listen for draw completion
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = new L.Draw.Polygon(map as any, {
      allowIntersection: false,
      shapeOptions: { color: "#22c55e", weight: 3, fillOpacity: 0.15 },
    });
    handlerRef.current = handler;
    handler.enable();
    setIsDrawing(true);
  }, [map]);

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
      removeParcel(id);
      drawnItems.eachLayer((layer) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((layer as any)._parcelId === id) {
          drawnItems.removeLayer(layer);
        }
      });
    },
    [removeParcel, drawnItems]
  );

  const totalArea = parcels.reduce((sum, p) => sum + p.areaAcres, 0);

  return (
    <div className="absolute right-0 bottom-0 left-0 z-[1000]">
      {/* Instruction overlay */}
      {isDrawing && (
        <div className="pointer-events-none absolute bottom-44 left-1/2 -translate-x-1/2">
          <div className="rounded-xl bg-black/70 px-5 py-3 text-center text-sm font-medium text-white backdrop-blur-sm">
            Tap each corner of your farm.
            <br />
            <span className="text-green-300">
              Tap first point or press Finish to close.
            </span>
          </div>
        </div>
      )}

      {/* Bottom panel */}
      <div className="rounded-t-2xl bg-white/95 px-4 pt-4 pb-6 shadow-2xl backdrop-blur-sm">
        {/* Parcel list */}
        {parcels.length > 0 && !isDrawing && (
          <ul role="list" className="mb-3 max-h-28 space-y-2 overflow-y-auto">
            {parcels.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium text-gray-800">
                    Parcel {i + 1}
                  </span>
                  <span className="text-sm text-gray-500">
                    {p.areaAcres.toFixed(1)} acres
                  </span>
                </div>
                <button
                  onClick={() => handleRemove(p.id)}
                  aria-label="Remove parcel"
                  className="min-h-[44px] min-w-[44px] p-2 text-xs font-medium text-red-500"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Total area */}
        {totalArea > 0 && !isDrawing && (
          <div className="mb-3 text-center text-sm font-semibold text-green-700">
            Total: ~{totalArea.toFixed(1)} acres
          </div>
        )}

        {/* Action buttons — changes when drawing */}
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
              className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white"
            >
              Finish Shape
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={startDrawing}
              className="flex-1 rounded-xl border-2 border-dashed border-green-300 py-3 text-sm font-semibold text-green-600 transition hover:bg-green-50"
            >
              {parcels.length === 0 ? "Start Drawing" : "+ Add Another Parcel"}
            </button>

            {parcels.length > 0 && (
              <button
                onClick={nextStep}
                className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white transition hover:bg-green-700"
              >
                Next
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Helper: convert Leaflet polygon layer to our Parcel format */
export function leafletLayerToParcel(layer: L.Polygon): {
  geojson: GeoJSON.Polygon;
  areaAcres: number;
} {
  const latlngs = layer.getLatLngs()[0] as L.LatLng[];
  const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
  coords.push(coords[0]); // close ring
  const geojson = turfPolygon([coords]);
  const m2 = area(geojson);
  return {
    geojson: geojson.geometry as GeoJSON.Polygon,
    areaAcres: m2 / 4046.86,
  };
}
