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
  photo_url?: string | null;
}

export interface MarketPrice {
  item_name: string;
  item_type: string;
  price_per_kg: number;
  unit: string;
  trend: string;
  trend_pct: number;
  updated_at?: string;
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

export interface ChatThread {
  id: string;
  farm_id: string;
  title: string;
  last_message: string | null;
  last_message_at: string;
  is_active: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  farm_id: string;
  thread_id?: string | null;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface FinancialRecord {
  id: string;
  farm_id: string;
  plot_id: string | null;
  record_type: "expense" | "income";
  category: string;
  amount: number;
  description: string | null;
  record_date: string;
  created_at: string;
}

export interface ActivityItem {
  id: string;
  farm_id: string;
  plot_id: string | null;
  event_type: string;
  title: string;
  description: string | null;
  photo_url: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: "weather" | "harvest" | "risk" | "task" | "info";
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}
