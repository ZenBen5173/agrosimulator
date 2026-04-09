"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const ESRI_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

interface PlotOverlay {
  label: string;
  crop: string;
  colour: string;
  growthStage?: string;
  warningLevel?: string;
}

interface ZoneOverlay {
  label: string;
  crop: string;
  colour: string;
  polygon: GeoJSON.Polygon;
  warningLevel?: string;
}

const CROP_EMOJI: Record<string, string> = {
  paddy: "🌾",
  rice: "🌾",
  padi: "🌾",
  chilli: "🌶️",
  chili: "🌶️",
  corn: "🌽",
  maize: "🌽",
  tomato: "🍅",
  cucumber: "🥒",
  eggplant: "🍆",
  lettuce: "🥬",
  kangkung: "🥬",
  spinach: "🥬",
  watermelon: "🍉",
  banana: "🍌",
  coconut: "🥥",
  "oil palm": "🌴",
  rubber: "🌳",
  durian: "🌳",
  papaya: "🍈",
  pineapple: "🍍",
  sugarcane: "🎋",
  cassava: "🥔",
  "sweet potato": "🍠",
};

function getCropEmoji(crop: string): string {
  const lower = crop.toLowerCase();
  for (const [key, emoji] of Object.entries(CROP_EMOJI)) {
    if (lower.includes(key)) return emoji;
  }
  return "🌱";
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

interface FarmMapViewProps {
  polygonGeoJson?: GeoJSON.Polygon | unknown;
  /** Additional parcel polygons (from farm_features) */
  extraPolygons?: GeoJSON.Polygon[];
  /** Zone polygons with crop info — renders colored fills + crop icons */
  zones?: ZoneOverlay[];
  boundingBox: { north: number; south: number; east: number; west: number };
  plots?: PlotOverlay[];
  onPlotClick?: (plotLabel: string) => void;
  className?: string;
}

export default function FarmMapView({
  polygonGeoJson,
  extraPolygons,
  zones,
  boundingBox,
  plots,
  onPlotClick,
  className,
}: FarmMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const onPlotClickRef = useRef(onPlotClick);
  onPlotClickRef.current = onPlotClick;

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // Satellite imagery
    L.tileLayer(ESRI_TILES, {
      maxZoom: 19,
    }).addTo(map);

    // Light label overlay for roads/places
    L.tileLayer(ESRI_LABELS, {
      maxZoom: 19,
      opacity: 0.6,
    }).addTo(map);

    // Fit to farm bounding box
    const bounds = L.latLngBounds(
      [boundingBox.south, boundingBox.west],
      [boundingBox.north, boundingBox.east]
    );
    map.fitBounds(bounds.pad(0.15));

    // Draw the farm boundary — handle both Feature and Polygon GeoJSON
    const polyCoords = extractPolygonCoords(polygonGeoJson);
    if (polyCoords && polyCoords[0] && polyCoords[0].length > 0) {
      // GeoJSON coordinates are [lng, lat], Leaflet wants [lat, lng]
      const coords = polyCoords[0].map(
        (c) => [c[1], c[0]] as L.LatLngTuple
      );

      // Farm boundary outline
      L.polygon(coords, {
        color: "#16a34a",
        weight: 3,
        fillColor: "#16a34a",
        fillOpacity: 0.05,
        dashArray: "6, 3",
      }).addTo(map);

      // Inner highlight — slightly brighter fill
      L.polygon(coords, {
        color: "transparent",
        weight: 0,
        fillColor: "#bbf7d0",
        fillOpacity: 0.12,
      }).addTo(map);
    } else {
      // No polygon — draw bounding box rectangle as fallback
      const bbCoords: L.LatLngTuple[] = [
        [boundingBox.south, boundingBox.west],
        [boundingBox.south, boundingBox.east],
        [boundingBox.north, boundingBox.east],
        [boundingBox.north, boundingBox.west],
      ];

      L.polygon(bbCoords, {
        color: "#16a34a",
        weight: 3,
        fillColor: "#16a34a",
        fillOpacity: 0.05,
        dashArray: "6, 3",
      }).addTo(map);
    }

    // Draw extra parcel polygons
    if (extraPolygons) {
      for (const ep of extraPolygons) {
        const epCoords = ep.coordinates[0]?.map(
          (c) => [c[1], c[0]] as L.LatLngTuple
        );
        if (epCoords && epCoords.length > 0) {
          L.polygon(epCoords, {
            color: "#16a34a",
            weight: 3,
            fillColor: "#16a34a",
            fillOpacity: 0.05,
            dashArray: "6, 3",
          }).addTo(map);
        }
      }
    }

    // Draw zone polygons with color fills + crop icons
    if (zones && zones.length > 0) {
      const labelLayer = L.layerGroup();
      const LABEL_ZOOM_THRESHOLD = map.getZoom();

      zones.forEach((zone) => {
        const zCoords = zone.polygon.coordinates[0]?.map(
          (c) => [c[1], c[0]] as L.LatLngTuple
        );
        if (!zCoords || zCoords.length === 0) return;

        const warningBorder =
          zone.warningLevel === "red"
            ? "#ef4444"
            : zone.warningLevel === "orange"
              ? "#f97316"
              : zone.warningLevel === "yellow"
                ? "#eab308"
                : zone.colour;

        const hasWarning = zone.warningLevel && zone.warningLevel !== "none";

        // Colored zone polygon — always visible
        const zonePoly = L.polygon(zCoords, {
          color: warningBorder,
          weight: hasWarning ? 3 : 2.5,
          fillColor: zone.colour,
          fillOpacity: 0.25,
          opacity: 0.9,
          dashArray: "",
        }).addTo(map);

        zonePoly.on("click", () => {
          onPlotClickRef.current?.(zone.label);
        });

        // Use polygon's visual center
        const center = zonePoly.getBounds().getCenter();

        const emoji = getCropEmoji(zone.crop);

        // Detailed label — only shown when zoomed in
        const detailIcon = L.divIcon({
          className: "zone-label-icon",
          html: `<div style="
            display: flex;
            align-items: center;
            gap: 4px;
            background: white;
            padding: 4px 10px 4px 6px;
            border-radius: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            pointer-events: none;
            border: 2px solid ${zone.colour};
          ">
            <span style="font-size: 16px;">${emoji}</span>
            <span style="
              font-size: 11px;
              font-weight: 700;
              color: #1f2937;
              white-space: nowrap;
              letter-spacing: 0.01em;
            ">${zone.label} · ${zone.crop}</span>
          </div>`,
          iconSize: [100, 30],
          iconAnchor: [50, 15],
        });

        L.marker(center, { icon: detailIcon, interactive: true })
          .addTo(labelLayer)
          .on("click", () => {
            onPlotClickRef.current?.(zone.label);
          });
      });

      // Toggle label layer based on zoom
      function updateLabels() {
        if (map.getZoom() >= LABEL_ZOOM_THRESHOLD) {
          if (!map.hasLayer(labelLayer)) labelLayer.addTo(map);
        } else {
          if (map.hasLayer(labelLayer)) labelLayer.removeFrom(map);
        }
      }

      map.on("zoomend", updateLabels);
      // Initial check
      updateLabels();
    } else if (plots && plots.length > 0 && polyCoords) {
      // Fallback: old-style circle markers when no zone polygons available
      const latSpan = boundingBox.north - boundingBox.south;
      const lngSpan = boundingBox.east - boundingBox.west;

      const n = plots.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);

      plots.forEach((plot, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;

        const lat =
          boundingBox.south +
          latSpan * 0.15 +
          ((row + 0.5) / rows) * latSpan * 0.7;
        const lng =
          boundingBox.west +
          lngSpan * 0.15 +
          ((col + 0.5) / cols) * lngSpan * 0.7;

        const warningColor =
          plot.warningLevel === "red"
            ? "#ef4444"
            : plot.warningLevel === "orange"
              ? "#f97316"
              : plot.warningLevel === "yellow"
                ? "#eab308"
                : plot.colour;

        const marker = L.circleMarker([lat, lng], {
          radius: 14,
          fillColor: plot.colour,
          fillOpacity: 0.75,
          color: warningColor,
          weight: plot.warningLevel && plot.warningLevel !== "none" ? 3 : 2,
          opacity: 0.9,
        }).addTo(map);

        const icon = L.divIcon({
          className: "plot-label-icon",
          html: `<div style="
            font-size: 10px;
            font-weight: 700;
            color: white;
            text-shadow: 0 1px 3px rgba(0,0,0,0.7);
            text-align: center;
            line-height: 1.1;
            pointer-events: none;
          ">
            <div>${plot.label}</div>
            <div style="font-size: 8px; font-weight: 400; opacity: 0.9;">${plot.crop}</div>
          </div>`,
          iconSize: [50, 24],
          iconAnchor: [25, 12],
        });

        L.marker([lat, lng], { icon, interactive: true })
          .addTo(map)
          .on("click", () => {
            onPlotClickRef.current?.(plot.label);
          });

        marker.on("click", () => {
          onPlotClickRef.current?.(plot.label);
        });
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [polygonGeoJson, boundingBox, plots, zones]);

  return (
    <>
      <style jsx global>{`
        .plot-label-icon,
        .zone-label-icon {
          background: none !important;
          border: none !important;
        }
      `}</style>
      <div
        ref={containerRef}
        role="region"
        aria-label="Farm map showing plots and zones"
        className={className}
        style={{ width: "100%", height: "100%" }}
      />
    </>
  );
}
