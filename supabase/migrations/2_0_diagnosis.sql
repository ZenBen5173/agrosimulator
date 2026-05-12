-- ─────────────────────────────────────────────────────────────────
-- AgroSim 2.0 — Doctor-style diagnosis schema (additive, non-destructive)
--
-- This migration adds new tables for the 2.0 diagnosis pipeline. It does NOT
-- alter or drop any 1.0 table. Apply via:
--   psql $DATABASE_URL -f supabase/migrations/2_0_diagnosis.sql
-- or via Supabase SQL editor.
--
-- All tables use Row-Level Security so a farmer only sees their own data.
-- ─────────────────────────────────────────────────────────────────

-- 2.0 doctor diagnosis sessions (separate from 1.0 diagnosis_sessions)
CREATE TABLE IF NOT EXISTS doctor_diagnosis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  plot_id UUID REFERENCES plots(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Session core
  crop TEXT NOT NULL CHECK (crop IN ('paddy','chilli','kangkung','banana','corn','sweet_potato')),
  pattern TEXT CHECK (pattern IN ('one_plant','few_plants','whole_plot','multiple_crops')),

  -- Photo (URL into supabase storage; we don't store base64 in DB)
  photo_storage_path TEXT,
  photo_quality TEXT CHECK (photo_quality IN ('good','acceptable','poor','unusable')),

  -- LLM observations
  observations TEXT[],

  -- Final result snapshot (JSONB so we can evolve schema)
  candidates JSONB,            -- DifferentialCandidate[]
  history_answers JSONB,       -- {questionId, question, answer}[]
  physical_test JSONB,         -- {test, result}
  result JSONB,                -- DiagnosisResult

  -- Lifecycle
  outcome TEXT CHECK (outcome IN ('confirmed','uncertain','cannot_determine')),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  diagnosis_id TEXT,           -- e.g. 'chilli_anthracnose'
  diagnosis_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalised_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_doctor_sessions_farm ON doctor_diagnosis_sessions(farm_id);
CREATE INDEX IF NOT EXISTS idx_doctor_sessions_plot ON doctor_diagnosis_sessions(plot_id);
CREATE INDEX IF NOT EXISTS idx_doctor_sessions_open
  ON doctor_diagnosis_sessions(farm_id) WHERE closed_at IS NULL;

ALTER TABLE doctor_diagnosis_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctor_sessions_owner_select" ON doctor_diagnosis_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "doctor_sessions_owner_insert" ON doctor_diagnosis_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "doctor_sessions_owner_update" ON doctor_diagnosis_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- Treatment monitoring loop (5-day follow-up: Better/Same/Worse)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctor_treatment_followup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES doctor_diagnosis_sessions(id) ON DELETE CASCADE,
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  scheduled_for DATE NOT NULL,                    -- when to ping the farmer
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('better','same','worse')),
  notes TEXT,

  -- Escalation outcome if worse
  escalated_to TEXT CHECK (escalated_to IN ('doa_lab','mardi_officer','neighbour_vote')),
  escalated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_due
  ON doctor_treatment_followup(scheduled_for) WHERE completed_at IS NULL;

ALTER TABLE doctor_treatment_followup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctor_followup_owner_select" ON doctor_treatment_followup
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "doctor_followup_owner_insert" ON doctor_treatment_followup
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "doctor_followup_owner_update" ON doctor_treatment_followup
  FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- District-level disease aggregate (powers the network early-warning
-- in the Pact layer — anonymised, never identifies individual farms)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS district_disease_aggregate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  district TEXT NOT NULL,
  crop TEXT NOT NULL,
  diagnosis_id TEXT NOT NULL,

  confirmed_count INT NOT NULL DEFAULT 0,
  first_seen_at DATE,
  last_seen_at DATE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(district, crop, diagnosis_id)
);

CREATE INDEX IF NOT EXISTS idx_district_disease_lookup
  ON district_disease_aggregate(district, crop);

-- This table is PUBLIC READ (aggregate only, anonymised) so all farmers can
-- see network signals. Writes happen server-side from confirmed sessions.
ALTER TABLE district_disease_aggregate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "district_aggregate_public_read" ON district_disease_aggregate
  FOR SELECT USING (true);
-- No insert/update policy → server-side only via service role.

-- ─────────────────────────────────────────────────────────────────
-- District-level price benchmark (powers the anonymous price feature
-- in the Pact layer — destroys middleman information asymmetry)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS district_price_aggregate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  district TEXT NOT NULL,
  crop TEXT NOT NULL,
  week_starting DATE NOT NULL,

  median_rm_per_kg NUMERIC(10,2),
  min_rm_per_kg NUMERIC(10,2),
  max_rm_per_kg NUMERIC(10,2),
  sample_count INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(district, crop, week_starting)
);

CREATE INDEX IF NOT EXISTS idx_price_lookup
  ON district_price_aggregate(district, crop, week_starting DESC);

ALTER TABLE district_price_aggregate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "district_price_public_read" ON district_price_aggregate
  FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────
-- Updated_at trigger helper (apply to all 2.0 tables)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_v2()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_district_disease_updated ON district_disease_aggregate;
CREATE TRIGGER trg_district_disease_updated
  BEFORE UPDATE ON district_disease_aggregate
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_v2();

DROP TRIGGER IF EXISTS trg_district_price_updated ON district_price_aggregate;
CREATE TRIGGER trg_district_price_updated
  BEFORE UPDATE ON district_price_aggregate
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_v2();
