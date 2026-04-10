const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, ExternalHyperlink,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, TableOfContents
} = require("docx");

// ── Colors ──
const GREEN = "1B7340";
const GREEN_LIGHT = "E8F5E9";
const GRAY_HEADER = "2E3440";
const GRAY_ROW_ALT = "F5F5F5";
const WHITE = "FFFFFF";
const BORDER_COLOR = "CCCCCC";

const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

// Page constants (US Letter)
const PAGE_W = 12240;
const PAGE_H = 15840;
const MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9360

// ── Helpers ──
function heading1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 }, children: [new TextRun({ text, bold: true, size: 32, font: "Arial", color: GREEN })] });
}
function heading2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 }, children: [new TextRun({ text, bold: true, size: 26, font: "Arial", color: GRAY_HEADER })] });
}
function bodyPara(text) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, size: 22, font: "Arial" })] });
}
function bodyBold(boldText, normalText) {
  return new Paragraph({ spacing: { after: 120 }, children: [
    new TextRun({ text: boldText, bold: true, size: 22, font: "Arial" }),
    new TextRun({ text: normalText, size: 22, font: "Arial" }),
  ]});
}
function bulletItem(text, bold) {
  const children = [];
  if (bold) {
    children.push(new TextRun({ text: bold, bold: true, size: 22, font: "Arial" }));
    children.push(new TextRun({ text: " " + text, size: 22, font: "Arial" }));
  } else {
    children.push(new TextRun({ text, size: 22, font: "Arial" }));
  }
  return new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children });
}
function numberedItem(text, ref) {
  return new Paragraph({ numbering: { reference: ref || "numbers", level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text, size: 22, font: "Arial" })] });
}

function makeTable(headers, rows, colWidths) {
  const tableRows = [];
  // Header row
  tableRows.push(new TableRow({
    children: headers.map((h, i) => new TableCell({
      borders, width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: GREEN, type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, font: "Arial", color: WHITE })] })]
    }))
  }));
  // Data rows
  rows.forEach((row, ri) => {
    tableRows.push(new TableRow({
      children: row.map((cell, ci) => new TableCell({
        borders, width: { size: colWidths[ci], type: WidthType.DXA },
        shading: { fill: ri % 2 === 0 ? WHITE : GRAY_ROW_ALT, type: ShadingType.CLEAR },
        margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20, font: "Arial" })] })]
      }))
    }));
  });
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: colWidths, rows: tableRows });
}

