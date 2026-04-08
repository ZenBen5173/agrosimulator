"use client";

import { create } from "zustand";

export type FeatureType =
  | "canal"
  | "bund"
  | "well"
  | "pond"
  | "stream"
  | "road"
  | "path"
  | "greenhouse"
  | "shelter"
  | "storage"
  | "house";

export interface DrawnFeature {
  id: string;
  type: FeatureType;
  geojson: GeoJSON.Geometry;
  label?: string;
}

export interface Parcel {
  id: string;
  geojson: GeoJSON.Polygon;
  areaAcres: number;
}

export interface FarmZone {
  id: string;
  label: string;
  geojson: GeoJSON.Polygon;
  areaSqm: number;
  suggestedCrop: string;
  cropOverride: string | null;
  colour: string;
}

export type TerrainType = "flat" | "sloped" | "terraced";

interface OnboardingState {
  currentStep: number;

  // Step 1
  parcels: Parcel[];

  // Step 2
  waterFeatures: DrawnFeature[];

  // Step 3
  roadFeatures: DrawnFeature[];

  // Step 4
  terrainType: TerrainType;

  // Step 5
  infrastructure: DrawnFeature[];

  // Step 6
  zones: FarmZone[];

  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;

  addParcel: (p: Parcel) => void;
  removeParcel: (id: string) => void;

  addWaterFeature: (f: DrawnFeature) => void;
  removeWaterFeature: (id: string) => void;

  addRoadFeature: (f: DrawnFeature) => void;
  removeRoadFeature: (id: string) => void;

  setTerrainType: (t: TerrainType) => void;

  addInfrastructure: (f: DrawnFeature) => void;
  removeInfrastructure: (id: string) => void;

  setZones: (zones: FarmZone[]) => void;
  updateZoneCrop: (zoneId: string, crop: string) => void;

  /** Load existing farm data for edit mode */
  loadExisting: (data: {
    parcels: Parcel[];
    waterFeatures: DrawnFeature[];
    roadFeatures: DrawnFeature[];
    terrainType: TerrainType;
    infrastructure: DrawnFeature[];
  }) => void;

  reset: () => void;
}

const TOTAL_STEPS = 6;

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currentStep: 0,
  parcels: [],
  waterFeatures: [],
  roadFeatures: [],
  terrainType: "flat",
  infrastructure: [],
  zones: [],

  setStep: (step) => set({ currentStep: Math.max(0, Math.min(step, TOTAL_STEPS - 1)) }),
  nextStep: () =>
    set((s) => ({ currentStep: Math.min(s.currentStep + 1, TOTAL_STEPS - 1) })),
  prevStep: () =>
    set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),

  addParcel: (p) => set((s) => ({ parcels: [...s.parcels, p] })),
  removeParcel: (id) =>
    set((s) => ({ parcels: s.parcels.filter((p) => p.id !== id) })),

  addWaterFeature: (f) =>
    set((s) => ({ waterFeatures: [...s.waterFeatures, f] })),
  removeWaterFeature: (id) =>
    set((s) => ({ waterFeatures: s.waterFeatures.filter((f) => f.id !== id) })),

  addRoadFeature: (f) =>
    set((s) => ({ roadFeatures: [...s.roadFeatures, f] })),
  removeRoadFeature: (id) =>
    set((s) => ({ roadFeatures: s.roadFeatures.filter((f) => f.id !== id) })),

  setTerrainType: (t) => set({ terrainType: t }),

  addInfrastructure: (f) =>
    set((s) => ({ infrastructure: [...s.infrastructure, f] })),
  removeInfrastructure: (id) =>
    set((s) => ({ infrastructure: s.infrastructure.filter((f) => f.id !== id) })),

  loadExisting: (data) =>
    set({
      parcels: data.parcels,
      waterFeatures: data.waterFeatures,
      roadFeatures: data.roadFeatures,
      terrainType: data.terrainType,
      infrastructure: data.infrastructure,
      currentStep: 0,
      zones: [],
    }),

  setZones: (zones) => set({ zones }),
  updateZoneCrop: (zoneId, crop) =>
    set((s) => ({
      zones: s.zones.map((z) =>
        z.id === zoneId ? { ...z, cropOverride: crop } : z
      ),
    })),

  reset: () =>
    set({
      currentStep: 0,
      parcels: [],
      waterFeatures: [],
      roadFeatures: [],
      terrainType: "flat",
      infrastructure: [],
      zones: [],
    }),
}));

export { TOTAL_STEPS };
