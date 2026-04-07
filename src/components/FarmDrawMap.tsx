"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet-draw";
import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import bbox from "@turf/bbox";
import { createClient } from "@/lib/supabase/client";

const MALAYSIA_CENTER: L.LatLngExpression = [4.2105, 101.9758];
const MALAYSIA_ZOOM = 7;
const GPS_ZOOM = 17;

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function getGridSize(acres: number): number {
  if (acres < 1) return 4;
  if (acres <= 2) return 6;
  if (acres <= 4) return 8;
  return 10;
}

function sqMetersToAcres(m2: number): number {
  return m2 / 4046.86;
}

export default function FarmDrawMap() {
  const mapRef = useRef<L.Map | null>(null);
  const drawLayerRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);

  const [areaAcres, setAreaAcres] = useState<number | null>(null);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [showInstruction, setShowInstruction] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [saving, setSaving] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const updateArea = useCallback(() => {
    const layer = drawLayerRef.current;
    if (!layer) return;

    const layers = layer.getLayers();
    if (layers.length === 0) {
      setAreaAcres(null);
      setHasPolygon(false);
      return;
    }

    const polygonLayer = layers[0] as L.Polygon;
    const latlngs = polygonLayer.getLatLngs()[0] as L.LatLng[];

    if (latlngs.length < 3) {
      setAreaAcres(null);
      setHasPolygon(false);
      return;
    }

    // Build GeoJSON for turf (lng, lat order)
    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    coords.push(coords[0]); // close the ring
    const geojson = turfPolygon([coords]);
    const m2 = area(geojson);
    setAreaAcres(sqMetersToAcres(m2));
    setHasPolygon(true);
  }, []);

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map("farm-map", {
      center: MALAYSIA_CENTER,
      zoom: MALAYSIA_ZOOM,
      zoomControl: false,
    });

    L.tileLayer(ESRI_TILES, {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19,
    }).addTo(map);

    // Zoom control top-left
    L.control.zoom({ position: "topleft" }).addTo(map);

    // Drawing layer
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawLayerRef.current = drawnItems;

    // Draw control — polygon only
    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: { color: "#22c55e", weight: 3, fillOpacity: 0.15 },
        },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems, remove: false, edit: false },
    });
    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    // Start polygon drawing mode automatically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const polygonHandler = new L.Draw.Polygon(map as any, {
      allowIntersection: false,
      shapeOptions: { color: "#22c55e", weight: 3, fillOpacity: 0.15 },
    });
    polygonHandler.enable();

    // On polygon created
    map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      drawnItems.clearLayers();
      drawnItems.addLayer(event.layer);
      setShowInstruction(false);
      setTimeout(() => updateArea(), 0);
    });

    // Dismiss instruction on first vertex
    map.on("draw:drawvertex", () => {
      setShowInstruction(false);
    });

    mapRef.current = map;

    // GPS
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.flyTo([pos.coords.latitude, pos.coords.longitude], GPS_ZOOM, {
            duration: 1.5,
          });
        },
        () => {
          // GPS denied — stay at Malaysia default
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [updateArea]);

  function handleRedraw() {
    const layer = drawLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    layer.clearLayers();
    setAreaAcres(null);
    setHasPolygon(false);
    setShowInstruction(true);

    // Re-enable polygon drawing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const polygonHandler = new L.Draw.Polygon(map as any, {
      allowIntersection: false,
      shapeOptions: { color: "#22c55e", weight: 3, fillOpacity: 0.15 },
    });
    polygonHandler.enable();
  }

  async function handleConfirm() {
    const layer = drawLayerRef.current;
    if (!layer || !areaAcres) return;

    setSaving(true);

    const polygonLayer = layer.getLayers()[0] as L.Polygon;
    const latlngs = polygonLayer.getLatLngs()[0] as L.LatLng[];

    // GeoJSON (lng, lat order)
    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    coords.push(coords[0]);
    const geojson = turfPolygon([coords]);

    // Bounding box [west, south, east, north]
    const [west, south, east, north] = bbox(geojson);
    const boundingBox = { north, south, east, west };

    const gridSize = getGridSize(areaAcres);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("farms").insert({
      user_id: user.id,
      polygon_geojson: geojson,
      bounding_box: boundingBox,
      area_acres: Math.round(areaAcres * 100) / 100,
      grid_size: gridSize,
      onboarding_done: false,
    });

    if (error) {
      console.error("Failed to save farm:", error.message);
      setSaving(false);
      return;
    }

    router.push("/onboarding/research");
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Map container */}
      <div id="farm-map" className="h-full w-full" />

      {/* Instruction overlay */}
      {showInstruction && (
        <div className="pointer-events-none absolute top-4 left-1/2 z-[1000] -translate-x-1/2">
          <div className="rounded-xl bg-black/70 px-5 py-3 text-center text-base font-medium text-white shadow-lg backdrop-blur-sm">
            Tap each corner of your farm to draw its boundary.
            <br />
            <span className="text-sm text-green-300">
              Tap your starting point to finish.
            </span>
          </div>
        </div>
      )}

      {/* Help button */}
      <button
        onClick={() => setShowHelp(true)}
        className="absolute top-4 right-4 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-lg font-bold text-white shadow-lg backdrop-blur-sm"
      >
        ?
      </button>

      {/* Area badge */}
      {areaAcres !== null && (
        <div className="absolute bottom-28 left-1/2 z-[1000] -translate-x-1/2">
          <div className="rounded-full bg-black/70 px-5 py-2 text-lg font-bold text-white shadow-lg backdrop-blur-sm">
            ~{areaAcres.toFixed(1)} acres
          </div>
        </div>
      )}

      {/* Bottom buttons */}
      <div
        className="absolute right-0 bottom-6 left-0 z-[1000] flex items-end justify-between px-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Redraw */}
        {hasPolygon ? (
          <button
            onClick={handleRedraw}
            className="flex h-12 items-center rounded-xl bg-black/60 px-5 text-base font-semibold text-white shadow-lg backdrop-blur-sm"
          >
            ↩ Redraw
          </button>
        ) : (
          <div />
        )}

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          disabled={!hasPolygon || saving}
          className="flex h-12 items-center rounded-xl bg-green-600 px-6 text-base font-semibold text-white shadow-lg transition-colors hover:bg-green-700 disabled:bg-gray-500 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Looks right →"}
        </button>
      </div>

      {/* Help modal */}
      {showHelp && (
        <div
          className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="mx-4 max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-bold text-gray-900">
              How to draw your farm
            </h2>
            <p className="mb-4 leading-relaxed text-gray-700">
              Zoom in close to your farm, then tap each corner of your land to
              draw the boundary. Tap your first point again to close the shape.
            </p>
            <button
              onClick={() => setShowHelp(false)}
              className="w-full rounded-xl bg-green-600 py-3 text-base font-semibold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