// ── Build Document ──
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: "Arial", color: GREEN }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Arial", color: GRAY_HEADER }, paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers3", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers4", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers5", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [
    // ── TITLE PAGE ──
    {
      properties: {
        page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } }
      },
      children: [
        new Paragraph({ spacing: { before: 4000 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "AgroSimulator", bold: true, size: 56, font: "Arial", color: GREEN })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "Application Report", size: 36, font: "Arial", color: GRAY_HEADER })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN, space: 1 } }, children: [] }),
        new Paragraph({ spacing: { before: 400 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "AI-Powered Farm Management for Malaysian Smallholder Farmers", italics: true, size: 24, font: "Arial", color: "666666" })] }),
        new Paragraph({ spacing: { before: 400 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "Project 2030: MyAI Future Hackathon", size: 22, font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "Track 1: Padi & Plates (Agrotech & Food Security)", size: 22, font: "Arial" })] }),
        new Paragraph({ spacing: { before: 600 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "April 2026", size: 22, font: "Arial", color: "888888" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new ExternalHyperlink({ children: [new TextRun({ text: "https://agrosimulator.vercel.app", style: "Hyperlink", size: 22 })], link: "https://agrosimulator.vercel.app" })] }),
        new Paragraph({ spacing: { before: 1200 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Team: Ben (Development) & Jeanette (Pitch & Presentation)", size: 20, font: "Arial", color: "888888" })] }),
      ]
    },

    // ── MAIN CONTENT ──
    {
      properties: {
        page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } }
      },
      headers: {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "AgroSimulator \u2014 Application Report", italics: true, size: 18, font: "Arial", color: "999999" })] })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Page ", size: 18, font: "Arial", color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, font: "Arial", color: "999999" })] })] })
      },
      children: [
        // TOC
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: "Arial", color: GREEN })] }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({ children: [new PageBreak()] }),

        // EXECUTIVE SUMMARY
        heading1("Executive Summary"),
        bodyPara("AgroSimulator is a mobile-first Progressive Web App that serves as an AI-powered digital twin for Malaysian smallholder farmers. Built for the Project 2030: MyAI Future Hackathon (Track 1: Padi & Plates \u2014 Agrotech & Food Security), the app transforms how farmers manage daily operations by combining real-time weather data, AI-driven task planning, precision resource calculations, disease detection, and inventory management into one unified morning briefing."),
        bodyPara("The app is live at agrosimulator.vercel.app and deployed automatically via Vercel. It features 7 AI flows powered by Firebase Genkit, 25 database tables with Row Level Security, 35+ API routes, and a Chat-to-Action architecture where AI autonomously writes to the database and sends push notifications."),
        new Paragraph({ children: [new PageBreak()] }),

        // 1. THE PROBLEM
        heading1("1. The Problem"),
        bodyPara("Malaysian smallholder farmers make up 85% of the country\u2019s agricultural workforce. They manage their farms using notebooks, memory, and WhatsApp messages. They face critical challenges that limit their productivity and income:"),
        bulletItem("No access to precision agriculture tools \u2014 these are reserved for large commercial farms with dedicated agronomy teams"),
        bulletItem("Guesswork on resource quantities \u2014 how much fertilizer per plot? How much water today?"),
        bulletItem("Delayed disease detection \u2014 by the time symptoms are visible to the untrained eye, significant crop damage has already occurred"),
        bulletItem("No inventory tracking \u2014 farmers don\u2019t know when they\u2019ll run out of supplies until they reach for the bag and it\u2019s empty"),
        bulletItem("No financial visibility \u2014 the true cost per kilogram of production is unknown, making it impossible to price competitively"),
        bulletItem("Weather-dependent decisions made without weather data \u2014 spray timing, watering schedules, and harvest decisions are based on instinct"),
        new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun({ text: "AgroSimulator solves all six problems in a single app.", bold: true, italics: true, size: 22, font: "Arial", color: GREEN })] }),
        new Paragraph({ children: [new PageBreak()] }),

        // 2. THE SOLUTION
        heading1("2. The Solution"),
        bodyPara("AgroSimulator provides a \u201Cmorning briefing\u201D experience. When a farmer opens the app at 6am, they see everything they need on one screen:"),
        numberedItem("Weather conditions and 5-day forecast", "numbers"),
        numberedItem("Exactly what to bring to the farm (litres of water, grams of fertilizer, ml of pesticide)", "numbers"),
        numberedItem("Today\u2019s prioritized task list with resource quantities attached to each task", "numbers"),
        numberedItem("Active treatment follow-ups (did yesterday\u2019s treatment work?)", "numbers"),
        numberedItem("Low stock alerts (you\u2019re running out of NPK fertilizer)", "numbers"),
        numberedItem("Proactive AI alerts (disease outbreak detected in your district, weather pattern warning)", "numbers"),
        bodyPara(""),
        bodyBold("The app replaces four separate tools:", " the farmer\u2019s notebook, receipt box, weather app, and spreadsheet \u2014 all in one mobile-first interface designed for use in the field."),
        new Paragraph({ children: [new PageBreak()] }),

        // 3. KEY FEATURES
        heading1("3. Key Features"),

        heading2("Feature 1: Morning Briefing (Home Screen)"),
        bulletItem("Single-scroll dashboard showing everything a farmer needs before leaving home"),
        bulletItem("Weather strip with 5-day forecast at a glance"),
        bulletItem("Prep list card showing exact resource quantities per plot (water, fertilizer, pesticide)"),
        bulletItem("Task list with checkboxes, priority badges, and resource amounts inline"),
        bulletItem("Treatment follow-up buttons (Better / Same / Worse) displayed inline for quick response"),
        bulletItem("Low stock warnings with direct reorder links"),

        heading2("Feature 2: AI-Powered Farm Setup"),
        bulletItem("Farmer draws farm boundary on satellite map using touch gestures"),
        bulletItem("AI researches soil type, water source, and nearest irrigation scheme from GPS coordinates"),
        bulletItem("AI generates optimal crop layout with rotation recommendations based on soil and market data"),
        bulletItem("Complete farm setup in under 5 minutes \u2014 no technical knowledge required"),

        heading2("Feature 3: Smart Daily Tasks"),
        bulletItem("AI generates prioritized daily tasks based on weather, crop growth stage, and risk scores"),
        bulletItem("Each task includes exact resource quantities (e.g., \u201CFertilize Plot A1 \u2014 200g NPK 15-15-15\u201D)"),
        bulletItem("Tasks calculated using MARDI (Malaysian Agricultural Research and Development Institute) guidelines"),
        bulletItem("When a task is completed, inventory is automatically deducted from stock"),

        heading2("Feature 4: Disease Detection (4-Layer System)"),
        bulletItem("Layer 1: Farmer photographs crop, AI analyzes with 85% confidence threshold \u2014 never guesses"),
        bulletItem("Layer 2: AI asks adaptive follow-up questions if confidence is below threshold"),
        bulletItem("Layer 3: Test kit integration \u2014 read soil pH strips and fungal test strips via camera"),
        bulletItem("Layer 4: Expert referral with auto-generated case package (photos, answers, plot history, AI reasoning)"),
        bulletItem("Treatment monitoring: automatic 5-day follow-up with Better/Same/Worse tracking"),
        bulletItem("If treatment fails: automatic escalation \u2014 \u201CSame\u201D schedules 3-day recheck, \u201CWorse\u201D triggers expert referral"),

        heading2("Feature 5: Receipt Scanning (Zero Data Entry)"),
        bulletItem("Farmer photographs a receipt from the agricultural shop"),
        bulletItem("AI reads the receipt \u2014 supports handwritten Bahasa Malaysia, thermal printed, WhatsApp screenshots"),
        bulletItem("Extracts items, quantities, prices with confidence indicators (green = auto-confirm, amber = verify, red = manual)"),
        bulletItem("One tap to confirm and update inventory automatically \u2014 zero typing required"),

        heading2("Feature 6: Inventory & Equipment Management"),
        bulletItem("Track all farm supplies (fertilizers, pesticides, seeds) with current stock levels"),
        bulletItem("Automatic reorder alerts when stock drops below configurable threshold"),
        bulletItem("Equipment tracking with straight-line depreciation calculations"),
        bulletItem("True daily cost breakdown: consumables + equipment wear per plot"),

        heading2("Feature 7: Proactive Intelligence Engine"),
        bulletItem("Automatically scans for agricultural threats every 6 hours via Vercel cron jobs"),
        bulletItem("Weather pattern detection: fungal risk after 4+ consecutive rain days, drought after 7+ hot days, flood risk above 50mm"),
        bulletItem("Community disease outbreak detection across farms in the same district (completely anonymous)"),
        bulletItem("Targeted alerts \u2014 only farmers growing affected crops in affected regions receive warnings"),

        heading2("Feature 8: Chat-to-Action AI Advisor (AgroBot)"),
        bulletItem("Conversational AI advisor that can take real actions, not just give text advice"),
        bulletItem("\u201CWater my paddy\u201D \u2192 creates a watering task with calculated quantity based on MARDI guidelines"),
        bulletItem("\u201CI need more fertilizer\u201D \u2192 creates a reorder request in the purchase system"),
        bulletItem("\u201CSchedule inspection for A1\u201D \u2192 creates an inspection task for the specified plot"),
        bulletItem("Every action writes to the database AND sends a push notification"),
        bulletItem("Shows which AI tools were used for each response (transparency badges in the chat UI)"),

        heading2("Feature 9: Financial Dashboard"),
        bulletItem("Income vs expense tracking with interactive charts (Recharts)"),
        bulletItem("Cost-per-kg calculation per crop \u2014 know the true production cost"),
        bulletItem("8-week cash flow projection based on spending patterns and expected harvests"),
        bulletItem("AI-powered financial insights and proactive recommendations"),
        bulletItem("Equipment depreciation integrated into true cost calculations"),

        heading2("Feature 10: Farm Visualization"),
        bulletItem("Isometric 2.5D farm view rendered with PixiJS WebGL for smooth performance"),
        bulletItem("6 weather states with real-time animations (sunny, rain, thunderstorm, drought, flood risk, overcast)"),
        bulletItem("Crop sprites change per growth stage (seedling, growing, mature, harvest-ready)"),
        bulletItem("Risk warning overlays on affected plots (yellow/orange/red pulsing indicators)"),
        bulletItem("Satellite map with hand-drawn farm boundaries via Leaflet.js"),
        new Paragraph({ children: [new PageBreak()] }),

        // 4. TECHNOLOGY STACK
        heading1("4. Technology Stack"),
        bodyPara("AgroSimulator is built with a modern, production-grade technology stack optimized for mobile-first performance and AI integration:"),
        makeTable(
          ["Layer", "Technology", "Purpose"],
          [
            ["Frontend", "Next.js 16, TypeScript, Tailwind CSS, Framer Motion", "Mobile-first responsive UI with smooth animations"],
            ["AI Orchestration", "Firebase Genkit (7 flows, 8 tools)", "Observable, traceable AI execution with named tools"],
            ["AI Models", "Google Gemini 2.5 Flash + Flash Lite", "Disease detection (high accuracy) + all other AI tasks"],
            ["Database", "Supabase (PostgreSQL)", "25 tables with Row Level Security on every table"],
            ["Authentication", "Supabase Auth (Magic Link OTP)", "Passwordless login via email"],
            ["Farm Map", "Leaflet.js + Esri World Imagery", "Satellite map for farm boundary drawing"],
            ["Farm Renderer", "PixiJS v8 (WebGL)", "Isometric 2.5D farm visualization"],
            ["Weather", "OpenWeatherMap API", "Real-time conditions and 5-day forecast"],
            ["Hosting", "Vercel", "Auto-deploy on push, 2 cron jobs for intelligence engine"],
            ["Push Notifications", "Web Push (VAPID)", "Browser push notifications for alerts and reminders"],
            ["State Management", "Zustand", "Lightweight client-side state"],
            ["Charts", "Recharts", "Financial dashboard visualizations"],
          ],
          [2000, 3360, 4000]
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // 5. AI ARCHITECTURE
        heading1("5. AI Architecture: The Chat-to-Action System"),
        bodyPara("The key innovation in AgroSimulator is the transition from \u201CChat\u201D to \u201CAction.\u201D Traditional AI chatbots return text responses. AgroSimulator\u2019s AI returns text AND takes autonomous action \u2014 writing to the database, creating tasks, updating inventory, and sending push notifications without additional user input."),

        heading2("How It Works"),
        numberedItem("Firebase Genkit provides the orchestration layer with 7 named, observable flows", "numbers2"),
        numberedItem("Each flow has access to 8 tools that can read farm data autonomously", "numbers2"),
        numberedItem("When the AI determines an action is needed, it writes to the database AND sends a push notification", "numbers2"),
        numberedItem("Every AI decision is traceable \u2014 judges can see exactly which tools were called and in what order", "numbers2"),

        heading2("The 7 Genkit Flows"),
        makeTable(
          ["#", "Flow Name", "Purpose"],
          [
            ["1", "Daily Farm Operations", "Generates morning prep list and tasks using all 8 tools"],
            ["2", "Disease Diagnosis", "Multi-turn analysis with confidence thresholds and escalation"],
            ["3", "Risk Assessment", "Calculates disease and stress risk per plot from weather + history"],
            ["4", "Planting Recommendation", "Suggests optimal crops based on rotation, soil, and market prices"],
            ["5", "Intelligence Scan", "Scans for agricultural threats from news sources and weather data"],
            ["6", "Inventory Reorder", "Projects when stock runs out and recommends order quantities"],
            ["7", "Chat Action", "Enables the AI advisor to create tasks, alerts, and reorder requests"],
          ],
          [500, 3000, 5860]
        ),

        heading2("The 8 AI Tools"),
        makeTable(
          ["Tool", "What It Does"],
          [
            ["getWeather", "Fetches current conditions and forecast for the farm location"],
            ["getPlots", "Returns all active plots with crop, growth stage, and risk data"],
            ["getMarketPrices", "Returns current market prices and price trends"],
            ["getPlotHistory", "Returns inspection and treatment history for a specific plot"],
            ["getFarmContext", "Returns farm metadata: soil type, water source, location, area"],
            ["getInventory", "Returns current stock levels for all inventory items"],
            ["getResourceProfile", "Looks up MARDI-based crop requirements per growth stage"],
            ["searchAgriculturalNews", "Searches the web for Malaysian agricultural threats and news"],
          ],
          [2800, 6560]
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // 6. DATA ARCHITECTURE
        heading1("6. Data Architecture"),
        bodyPara("The application uses 25 database tables organized by domain, all hosted on Supabase (PostgreSQL) with Row Level Security enabled on every table. This ensures farmers can only access their own farm data."),
        makeTable(
          ["Domain", "Tables"],
          [
            ["Farm Management", "farms, plots, grid_cells, farm_zones, farm_features"],
            ["Tasks & Operations", "tasks, resource_prep_lists"],
            ["Disease & Health", "plot_events, diagnosis_sessions, treatment_monitoring"],
            ["Inventory", "inventory_items, inventory_movements, receipt_scans, purchase_requests"],
            ["Equipment", "equipment, equipment_usage"],
            ["Financial", "financial_records"],
            ["Intelligence", "farm_alerts"],
            ["User & Communication", "chat_messages, push_subscriptions, planting_plans"],
            ["External Data", "weather_snapshots, market_prices"],
          ],
          [2800, 6560]
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // 7. 3-LAYER FALLBACK
        heading1("7. The 3-Layer Fallback System"),
        bodyPara("Every external service in AgroSimulator uses a 3-layer fallback pattern to ensure the app always works \u2014 especially critical during live demos:"),
        bulletItem("Real API call (OpenWeatherMap, Gemini, etc.)", "Layer 1:"),
        bulletItem("Gemini web search \u2014 searches for current data if the primary API fails", "Layer 2:"),
        bulletItem("Static mock data \u2014 hardcoded realistic Malaysian agricultural data as last resort", "Layer 3:"),
        bodyPara("This means the demo always works regardless of API key status, rate limits, or network issues. Even the fallback data is realistic because it\u2019s based on actual Malaysian agricultural conditions."),

        // 8. CROP RESOURCE PROFILES
        heading1("8. Crop Resource Profiles"),
        bodyPara("Resource calculations are powered by a static configuration based on MARDI Malaysian agricultural guidelines. This covers 6 crops across 5 growth stages (seedling, growing, mature, harvest-ready, harvested):"),
        bodyPara("Crops covered: Paddy, Chilli, Kangkung (Water Spinach), Banana, Corn, and Sweet Potato."),
        bodyPara("For each crop and growth stage, the system knows:"),
        bulletItem("Water requirement (ml per square metre per day)"),
        bulletItem("Rain threshold for skipping watering (mm)"),
        bulletItem("Fertilizer type and quantity (grams per square metre)"),
        bulletItem("Fertilizer application frequency (days between applications)"),
        bulletItem("Pesticide type and quantity (ml per square metre)"),
        bulletItem("Risk score threshold triggering pesticide application"),
        bulletItem("Labour time estimate (minutes per plot)"),
        bodyPara(""),
        bodyBold("These are not AI-generated guesses", " \u2014 they are based on established agricultural science applied specifically to Malaysian tropical conditions."),
        new Paragraph({ children: [new PageBreak()] }),

        // 9. UX DESIGN
        heading1("9. User Experience Design"),
        heading2("Navigation"),
        bodyPara("The app uses a 5-tab bottom navigation bar designed around the farmer\u2019s daily workflow:"),
        makeTable(
          ["Tab", "Purpose"],
          [
            ["Today", "Morning briefing \u2014 everything needed before leaving home"],
            ["Farm", "Isometric map view + plot details and management"],
            ["[+] Quick Actions", "6 quick actions: Scan Crop, Scan Receipt, Add Record, Weather, Market, Settings"],
            ["Chat", "AI advisor with autonomous action capability"],
            ["Money", "Financial dashboard, charts, and AI insights"],
          ],
          [2200, 7160]
        ),

        heading2("Design Principles"),
        numberedItem("Morning-first: Everything needed before leaving home, visible in one scroll \u2014 no hidden drawers or buried menus", "numbers3"),
        numberedItem("Action over information: Every screen leads to a concrete action the farmer can take immediately", "numbers3"),
        numberedItem("Confidence-based UI: Green = confirmed and safe, Amber = verify before proceeding, Red = needs attention now", "numbers3"),
        numberedItem("Zero typing: Receipt scanning, photo-based diagnosis, tap-to-complete tasks \u2014 designed for field use", "numbers3"),
        numberedItem("Malaysian context: Bahasa Malaysia receipt support, local crop varieties, MARDI guidelines, FAMA market prices", "numbers3"),

        heading2("Visual Language"),
        bulletItem("Consistent white headers with back navigation across all detail pages"),
        bulletItem("Clean card-based layout with subtle shadows and rounded corners"),
        bulletItem("Green brand color (#16a34a) for primary actions and active states"),
        bulletItem("Framer Motion animations for smooth transitions and feedback"),
        bulletItem("Responsive mobile-first design (375px target) with safe-area support for modern phones"),
        new Paragraph({ children: [new PageBreak()] }),

        // 10. DEPLOYMENT
        heading1("10. Deployment & Infrastructure"),
        bulletItem("Public GitHub repository with no secrets committed"),
        bulletItem("Vercel hosting with automatic deployment on push to master branch"),
        bulletItem("2 Vercel Cron Jobs: intelligence scan (every 6 hours), weather pattern detection (daily at 6am)"),
        bulletItem("Supabase hosted in ap-southeast-1 region (Singapore \u2014 closest to Malaysia for low latency)"),
        bulletItem("Progressive Web App: installable on home screen, offline-capable service worker"),
        bulletItem("Web Push notifications via VAPID keys for alerts and task reminders"),

        // 11. TEAM
        heading1("11. Team"),
        makeTable(
          ["Member", "Role", "Responsibilities"],
          [
            ["Ben", "Development", "All coding, architecture, AI integration, database design, UI/UX implementation"],
            ["Jeanette", "Pitch & Presentation", "Demo video (3 min max), Google Slides deck (15 slides max), submission"],
          ],
          [1500, 2500, 5360]
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // 12. JUDGING CRITERIA
        heading1("12. Judging Criteria Alignment"),
        bodyPara("The following table shows how AgroSimulator addresses each hackathon judging criterion:"),
        makeTable(
          ["Criterion", "How AgroSimulator Scores"],
          [
            ["Innovation & Creativity", "First app to combine isometric farm visualization with AI-powered precision resource planning for Malaysian smallholders. Receipt scanning for handwritten BM receipts is a novel application of Gemini Vision."],
            ["Technical Implementation", "7 Genkit flows, 8 AI tools, 25 DB tables with RLS, 35+ API routes, 3-layer service fallback, 2 Vercel cron jobs, WebGL farm renderer, PWA with push notifications."],
            ["AI Integration (Gemini)", "Chat-to-Action architecture where AI autonomously calls named tools, writes to the database, and sends push notifications. Observable and traceable \u2014 not just a chatbot, but an agent."],
            ["Impact & Practicality", "Solves real daily problems: what to bring, what to do, what\u2019s wrong with crops, when to reorder supplies. Built with Malaysian crop varieties, MARDI guidelines, and local market data."],
            ["User Experience", "Morning-first design philosophy, zero-typing interactions, confidence-based interfaces, single-scroll briefing. Designed for farmers using the app in the field."],
            ["Scalability", "Supabase RLS for secure multi-tenant data isolation, Vercel edge deployment for global performance, Genkit flows for observable AI execution at scale."],
          ],
          [2200, 7160]
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // 13. FUTURE ROADMAP
        heading1("13. Future Roadmap"),
        heading2("Phase 1 (Post-Hackathon)"),
        bulletItem("WhatsApp integration for supplier ordering (pre-filled RFQ messages)"),
        bulletItem("PDF report generation for diagnosis reports and financial statements"),
        bulletItem("Expert marketplace with video call booking and on-site consultation"),

        heading2("Phase 2"),
        bulletItem("Labour and workforce management (worker registry, scheduling, cost per plot)"),
        bulletItem("Customer directory with AI-calculated payment reliability scores"),
        bulletItem("AI market timing alerts (price spike + harvest ready = sell now notification)"),

        heading2("Phase 3"),
        bulletItem("Loan tracking for Agrobank and TEKUN agricultural financing"),
        bulletItem("Subsidy claim assistance (Subsidi Baja, MySUBSIDI integration)"),
        bulletItem("Season-over-season comparison and yield improvement tracking"),

        heading2("Phase 4"),
        bulletItem("Community features \u2014 anonymous cross-farm disease detection and regional alerts"),
        bulletItem("Regional market insights aggregated from participating farms"),
        bulletItem("Farmer cooperative features for shared equipment and bulk purchasing"),
      ]
    }
  ]
});

// ── Write File ──
const outPath = process.argv[2] || "AgroSimulator_App_Report.docx";
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outPath, buffer);
  console.log("Report generated:", outPath, "(" + (buffer.length / 1024).toFixed(0) + " KB)");
});
