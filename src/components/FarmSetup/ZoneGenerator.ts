/**
 * ZoneGenerator — Auto-detect farm zones from drawn features
 *
 * Algorithm:
 * 1. Merge all parcel polygons into a single farm boundary (union)
 * 2. Buffer & subtract infrastructure points (buildings take up space)
 * 3. If water features (lines) exist, use them as dividers to split the farm
 * 4. Subtract road buffers (roads are not plantable)
 * 5. Merge tiny slivers into adjacent zones
 * 6. Assign labels (A, B, C...) and colours
 */

import {
  polygon as turfPolygon,
  featureCollection,
  point as turfPoint,
} from "@turf/helpers";
import type { Feature, Polygon, MultiPolygon, GeoJsonProperties } from "geojson";
import area from "@turf/area";
import centerOfMass from "@turf/center-of-mass";
import buffer from "@turf/buffer";
import difference from "@turf/difference";
import union from "@turf/union";
import type { Parcel, DrawnFeature, FarmZone } from "./useOnboardingStore";

type PolyFeature = Feature<Polygon | MultiPolygon, GeoJsonProperties>;

const ZONE_COLOURS = [
  "#4ade80", // green
  "#f87171", // red
  "#60a5fa", // blue
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#34d399", // emerald
  "#fb923c", // orange
  "#f472b6", // pink
  "#38bdf8", // sky
  "#a3e635", // lime
];

const SUGGESTED_CROPS = [
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
];

// Minimum zone area in sq meters — anything smaller gets merged
const MIN_ZONE_AREA_SQM = 50;

// Buffer radius for infrastructure/roads in meters
const INFRA_BUFFER_M = 5;
const ROAD_BUFFER_M = 3;

export function generateZones(
  parcels: Parcel[],
  waterFeatures: DrawnFeature[],
  roadFeatures: DrawnFeature[],
  infrastructure: DrawnFeature[]
): FarmZone[] {
  if (parcels.length === 0) return [];

  // Step 1: Merge all parcels into one farm polygon
  let farmPoly: PolyFeature = parcelToTurf(parcels[0]);
  for (let i = 1; i < parcels.length; i++) {
    const next = parcelToTurf(parcels[i]);
    const fc = featureCollection([farmPoly, next]) as GeoJSON.FeatureCollection<Polygon | MultiPolygon>;
    const merged = union(fc);
    if (merged) farmPoly = merged;
  }

  // Step 2: Subtract infrastructure buffers
  for (const infra of infrastructure) {
    if (infra.geojson.type === "Point") {
      const coords = infra.geojson.coordinates as [number, number];
      const pt = turfPoint(coords);
      const buf = buffer(pt, INFRA_BUFFER_M, { units: "meters" });
      if (buf) {
        const fc = featureCollection([farmPoly, buf as PolyFeature]) as GeoJSON.FeatureCollection<Polygon | MultiPolygon>;
        const diff = difference(fc);
        if (diff) farmPoly = diff;
      }
    }
  }

  // Step 3: Subtract road buffers
  for (const road of roadFeatures) {
    if (road.geojson.type === "LineString") {
      const lineFeature: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: road.geojson as GeoJSON.LineString,
      };
      const buf = buffer(lineFeature, ROAD_BUFFER_M, { units: "meters" });
      if (buf) {
        const fc = featureCollection([farmPoly, buf as PolyFeature]) as GeoJSON.FeatureCollection<Polygon | MultiPolygon>;
        const diff = difference(fc);
        if (diff) farmPoly = diff;
      }
    }
  }

  // Step 4: Split farm by water lines
  const waterLines = waterFeatures.filter(
    (f) => f.geojson.type === "LineString"
  );

  let zones: FarmZone[];

  if (waterLines.length > 0) {
    zones = splitByWaterLines(farmPoly, waterLines);
  } else {
    // No water lines — entire farm is one zone
    const areaM2 = area(farmPoly);
    zones = [
      {
        id: `zone-0`,
        label: "A",
        geojson: extractPolygon(farmPoly),
        areaSqm: areaM2,
        suggestedCrop: SUGGESTED_CROPS[0],
        cropOverride: null,
        colour: ZONE_COLOURS[0],
      },
    ];
  }

  // Step 5: Filter out tiny slivers
  zones = zones.filter((z) => z.areaSqm >= MIN_ZONE_AREA_SQM);

  // Re-label after filtering
  zones = zones.map((z, i) => ({
    ...z,
    label: String.fromCharCode(65 + i), // A, B, C...
    colour: ZONE_COLOURS[i % ZONE_COLOURS.length],
    suggestedCrop: SUGGESTED_CROPS[i % SUGGESTED_CROPS.length],
  }));

  return zones;
}

