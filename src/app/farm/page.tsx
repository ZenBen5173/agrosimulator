"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import FarmSwitcher from "@/components/home/FarmSwitcher";
import NotificationBell from "@/components/NotificationBell";
import PlotBottomSheet from "@/components/PlotBottomSheet";
import PlotCardRow from "@/components/home/PlotCardRow";
import { SkeletonCard } from "@/components/ui/Skeleton";
import type { PlotData } from "@/types/farm";
import toast from "react-hot-toast";

const FarmMapView = dynamic(() => import("@/components/FarmMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-900">
      <p className="text-green-400 text-sm">Loading map...</p>
    </div>
  ),
});

export default function FarmTabPage() {
  const router = useRouter();
  const supabase = createClient();
  const store = useFarmStore();
  const { farm, farms, plots, weather, selectedPlot } = store;

  const [loading, setLoading] = useState(!farm);
  const [extraPolygons, setExtraPolygons] = useState<GeoJSON.Polygon[]>([]);
  const [zoneOverlays, setZoneOverlays] = useState<
    { label: string; crop: string; colour: string; polygon: GeoJSON.Polygon; warningLevel?: string }[]
  >([]);

  useEffect(() => {
    if (farm && plots.length > 0) {
      // Already loaded from home tab — just fetch map data
      fetchMapData(farm.id);
      return;
    }

    async function loadFarm() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/"); return; }

      const { data: allFarms } = await supabase
        .from("farms")
        .select("id, name, area_acres, grid_size, soil_type, water_source, polygon_geojson, bounding_box")
        .eq("onboarding_done", true)
        .order("created_at", { ascending: false });

      if (!allFarms || allFarms.length === 0) { router.replace("/onboarding"); return; }

      store.setFarms(allFarms);
      const farmRow = allFarms[0];
      store.setFarm(farmRow);

      const { data: plotRows } = await supabase.from("plots")
        .select("id, label, crop_name, growth_stage, warning_level, colour_hex, planted_date, expected_harvest, photo_url")
        .eq("farm_id", farmRow.id);

      store.setPlots(plotRows || []);
      fetchMapData(farmRow.id);
      setLoading(false);
    }

    loadFarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchMapData(farmId: string) {
    const [parcelsRes, zonesRes] = await Promise.all([
      supabase.from("farm_features").select("geometry_geojson").eq("farm_id", farmId).eq("feature_type", "parcel"),
      supabase.from("farm_zones").select("zone_label, suggested_crop, crop_override, colour_hex, geometry_geojson")
        .eq("farm_id", farmId).order("zone_label"),
    ]);

    setExtraPolygons(
      (parcelsRes.data || [])
        .map((r: { geometry_geojson: unknown }) => r.geometry_geojson as GeoJSON.Polygon)
        .filter((g): g is GeoJSON.Polygon => !!g)
    );

    setZoneOverlays(
      (zonesRes.data || [])
        .filter((z: { geometry_geojson: unknown }) => z.geometry_geojson)
        .map((z: { zone_label: string; suggested_crop: string; crop_override: string | null; colour_hex: string; geometry_geojson: unknown }) => {
          const matchingPlot = plots.find((p) => p.label === z.zone_label);
          return {
            label: z.zone_label,
            crop: z.crop_override || z.suggested_crop,
            colour: z.colour_hex,
            polygon: z.geometry_geojson as GeoJSON.Polygon,
            warningLevel: matchingPlot?.warning_level,
          };
        })
    );
    setLoading(false);
  }

  const handleTileClick = useCallback((plotLabel: string) => {
    const plot = plots.find((p) => p.label === plotLabel);
    if (plot) store.setSelectedPlot(plot);
  }, [plots, store]);

  const handleHarvest = useCallback(async (plotId: string) => {
    try {
      const res = await fetch("/api/plots/harvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plot_id: plotId }),
      });
      if (res.ok) {
        store.updatePlot(plotId, { growth_stage: "harvested", warning_level: "none" });
        toast.success("Plot harvested!");
      }
    } catch { toast.error("Failed to harvest"); }
  }, [store]);

  if (loading || !farm) {
    return (
      <div className="min-h-screen bg-gray-900">
        <div className="h-[60vh] animate-pulse bg-gray-800" />
        <div className="px-4 pt-4 space-y-3">
          <div className="flex gap-3">{[1, 2, 3].map((i) => <SkeletonCard key={i} className="w-24 h-28" />)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-lg border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          {farms.length > 1 ? <FarmSwitcher /> : (
            <h1 className="text-lg font-bold text-gray-900">Farm View</h1>
          )}
          <NotificationBell />
        </div>
      </div>

      {/* Map */}
      <div className="h-[55vh] bg-gray-900">
        {farm.polygon_geojson && farm.bounding_box ? (
          <FarmMapView
            polygonGeoJson={farm.polygon_geojson}
            boundingBox={farm.bounding_box}
            extraPolygons={extraPolygons}
            zones={zoneOverlays}
            plots={plots.map((p) => ({
              label: p.label,
              crop: p.crop_name,
              colour: p.colour_hex,
              growthStage: p.growth_stage,
              warningLevel: p.warning_level,
            }))}
            onPlotClick={handleTileClick}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-gray-400 text-sm">No farm boundary drawn yet</p>
          </div>
        )}
      </div>

      {/* Farm health summary */}
      {plots.length > 0 && (() => {
        const atRisk = plots.filter((p) => p.warning_level === "red" || p.warning_level === "orange");
        const caution = plots.filter((p) => p.warning_level === "yellow");
        const healthy = plots.length - atRisk.length - caution.length;
        const stages = plots.reduce((acc, p) => { acc[p.growth_stage] = (acc[p.growth_stage] || 0) + 1; return acc; }, {} as Record<string, number>);
        const dominantStage = Object.entries(stages).sort((a, b) => b[1] - a[1])[0];
        const parts: string[] = [];
        if (atRisk.length > 0) parts.push(`${atRisk.length} plot${atRisk.length > 1 ? "s" : ""} need attention (${atRisk.map((p) => p.label).join(", ")})`);
        else parts.push(`All ${plots.length} plots healthy`);
        if (dominantStage) parts.push(`mostly ${dominantStage[0]} stage`);
        if (caution.length > 0) parts.push(`${caution.length} on watch`);
        return (
          <div className="px-4 pt-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">AI Summary</p>
            <p className="text-xs text-gray-600 leading-relaxed">{parts.join(". ")}.</p>
          </div>
        );
      })()}

      {/* Plot cards */}
      {plots.length > 0 && (
        <div className="px-4 pt-3">
          <h2 className="text-sm font-bold text-gray-800 mb-2">Your Plots</h2>
          <PlotCardRow />
        </div>
      )}

      {/* Plot bottom sheet */}
      {selectedPlot && (
        <PlotBottomSheet
          plot={selectedPlot}
          onClose={() => store.setSelectedPlot(null)}
          onHarvest={handleHarvest}
        />
      )}
    </div>
  );
}
