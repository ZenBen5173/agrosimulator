import { describe, it, expect } from "vitest";

/**
 * Test weather condition code mapping from OpenWeatherMap to app conditions.
 * Extracted from src/app/api/weather/route.ts
 */
function mapConditionCode(
  code: number,
  temp: number,
  humidity: number,
  rain3h: number
): string {
  if (code >= 200 && code <= 232) return "thunderstorm";
  if (code >= 500 && code <= 531) {
    if (rain3h > 20) return "flood_risk";
    return "rainy";
  }
  if (code >= 300 && code <= 321) return "rainy";
  if (code === 800) {
    if (temp > 35 && humidity < 30) return "drought";
    return "sunny";
  }
  if (code >= 801 && code <= 804) return "overcast";
  return "sunny";
}

describe("mapConditionCode", () => {
  it("maps thunderstorm codes (200-232)", () => {
    expect(mapConditionCode(200, 28, 80, 5)).toBe("thunderstorm");
    expect(mapConditionCode(232, 28, 80, 5)).toBe("thunderstorm");
  });

  it("maps rain codes (500-531) to rainy", () => {
    expect(mapConditionCode(500, 28, 80, 5)).toBe("rainy");
    expect(mapConditionCode(520, 28, 80, 10)).toBe("rainy");
  });

  it("maps heavy rain to flood_risk when rain3h > 20", () => {
    expect(mapConditionCode(502, 28, 80, 25)).toBe("flood_risk");
    expect(mapConditionCode(500, 28, 80, 21)).toBe("flood_risk");
  });

  it("maps drizzle codes (300-321) to rainy", () => {
    expect(mapConditionCode(300, 28, 80, 0)).toBe("rainy");
    expect(mapConditionCode(321, 28, 80, 0)).toBe("rainy");
  });

  it("maps clear sky (800) to sunny", () => {
    expect(mapConditionCode(800, 28, 70, 0)).toBe("sunny");
  });

  it("maps extreme heat + low humidity to drought", () => {
    expect(mapConditionCode(800, 38, 20, 0)).toBe("drought");
    expect(mapConditionCode(800, 36, 25, 0)).toBe("drought");
  });

  it("does NOT map as drought when humidity is normal", () => {
    expect(mapConditionCode(800, 38, 50, 0)).toBe("sunny");
  });

  it("maps cloud codes (801-804) to overcast", () => {
    expect(mapConditionCode(801, 28, 70, 0)).toBe("overcast");
    expect(mapConditionCode(804, 28, 70, 0)).toBe("overcast");
  });

  it("defaults unknown codes to sunny", () => {
    expect(mapConditionCode(999, 28, 70, 0)).toBe("sunny");
    expect(mapConditionCode(700, 28, 70, 0)).toBe("sunny");
  });
});