/**
 * Split the farm polygon by water lines:
 * Buffer each water line thinly and subtract from farm polygon.
 * The remaining disconnected pieces become zones.
 */
function splitByWaterLines(
  farmPoly: PolyFeature,
  waterLines: DrawnFeature[]
): FarmZone[] {
  let remaining: PolyFeature = farmPoly;

  for (const wl of waterLines) {
    const lineFeature: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: wl.geojson as GeoJSON.LineString,
    };
    // Thin buffer along water line acts as a "cut"
    const cutBuf = buffer(lineFeature, 1, { units: "meters" });
    if (cutBuf) {
      const fc = featureCollection([remaining, cutBuf as PolyFeature]) as GeoJSON.FeatureCollection<Polygon | MultiPolygon>;
      const diff = difference(fc);
      if (diff) remaining = diff;
    }
  }

  // After subtracting water line buffers, we may have a MultiPolygon
  const resultGeom = remaining.geometry;
  const zones: FarmZone[] = [];

  if (resultGeom.type === "MultiPolygon") {
    for (let i = 0; i < resultGeom.coordinates.length; i++) {
      const polyCoords = resultGeom.coordinates[i];
      const poly = turfPolygon(polyCoords);
      const areaM2 = area(poly);

      zones.push({
        id: `zone-${i}`,
        label: String.fromCharCode(65 + i),
        geojson: { type: "Polygon", coordinates: polyCoords },
        areaSqm: areaM2,
        suggestedCrop: SUGGESTED_CROPS[i % SUGGESTED_CROPS.length],
        cropOverride: null,
        colour: ZONE_COLOURS[i % ZONE_COLOURS.length],
      });
    }
  } else if (resultGeom.type === "Polygon") {
    const areaM2 = area(remaining);
    zones.push({
      id: `zone-0`,
      label: "A",
      geojson: resultGeom,
      areaSqm: areaM2,
      suggestedCrop: SUGGESTED_CROPS[0],
      cropOverride: null,
      colour: ZONE_COLOURS[0],
    });
  }

  return zones;
}

/** Convert Parcel to turf Feature */
function parcelToTurf(parcel: Parcel): Feature<Polygon, GeoJsonProperties> {
  return {
    type: "Feature",
    properties: {},
    geometry: parcel.geojson,
  };
}

/** Extract a Polygon geometry from a Feature (handles Polygon or MultiPolygon) */
function extractPolygon(feature: PolyFeature): GeoJSON.Polygon {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry;
  }
  if (feature.geometry.type === "MultiPolygon") {
    // Return the largest polygon
    const mp = feature.geometry;
    let largest = mp.coordinates[0];
    let largestArea = 0;
    for (const coords of mp.coordinates) {
      const poly = turfPolygon(coords);
      const a = area(poly);
      if (a > largestArea) {
        largestArea = a;
        largest = coords;
      }
    }
    return { type: "Polygon", coordinates: largest };
  }
  // Fallback — should not happen with our types
  return (feature.geometry as unknown) as GeoJSON.Polygon;
}

/** Get center point of a zone for label placement */
export function getZoneCenter(geojson: GeoJSON.Polygon): [number, number] {
  const feature: Feature<Polygon, GeoJsonProperties> = {
    type: "Feature",
    properties: {},
    geometry: geojson,
  };
  const center = centerOfMass(feature);
  return center.geometry.coordinates as [number, number];
}
