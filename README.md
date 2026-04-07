# AgroSimulator

> AI-powered digital twin for Malaysian smallholder farmers
> Built for Project 2030: MyAI Future Hackathon — Track 1: Padi & Plates (Agrotech & Food Security)

## What It Does

AgroSimulator transforms how Malaysian smallholder farmers manage their land by providing an AI-powered digital twin of their farm. Farmers draw their actual farm boundaries on a satellite map, and the system uses AI to research their soil, plan crop layouts, detect diseases through photos, and generate daily weather-aware task lists. It gives every farmer — regardless of farm size — access to the kind of precision agriculture tools previously reserved for large commercial operations.

## Key Features

- **Interactive Isometric Farm** — PixiJS 2.5D WebGL renderer with 6 weather states (sun, rain, thunderstorm, drought, flood risk, overcast)
- **AI Planting Planner** — Gemini recommends optimal crops based on soil, weather, disease history, and market prices, with a full week-by-week care schedule
- **Multi-Turn Disease Detection** — Gemini Vision analyses crop photos with confidence thresholds (never guesses below 85%), asks follow-up questions, and routes uncertain cases to real experts
- **Smart Daily Tasks** — AI generates prioritised to-do lists based on weather forecasts, crop growth stages, and inspection history
- **Proactive Risk Scoring** — AI recalculates disease risk on every app open, with pulsing warning icons on the farm map
- **Real-Time Weather** — OpenWeatherMap integration with visual effects (rain particles, lightning flashes, drought tinting)
- **Crop Rotation Intelligence** — Recommends different crops after disease detection to break disease cycles

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS) |
| AI | Gemini 2.0 Flash (disease detection) + Flash Lite (all other AI) |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Farm Renderer | PixiJS v8 (WebGL isometric 2.5D) |
| Farm Map | Leaflet.js + Esri World Imagery tiles |
| Weather | OpenWeatherMap API |
| Deployment | Vercel |

## AI Usage Disclosure

This project uses AI in the following ways:

- **Gemini 2.0 Flash**: Crop disease detection via multimodal vision analysis with multi-turn conversation
- **Gemini 2.0 Flash Lite**: Soil research, plot layout planning, daily task generation, risk scoring, planting recommendations
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
NEXT_PUBLIC_APP_URL=
```

### Installation

```bash
npm install
npm run dev
```

### Database Setup

Run the SQL schema in `/supabase/schema.sql` against your Supabase project.
Enable RLS on all tables (policies included in schema file).

## Architecture Overview

- **Gemini called server-side only** via Next.js API routes — API key never exposed to client
- **PixiJS isolated** in `/components/FarmCanvas` — all WebGL logic separated from React
- **Supabase RLS** ensures farmers only see their own data — every table has row-level security
- **Mock fallbacks** for all AI calls ensure the app works even during API outages or quota exhaustion
- **Confidence thresholds** prevent the AI from guessing — uncertain diagnoses are routed to human experts

## Team

- **Ben** — Development
- **Jeanette** — Pitch & Presentation

## Live Demo

[https://agrosimulator.vercel.app](https://agrosimulator.vercel.app)
