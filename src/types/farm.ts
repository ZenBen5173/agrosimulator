export interface PlotInfo {
  crop: string;
  colour: string;
  reason: string;
}

export interface GridJson {
  grid: string[][];
  plots: Record<string, PlotInfo>;
}

export interface PlotData {
  id: string;
  label: string;
  crop_name: string;
  growth_stage: string;
  warning_level: string;
  colour_hex: string;
  planted_date: string | null;
  expected_harvest: string | null;
}

export interface MarketPrice {
  item_name: string;
  item_type: string;
  price_per_kg: number;
  unit: string;
  trend: string;
  trend_pct: number;
}

export interface TaskData {
  id: string;
  farm_id: string;
  plot_id: string | null;
  title: string;
  description: string;
  task_type: string;
  priority: string;
  due_date: string;
  completed: boolean;
  completed_at: string | null;
  auto_generated: boolean;
  triggered_by: string | null;
  created_at: string;
  plot_label?: string;
}
