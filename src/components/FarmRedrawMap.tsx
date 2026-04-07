"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet-draw";
import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import bbox from "@turf/bbox";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

const MALAYSIA_CENTER: L.LatLngExpression = [4.2105, 101.9758];

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

/** Extract Polygon coordinates from either a Feature or bare Polygon GeoJSON */
function extractPolygonCoords(
  geojson: unknown
): number[][][] | null {
  if (!geojson || typeof geojson !== "object") return null;

  const obj = geojson as Record<string, unknown>;

  // Case 1: bare Polygon { type: "Polygon", coordinates: [...] }
  if (obj.type === "Polygon" && Array.isArray(obj.coordinates)) {
    return obj.coordinates as number[][][];
  }

  // Case 2: Feature { type: "Feature", geometry: { type: "Polygon", coordinates: [...] } }
  if (obj.type === "Feature" && obj.geometry) {
    const geom = obj.geometry as Record<string, unknown>;
    if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
      return geom.coordinates as number[][][];
    }
  }

  return null;
}

export default function FarmRedrawMap() {
  const mapRef = useRef<L.Map | null>(null);
  const drawLayerRef = useRef<L.FeatureGroup | null>(null);
  const drawHandlerRef = useRef<L.Draw.Polygon | null>(null);

  const [farmId, setFarmId] = useState<string | null>(null);
  const [areaAcres, setAreaAcres] = useState<number | null>(null);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [showInstruction, setShowInstruction] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

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

    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    coords.push(coords[0]);
    const geojson = turfPolygon([coords]);
    const m2 = area(geojson);
    setAreaAcres(sqMetersToAcres(m2));
    setHasPolygon(true);
  }, []);

  function startDrawing(map: L.Map) {
    // Disable any existing draw handler first
    if (drawHandlerRef.current) {
      drawHandlerRef.current.disable();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = new L.Draw.Polygon(map as any, {
      allowIntersection: false,
      shapeOptions: {
        color: "#22c55e",
        weight: 3,
        fillOpacity: 0.15,
      },
    });
    handler.enable();
    drawHandlerRef.current = handler;
  }

  // Load farm and initialize map
  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: farm } = await supabase
        .from("farms")
        .select("id, bounding_box, polygon_geojson")
        .eq("onboarding_done", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!farm) {
        router.replace("/home");
        return;
      }

      setFarmId(farm.id);
      setLoading(false);

      // Wait for DOM to render the map container
      await new Promise((r) => setTimeout(r, 150));

      if (mapRef.current) return;
      const container = document.getElementById("redraw-map");
      if (!container) return;

      const map = L.map(container, {
        center: MALAYSIA_CENTER,
        zoom: 7,
        zoomControl: false,
      });

      L.tileLayer(ESRI_TILES, { maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: "topleft" }).addTo(map);

      // Fit to existing bounding box
      if (farm.bounding_box) {
        const bb = farm.bounding_box as {
          north: number;
          south: number;
          east: number;
          west: number;
        };
        const bounds = L.latLngBounds(
          [bb.south, bb.west],
          [bb.north, bb.east]
        );
        map.fitBounds(bounds.pad(0.3));
      }

      // Feature group for drawn polygons
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      drawLayerRef.current = drawnItems;

      // Draw existing polygon as a faded reference layer (non-editable)
      const polyCoords = extractPolygonCoords(farm.polygon_geojson);
      if (polyCoords && polyCoords[0]) {
        const leafletCoords = polyCoords[0].map(
          (c) => [c[1], c[0]] as L.LatLngTuple
        );

        // Add as a ghost/reference layer (not in drawnItems)
        L.polygon(leafletCoords, {
          color: "#9ca3af",
          weight: 2,
          fillOpacity: 0.08,
          dashArray: "4, 6",
          interactive: false,
        }).addTo(map);
      }

      // Draw control (hidden by CSS, but needed for event system)
      const drawControl = new L.Control.Draw({
        position: "topright",
        draw: {
          polygon: {
            allowIntersection: false,
            shapeOptions: {
              color: "#22c55e",
              weight: 3,
              fillOpacity: 0.15,
            },
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

      // Handle polygon creation
      map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
        const event = e as L.DrawEvents.Created;
        drawnItems.clearLayers();
        drawnItems.addLayer(event.layer);
        setShowInstruction(false);
        setTimeout(() => updateArea(), 0);
      });

      map.on("draw:drawvertex", () => {
        setShowInstruction(false);
      });

      mapRef.current = map;

      // Always auto-start polygon drawing — this is the redraw page
      // Small delay to ensure map is fully interactive
      setTimeout(() => {
        startDrawing(map);
      }, 300);
    }

    init();

    return () => {
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRedraw() {
    const layer = drawLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    layer.clearLayers();
    setAreaAcres(null);
    setHasPolygon(false);
    setShowInstruction(true);

    startDrawing(map);
  }

  async function handleSave() {
    const layer = drawLayerRef.current;
    if (!layer || !areaAcres || !farmId) return;

    setSaving(true);

    const polygonLayer = layer.getLayers()[0] as L.Polygon;
    const latlngs = polygonLayer.getLatLngs()[0] as L.LatLng[];

    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    coords.push(coords[0]);
    const geojson = turfPolygon([coords]);

    const [west, south, east, north] = bbox(geojson);
    const boundingBox = { north, south, east, west };
    const gridSize = getGridSize(areaAcres);

    const { error } = await supabase
      .from("farms")
      .update({
        polygon_geojson: geojson.geometry, // Store as Polygon, not Feature
        bounding_box: boundingBox,
        area_acres: Math.round(areaAcres * 100) / 100,
        grid_size: gridSize,
      })
      .eq("id", farmId);

    if (error) {
      console.error("Failed to save:", error.message);
      toast.error("Failed to save farm boundary");
      setSaving(false);
      return;
    }

    toast.success("Farm boundary updated!");
    router.push("/home");
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <p className="text-green-400">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div id="redraw-map" className="h-full w-full" />

      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="absolute top-4 left-4 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm"
      >
        <ArrowLeft size={20} />
      </button>

      {/* Title */}
      <div className="absolute top-4 left-1/2 z-[1000] -translate-x-1/2">
        <div className="rounded-full bg-black/70 px-5 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-sm">
          Redraw Farm Boundary
        </div>
      </div>

      {/* Instruction overlay */}
      {showInstruction && (
        <div className="pointer-events-none absolute top-20 left-1/2 z-[1000] -translate-x-1/2">
          <div className="rounded-xl bg-black/70 px-5 py-3 text-center text-sm font-medium text-white shadow-lg backdrop-blur-sm">
            Tap each corner of your farm to draw its boundary.
            <br />
            <span className="text-green-300">
              Tap your starting point to finish.
            </span>
          </div>
        </div>
      )}

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

        <button
          onClick={handleSave}
          disabled={!hasPolygon || saving}
          className="flex h-12 items-center rounded-xl bg-green-600 px-6 text-base font-semibold text-white shadow-lg transition-colors hover:bg-green-700 disabled:bg-gray-500 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Boundary ✓"}
        </button>
      </div>
    </div>
  );
}
