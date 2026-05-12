> **NOTE — read this first.** This document describes the **1.0** build (qualifier round, April 2026). For **2.0** (finals round, May 2026 onwards), the source of truth is [`AGROSIM_2.0.md`](AGROSIM_2.0.md). Use that for any product, feature, or pitch decisions. This 1.0 doc is retained for historical context and any 1.0-era code still in the repo.

---

# What This Is
This is the complete planning context for Claude Code working on AgroSimulator. Read this in full at the start of every session. It supersedes all previous [CLAUDE.md](http://claude.md/) content.
Last updated: 10 April 2026 (superseded by AGROSIM_2.0.md May 2026)
---
# Project Overview
AgroSimulator is an AI-powered farm management PWA for Malaysian smallholder farmers. Built for Project 2030: MyAI Future Hackathon — Track 1: Padi & Plates.
**Submission deadline: 21 April 2026, 11:59 PM. No extensions.**
**Live URL:** [https://agrosimulator.vercel.app](https://agrosimulator.vercel.app/)
**Stack:** Next.js 16 (App Router, TypeScript, Tailwind) + Supabase + Vercel + Gemini 2.0/2.5 + Firebase Genkit + Leaflet + PixiJS
---
# Core Rules
- All Gemini/AI calls: server-side only via Next.js API routes. Never expose API keys to client.
- Every Supabase table has RLS enabled. Users only access their own farm data.
- Every AI call must result in a database write, not just a text response. Chat = text output. Action = DB write + push notification.
- Build one thing, test fully, then move on. Never stack features on unverified foundations.
- All services use 3-layer fallback: Real API → Gemini web search mock → Static mock.
---
# Current App State (as of 10 Apr 2026)
All 12 original build stages complete. The app currently has:
- 15 Supabase tables, 25+ API routes
- PWA with service worker + push notifications
- Bottom tab bar (Home / Dashboard / Chat / Calendar / Profile) + FAB overflow menu
- PixiJS isometric farm simulator (70% of home screen)
- 6 weather states with animations
- Emoji-based crop sprites per growth stage
- 3-state swipe drawer with real tasks, weather, market prices
- Disease detection: 6-screen flow, 3 outcome variants (confirmed/uncertain/cannot_determine)
- Smart daily task generation (Genkit planned but not yet implemented — see below)
- Risk scoring with warning tile overlays (yellow/orange/red)
- Planting planner with weekly schedule
- Financial dashboard (Recharts)
- AgroBot AI chat advisor
- Crop calendar
- Activity log, market prices detail, weather detail pages
- Data export
**AI Models in use:**
- `gemini-2.5-flash-lite` — all general calls (30 RPM free tier)
- `gemini-2.5-flash` — disease detection only (accuracy critical)
- Retry: 2x on 429 with 2s delay. Mock fallbacks on all services.
---
# CRITICAL: Three Foundations to Establish First
Do NOT build any new features until these 3 foundations are in place.
## Foundation 1 — Firebase Genkit
Currently the app calls Gemini directly via `@google/generative-ai`. This misses a key judging requirement. Genkit must be retrofitted.
```bash
npm install @genkit-ai/core @genkit-ai/googleai zod
```
Create `src/lib/genkit.ts`:
```typescript
import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.0-flash-lite',
});
```
Create `src/lib/tools.ts` — shared tool library all flows import:
- `weatherTool` — fetch weather for farm location
- `plotsTool` — get all active plots with crop/stage/risk
- `inventoryTool` — get current stock levels
- `marketPricesTool` — get current prices and trends
- `resourceProfileTool` — look up crop × growth stage requirements
- `webSearchTool` — Gemini google_search for news/research
- `plotHistoryTool` — get plot_events history for a plot
- `getFarmContextTool` — get full farm metadata
Create `src/flows/` directory with these 6 flows:
1. `dailyFarmOperations.ts` — runs on app open, uses all tools, generates prep list + tasks
1. `diseaseDiagnosis.ts` — multi-turn, uses plotHistory + diseaseDB + weatherHistory tools
1. `intelligenceScan.ts` — uses webSearch + getAffectedFarmers + sendFarmAlert tools
1. `riskAssessment.ts` — uses weatherHistory + plotEvents + growthVulnerability tools
1. `plantingRecommendation.ts` — uses plotHistory + soilProfile + marketPrices + weather tools
1. `inventoryReorder.ts` — uses stockLevels + upcomingUsage + supplierHistory tools
**Why this matters for judging:** Genkit flows are named, observable, and traceable. Judges can see every tool call Gemini made in order. That is agentic execution — not a chatbot.
## Foundation 2 — 3-Layer Service Fallback Pattern
Every external service uses this pattern:
```typescript
async function getWeather(farm: Farm): Promise<WeatherData> {
  // Layer 1: Real API
  if (process.env.OPENWEATHER_API_KEY) {
    try { return await openWeatherMap.fetch(farm.district); } 
    catch (e) { console.warn('OpenWeatherMap failed, falling back'); }
  }
  // Layer 2: Gemini web search mock (actually searches for current data)
  if (process.env.GEMINI_API_KEY) {
    return await geminiSearchWeather(farm.district, farm.state);
  }
  // Layer 3: Static mock (last resort)
  return staticMockWeather(farm.state);
}
```
Every response returns `{ data, source: 'live_api' | 'gemini_web_search' | 'static_mock', freshness }`.
Apply to: weather, marketPrices, agriNews, soilResearch, diseaseDatabase.
**Why this matters:** Demo always works regardless of which API keys are configured. Gemini mock uses web search for current data, so it looks real even without the real API.
## Foundation 3 — Crop Resource Profiles Config
Create `src/config/cropResourceProfiles.json` — static config powering all quantity calculations. Based on MARDI Malaysian agricultural guidelines (Gemini can research these).
Structure per crop × growth stage:
```json
{
  "Paddy": {
    "seedling": {
      "water_ml_per_m2_per_day": 4,
      "water_skip_if_rain_mm": 3,
      "fertilizer_type": "NPK 15-15-15",
      "fertilizer_g_per_m2": 2,
      "fertilizer_frequency_days": 14,
      "pesticide_threshold_risk_score": 0.7,
      "pesticide_type": "Chlorpyrifos",
      "pesticide_ml_per_m2": 0.5,
      "labour_minutes_per_plot": 15
    }
  }
}
```
Cover all crops: Paddy, Chilli, Kangkung, Banana, Corn, Sweet Potato — all growth stages.
---
# New Features to Build (after foundations)
## Feature 1 — Resource Planning & Daily Prep List
**The concept:** Before the farmer leaves home each morning, the app generates a physical resource checklist: exactly what to bring, how much, when to apply, what it costs.
**Example output:**
```javascript
Bring today:
- Water — 63 litres total (Plot A + Plot C)
- NPK 15-15-15 — 240g (Plot C, Week 4)
- Copper fungicide — 30ml (Plot B, precautionary)

Reorder soon:
- Urea — 0.5kg left, need 2kg by Thursday — RM 8.50

True cost today: RM 5.36 (consumables + equipment wear)
```
**Architecture:**
- `src/services/resources/calculator.ts` — pure math engine, no AI. Inputs: plot area m², crop profile, weather, days since last application. Outputs: raw quantities per plot.
- `src/flows/dailyFarmOperations.ts` — Genkit flow. Gemini calls tools, gets calculated quantities, sequences operations, detects conflicts (don't spray if rain in 3h), adds timing.
- Plot area derivation: `grid_cells count × cell_area_m2`. Cell area = bounding_box_area_m2 ÷ grid_size². Convert bounding box degrees to metres using Haversine.
**New DB tables needed:**
```sql
inventory_items (id, farm_id, item_name, item_type, current_quantity, unit, reorder_threshold, reorder_quantity, last_purchase_price_rm, supplier_name)
inventory_movements (id, farm_id, item_id, movement_type, quantity, unit, plot_id, task_id, notes)
resource_prep_lists (id, farm_id, date, prep_list_json, total_estimated_cost_rm, generated_at)
equipment (id, farm_id, name, category, purchase_date, purchase_price_rm, salvage_value_rm, useful_life_years, depreciation_method, current_book_value_rm, condition, last_serviced_date)
equipment_usage (id, farm_id, equipment_id, task_id, plot_id, used_at, duration_minutes)
```
**Tasks gain new fields:** resource_item, resource_quantity, resource_unit, estimated_cost_rm, timing_recommendation, inventory_item_id.
When task marked done: auto-deduct from inventory_items, insert inventory_movements row.
**UI:** Prep list card at top of swipe drawer half-open state. Full `/prep` page. `/inventory` screen.
## Feature 2 — Receipt Scanning (Zero Data Entry)
**The concept:** Farmer photographs a receipt from the agri shop. AI reads it and updates inventory automatically. No typing.
**Flow:**
1. Farmer taps "Scan Receipt"
1. Camera opens, photos receipt
1. Gemini Vision extracts: supplier, items, quantities, units, prices, date
1. Confirmation screen — confidence-based: green (auto-confirm), amber (verify), red (must tap to confirm)
1. Farmer taps "Looks right"
1. Auto-updates: inventory_items stock levels, inventory_movements purchase record, financial_records expense, suppliers table
**Gemini handles:** handwritten BM receipts, thermal printed, WhatsApp screenshots, mixed BM/English. "Baja" = Fertilizer, "Racun kulat" = Fungicide.
**New DB table:** `receipt_scans (id, farm_id, photo_url, gemini_result jsonb, overall_confidence, total_amount_rm, supplier_name, receipt_date, confirmed_at)`
**API routes:** `POST /api/inventory/scan-receipt`, `POST /api/inventory/confirm-receipt`
**Demo moment:** Jeanette photographs a real Malaysian agri receipt live on Demo Day. Inventory updates in 10 seconds. Zero typing.
## Feature 3 — Automated Reordering
**The concept:** AI detects low stock, asks farmer if they want to reorder, generates WhatsApp RFQ to previous supplier, reads the supplier's reply, generates PO. Farmer touchpoints: 4 taps + 2 photo scans.
**Full flow:**
1. Stock depletes via task completion
1. AI projects stock will run out in < 3 days
1. Push notification: "NPK running low. Reorder from Kedai Ah Kow? [Yes]"
1. Farmer taps Yes → WhatsApp opens with pre-filled RFQ message
1. Supplier replies → farmer scans WhatsApp reply screenshot
1. Gemini reads quote → shows order summary
1. Farmer confirms → PO generated → PO confirmation WhatsApp pre-filled
1. Goods arrive → farmer scans receipt → GRN auto-generated, stock updated
**New DB tables:** `purchase_requests`, `purchase_orders`, `goods_received_notes`
**API routes:** `POST /api/inventory/reorder-check`, `POST /api/inventory/generate-rfq`, `POST /api/inventory/scan-quote`, `POST /api/inventory/confirm-order`, `POST /api/inventory/receive-order`
## Feature 4 — Equipment & Depreciation
**The concept:** Farmer enters equipment they own. AI suggests useful life and salvage value. App auto-calculates straight-line depreciation. Shows true cost per use, flags maintenance, plans replacement.
**Example:**
> "Your water pump is worth RM 320 today. It costs you RM 18/month just from wear. Start setting aside RM 18/month for replacement next year."
**Depreciation formula:**
```javascript
Annual dep = (purchase_price - salvage_value) / useful_life_years
Current book value = purchase_price - (annual_dep × years_owned)
Cost per use = annual_dep / estimated_uses_per_year
```
**AI auto-suggests** useful life and salvage value when farmer enters equipment name + category.
**The daily prep list gains an equipment section:**
```javascript
Equipment needed today:
  Water pump — Cost: RM 1.22 — Condition: Good
  Backpack sprayer — Cost: RM 0.48 — ⚠️ Service overdue

True cost today:
  Consumables: RM 3.66
  Equipment:   RM 1.70
  Total:       RM 5.36
```
## Feature 5 — AI Diagnosis Improvements (4-Layer)
**Current state:** Layer 1 only (photos → Gemini → result). No feedback loop, no test kits, no expert escalation.
**Layer 1 improvements:**
- Camera overlay guide frames ("fill this frame with the affected leaf")
- Gemini photo quality pre-check before sending
- 4th optional photo: soil surface around plant base
**Layer 2 — Farmer Questionnaire:**
- Gemini generates adaptive questions based on current differential diagnosis
- Max 5 questions, then escalate if still uncertain
- Question types: Yes/No (large tap buttons), multiple choice, scale slider, photo prompt
- Special observation cards: soil moisture, smell, stem firmness, spread pattern (spread pattern is most diagnostically valuable)
**Layer 3 — Test Kit Integration:**
- App recommends specific test kit (soil pH, NPK, fungal strip)
- Step-by-step illustrated guide in-app
- Farmer photographs test result strip
- Gemini Vision reads the strip and incorporates into diagnosis
- Key insight: nutrient deficiency is frequently misdiagnosed as fungal disease
**Layer 4 — Expert Marketplace (mocked):**
- Auto-generated case package: all photos, questionnaire answers, plot history, Gemini reasoning log
- Booking UI: remote review (free) / video call (RM 30–80) / on-site (RM 100–300)
- WhatsApp pre-filled message to MARDI/DOA extension officer
- Payment processing: V2 (pitch roadmap)
**Treatment monitoring (CRITICAL — currently missing):**
After any diagnosis, auto-create 5-day follow-up task: "Did the treatment work?"
Farmer taps Better/Same/Worse:
- Better → close case, clear warning
- Same → adjust treatment, 3-day recheck
- Worse → immediate Layer 4 escalation
**Diagnosis report generation:**
Every diagnosis generates a structured PDF report: symptoms observed, diagnostic process (which layers), final diagnosis with confidence, treatment plan with quantities, follow-up date, estimated treatment cost.
**Diagnosis history per plot:** timeline of all diagnoses, AI pattern detection across history ("Plot B1 gets anthracnose every rainy season after 3+ rain days").
**Confidence → Action decision tree:**
```javascript
After Layer 1:
  ≥ 0.85 → Confirmed diagnosis → Treatment → Monitor
  0.60–0.84 → Layer 2
  < 0.60 → Layer 2 (flag Layer 3 likely needed)

After Layer 2:
  ≥ 0.85 → Confirmed
  0.75–0.84 → Uncertain, suggest treatment with caveat
  < 0.75 → Layer 3

After Layer 3:
  ≥ 0.80 → Confirmed
  0.60–0.79 → Best assessment + expert task in 3 days
  < 0.60 → Layer 4
```
**New DB tables:** `diagnosis_sessions`, `diagnosis_photos`, `diagnosis_questionnaire`, `test_kit_results`, `expert_consultations`, `treatment_monitoring`
## Feature 6 — Proactive Intelligence Engine
**The concept:** Server-side agent that monitors agricultural news, weather patterns, and cross-farm disease data. Sends targeted warnings to affected farmers before problems reach their crops.
**Three signal types:**
**Signal 1 — Agricultural News:**
Use Gemini's built-in `google_search` tool — no custom scraper needed.
```typescript
await ai.generate({
  tools: [{ googleSearch: {} }],
  prompt: `Search for latest Malaysian agricultural news from the last 24 hours.
           Look for: crop disease outbreaks, fertilizer recalls, pest invasions, flood warnings.
           Focus on: MARDI, DOA, Jabatan Pertanian, MetMalaysia.
           Return actionable alerts for Malaysian smallholder farmers in JSON.`
});
```
Targeting: match threat to affected farmers by crop, region, and inventory item. Only send to farmers actually affected.
**Signal 2 — Weather Pattern Detection (deterministic rules, no AI):**
- 4+ consecutive rain days → fungal risk alert
- 7+ days no rain + temp > 33°C → drought forming
- Rain > 50mm forecast in 24h → flood risk
- Humidity > 85% for 3+ days → disease pressure
- Sudden temp drop > 5°C → cold stress
**Signal 3 — Cross-Farm Outbreak Detection:**
If 3+ farms in same district confirm same disease in 14 days → community outbreak. Alert all farms in that district growing that crop. Completely anonymous.
**Implementation:**
Two Vercel Cron Jobs (free tier):
```json
{
  "crons": [
    { "path": "/api/cron/intelligence-scan", "schedule": "0 */6 * * *" },
    { "path": "/api/cron/weather-patterns", "schedule": "0 6 * * *" }
  ]
}
```
**Deduplication:** Never send same alert to same farm twice within 7 days.
**New DB tables:** `intelligence_sources`, `intelligence_articles`, `farm_alerts`, `weather_pattern_alerts`, `community_outbreak_events`
**UI:** Wire existing notification bell to farm_alerts. Alert feed page `/alerts`. High-severity alerts surface at top of morning briefing drawer before tasks.
## Feature 7 — Farm Business Pipeline
**The concept:** Full farm business management — replacing the notebook, receipt box, and spreadsheet. 6 stages.
**Stage 1 — Procurement:** Supplier directory, purchase orders, GRN, subsidy tracking (Subsidi Baja, MySUBSIDI), AI price comparison.
**Stage 2 — Resource Planning:** Already Feature 1 above.
**Stage 3 — Equipment:** Already Feature 4 above.
**Stage 4 — Labour & Workforce:** Worker registry (name, daily rate, skill type), AI labour scheduling estimates per plot size + crop + task type, labour cost per plot per season.
**Stage 5 — Sales & Customers:**
- Customer directory with payment reliability score (AI-calculated)
- SO → DO → Invoice flow
- Debtor tracking + aging report
- AI market timing: when price spikes + harvest ready → alert + pre-fill WhatsApp to buyers
- PDF document generation: invoice, DO, GRN, SO, statement of account
**Stage 6 — Financial Intelligence:**
- True cost per kg = (inputs + labour + equipment dep + land rent) ÷ yield kg
- P&L per plot per season
- 8-week cash flow projection (money in vs out)
- Loan tracking (Agrobank, TEKUN)
- Season-over-season comparison
- AI financial advisor: proactive insights the farmer didn't ask for
**New DB tables:** `suppliers`, `customers`, `sales_orders`, `delivery_orders`, `sales_invoices`, `payments_received`, `workers`, `labour_records`, `loans`, `loan_repayments`, `land_costs`, `season_summary`, `subsidy_claims`, `financial_records (already exists)`
---
# The Chat-to-Action Architecture
Every AI flow must result in a DB write + user notification, not just text output.
**5 Action flows that demonstrate autonomous execution:**
1. **Morning Farm Operations** — triggers on app open. Gemini calls 5 tools autonomously. Calculates exact quantities. Creates tasks with quantities in DB. Sends push: "Prep list ready."
1. **Automated Reorder** — triggers when task completion depletes stock below threshold. AI generates RFQ. Farmer taps Yes. WhatsApp pre-filled.
1. **Disease Alert → Inspection Task** — triggers when risk score > 0.6. Injects inspection task into task list. Sends push. After inspection, DB updated, warning cleared or escalated.
1. **Community Outbreak → Proactive Alert** — triggers when 3rd farm confirms same disease. All farms in district get alerted. Inspection tasks injected.
1. **Market Opportunity → Sales Action** — triggers when price spike + harvest timing. AI calculates yield. Generates WhatsApp offer to buyer. Farmer taps Yes.
**Architectural rule:** If Gemini output doesn't write to the DB, it's still chat.
---
# Build Priority Order
Given 11 days remaining:
1. Foundation 1: Genkit setup + tool library + flows directory
1. Foundation 2: 3-layer service wrappers (weather, market, news)
1. Foundation 3: cropResourceProfiles.json
1. Feature 1: Resource planning (calculation engine + inventory tables + prep list UI)
1. Feature 2: Receipt scanning
1. Feature 3: Automated reordering
1. Feature 5: Diagnosis improvements (Layer 2 questionnaire + treatment monitoring + report generation) — highest demo impact
1. Feature 6: Proactive intelligence engine (Vercel cron + Gemini news search)
1. Feature 4: Equipment & depreciation
1. Feature 7: Business pipeline (sales + customers + financial intelligence) — partial MVP
---
# Judging Criteria & How We Score








**Key judging requirement:** Transition from Chat to Action (autonomous execution). Genkit flows + tool use + DB writes = this requirement met.
---
# Submission Checklist
- [ ] Public GitHub repo — no secrets committed
- [ ] README: setup steps, .env vars, features, tech stack, AI tools disclosure, architecture overview
- [ ] Live Vercel URL accessible without login
- [ ] All Supabase tables have RLS enabled
- [ ] Supabase Storage bucket: crop-photos
- [ ] .env.local and [CLAUDE.md](http://claude.md/) in .gitignore
- [ ] Video demo (3 min max) — partner Jeanette records
- [ ] Google Slides deck (15 slides max, PDF) — partner Jeanette prepares
- [ ] Submit via official Google Form before 21 Apr 11:59 PM
---
# Sync Command
Run at start of every Claude Code session:
```bash
node scripts/sync-claude-md.js
```
This fetches the [CLAUDE.md](http://claude.md/) Notion source page and writes [CLAUDE.md](http://claude.md/) to project root.
However, this Master Brief is the most complete reference. If syncing gives outdated content, paste this page directly.
---
# Contact & Resources
- Hackathon email: [myaifuturehackathon@gmail.com](mailto:myaifuturehackathon@gmail.com)
- Discord: [https://discord.gg/qJ6q4pph](https://discord.gg/qJ6q4pph)
- Gemini API keys: [aistudio.google.com](http://aistudio.google.com/)
- OpenWeatherMap: [openweathermap.org/api](http://openweathermap.org/api) (free tier, 1000 calls/day)
- Supabase project: qrevbizwmiqdlgtnptji (ap-southeast-1)
- GitHub: push to master branch
- Vercel: auto-deploys on push to master
