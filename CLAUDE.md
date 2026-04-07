> This page is the single source of truth for [CLAUDE.md](http://claude.md/). It is synced into the project root automatically via `node scripts/sync-claude-md.js`. Do not edit [CLAUDE.md](http://claude.md/) directly — edit this page instead.
---
## What This Is
AgroSimulator is an AI-powered isometric farm simulator for Malaysian smallholder farmers. Built for Project 2030: MyAI Future Hackathon — Track 1: Padi & Plates (Agrotech & Food Security). Submission deadline: 21 April 2026, 11:59 PM. No extensions.
## Build Rule
One stage at a time. Test fully before moving to the next stage. Never stack features on unverified foundations. Build empty frame first, then add progressively.
## Stack
- Frontend: Next.js (App Router, TypeScript, Tailwind CSS)
- Database: Supabase (PostgreSQL + Auth + Storage + RLS)
- Deployment: Vercel
- AI: Gemini 2.0 Flash Lite (default — 30 RPM free tier) + Gemini 2.0 Flash (disease detection only — accuracy critical)
- Farm Map: Leaflet.js + Leaflet Draw + Esri World Imagery tiles (fully free, no API key, no credit card)
- Farm Renderer: PixiJS (isometric 2.5D, WebGL)
- Weather: OpenWeatherMap API (free tier)
- AI Orchestration: Firebase Genkit (for F3 Smart Suggestions)
## Folder Structure
```javascript
/app                    → Next.js App Router pages
/components
  /FarmCanvas
    index.tsx           → React wrapper for PixiJS, manages mount/unmount
    renderer.ts         → All PixiJS logic, no React
    weatherEffects.ts   → Weather overlay effects
    tileSprites.ts      → Sprite loading, maps growth stage to sprite
    gridGenerator.ts    → Converts AI grid JSON to isometric tile positions
/lib                    → Supabase client, utility functions
/hooks                  → React hooks
/types                  → TypeScript types
/services
  /ai                   → Gemini API calls
  /weather              → OpenWeatherMap integration
  /map                  → Mapbox helpers
/stores                 → State management
/utils                  → General utilities
/scripts
  sync-claude-md.js     → Fetches this Notion page and writes CLAUDE.md
```
## Environment Variables Required
```javascript
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_MAPBOX_TOKEN
NEXT_PUBLIC_OPENWEATHER_API_KEY
GEMINI_API_KEY              ← server-side only, never expose to client
NOTION_API_KEY              ← for sync-claude-md.js script only
NOTION_CLAUDE_MD_PAGE_ID    ← ID of this Notion page
```
**Key Rule:** Gemini calls go through Next.js API routes only. Never call Gemini from the client side.
## MVP Features (in build order)
- F1: AI Planting Planner — Gemini + OpenWeatherMap → crop recommendation + planting calendar
- F2: AI Disease Detection — Gemini 2.0 Flash Vision → multi-turn diagnosis with confidence threshold
- F3: Smart Suggestions Engine — Firebase Genkit agentic flow → daily weather-aware task list
## Database Tables (Supabase PostgreSQL)
### profiles
```javascript
id uuid PK references auth.users
full_name text
phone text
district text
state text
created_at timestamptz
```
### farms
```javascript
id uuid PK
user_id uuid FK → profiles.id
name text
district text
state text
polygon_geojson jsonb        -- raw Mapbox drawn polygon
bounding_box jsonb           -- { north, south, east, west }
area_acres float
grid_size int                -- e.g. 8 means 8x8 grid
soil_type text
water_source text            -- rain-fed / irrigated / both
ai_soil_reasoning text
onboarding_done boolean
created_at timestamptz
```
### grid_cells
```javascript
id uuid PK
farm_id uuid FK → farms.id
row int
col int
is_active boolean            -- true = inside polygon
plot_id uuid FK → plots.id   -- null if outside or unassigned
```
### plots
```javascript
id uuid PK
farm_id uuid FK → farms.id
label text                   -- "A1", "B2" etc
crop_name text
crop_variety text
growth_stage text            -- seedling / growing / mature / harvest_ready / harvested
planted_date date
expected_harvest date
days_since_checked int
warning_level text           -- none / yellow / orange / red
warning_reason text
risk_score float             -- 0.0 to 1.0, recalculated by Gemini on app open
ai_placement_reason text
colour_hex text
is_active boolean
created_at timestamptz
updated_at timestamptz
```
### plot_events
```javascript
id uuid PK
plot_id uuid FK → plots.id
farm_id uuid FK → farms.id
event_type text              -- inspection_clean / inspection_disease /
                             -- inspection_suspicious / inspection_referred /
                             -- treatment_applied / watered / fertilized /
                             -- harvested / replanted / weather_stress / ai_risk_recalc
photo_url text
gemini_result jsonb
disease_name text
severity text                -- mild / moderate / severe
treatment jsonb
weather_at_time jsonb
notes text
created_at timestamptz
```
### tasks
```javascript
id uuid PK
farm_id uuid FK → farms.id
plot_id uuid FK → plots.id   -- null if farm-wide
title text
description text
task_type text               -- inspection / watering / fertilizing /
                             -- treatment / harvesting / replanting / farm_wide
priority text                -- urgent / normal / low
due_date date
completed boolean
completed_at timestamptz
auto_generated boolean
triggered_by text            -- weather / inspection_result / growth_stage / schedule
created_at timestamptz
```
### weather_snapshots
```javascript
id uuid PK
farm_id uuid FK → farms.id
fetched_at timestamptz
condition text               -- sunny / rainy / thunderstorm / drought / overcast / flood_risk
temp_celsius float
humidity_pct float
rainfall_mm float
wind_kmh float
forecast_json jsonb
```
### market_prices
```javascript
id uuid PK
item_name text
item_type text               -- crop / fertilizer / pesticide
price_per_kg float
unit text
trend text                   -- up / down / stable
trend_pct float
source text
updated_at timestamptz
```
### onboarding_ai_suggestions
```javascript
id uuid PK
farm_id uuid FK → farms.id
suggested_soil text
soil_reasoning text
suggested_water text
water_reasoning text
plot_layout_json jsonb
farmer_confirmed_at timestamptz
created_at timestamptz
```
### expert_referrals
```javascript
id uuid PK
plot_event_id uuid FK → plot_events.id
plot_id uuid FK → plots.id
case_package_json jsonb
expert_contact text
status text                  -- pending / responded / resolved
expert_response text
resolved_at timestamptz
created_at timestamptz
```
## RLS Policy Pattern
Apply to every table. Users can only access their own farm's data:
```sql
CREATE POLICY "farm owner only" ON [table] FOR ALL
USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));
-- For profiles: USING (id = auth.uid());
```
## Isometric Grid System
Projection math:
```javascript
screen_x = (col - row) * (tileWidth / 2)
screen_y = (col + row) * (tileHeight / 4)
```
Grid size by farm area:
```javascript
< 1 acre  → 4x4  (16 cells)
1–2 acres → 6x6  (36 cells)
2–4 acres → 8x8  (64 cells)
> 4 acres → 10x10 (100 cells)
```
Cells outside drawn polygon → is_active = false → rendered greyed out.
## AI Plot Layout — Gemini Output Format
```json
{
  "grid": [["A1","A1","B1","out"],["A1","A1","B1","B1"]],
  "plots": {
    "A1": { "crop": "Paddy", "colour": "#4ADE80", "reason": "..." },
    "B1": { "crop": "Chilli", "colour": "#F87171", "reason": "..." }
  }
}
```
## Disease Detection — Confidence Rules
- Threshold to commit to diagnosis: **0.85**
- 0.60–0.84: show best assessment with explicit uncertainty, auto-create expert verification task
- Below 0.60: no diagnosis, no treatment, route to expert referral
- Max 5 follow-up questions before escalating to expert
- Gemini system instruction must include: only diagnose Malaysian crops, return valid JSON only, never guess below threshold
## Weather States → PixiJS Effects
```javascript
sunny        → bright palette, sun sprite top corner
overcast     → semi-transparent grey overlay drifting
rainy        → ParticleContainer 200–400 rain particles, wet soil tiles
thunderstorm → dark overlay + rain + setTimeout white flash
drought      → ColorMatrixFilter orange tint + cracked soil texture
flood_risk   → water shimmer animation on low-elevation tiles
```
## Crop Tile Sprite States
```javascript
seedling / growing / mature / harvest_ready / harvested / diseased
```
## Warning Levels on Tiles
```javascript
yellow → small pulsing dot (routine check, days threshold exceeded)
orange → animated warning badge (high risk conditions)
red    → wilted sprite + red tile tint (active confirmed disease)
```
Pulse animation: PixiJS Ticker, scale oscillates 0.9→1.1 on sine wave.
## Performance Targets (low-end Android)
- Cap rain particles at 300
- Use ParticleContainer not Container for weather
- Single sprite sheet texture atlas
- Disable weather animations if navigator.hardwareConcurrency <= 2
- Target 30fps: app.ticker.maxFPS = 30
## Build Stages
```javascript
Stage 0  ✅ DONE  — Next.js scaffold, Vercel live, env vars
Stage 1  ✅ DONE  — Database schema (all 10 tables + RLS)
Stage 2  ✅ DONE  — Auth (OTP phone sign-in)
Stage 3  ✅ DONE  — Leaflet farm drawing (Screen 1.2)
Stage 4  ✅ DONE  — AI farm research: soil + water (Screens 1.3 + 1.4)
Stage 5  ✅ DONE  — AI plot layout + first PixiJS render (Screens 1.5 + 1.6)
Stage 6  ✅ DONE  — Home screen shell: 70/30 layout + swipe drawer
Stage 7  ✅ DONE  — Weather + animations + crop sprites
Stage 8  ✅ DONE  — F3: Smart Suggestions to-do list
Stage 9  ✅ DONE  — Warning icons + risk scoring
Stage 10 ✅ DONE  — F2: Disease detection full flow (Screens 3.1–3.6)
Stage 11 ✅ DONE  — F1: Planting planner
Stage 12 🔄 NEXT  — Polish + submission (deadline 21 Apr 11:59 PM)
```
## Screen Inventory
```javascript
Onboarding: 1.1 Welcome / 1.2 Map Draw / 1.3 AI Loading /
            1.4 Review Details / 1.4a Soil Guide /
            1.5 Plot Layout / 1.6 Confirm
Home:       2.1 Main (farm + drawer) / 2.2 Plot Bottom Sheet
Inspection: 3.1 Briefing / 3.2 Photo Capture / 3.3 Analysing /
            3.4 Follow-up Questions / 3.5 Diagnosis Result /
            3.6 Expert Referral
Farm Mgmt:  4.1 Farm Overview / 4.2 Plot Detail / 4.3 Farm History
Settings:   5.1 Profile / 5.2 App Settings
```
## Coding Rules
- Never commit secrets or .env.local
- All Gemini API calls server-side only (Next.js API routes)
- Supabase RLS enabled on every table before writing any app code
- Gemini must return structured JSON — validate schema before showing to user
- PixiJS logic stays in /components/FarmCanvas — no Pixi code in React components
- Test on 375px mobile width at every stage
- Handle loading states and error states for every API call
- After each stage: confirm all test cases pass before moving on
## How to Sync This File
Run from project root:
```bash
node scripts/sync-claude-md.js
```
This fetches this Notion page and overwrites [CLAUDE.md](http://claude.md/). Run this at the start of every Claude Code session to get the latest project context.
