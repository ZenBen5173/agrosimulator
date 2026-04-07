-- AgroSimulator Database Schema
-- Run against a fresh Supabase project

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users,
  full_name text,
  phone text,
  district text,
  state text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  name text,
  district text,
  state text,
  polygon_geojson jsonb,
  bounding_box jsonb,
  area_acres float,
  grid_size int,
  soil_type text,
  water_source text,
  ai_soil_reasoning text,
  onboarding_done boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE plots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) NOT NULL,
  label text,
  crop_name text,
  crop_variety text,
  growth_stage text DEFAULT 'seedling',
  planted_date date,
  expected_harvest date,
  days_since_checked int DEFAULT 0,
  warning_level text DEFAULT 'none',
  warning_reason text,
  risk_score float DEFAULT 0,
  ai_placement_reason text,
  colour_hex text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE grid_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) NOT NULL,
  row int NOT NULL,
  col int NOT NULL,
  is_active boolean DEFAULT true,
  plot_id uuid REFERENCES plots(id)
);

CREATE TABLE plot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id uuid REFERENCES plots(id) NOT NULL,
  farm_id uuid REFERENCES farms(id) NOT NULL,
  event_type text NOT NULL,
  photo_url text,
  gemini_result jsonb,
  disease_name text,
  severity text,
  treatment jsonb,
  weather_at_time jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) NOT NULL,
  plot_id uuid REFERENCES plots(id),
  title text NOT NULL,
  description text,
  task_type text NOT NULL,
  priority text DEFAULT 'normal',
  due_date date,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  auto_generated boolean DEFAULT false,
  triggered_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE weather_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  condition text,
  temp_celsius float,
  humidity_pct float,
  rainfall_mm float,
  wind_kmh float,
  forecast_json jsonb
);

CREATE TABLE market_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  item_type text NOT NULL,
  price_per_kg float,
  unit text DEFAULT 'kg',
  trend text DEFAULT 'stable',
  trend_pct float DEFAULT 0,
  source text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE onboarding_ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) NOT NULL,
  suggested_soil text,
  soil_reasoning text,
  suggested_water text,
  water_reasoning text,
  plot_layout_json jsonb,
  farmer_confirmed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE expert_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_event_id uuid REFERENCES plot_events(id),
  plot_id uuid REFERENCES plots(id) NOT NULL,
  case_package_json jsonb,
  expert_contact text,
  status text DEFAULT 'pending',
  expert_response text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE planting_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id uuid REFERENCES plots(id) NOT NULL,
  farm_id uuid REFERENCES farms(id) NOT NULL,
  crop text NOT NULL,
  plan_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile only" ON profiles FOR ALL USING (id = auth.uid());

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farm owner only" ON farms FOR ALL USING (user_id = auth.uid());

ALTER TABLE plots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farm owner only" ON plots FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

ALTER TABLE grid_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farm owner only" ON grid_cells FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

ALTER TABLE plot_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farm owner only" ON plot_events FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farm owner only" ON tasks FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

ALTER TABLE weather_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farm owner only" ON weather_snapshots FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON market_prices FOR SELECT USING (true);

ALTER TABLE onboarding_ai_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farm owner only" ON onboarding_ai_suggestions FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

ALTER TABLE expert_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farm owner only" ON expert_referrals FOR ALL
  USING (plot_id IN (
    SELECT p.id FROM plots p
    JOIN farms f ON p.farm_id = f.id
    WHERE f.user_id = auth.uid()
  ));

ALTER TABLE planting_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farm owner only" ON planting_plans FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

-- ============================================================
-- STORAGE
-- ============================================================
-- Create a private bucket called 'crop-photos' in Supabase Dashboard
-- Storage > New Bucket > Name: crop-photos > Private
