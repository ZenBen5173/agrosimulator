import { describe, it, expect } from "vitest";

/**
 * Test the extractPolygonCoords logic used in FarmMapView and FarmRedrawMap.
 * This is the function that handles both Feature and Polygon GeoJSON formats.
 */
function extractPolygonCoords(
  geojson: unknown
): number[][][] | null {
  if (!geojson || typeof geojson !== "object") return null;

  const obj = geojson as Record<string, unknown>;

  if (obj.type === "Polygon" && Array.isArray(obj.coordinates)) {
    return obj.coordinates as number[][][];
  }

  if (obj.type === "Feature" && obj.geometry) {
    const geom = obj.geometry as Record<string, unknown>;
    if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
      return geom.coordinates as number[][][];
    }
  }

  return null;
}

describe("extractPolygonCoords", () => {
  it("extracts coordinates from bare Polygon GeoJSON", () => {
    const polygon = {
      type: "Polygon",
      coordinates: [
        [
          [101.5, 3.0],
          [101.6, 3.0],
          [101.6, 3.1],
          [101.5, 3.1],
          [101.5, 3.0],
        ],
      ],
    };

    const result = extractPolygonCoords(polygon);
    expect(result).not.toBeNull();
    expect(result![0]).toHaveLength(5);
    expect(result![0][0]).toEqual([101.5, 3.0]);
  });

  it("extracts coordinates from Feature wrapping a Polygon", () => {
    const feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [101.5, 3.0],
            [101.6, 3.0],
            [101.6, 3.1],
            [101.5, 3.1],
            [101.5, 3.0],
          ],
        ],
      },
    };

    const result = extractPolygonCoords(feature);
    expect(result).not.toBeNull();
    expect(result![0]).toHaveLength(5);
  });

  it("returns null for null/undefined input", () => {
    expect(extractPolygonCoords(null)).toBeNull();
    expect(extractPolygonCoords(undefined)).toBeNull();
    expect(extractPolygonCoords("")).toBeNull();
  });

  it("returns null for non-polygon GeoJSON", () => {
    const point = { type: "Point", coordinates: [101.5, 3.0] };
    expect(extractPolygonCoords(point)).toBeNull();
  });

  it("returns null for Feature with non-polygon geometry", () => {
    const feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[101.5, 3.0], [101.6, 3.1]] },
    };
    expect(extractPolygonCoords(feature)).toBeNull();
  });
});
