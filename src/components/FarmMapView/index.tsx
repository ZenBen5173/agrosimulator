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
  boundingBox: { north: number; south: number; east: number; west: number };
  plots?: PlotOverlay[];
  onPlotClick?: (plotLabel: string) => void;
  className?: string;
}

export default function FarmMapView({
  polygonGeoJson,
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
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: true,
    });

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
        color: "#22c55e",
        weight: 3,
        fillColor: "#22c55e",
        fillOpacity: 0.08,
        dashArray: "8, 4",
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
        color: "#22c55e",
        weight: 3,
        fillColor: "#22c55e",
        fillOpacity: 0.1,
        dashArray: "8, 4",
      }).addTo(map);
    }

    // Add plot markers if available
    if (plots && plots.length > 0 && polyCoords) {
      const ring = polyCoords[0];

      // Calculate polygon centroid for plot distribution
      const centerLat = (boundingBox.north + boundingBox.south) / 2;
      const centerLng = (boundingBox.east + boundingBox.west) / 2;
      const latSpan = boundingBox.north - boundingBox.south;
      const lngSpan = boundingBox.east - boundingBox.west;

      // Distribute plot markers within the polygon
      const n = plots.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);

      plots.forEach((plot, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;

        // Position within bounding box (with padding)
        const lat =
          boundingBox.south +
          latSpan * 0.15 +
          ((row + 0.5) / rows) * latSpan * 0.7;
        const lng =
          boundingBox.west +
          lngSpan * 0.15 +
          ((col + 0.5) / cols) * lngSpan * 0.7;

        // Plot circle marker
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

        // Label
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
  }, [polygonGeoJson, boundingBox, plots]);

  return (
    <>
      <style jsx global>{`
        .plot-label-icon {
          background: none !important;
          border: none !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className={className}
        style={{ width: "100%", height: "100%" }}
      />
    </>
  );
}
