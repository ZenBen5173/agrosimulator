"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet-draw";
import { createClient } from "@/lib/supabase/client";

import {
  useOnboardingStore,
  type Parcel,
  type DrawnFeature,
  type TerrainType,
} from "./useOnboardingStore";
import StepIndicator from "./StepIndicator";
import BoundaryStep, { leafletLayerToParcel } from "./steps/BoundaryStep";
import WaterStep, { leafletLayerToWaterFeature } from "./steps/WaterStep";
import RoadsStep, { leafletLayerToRoadFeature } from "./steps/RoadsStep";
import TerrainStep from "./steps/TerrainStep";
import InfrastructureStep, {
  leafletLayerToInfraFeature,
} from "./steps/InfrastructureStep";
import ZoneReviewStep from "./steps/ZoneReviewStep";

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

interface FarmSetupProps {
  /** If provided, we're editing an existing farm instead of creating new */
  editFarmId?: string;
}

export default function FarmSetup({ editFarmId }: FarmSetupProps = {}) {
  const mapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingFarm, setLoadingFarm] = useState(!!editFarmId);

  const router = useRouter();
  const supabase = createClient();

  const store = useOnboardingStore();
  const {
    currentStep,
    parcels,
    waterFeatures,
    roadFeatures,
    infrastructure,
    zones,
    terrainType,
    reset,
  } = store;

  // Track active drawing type for the draw:created handler
  const activeStepRef = useRef(currentStep);
  const activeTypeRef = useRef<string>("canal");

  // Keep step ref in sync
  useEffect(() => {
    activeStepRef.current = currentStep;
  }, [currentStep]);

  // Callback passed to step components when they change active type
  const handleActiveTypeChange = useCallback((type: string) => {
    activeTypeRef.current = type;
  }, []);

  // Load existing farm data when in edit mode
  useEffect(() => {
    if (!editFarmId) return;

    async function loadFarm() {
      const { data: farm } = await supabase
        .from("farms")
        .select("polygon_geojson, area_acres, terrain_type, bounding_box")
        .eq("id", editFarmId)
        .single();

      if (!farm) {
        setLoadingFarm(false);
        return;
      }

      // Load farm features
      const { data: features } = await supabase
        .from("farm_features")
        .select("id, feature_type, geometry_geojson, properties")
        .eq("farm_id", editFarmId);

      // Build store data from existing farm
      const existingParcels: Parcel[] = [];
      const existingWater: DrawnFeature[] = [];
      const existingRoads: DrawnFeature[] = [];
      const existingInfra: DrawnFeature[] = [];

      // Main polygon as first parcel
      if (farm.polygon_geojson) {
        existingParcels.push({
          id: "parcel-existing-0",
          geojson: farm.polygon_geojson as GeoJSON.Polygon,
          areaAcres: farm.area_acres || 0,
        });
      }

      // Process features
      if (features) {
        for (const f of features) {
          const feature: DrawnFeature = {
            id: f.id,
            type: f.feature_type as DrawnFeature["type"],
            geojson: f.geometry_geojson as GeoJSON.Geometry,
            label: (f.properties as Record<string, string>)?.label || undefined,
          };

          if (f.feature_type === "parcel") {
            existingParcels.push({
              id: f.id,
              geojson: f.geometry_geojson as GeoJSON.Polygon,
              areaAcres: (f.properties as Record<string, number>)?.areaAcres || 0,
            });
          } else if (["canal", "bund", "stream", "well", "pond"].includes(f.feature_type)) {
            existingWater.push(feature);
          } else if (["road", "path"].includes(f.feature_type)) {
            existingRoads.push(feature);
          } else if (["greenhouse", "shelter", "storage", "house"].includes(f.feature_type)) {
            existingInfra.push(feature);
          }
        }
      }

      // Load into store
      useOnboardingStore.getState().loadExisting({
        parcels: existingParcels,
        waterFeatures: existingWater,
        roadFeatures: existingRoads,
        terrainType: (farm.terrain_type as TerrainType) || "flat",
        infrastructure: existingInfra,
      });

      // Fit map to existing farm bounds
      if (farm.bounding_box && mapRef.current) {
        const bb = farm.bounding_box as { north: number; south: number; east: number; west: number };
        mapRef.current.fitBounds(
          L.latLngBounds([bb.south, bb.west], [bb.north, bb.east]).pad(0.3)
        );
      }

      // Render existing features on map
      const map = mapRef.current;
      const drawnItems = drawnItemsRef.current;
      if (map && drawnItems) {
        renderExistingFeatures(existingParcels, existingWater, existingRoads, existingInfra, drawnItems);
      }

      setLoadingFarm(false);
    }

    // Wait for map to be ready before loading
    if (mapReady) {
      loadFarm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editFarmId, mapReady]);

  // Initialize Leaflet map — persists across all steps
  useEffect(() => {
    if (mapRef.current) return;
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: MALAYSIA_CENTER,
      zoom: MALAYSIA_ZOOM,
      zoomControl: false,
    });

    L.tileLayer(ESRI_TILES, {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "topleft" }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;
    mapRef.current = map;

    // Central draw:created handler — routes to the correct step
    // Use useOnboardingStore.getState() to avoid stale closure issues
    map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      const layer = event.layer;
      const step = activeStepRef.current;
      const s = useOnboardingStore.getState();


      try {
        if (step === 0) {
          // Boundary — polygon
          const result = leafletLayerToParcel(layer as L.Polygon);
          const id = `parcel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (layer as any)._parcelId = id;
          drawnItems.addLayer(layer);
          s.addParcel({ id, ...result });
        } else if (step === 1) {
          // Water features
          const type = activeTypeRef.current;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const feature = leafletLayerToWaterFeature(layer as any, type as any);
          if (feature) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (layer as any)._featureId = feature.id;
            drawnItems.addLayer(layer);
            s.addWaterFeature(feature);
          }
        } else if (step === 2) {
          // Roads
          const type = activeTypeRef.current;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const feature = leafletLayerToRoadFeature(layer as any, type as any);
          if (feature) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (layer as any)._featureId = feature.id;
            drawnItems.addLayer(layer);
            s.addRoadFeature(feature);
          }
        } else if (step === 4) {
          // Infrastructure — markers
          const type = activeTypeRef.current;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const feature = leafletLayerToInfraFeature(layer as any, type as any);
          if (feature) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (layer as any)._featureId = feature.id;
            drawnItems.addLayer(layer);
            s.addInfrastructure(feature);
          }
        }
      } catch (err) {
        console.error("[FarmSetup] Error in draw:created handler:", err);
      }
    });

    // GPS — fly to user's location (only for new farms, not edit mode)
    if (!editFarmId && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.flyTo([pos.coords.latitude, pos.coords.longitude], GPS_ZOOM, {
            duration: 1.5,
          });
        },
        () => {
          /* GPS denied — stay at Malaysia default */
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      drawnItemsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save everything to Supabase and navigate to research
  const handleFinish = useCallback(async () => {
    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSaving(false);
        return;
      }

      const totalAreaAcres = parcels.reduce((sum, p) => sum + p.areaAcres, 0);

      // Bounding box from all parcel coordinates
      let allCoords: number[][] = [];
      for (const p of parcels) {
        const ring = p.geojson.coordinates[0];
        allCoords = allCoords.concat(ring);
      }
      const lngs = allCoords.map((c) => c[0]);
      const lats = allCoords.map((c) => c[1]);
      const boundingBox = {
        north: Math.max(...lats),
        south: Math.min(...lats),
        east: Math.max(...lngs),
        west: Math.min(...lngs),
      };

      const mainPolygon = parcels[0]?.geojson || null;
      const gridSize = getGridSize(totalAreaAcres);

      // 1. Insert or update farm
      let farmId: string;

      if (editFarmId) {
        // Edit mode — update existing farm
        const { error: farmError } = await supabase
          .from("farms")
          .update({
            polygon_geojson: mainPolygon,
            bounding_box: boundingBox,
            area_acres: Math.round(totalAreaAcres * 100) / 100,
            grid_size: gridSize,
            terrain_type: terrainType,
            total_parcels: parcels.length,
          })
          .eq("id", editFarmId);

        if (farmError) {
          console.error("Failed to update farm:", farmError.message);
          setSaving(false);
          return;
        }
        farmId = editFarmId;

        // Clear old features and zones before re-inserting
        await supabase.from("farm_features").delete().eq("farm_id", farmId);
        await supabase.from("farm_zones").delete().eq("farm_id", farmId);
      } else {
        // New farm
        const { data: farm, error: farmError } = await supabase
          .from("farms")
          .insert({
            user_id: user.id,
            polygon_geojson: mainPolygon,
            bounding_box: boundingBox,
            area_acres: Math.round(totalAreaAcres * 100) / 100,
            grid_size: gridSize,
            terrain_type: terrainType,
            total_parcels: parcels.length,
            onboarding_done: false,
          })
          .select("id")
          .single();

        if (farmError || !farm) {
          console.error("Failed to save farm:", farmError?.message);
          setSaving(false);
          return;
        }
        farmId = farm.id;
      }

      // 2. Save all farm features
      const features = [
        ...waterFeatures.map((f) => ({
          farm_id: farmId,
          feature_type: f.type,
          geometry_geojson: f.geojson,
          properties: { label: f.label || null },
        })),
        ...roadFeatures.map((f) => ({
          farm_id: farmId,
          feature_type: f.type,
          geometry_geojson: f.geojson,
          properties: { label: f.label || null },
        })),
        ...infrastructure.map((f) => ({
          farm_id: farmId,
          feature_type: f.type,
          geometry_geojson: f.geojson,
          properties: { label: f.label || null },
        })),
        // Extra parcels (beyond the first, which is polygon_geojson)
        ...parcels.slice(1).map((p) => ({
          farm_id: farmId,
          feature_type: "parcel" as const,
          geometry_geojson: p.geojson,
          properties: { areaAcres: p.areaAcres },
        })),
      ];

      if (features.length > 0) {
        const { error: featError } = await supabase
          .from("farm_features")
          .insert(features);
        if (featError) {
          console.error("Failed to save features:", featError.message);
        }
      }

      // 3. Save zones
      if (zones.length > 0) {
        const zoneRows = zones.map((z) => ({
          farm_id: farmId,
          zone_label: z.label,
          geometry_geojson: z.geojson,
          area_sqm: Math.round(z.areaSqm),
          suggested_crop: z.suggestedCrop,
          crop_override: z.cropOverride,
          colour_hex: z.colour,
        }));

        const { error: zoneError } = await supabase
          .from("farm_zones")
          .insert(zoneRows);
        if (zoneError) {
          console.error("Failed to save zones:", zoneError.message);
        }
      }

      // Reset store and navigate forward
      reset();
      const destination = editFarmId ? "/home" : "/onboarding/research";
      try {
        router.push(destination);
      } catch {
        window.location.href = destination;
      }
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save farm. Check console for details.");
    } finally {
      setSaving(false);
    }
  }, [
    supabase,
    parcels,
    waterFeatures,
    roadFeatures,
    infrastructure,
    zones,
    terrainType,
    editFarmId,
    reset,
    router,
  ]);

  // Render the current step panel
  function renderStep() {
    if (!mapReady || !mapRef.current || !drawnItemsRef.current) return null;

    const map = mapRef.current;
    const drawnItems = drawnItemsRef.current;

    switch (currentStep) {
      case 0:
        return <BoundaryStep map={map} drawnItems={drawnItems} />;
      case 1:
        return (
          <WaterStep
            map={map}
            drawnItems={drawnItems}
            onTypeChange={handleActiveTypeChange}
          />
        );
      case 2:
        return (
          <RoadsStep
            map={map}
            drawnItems={drawnItems}
            onTypeChange={handleActiveTypeChange}
          />
        );
      case 3:
        return <TerrainStep />;
      case 4:
        return (
          <InfrastructureStep
            map={map}
            drawnItems={drawnItems}
            onTypeChange={handleActiveTypeChange}
          />
        );
      case 5:
        return (
          <ZoneReviewStep
            map={map}
            drawnItems={drawnItems}
            onFinish={handleFinish}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Map — stays mounted across all steps */}
      <div ref={containerRef} id="farm-setup-map" aria-label="Farm setup map" className="h-full w-full" />

      {/* Top: step indicator */}
      <div className="absolute top-0 right-0 left-0 z-[1000] bg-gradient-to-b from-black/50 to-transparent pt-2 pb-6">
        <StepIndicator step={currentStep} />
      </div>

      {/* Help button */}
      <button
        className="absolute top-14 right-4 z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-sm font-bold text-white shadow-lg backdrop-blur-sm"
        aria-label="Help"
      >
        ?
      </button>

      {/* Loading overlay for edit mode */}
      {loadingFarm && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 shadow-2xl">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
            <p role="status" aria-live="polite" className="text-sm font-medium text-gray-700">
              Loading farm data...
            </p>
          </div>
        </div>
      )}

      {/* Current step panel (bottom sheet) */}
      {!loadingFarm && renderStep()}

      {/* Saving overlay */}
      {saving && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 shadow-2xl">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
            <p role="status" aria-live="polite" className="text-sm font-medium text-gray-700">
              Saving your farm...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Render existing farm features as Leaflet layers on the map */
function renderExistingFeatures(
  parcels: Parcel[],
  water: DrawnFeature[],
  roads: DrawnFeature[],
  infra: DrawnFeature[],
  drawnItems: L.FeatureGroup
) {
  // Parcels — green polygons
  for (const p of parcels) {
    const coords = p.geojson.coordinates[0].map(
      (c) => [c[1], c[0]] as L.LatLngTuple
    );
    const layer = L.polygon(coords, {
      color: "#22c55e",
      weight: 3,
      fillOpacity: 0.15,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (layer as any)._parcelId = p.id;
    drawnItems.addLayer(layer);
  }

  // Water features
  for (const f of water) {
    if (f.geojson.type === "LineString") {
      const coords = (f.geojson as GeoJSON.LineString).coordinates.map(
        (c) => [c[1], c[0]] as L.LatLngTuple
      );
      const layer = L.polyline(coords, {
        color: "#3b82f6",
        weight: 3,
        dashArray: "8,4",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (layer as any)._featureId = f.id;
      drawnItems.addLayer(layer);
    } else if (f.geojson.type === "Point") {
      const c = (f.geojson as GeoJSON.Point).coordinates;
      const layer = L.marker([c[1], c[0]], {
        icon: L.divIcon({
          className: "",
          html: `<div style="font-size:24px;text-align:center">💧</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (layer as any)._featureId = f.id;
      drawnItems.addLayer(layer);
    } else if (f.geojson.type === "Polygon") {
      const coords = (f.geojson as GeoJSON.Polygon).coordinates[0].map(
        (c) => [c[1], c[0]] as L.LatLngTuple
      );
      const layer = L.polygon(coords, {
        color: "#0ea5e9",
        weight: 2,
        fillOpacity: 0.3,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (layer as any)._featureId = f.id;
      drawnItems.addLayer(layer);
    }
  }

  // Roads
  for (const f of roads) {
    if (f.geojson.type === "LineString") {
      const coords = (f.geojson as GeoJSON.LineString).coordinates.map(
        (c) => [c[1], c[0]] as L.LatLngTuple
      );
      const isPath = f.type === "path";
      const layer = L.polyline(coords, {
        color: isPath ? "#a3a3a3" : "#78716c",
        weight: isPath ? 2 : 4,
        dashArray: isPath ? "6,6" : undefined,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (layer as any)._featureId = f.id;
      drawnItems.addLayer(layer);
    }
  }

  // Infrastructure
  const INFRA_ICONS: Record<string, string> = {
    greenhouse: "🏗️",
    shelter: "🏠",
    storage: "📦",
    house: "🏡",
  };
  for (const f of infra) {
    if (f.geojson.type === "Point") {
      const c = (f.geojson as GeoJSON.Point).coordinates;
      const emoji = INFRA_ICONS[f.type] || "📍";
      const layer = L.marker([c[1], c[0]], {
        icon: L.divIcon({
          className: "",
          html: `<div style="font-size:28px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">${emoji}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (layer as any)._featureId = f.id;
      drawnItems.addLayer(layer);
    }
  }
}
