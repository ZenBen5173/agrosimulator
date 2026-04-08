"use client";

import { create } from "zustand";
import type {
  PlotData,
  MarketPrice,
  TaskData,
  AppNotification,
} from "@/types/farm";

interface FarmRow {
  id: string;
  name: string | null;
  area_acres: number;
  grid_size: number;
  soil_type: string | null;
  water_source: string | null;
  polygon_geojson: GeoJSON.Polygon | null;
  bounding_box: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
}

interface WeatherData {
  condition: string;
  temp_celsius: number;
  humidity_pct: number;
  rainfall_mm: number;
  wind_kmh: number;
  forecast: {
    date: string;
    condition: string;
    temp_min: number;
    temp_max: number;
    rain_chance: number;
  }[];
}

interface FarmStore {
  farm: FarmRow | null;
  farms: FarmRow[];
  plots: PlotData[];
  weather: WeatherData | null;
  tasks: TaskData[];
  marketPrices: MarketPrice[];
  selectedPlot: PlotData | null;
  notifications: AppNotification[];
  plotWarnings: Record<string, { warningLevel: string; warningReason: string }>;

  setFarm: (farm: FarmRow) => void;
  setFarms: (farms: FarmRow[]) => void;
  setPlots: (plots: PlotData[]) => void;
  updatePlot: (plotId: string, updates: Partial<PlotData>) => void;
  setWeather: (weather: WeatherData) => void;
  setTasks: (tasks: TaskData[]) => void;
  removeTask: (taskId: string) => void;
  setMarketPrices: (prices: MarketPrice[]) => void;
  setSelectedPlot: (plot: PlotData | null) => void;
  setPlotWarnings: (
    warnings: Record<string, { warningLevel: string; warningReason: string }>
  ) => void;
  addNotification: (n: Omit<AppNotification, "id" | "created_at" | "read">) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useFarmStore = create<FarmStore>((set) => ({
  farm: null,
  farms: [],
  plots: [],
  weather: null,
  tasks: [],
  marketPrices: [],
  selectedPlot: null,
  notifications: [],
  plotWarnings: {},

  setFarm: (farm) => set({ farm }),
  setFarms: (farms) => set({ farms }),
  setPlots: (plots) => set({ plots }),
  updatePlot: (plotId, updates) =>
    set((state) => ({
      plots: state.plots.map((p) =>
        p.id === plotId ? { ...p, ...updates } : p
      ),
      selectedPlot:
        state.selectedPlot?.id === plotId
          ? { ...state.selectedPlot, ...updates }
          : state.selectedPlot,
    })),
  setWeather: (weather) => set({ weather }),
  setTasks: (tasks) => set({ tasks }),
  removeTask: (taskId) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) })),
  setMarketPrices: (marketPrices) => set({ marketPrices }),
  setSelectedPlot: (selectedPlot) => set({ selectedPlot }),
  setPlotWarnings: (plotWarnings) => set({ plotWarnings }),
  addNotification: (n) =>
    set((state) => ({
      notifications: [
        {
          ...n,
          id: crypto.randomUUID(),
          read: false,
          created_at: new Date().toISOString(),
        },
        ...state.notifications,
      ],
    })),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),
  clearNotifications: () => set({ notifications: [] }),
}));
