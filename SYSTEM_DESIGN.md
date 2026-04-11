# AgroSim - System Design Documentation

> **Version:** 1.0 | **Date:** April 10, 2026 | **Platform:** Web (PWA) | **Target:** Malaysian Agrotech Hackathon

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Database Schema](#3-database-schema)
4. [Pages & Routing](#4-pages--routing)
5. [API Routes](#5-api-routes)
6. [AI Services (Gemini)](#6-ai-services-gemini)
7. [Components](#7-components)
8. [State Management](#8-state-management)
9. [Design System](#9-design-system)
10. [Key Workflows](#10-key-workflows)
11. [External Integrations](#11-external-integrations)
12. [PWA & Performance](#12-pwa--performance)
13. [Accessibility](#13-accessibility)
14. [File Structure](#14-file-structure)
15. [Known Gaps & Future Opportunities](#15-known-gaps--future-opportunities)

---

## 1. Architecture Overview

AgroSim is a **mobile-first PWA** built with Next.js App Router that helps Malaysian smallholder farmers manage their farms through AI-powered recommendations, disease detection, weather-aware task generation, and market price tracking.

```
                    +---------------------------+
                    |      Vercel (Hosting)      |
                    |   Next.js 16 App Router    |
                    +---------------------------+
                              |
              +---------------+----------------+
              |                                |
     +--------v--------+            +---------v---------+
     | Client (React)  |            | API Routes (Edge) |
     | Zustand Store   |            | Server-side only  |
     | Framer Motion   |            +---------+---------+
     | PixiJS / Leaflet|                      |
     +--------+--------+         +------------+------------+
              |                  |            |             |
              v                  v            v             v
        User Device        Supabase     Google Gemini  OpenWeatherMap
        (Mobile PWA)      (PostgreSQL    (2.5 Flash     (Current +
                           + Auth +      Lite/Flash)     5-day forecast)
                           Storage +
                           RLS)
```

**Key Principles:**
- All AI calls are server-side only (API keys never exposed)
- Row-Level Security (RLS) on every Supabase table
- Graceful degradation: mock data fallbacks if APIs fail
- One weather snapshot & one task generation per farm per day
- Mobile-first: touch gestures, safe-area insets, 44px min touch targets

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | Next.js (App Router) | 16.2.2 | SSR, routing, API routes |
| **Language** | TypeScript | 5.x | Type safety |
| **UI** | React | 19.2.4 | Component rendering |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS |
| **Animation** | Framer Motion | 12.38.0 | Spring physics animations |
| **Icons** | Lucide React | 1.7.0 | Consistent icon set |
| **State** | Zustand | 5.0.12 | Lightweight global state |
| **2.5D Rendering** | PixiJS | 8.17.1 | Isometric farm canvas |
| **Mapping** | Leaflet + Leaflet Draw | 1.9.4 | Satellite maps, polygon drawing |
| **Spatial** | Turf.js | various | Area calc, bbox, centroid, union |
| **Charts** | Recharts | 3.8.1 | Financial charts |
| **Database** | Supabase (PostgreSQL) | — | Auth, DB, Storage, RLS |
| **AI** | Google Gemini | 0.24.1 | Disease detection, chat, tasks |
| **Weather** | OpenWeatherMap | Free tier | Current + 5-day forecast |
| **Push** | Web Push | 3.6.7 | Severe weather & risk alerts |
| **Dates** | date-fns | 4.1.0 | Relative time formatting |
| **Testing** | Vitest | 4.1.3 | Unit tests |
| **Toasts** | React Hot Toast | 2.6.0 | User feedback |

---

## 3. Database Schema

### 3.1 Tables & Relationships

```
profiles ──< farms ──< plots ──< plot_events
                  |         |         └──< expert_referrals
                  |         └──< planting_plans
                  ├──< farm_zones
                  ├──< farm_features
                  ├──< tasks
                  ├──< chat_messages
                  ├──< financial_records
                  ├──< activity
                  ├──< weather_snapshots
                  └──< onboarding_ai_suggestions

market_prices (global, not per-farm)
```

### 3.2 Table Definitions

#### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | FK to auth.users |
| full_name | text | |
| phone | text | |
| district | text | Malaysian district |
| state | text | Malaysian state |
| created_at | timestamptz | |

#### `farms`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK | → profiles.id |
| name | text | nullable |
| district | text | |
| state | text | |
| polygon_geojson | jsonb | GeoJSON.Polygon |
| bounding_box | jsonb | {north, south, east, west} |
| area_acres | float | Computed from polygon |
| grid_size | int | 4/6/8/10 based on acreage |
| soil_type | text | e.g. "clay loam" |
| water_source | text | e.g. "rain-fed" |
| ai_soil_reasoning | text | Gemini explanation |
| onboarding_done | boolean | |
| created_at | timestamptz | |

#### `plots`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| farm_id | uuid FK | → farms.id |
| label | text | "A", "B", etc. |
| crop_name | text | Currently planted crop |
| crop_variety | text | Specific variety |
| growth_stage | text | seedling/growing/mature/harvest_ready/harvested |
| planted_date | date | |
| expected_harvest | date | |
| warning_level | text | none/yellow/orange/red |
| warning_reason | text | AI-generated |
| risk_score | float | 0.0-1.0 from Gemini |
| days_since_checked | int | |
| colour_hex | text | AI-assigned plot color |
| ai_placement_reason | text | Why this crop here |
| is_active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `farm_zones`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| farm_id | uuid FK | |
| zone_label | text | |
| suggested_crop | text | AI suggestion |
| crop_override | text | User override |
| colour_hex | text | Zone color |
| geometry_geojson | jsonb | Polygon geometry |
| created_at | timestamptz | |

#### `farm_features`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| farm_id | uuid FK | |
| feature_type | text | parcel/road/building/water |
| geometry_geojson | jsonb | GeoJSON geometry |

#### `plot_events`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| plot_id | uuid FK | |
| farm_id | uuid FK | |
| event_type | text | inspection_clean/inspection_disease/inspection_suspicious/inspection_referred/treatment_applied/watered/fertilized/harvested/replanted/weather_stress/ai_risk_recalc |
| photo_url | text | Supabase Storage URL |
| gemini_result | jsonb | Full AI response |
| disease_name | text | |
| severity | text | mild/moderate/severe |
| treatment | jsonb | Treatment plan |
| weather_at_time | jsonb | Snapshot of weather |
| notes | text | |
| created_at | timestamptz | |

#### `tasks`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| farm_id | uuid FK | |
| plot_id | uuid FK | nullable (farm-wide tasks) |
| title | text | |
| description | text | |
| task_type | text | inspection/watering/fertilizing/treatment/harvesting/replanting/farm_wide |
| priority | text | urgent/normal/low |
| due_date | date | |
| completed | boolean | |
| completed_at | timestamptz | |
| auto_generated | boolean | AI-generated flag |
| triggered_by | text | weather/inspection_result/growth_stage/schedule |
| created_at | timestamptz | |

#### `weather_snapshots`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| farm_id | uuid FK | |
| condition | text | sunny/overcast/rainy/thunderstorm/drought/flood_risk |
| temp_celsius | float | |
| humidity_pct | float | |
| rainfall_mm | float | 3-hour rain |
| wind_kmh | float | |
| forecast_json | jsonb | Array of 5-day ForecastDay |
| fetched_at | timestamptz | One per day per farm |

#### `market_prices`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| item_name | text | Unique constraint |
| item_type | text | crop/fertilizer/pesticide |
| price_per_kg | float | |
| unit | text | kg/liter |
| trend | text | up/down/stable |
| trend_pct | float | |
| source | text | "simulated" |
| updated_at | timestamptz | |

#### `chat_messages`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| farm_id | uuid FK | |
| role | text | user/assistant |
| content | text | |
| metadata | jsonb | |
| created_at | timestamptz | |

#### `financial_records`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| farm_id | uuid FK | |
| plot_id | uuid FK | nullable |
| record_type | text | expense/income |
| category | text | |
| amount | float | |
| description | text | |
| record_date | date | |
| created_at | timestamptz | |

#### `planting_plans`, `activity`, `expert_referrals`, `onboarding_ai_suggestions`
Additional supporting tables for planting recommendations, activity logging, expert referrals, and onboarding data.

---

## 4. Pages & Routing

### 4.1 Route Map

```
/                           Welcome (email login)
/auth/verify                OTP verification
/auth/callback              Supabase OAuth callback

/onboarding                 → redirects to /onboarding/map
/onboarding/map             Farm setup wizard (6 steps)
/onboarding/details         Farm details input
/onboarding/research        AI soil/water research results
/onboarding/confirm         Final confirmation

/home                       Main dashboard (map + tasks + weather + market)
/dashboard                  Financial dashboard (income/expense charts)
/chat                       AI advisor chat
/calendar                   Task calendar view
/profile                    User settings

/weather                    Detailed weather (hourly, 7-day, rainfall, spray)
/market                     Market prices (sparklines, area charts, tabs)
/activity                   Activity log with filters

/inspection                 Inspection briefing
/inspection/capture         Camera (3 photos)
/inspection/analysing       AI processing screen
/inspection/questions       Follow-up Q&A (max 5)
/inspection/result          Diagnosis + treatment
/inspection/referral        Expert referral

/planting/[plot_id]         AI planting plan + weekly schedule

/farm/redraw                Edit farm boundary
/dev/sprites                Sprite viewer (dev only)
```

### 4.2 Navigation Structure

**Bottom Tab Bar (4 tabs + FAB):**
- Home | Dashboard | [+FAB] | AI Chat | Calendar

**FAB Menu (3x2 grid):**
| Scan Crop | Weather | Market Prices |
|-----------|---------|---------------|
| Add Farm | Edit Boundary | Profile |

**Pages with hidden tab bar:** `/`, `/auth/*`, `/onboarding/*`, `/inspection/*`, `/planting/*`, `/dev/*`

---

## 5. API Routes

### 5.1 Authentication
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/dev-login` | Instant login (dev mode, bypasses OTP) |

### 5.2 Weather
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/weather?farm_id=` | Current weather + 5-day forecast (OpenWeatherMap) |
| GET | `/api/weather/detail?farm_id=` | Extended: hourly, 7-day, spray, monsoon |

### 5.3 Market Prices
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/market-prices` | All current prices |
| POST | `/api/market-prices/refresh` | Regenerate simulated prices |
| GET | `/api/market-prices/history?days=` | Historical price data (7/30/90 days) |

### 5.4 Inspection
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/inspection/analyse` | Initial photo analysis (confidence + follow-ups) |
| POST | `/api/inspection/diagnose` | Final diagnosis with farmer answers |
| POST | `/api/inspection/clean` | Mark plot healthy |
| POST | `/api/inspection/tips` | Get crop-specific inspection tips |
| POST | `/api/inspection/upload-photo` | Upload to Supabase Storage |

### 5.5 Tasks
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/tasks/generate` | AI-generate daily tasks (throttled 1x/day) |
| GET | `/api/tasks/list?farm_id=` | Get pending tasks |
| POST | `/api/tasks/complete` | Mark task done |

### 5.6 Planting
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/planting/plan` | Generate AI planting plan |
| POST | `/api/planting/confirm` | Confirm and plant crop |

### 5.7 Plots
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/plots/harvest` | Mark harvested |
| POST | `/api/plots/recalculate-risk` | AI risk scoring for all plots |

### 5.8 Other
| Method | Route | Purpose |
|--------|-------|---------|
| GET/PUT | `/api/profile` | Get/update user profile |
| GET | `/api/financial?farm_id=&period=` | Financial summary + records |
| GET | `/api/activity?farm_id=&page=&filter=` | Activity log (paginated) |
| POST | `/api/chat` | AI chat (farm-context aware) |
| POST | `/api/onboarding/research-farm` | AI soil/water research |
| POST | `/api/onboarding/generate-plot-layout` | AI grid + crop layout |
| POST | `/api/export/report` | Export farm report |
| GET | `/api/push/vapid-key` | VAPID public key |
| POST | `/api/push/subscribe` | Push notification subscription |
| POST | `/api/push/send` | Send push (server-side) |
| GET | `/api/referral` | Expert referral status |

---

## 6. AI Services (Gemini)

All AI services live in `src/services/ai/` and are server-side only.

### 6.1 Models Used
| Model | RPM (Free) | Used For |
|-------|-----------|----------|
| gemini-2.5-flash-lite | 30 | Chat, tasks, planting, risk scoring, layout |
| gemini-2.5-flash | Higher | Disease detection (needs accuracy) |

### 6.2 Service Functions

#### Disease Detection (`diseaseDetection.ts`)
- `analysePhotos(photos, cropName, plotLabel)` → Initial assessment
- `diagnoseWithAnswers(photos, cropName, farmerAnswers)` → Final diagnosis
- **Confidence thresholds:**
  - >= 0.85 → "confirmed" (full treatment steps)
  - 0.60-0.84 → "uncertain" (expert verification needed)
  - < 0.60 → "cannot_determine" (expert referral)
- 2 retries on rate limit (429), mock fallback

#### Chat Advisor (`chatAdvisor.ts`)
- `chatWithAdvisor(systemContext, history, message)` → Plain text reply
- Context includes: farm details, plots, weather, tasks, last 10 messages
- Focus: Malaysian agriculture, actionable advice

#### Task Generator (`taskGenerator.ts`)
- `generateTasks(plots, weather, soilType, waterSource)` → 3-7 tasks/day
- Weather-aware: flood → drainage, drought → emergency watering
- Growth-stage aware: seedling → inspect, mature → harvest
- Triggers: weather, growth_stage, schedule, inspection_result

#### Planting Planner (`plantingPlanner.ts`)
- `generatePlantingPlan(plot, farm, diseaseHistory, weather, marketPrices)` → Plan
- Considers: crop rotation, disease avoidance, market prices, soil/water
- Returns: crop, reason, yield estimate, weekly schedule

#### Risk Scoring (`riskScoring.ts`)
- `riskScoringAgent(plots, weather, tasks)` → Warning levels per plot
- Score 0.0-1.0 mapped to: none/yellow/orange/red

#### Plot Layout (`plotLayout.ts`)
- `generatePlotLayout(geojson, gridSize, soilType, waterSource)` → GridJson
- Assigns crops to grid cells based on farm conditions

---

## 7. Components

### 7.1 App Shell & Navigation

| Component | Path | Purpose |
|-----------|------|---------|
| AppShell | `/components/AppShell/` | Root layout, conditional tab bar, toasts |
| BottomTabBar | `/components/BottomTabBar/` | 4 tabs + center FAB |
| FabMenu | `/components/BottomTabBar/FabMenu.tsx` | 6-item overlay menu (3x2) |
| NotificationBell | `/components/NotificationBell/` | Bell + dropdown, unread badge |
| FarmSwitcher | `/components/home/FarmSwitcher.tsx` | Multi-farm dropdown |

### 7.2 Map & Visualization

| Component | Path | Purpose |
|-----------|------|---------|
| FarmCanvas | `/components/FarmCanvas/` | PixiJS isometric 2.5D renderer |
| FarmMapView | `/components/FarmMapView/` | Leaflet satellite map + zones |
| FarmDrawMap | `/components/FarmDrawMap.tsx` | Boundary drawing (onboarding) |
| FarmRedrawMap | `/components/FarmRedrawMap.tsx` | Edit boundary |
| FarmSetup | `/components/FarmSetup/` | 6-step onboarding wizard |
| StepIndicator | `/components/FarmSetup/StepIndicator.tsx` | Progress dots |

### 7.3 Home Page

| Component | Path | Purpose |
|-----------|------|---------|
| SummaryCards | `/components/home/SummaryCards.tsx` | Plots/Harvest/Alerts/Rain cards |
| PlotCardRow | `/components/home/PlotCardRow.tsx` | Horizontal scroll plot cards |
| PlotBottomSheet | `/components/PlotBottomSheet/` | Plot detail modal + actions |

### 7.4 Dashboard

| Component | Path | Purpose |
|-----------|------|---------|
| RevenueChart | `/components/dashboard/RevenueChart.tsx` | Recharts area (income/expense) |
| ExpenseBreakdown | `/components/dashboard/ExpenseBreakdown.tsx` | Donut chart by category |
| AddRecordSheet | `/components/dashboard/AddRecordSheet.tsx` | Form to add records |

### 7.5 UI Primitives

| Component | Path | Purpose |
|-----------|------|---------|
| Card | `/components/ui/Card.tsx` | default/glass/elevated variants |
| ProgressRing | `/components/ui/ProgressRing.tsx` | SVG circular progress |
| Skeleton | `/components/ui/Skeleton.tsx` | Loading placeholders |

### 7.6 Weather & Market (Detail Pages)

Built as page-level components with inline SVG charts:
- **Weather:** HourlyStrip, HourlyTempChart, DailyRow, RainfallChart, SprayCard
- **Market:** Sparkline, AreaChart, StatsSummary, PriceRow (all pure SVG)

---

## 8. State Management

**Zustand store** (`src/stores/farmStore.ts`):

```typescript
interface FarmStore {
  // Data
  farm: FarmRow | null;
  farms: FarmRow[];
  plots: PlotData[];
  weather: WeatherData | null;
  tasks: TaskData[];
  marketPrices: MarketPrice[];
  selectedPlot: PlotData | null;
  notifications: AppNotification[];
  plotWarnings: Record<string, { warningLevel, warningReason }>;

  // Actions
  setFarm / setFarms / setPlots / updatePlot
  setWeather / setTasks / removeTask / setMarketPrices
  setSelectedPlot / setPlotWarnings
  addNotification / markNotificationRead / clearNotifications
}
```

**Design decisions:**
- No persistence (fresh fetch on page load)
- No derived state selectors (computed in components)
- Notifications stored client-side only (not in DB)

---

## 9. Design System

### 9.1 Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#16a34a` (green-600) | CTAs, nav active, success |
| Background | `#ffffff` / `#f9fafb` | Page bg, card bg |
| Text Primary | `#111827` (gray-900) | Headings |
| Text Secondary | `#6b7280` (gray-500) | Body, descriptions |
| Warning Yellow | `#eab308` | Low risk |
| Warning Orange | `#f97316` | Medium risk |
| Warning Red | `#ef4444` | High risk, errors |
| Info Blue | `#3b82f6` | Rain, humidity, links |
| Amber | `#f59e0b` | Temperature, harvest |

### 9.2 Typography

| Element | Class | Size |
|---------|-------|------|
| Page title | `text-lg font-bold` | 18px |
| Section heading | `text-base font-bold` | 16px |
| Body | `text-sm` | 14px |
| Caption | `text-xs` | 12px |
| Micro | `text-[10px]-[11px]` | 10-11px |
| Font | Geist Sans / Geist Mono | Variable |

### 9.3 Spacing & Layout

| Pattern | Value |
|---------|-------|
| Page padding | `px-4` (16px) |
| Section gap | `mb-5` (20px) |
| Card padding | `p-4` (16px) |
| Card radius | `rounded-2xl` (16px) |
| Touch target | min 44px height |
| Bottom nav height | 56px (h-14) |
| Safe area | `env(safe-area-inset-bottom)` |

### 9.4 Animation Tokens

| Pattern | Config |
|---------|--------|
| Spring (buttons) | `type: "spring", damping: 25, stiffness: 300-400` |
| Tap feedback | `whileTap: { scale: 0.92-0.97 }` |
| Stagger children | `delayChildren: 0.02, staggerChildren: 0.05` |
| Page transition | `fadeIn 0.3s ease-out` |
| Card press | `transform: scale(0.98)` on active |

### 9.5 Card Variants

| Variant | Styles |
|---------|--------|
| default | `bg-white rounded-2xl border border-gray-100` |
| glass | `bg-white/60 backdrop-blur-xl border-white/30 shadow-lg` |
| elevated | `bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)]` |

---

## 10. Key Workflows

### 10.1 Onboarding
```
Email login → OTP/Dev login
→ /onboarding/map (6-step wizard):
  1. Draw farm boundary (Leaflet Draw)
  2. Mark water features
  3. Draw roads/paths
  4. Select terrain type
  5. Mark infrastructure
  6. Review zones
→ /onboarding/research (Gemini analyzes soil + water)
→ /onboarding/confirm (review AI suggestions)
→ Save farm + plots to Supabase
→ /home
```

### 10.2 Daily Usage (Home)
```
Load /home → Parallel fetch:
  - Farm + plots from Supabase
  - Weather from OpenWeatherMap (snapshot once/day)
  - Market prices (refresh if stale >24h)
  - AI task generation (once/day, 3-7 tasks)
  - AI risk scoring (updates warning levels)

Display: Map + Summary cards + Plot cards + Tasks + Forecast + Market
```

### 10.3 Crop Inspection
```
Home → Scan Crop (FAB) → /inspection (briefing)
→ /inspection/capture (3 photos: full, close-up, healthy reference)
→ /inspection/analysing (Gemini analysis)

If confidence >= 0.85:
  → /inspection/result (confirmed diagnosis + treatment)
  → Creates treatment tasks, updates plot warning_level = red

If 0.60-0.84:
  → /inspection/questions (max 5 follow-up Qs)
  → Re-diagnose with answers
  → /inspection/result (uncertain + expert verification task)

If < 0.60:
  → /inspection/referral (expert referral created)
```

### 10.4 Planting
```
Tap harvested plot → PlotBottomSheet → "Plan Next Crop"
→ /planting/[plot_id]
→ Gemini generates plan (considers rotation, disease, market, weather)
→ Display: crop, reason, yield estimate, weekly schedule
→ Confirm → Plot updated: new crop, seedling stage, dates set
```

### 10.5 Financial Tracking
```
/dashboard → View income/expense charts
→ FAB (+) → AddRecordSheet modal
→ Enter: type, category, amount, plot, date
→ Save → Charts update
```

---

## 11. External Integrations

### 11.1 Supabase
- **Auth:** Email OTP + dev bypass
- **Database:** PostgreSQL with RLS (users only access own farms)
- **Storage:** Inspection photos
- **Realtime:** Not currently used

### 11.2 Google Gemini
- **Models:** gemini-2.5-flash-lite (general), gemini-2.5-flash (disease)
- **Rate limits:** 30 RPM on free tier (flash-lite)
- **Retry:** 2x on 429 errors
- **Fallback:** Mock data if API unavailable
- **Schema validation:** All responses validated before use

### 11.3 OpenWeatherMap
- **Endpoints:** `/data/2.5/weather` + `/data/2.5/forecast`
- **Data:** Current conditions + 40x 3-hour intervals (5 days)
- **Condition mapping:** OWM codes → app states (sunny/overcast/rainy/thunderstorm/drought/flood_risk)
- **Fallback:** Mock weather if no API key

### 11.4 Leaflet + ESRI
- **Tiles:** ESRI World Imagery (free, no API key)
- **Labels:** ESRI Reference World Boundaries overlay
- **Drawing:** Leaflet Draw plugin for polygon creation

---

## 12. PWA & Performance

### 12.1 Service Worker (`/public/sw.js`)
- Cache-first for static shell (/, /home, /dashboard, /chat, /calendar, /profile)
- Network-first for API routes
- Push notification handling with vibration
- Notification click routing

### 12.2 Manifest
- `display: standalone`, `theme_color: #16a34a`
- `start_url: /home`
- Icons: 192x192 + 512x512 SVG

### 12.3 Performance Optimizations
- **PixiJS:** maxFPS=30, capped 300 rain particles, ParticleContainer, disable animations on low-end (`hardwareConcurrency <= 2`)
- **React:** Dynamic imports (SSR=false for Leaflet/PixiJS), Zustand (no Redux overhead)
- **Throttling:** 1 task gen/day, 1 weather snapshot/day, market refresh only if stale >24h
- **Charts:** Pure SVG (sparklines, area charts) — no heavy chart library on market/weather pages

---

## 13. Accessibility

### 13.1 WCAG 2.1 AA Compliance

| Feature | Implementation |
|---------|---------------|
| Color contrast | Green-600 on white = 4.5:1+ |
| Focus indicators | 2px solid green, 2px offset |
| Keyboard navigation | Tab trap in modals, Escape closes |
| ARIA labels | All buttons, nav, menu items, dialogs |
| Motion | Respects `prefers-reduced-motion` |
| Touch targets | Min 44px height |
| High contrast | `forced-colors` media query support |
| Form labels | Visible labels on all inputs |
| Semantic HTML | `<nav>`, `<main>`, `<ul>/<li>`, `role="dialog"` |

### 13.2 Known Gaps
- SwipeDrawer missing `role="region"` + `aria-label`
- Chart tooltips not keyboard-accessible
- Some toast messages may not persist for screen readers

---

## 14. File Structure

```
src/
  app/
    page.tsx                    # Welcome/login
    layout.tsx                  # Root layout (fonts, metadata)
    globals.css                 # Tailwind + custom animations
    api/
      auth/dev-login/           # Dev instant login
      weather/                  # Current weather
      weather/detail/           # Extended weather data
      market-prices/            # Current prices
      market-prices/refresh/    # Regenerate prices
      market-prices/history/    # Historical data
      inspection/               # analyse, diagnose, clean, tips, upload
      tasks/                    # generate, list, complete
      planting/                 # plan, confirm
      plots/                    # harvest, recalculate-risk
      chat/                     # AI advisor
      financial/                # Income/expense data
      activity/                 # Activity log
      profile/                  # User profile
      push/                     # VAPID key, subscribe, send
      referral/                 # Expert referrals
      export/                   # Report export
      onboarding/               # research-farm, generate-plot-layout
    home/page.tsx               # Main dashboard
    dashboard/page.tsx          # Financial
    chat/page.tsx               # AI chat
    calendar/page.tsx           # Task calendar
    profile/page.tsx            # Settings
    weather/page.tsx            # Weather detail
    market/page.tsx             # Market prices detail
    activity/page.tsx           # Activity log
    inspection/                 # 5 sub-pages
    planting/[plot_id]/         # Dynamic planting page
    onboarding/                 # 4 sub-pages
    farm/redraw/                # Edit boundary
    auth/                       # verify, callback

  components/
    AppShell/                   # Root layout wrapper
    BottomTabBar/               # Nav bar + FabMenu
    FarmCanvas/                 # PixiJS isometric renderer
      renderer.ts, gridGenerator.ts, cropSprites.ts,
      tileSprites.ts, weatherEffects.ts
    FarmMapView/                # Leaflet satellite map
    FarmSetup/                  # Onboarding wizard
      steps/                    # BoundaryStep, WaterStep, etc.
      StepIndicator.tsx
    PlotBottomSheet/            # Plot detail modal
    SwipeDrawer/                # Draggable bottom sheet
    NotificationBell/           # Notification center
    home/                       # SummaryCards, PlotCardRow, FarmSwitcher
    dashboard/                  # RevenueChart, ExpenseBreakdown, AddRecordSheet
    activity/                   # ActivityCard
    ui/                         # Card, ProgressRing, Skeleton

  services/ai/
    gemini.ts                   # Gemini API wrapper
    diseaseDetection.ts         # Photo analysis + diagnosis
    chatAdvisor.ts              # Farm chat
    taskGenerator.ts            # Daily task AI
    plantingPlanner.ts          # Crop recommendations
    riskScoring.ts              # Plot risk assessment
    plotLayout.ts               # Grid generation

  stores/
    farmStore.ts                # Zustand global state

  types/
    farm.ts                     # All TypeScript interfaces

  hooks/
    usePushNotifications.ts     # Push subscription
    useServiceWorker.ts         # SW registration

  lib/
    supabase/client.ts          # Client-side Supabase
    supabase/server.ts          # Server-side Supabase
    pushNotify.ts               # Web Push sender

public/
  manifest.json                 # PWA manifest
  sw.js                         # Service worker
  icons/                        # App icons
  sprites/                      # Crop sprite sheet
```

---

## 15. Known Gaps & Future Opportunities

### 15.1 Current Limitations
1. **No real-time collaboration** — single user per farm, no shared access
2. **No offline mode** — service worker caches shell but not data
3. **Market prices are simulated** — not connected to real FAMA/Agrobazaar data
4. **No IoT/sensor integration** — soil moisture, pH, etc. are not measured
5. **Weather detail hourly data is simulated** — derived from daily snapshot, not actual 3-hour intervals
6. **No push notification preferences** — all-or-nothing
7. **No i18n** — English only (Malay translation needed for Malaysian farmers)
8. **Financial dashboard lacks** budget planning, ROI projections
9. **Calendar page** is minimal — needs task scheduling, recurring events
10. **No export to PDF/CSV** fully working for all data types
11. **SwipeDrawer** missing accessibility roles
12. **Chart tooltips** not keyboard-accessible

### 15.2 Potential Features
1. **Real FAMA API integration** for Malaysian market prices
2. **Malay language (BM) toggle** — critical for target users
3. **IoT sensor dashboard** — soil moisture, pH, temperature probes
4. **Community features** — farmer-to-farmer marketplace, tips sharing
5. **Government subsidy tracker** — track BRIM, MySUBSIDI, ePerolehan
6. **Drone mapping integration** — aerial imagery for crop health
7. **Multi-user farm access** — family members, workers, agronomists
8. **Seasonal crop calendar** — Malaysian planting seasons
9. **Supply chain tracking** — from farm to market
10. **Voice commands** — for hands-free field use
11. **Comparison dashboard** — compare farm performance across seasons
12. **Harvest prediction ML** — yield forecasting based on growth data
13. **Pest/disease image database** — offline reference for common Malaysian crop diseases
14. **WhatsApp integration** — send daily summaries via WhatsApp (preferred by Malaysian farmers)
15. **Gamification** — streak tracking, farm health score, achievements

---

*This document serves as the complete technical reference for AgroSim. Use it to onboard new contributors, plan features, and discuss architectural decisions.*
