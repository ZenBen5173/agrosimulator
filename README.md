# AgroSim

> AI-powered digital twin for Malaysian smallholder farmers
> Built for Project 2030: MyAI Future Hackathon — Track 1: Padi & Plates (Agrotech & Food Security)

## What It Does

AgroSim transforms how Malaysian smallholder farmers manage their land by providing an AI-powered digital twin of their farm. Farmers draw their actual farm boundaries on a satellite map, and the system uses AI to research their soil, plan crop layouts, detect diseases through photos, manage inventory, track equipment, and generate daily weather-aware resource plans. It gives every farmer — regardless of farm size — access to precision agriculture tools previously reserved for large commercial operations.

## Key Features

### AI-Powered Farm Management
- **Firebase Genkit Flows** — 7 named, observable AI flows with 8 tool definitions for autonomous execution
- **Chat-to-Action** — AgroBot chat triggers DB writes + push notifications (create tasks, schedule watering, reorder items)
- **Multi-Turn Disease Detection** — Gemini Vision with 4-layer confidence system (never guesses below 85%)
- **Smart Daily Tasks** — AI generates prioritised to-do lists with exact resource quantities and cost estimates
- **Proactive Risk Scoring** — AI recalculates disease risk on every app open

### Resource & Inventory
- **Daily Prep List** — Exact water/fertilizer/pesticide quantities per plot based on MARDI guidelines
- **Receipt Scanning** — AI reads Malaysian receipts (BM/English, handwritten, thermal, WhatsApp) and auto-updates inventory
- **Automated Reorder** — AI projects when stock runs out and creates purchase requests
- **Equipment Tracking** — Straight-line depreciation, service alerts, cost-per-use calculation

### Intelligence Engine
- **Proactive Alerts** — 2 Vercel cron jobs scan for agricultural threats every 6 hours
- **Weather Pattern Detection** — Deterministic rules for fungal risk (4+ rain days), drought (7+ hot days), humidity stress
- **Treatment Monitoring** — Better/Same/Worse follow-up flow with automatic escalation
- **Financial Insights** — AI-powered cost-per-kg, cash flow projection, and proactive recommendations

### Farm Visualisation
- **Isometric Farm** — PixiJS 2.5D WebGL renderer with 6 weather states
- **Satellite Map** — Leaflet.js with Esri World Imagery tiles for farm boundary drawing
- **Market Charts** — Stock-market-style price visualisation with sparklines and area charts

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS, Framer Motion) |
| AI Orchestration | Firebase Genkit (7 flows, 8 tools) |
| AI Models | Gemini 2.5 Flash (disease) + Flash Lite (all other AI) |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS, 25 tables) |
| Farm Renderer | PixiJS v8 (WebGL isometric 2.5D) |
| Farm Map | Leaflet.js + Esri World Imagery tiles |
| Weather | OpenWeatherMap API |
| State | Zustand |
| Deployment | Vercel (auto-deploy + 2 cron jobs) |

## AI Usage Disclosure

This project uses AI in the following ways:

- **Firebase Genkit**: AI orchestration framework with named flows and tools for observable, traceable AI execution
- **Gemini 2.5 Flash**: Crop disease detection via multimodal vision analysis with multi-turn conversation
- **Gemini 2.5 Flash Lite**: Farm research, plot layout, task generation, risk scoring, planting plans, chat advisor, receipt scanning, intelligence scanning, financial insights
- **Gemini Tools**: 8 defined tools (getWeather, getPlots, getMarketPrices, getPlotHistory, getFarmContext, getInventory, getResourceProfile, searchAgriculturalNews)
- **AI-generated code**: Portions of this codebase were written with AI coding assistance (Claude Code). All code has been reviewed and is understood by the team.

## Setup Instructions

### Prerequisites

- Node.js 18+
- Supabase account (free tier)
- Google AI Studio API key (free)
- OpenWeatherMap API key (free)

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_OPENWEATHER_API_KEY=
```

### Installation

```bash
npm install
npm run dev
```

### Database Setup

Run the SQL schema against your Supabase project. Enable RLS on all tables.

## Architecture Overview

```
Client (React + PixiJS + Zustand)
  → Next.js API Routes (35+ endpoints)
    → Firebase Genkit (7 flows, 8 tools)
      → Gemini AI (structured JSON output)
    → Supabase (25 tables, RLS enabled)
    → OpenWeatherMap API
  → Vercel Cron Jobs (intelligence scan, weather patterns)
```

### Key Architectural Decisions
- **Genkit flows** make every AI call named, observable, and traceable — judges can see every tool call
- **Chat-to-Action** pattern: every AI output that warrants it writes to DB + sends push notification
- **3-layer fallback**: Real API → Gemini web search → Static mock — demo always works
- **Crop resource profiles**: MARDI-based JSON config powers all quantity calculations (no AI needed for math)
- **Supabase RLS** ensures farmers only see their own data
- **Confidence thresholds** prevent AI from guessing — uncertain diagnoses routed to human experts

## Team

- **Teo Zen Ben** — Development
- **Jeanette Tan En Jie** — Pitch & Presentation

## Live Demo

[https://agrosimulator.vercel.app](https://agrosimulator.vercel.app)
