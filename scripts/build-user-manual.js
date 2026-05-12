/**
 * Build the AgroSim User Manual as a Word document.
 *
 * Run with: node scripts/build-user-manual.js
 * Output:   C:\Users\teoze\Desktop\AgroSim\AgroSim_User_Manual.docx
 */

const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  PageOrientation,
} = require("docx");

const OUTPUT_PATH =
  "C:/Users/teoze/Desktop/AgroSim/AgroSim_User_Manual.docx";

// ─── Helpers ────────────────────────────────────────────────────

function title(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 48, font: "Arial" })],
    alignment: AlignmentType.LEFT,
    spacing: { before: 0, after: 240 },
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text })],
  });
}

function p(text) {
  return new Paragraph({
    children: [new TextRun({ text })],
    spacing: { after: 120 },
  });
}

/**
 * Paragraph supporting inline bold runs.
 * Pass an array of either strings (regular) or {b: "..."} (bold).
 */
function pmix(...parts) {
  return new Paragraph({
    children: parts.map((part) => {
      if (typeof part === "string") return new TextRun({ text: part });
      if (part.b) return new TextRun({ text: part.b, bold: true });
      if (part.i) return new TextRun({ text: part.i, italics: true });
      return new TextRun({ text: String(part) });
    }),
    spacing: { after: 120 },
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text })],
  });
}

function bulletMix(...parts) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: parts.map((part) => {
      if (typeof part === "string") return new TextRun({ text: part });
      if (part.b) return new TextRun({ text: part.b, bold: true });
      if (part.i) return new TextRun({ text: part.i, italics: true });
      return new TextRun({ text: String(part) });
    }),
  });
}

function numbered(text) {
  return new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    children: [new TextRun({ text })],
  });
}

function numberedMix(...parts) {
  return new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    children: parts.map((part) => {
      if (typeof part === "string") return new TextRun({ text: part });
      if (part.b) return new TextRun({ text: part.b, bold: true });
      if (part.i) return new TextRun({ text: part.i, italics: true });
      return new TextRun({ text: String(part) });
    }),
  });
}

function quote(text) {
  return new Paragraph({
    children: [new TextRun({ text, italics: true })],
    indent: { left: 720 },
    spacing: { after: 120 },
  });
}

// ─── Content ────────────────────────────────────────────────────

const children = [];

children.push(title("AgroSim — The Full User Manual"));
children.push(
  pmix({ i: "Plain English. Written for a curious user, not a developer." })
);

// ── Section: What it is ──
children.push(h1("What it is, in one breath"));
children.push(
  pmix(
    "AgroSim is a phone app for ",
    { b: "Malaysian smallholder farmers" },
    " — the kind of person who farms 2 to 10 acres of chilli, paddy, kangkung, banana, corn or sweet potato by themselves or with family. It does three things:"
  )
);
children.push(numbered("Watches over the crops so a disease doesn't wipe out a season."));
children.push(numbered("Keeps the books so the farmer knows what's actually making money."));
children.push(numbered("Connects the farmer to nearby farmers so middlemen stop squeezing them on price."));

// ── Section: Who it's for ──
children.push(h1("Who it's for — and why they need it"));
children.push(
  p(
    "Imagine you're a chilli farmer in Cameron Highlands. You wake at 5am, walk to your plot alone, and you make every decision by yourself. You have:"
  )
);
children.push(
  bulletMix({ b: "No agronomist" }, " — when your chilli plant gets sick, no one to call.")
);
children.push(
  bulletMix({ b: "No accountant" }, " — your books are receipts in a shoebox plus your memory.")
);
children.push(
  bulletMix(
    { b: "No purchasing department" },
    " — agri shop charges you RM 95 for a sack of fertilizer; you don't know if that's fair."
  )
);
children.push(
  bulletMix(
    { b: "No sales team" },
    " — middleman pays you RM 3.80/kg for chilli; you don't know other farmers got RM 4.20 the same week."
  )
);
children.push(
  pmix(
    "You're the smallest player in a system designed by people much bigger than you. ",
    { b: "AgroSim's whole job is to give you the things you're missing." }
  )
);

// ── Section: The big idea ──
children.push(h1("The big idea — three layers"));
children.push(
  p(
    "Think of AgroSim like a hospital with three departments. Each layer is a separate idea, but they share data so the whole thing feels like one app."
  )
);

// CARE
children.push(h2("Layer 1 — CARE: protect what's already in the ground"));
children.push(
  p(
    "When something looks wrong with your crop, you tap Inspect. The app doesn't just glance at a photo and shout an answer. It thinks like a real doctor."
  )
);

children.push(
  numberedMix(
    { b: "The smart question." },
    " Before any photo, it asks: Is this happening to one plant, a few plants, the whole plot, or other crops too? If it affects other crops, it's almost never a disease — it's water, drainage, or chemical damage. No other plant disease app asks this first. They all jump to the photo and get it wrong."
  )
);
children.push(
  numberedMix(
    { b: "The photo." },
    " You frame the sick leaf, and try to fit a healthy leaf in the same shot for comparison."
  )
);
children.push(
  numberedMix(
    { b: "The AI thinks out loud." },
    " Instead of \"Anthracnose, 87%\", it shows you 5 possibilities and crosses out the wrong ones with reasons:"
  )
);
children.push(quote("Not bacterial wilt — plant isn't drooping; bacterial wilt would make it flop."));
children.push(quote("Not iron deficiency — iron affects NEW leaves; yours started in OLD leaves."));
children.push(quote("Not Cercospora — would have frog-eye rings; yours doesn't."));
children.push(quote("Most likely: Anthracnose 62% or Phosphorus deficiency 28%."));
children.push(
  numberedMix(
    { b: "The smell test (the part nobody else does)." },
    " AI picks ONE confirmation test you can do with your hands. For example: \"Cut a fruit. Smell the inside: sour, earthy, or nothing?\" You sniff. Sour. Confirmed: Anthracnose, 91%."
  )
);
children.push(
  numberedMix(
    { b: "Two-part prescription." },
    " Stop it now (spray Mancozeb every 7 days, 3 times — generic costs RM 12 at Kedai Ah Kow nearby). Stop it coming back (less overhead watering, prune lower leaves, plant resistant variety next season)."
  )
);
children.push(
  numberedMix(
    { b: "Five-day check-in." },
    " A push notification: \"How are the plants? Better, Same, or Worse?\" Better closes the case. Same schedules a 3-day recheck. Worse auto-sends your photos and history to a real MARDI extension officer."
  )
);
children.push(
  numberedMix(
    { b: "Honest uncertainty." },
    " If the AI is less than 70% sure at any point, it refuses to guess. It says \"I don't know — let me send this to a real expert.\" That's the trust posture: it would rather admit ignorance than be confidently wrong."
  )
);

// BOOKS
children.push(h2("Layer 2 — BOOKS: know what's actually working"));
children.push(p("This replaces the notebook plus receipt-box that most farmers currently use."));
children.push(
  pmix(
    { b: "Receipt scanning." },
    " You photograph any agri-shop receipt — BM or English, handwritten or printed, even a WhatsApp screenshot. The AI reads it in 8 seconds: supplier, items, quantities, prices. You tap Confirm, and your inventory updates. No typing. (Soon: forward the receipt to AgroSim's WhatsApp number — no need to even open the app.)"
  )
);
children.push(
  pmix(
    { b: "Inventory." },
    " Tracks every input you have (Mancozeb, NPK, Urea, etc.). Receipts add. Treatments deduct. A red warning pops up before you run out."
  )
);
children.push(
  pmix(
    { b: "Sales log." },
    " When you sell your chilli, log how much and what price. This single piece of data is what makes the Pact layer work."
  )
);
children.push(
  pmix(
    { b: "The end goal of Books " },
    "is one killer line at the end of each season: \"Your chilli made RM 3.40 per kilo, your kangkung made 80 sen. Grow more chilli next season.\" Most smallholders never know this because nothing recorded it. AgroSim records painlessly so the answer is always there."
  )
);

// PACT
children.push(h2("Layer 3 — PACT: collective power against the middleman"));
children.push(p("The most novel layer, and the one no other app has."));
children.push(
  pmix({ b: "Anonymous district price benchmark." }, " Every week, a quiet message:")
);
children.push(quote("Other chilli farmers in Cameron Highlands averaged RM 4.20/kg this week. You sold at RM 3.80."));
children.push(
  p(
    "That one line destroys the middleman's biggest weapon: information asymmetry. The middleman knows the price. The farmer didn't — until now. Every individual farmer's number stays anonymous; only the district median is shown."
  )
);
children.push(
  pmix(
    { b: "Group buying." },
    " Five farmers in the same kampung want NPK this month. Alone, each pays RM 95. Together, they pay RM 78 — saving RM 17 per sack. Anyone can start a group buy. Other farmers in the same district see it and tap to join. When the minimum is met, AgroSim sends one combined order to the supplier."
  )
);
children.push(
  pmix(
    { b: "Network disease early warning." },
    " When 3 farms within 8 km confirm the same disease, AgroSim quietly tells everyone else in the area: \"3 farms near you have anthracnose this week — inspect Plot B today.\" No solo-farmer app can do this; it falls out of the network for free."
  )
);

// ── Section: Every screen ──
children.push(h1("Every screen, what you tap, and what it shows"));

children.push(h2("1. Landing page (/)"));
children.push(
  p(
    "First thing you see. A clean white page with the headline \"Stop farming alone\" and three buttons:"
  )
);
children.push(bulletMix({ b: "Enter the demo" }, " (black, big) — signs you in as Pak Ali (the demo character)"));
children.push(bulletMix({ b: "Reset to baseline + enter" }, " (orange) — wipes everything and starts you fresh"));
children.push(bulletMix({ b: "Dev sign-in" }, " (small grey) — for testing, no welcome tour"));

children.push(h2("2. Today (/home) — the home base"));
children.push(p("The first screen you see after signing in. Has, top to bottom:"));
children.push(bullet("Your name plus notification bell"));
children.push(bullet("AI summary — a one-paragraph good-morning message tailored to weather and tasks"));
children.push(bullet("Quick Links — buttons to Inspect / Receipt / Market / Inventory / Weather"));
children.push(bullet("Today's hourly weather plus 7-day forecast"));
children.push(bullet("Tasks list — today's urgent and normal items"));
children.push(bullet("Low-stock warnings if any input is running out"));

children.push(h2("3. Inspect (/inspection/v2) — the doctor"));
children.push(p("Multi-stage form:"));
children.push(bullet("Pick crop (chilli, paddy, etc.)"));
children.push(bullet("Pattern question — one plant / few / whole plot / other crops too"));
children.push(bullet("Photo — camera opens, you snap"));
children.push(bullet("Differential ladder appears, with crossed-out diseases plus reasons"));
children.push(bullet("Up to 3 history questions (when did it start, recent weather, recent sprays)"));
children.push(bullet("Physical confirmation test with photos and smell options"));
children.push(bullet("Final diagnosis with full reasoning (why I'm sure, what I ruled out, what I'm still not sure about)"));
children.push(bullet("Two-part prescription with brand names and RM prices"));
children.push(bullet("5-day follow-up automatically scheduled"));

children.push(h2("4. Pact / Market (/market)"));
children.push(p("The Pact surface, top to bottom:"));
children.push(bullet("District + crop dropdowns at the top"));
children.push(bullet("Anonymous district price card (the killer line in green/amber/grey depending on whether you're above/below/at the median)"));
children.push(bullet("Log a sale collapsible form (your number stays anonymous)"));
children.push(bullet("List of open group buys in your district, each showing bulk price, savings, progress bar — tap to see detail or join"));
children.push(bullet("\"+ Start one\" link to create your own group buy"));

children.push(h2("5. Group buy detail (/pact/group-buys/[id])"));
children.push(bullet("Item name, district, supplier"));
children.push(bullet("Bulk price vs alone price plus how much you save per unit"));
children.push(bullet("Progress bar showing how many joined / how many needed"));
children.push(bullet("Join button (with quantity picker) — or Leave if you're already in"));
children.push(bullet("Closes-at countdown"));

children.push(h2("6. Start group buy (/pact/group-buys/new)"));
children.push(p("Simple form:"));
children.push(bullet("District, item name, unit"));
children.push(bullet("Individual price (what you'd pay alone) + bulk price"));
children.push(bullet("Live \"Each farmer saves X%\" indicator as you type"));
children.push(bullet("Minimum participants, days open"));
children.push(bullet("Optional supplier name"));
children.push(bullet("Open the group buy → other farmers in your district see it instantly"));

children.push(h2("7. Receipts (/receipts)"));
children.push(bulletMix({ b: "Open camera" }, " (green) or ", { b: "Choose image" }, " (white)"));
children.push(bullet("After you snap → loading screen → review screen"));
children.push(p("Review shows supplier, date, all line items with confidence colour coding:"));
children.push(bullet("Green row = looks right, no need to check"));
children.push(bullet("Amber row = please glance over"));
children.push(bullet("Red row = please verify carefully"));
children.push(bullet("Warnings panel if anything looks off (totals don't add up, missing supplier, etc.)"));
children.push(bulletMix({ b: "Looks right — Add to inventory" }, " button writes everything to your books"));

children.push(h2("8. Inventory (/inventory)"));
children.push(bullet("List of every input you have on hand"));
children.push(bullet("Each shows current quantity plus unit (e.g. 1.5 kg) and whether it's low"));
children.push(bullet("Tap an item to see purchase plus usage history"));

children.push(h2("9. Weather (/weather)"));
children.push(bullet("Today's hourly forecast (rain chance, temp curve)"));
children.push(bullet("7-day outlook"));
children.push(bullet("Used by Care layer to detect risky weather (4 rainy days = anthracnose risk for chilli)"));

children.push(h2("10. Treatment follow-up (/diagnosis/followup/[id])"));
children.push(p("The 5-day check-in screen. Three big tap buttons:"));
children.push(bulletMix({ b: "Better" }, " (green) — closes case, plot warning cleared"));
children.push(bulletMix({ b: "Same" }, " (orange) — schedules a 3-day recheck"));
children.push(bulletMix({ b: "Worse" }, " (red) — escalates to a real MARDI extension officer"));
children.push(bullet("Optional notes box. After tapping → result screen tells you what AgroSim is doing about it."));

children.push(h2("11. Settings (/settings)"));
children.push(bullet("Profile (your name, phone, district)"));
children.push(bullet("Farm management (add new farm, edit boundary)"));
children.push(bullet("Inventory summary"));
children.push(
  bulletMix(
    { b: "For the demo user only:" },
    " an orange Reset demo data button — wipes everything you've added during this session and reseeds the baseline. Lets you do login → test → reset → repeat for clean demos"
  )
);
children.push(bulletMix({ b: "Sign Out" }, " at the bottom (red)"));

children.push(h2("12. Onboarding (first-time only, /onboarding)"));
children.push(bullet("Draw your farm boundary on a satellite map"));
children.push(bullet("Confirm soil type and crops for each zone"));
children.push(bullet("AI auto-suggests sensible defaults"));
children.push(bullet("Confirm → you're in"));

// ── Section: What makes AgroSim different ──
children.push(h1("What makes AgroSim genuinely different"));

children.push(
  numberedMix(
    { b: "The diagnosis thinks like a doctor" },
    ", not like a vending machine. It shows reasoning, rules things out with evidence, asks a confirmation test, admits uncertainty, follows up after 5 days."
  )
);
children.push(
  numberedMix(
    { b: "Smell is a structured input." },
    " No other app uses smell, even though plant doctors do — bacterial soft rot smells distinct from anthracnose, and a farmer's nose works fine."
  )
);
children.push(
  numberedMix(
    { b: "Local context is baked in." },
    " Recognises \"Baja\" (fertilizer) and \"Racun kulat\" (fungicide) on receipts. Uses MARDI guidelines for treatment. Recommends the actual brand sold at the actual nearest kedai pertanian."
  )
);
children.push(
  numberedMix(
    { b: "Honest uncertainty." },
    " Below 70% confidence, the app refuses to guess and routes to a human. Most AI apps confidently output something even when wrong — that destroys trust the first time it kills a crop."
  )
);
children.push(
  numberedMix(
    { b: "The Pact layer turns isolated farmers into an invisible co-op." },
    " Group buying, anonymous price benchmark, network disease early-warning. A solo-farmer app is something competitors can copy in a week. A network of trusting Malaysian smallholders is a moat that takes years to build."
  )
);

// ── Section: How to test ──
children.push(h1("How to test the whole thing yourself, in order"));

children.push(numbered("Visit the live URL."));
children.push(
  numberedMix(
    "Tap ",
    { b: "Reset to baseline + enter" },
    " (orange button) — gives you a clean Pak Ali account with everything pre-loaded."
  )
);
children.push(
  numbered(
    "You're now on /home. Plot A (chilli) has a yellow warning. There's an urgent \"Inspect Plot A\" task."
  )
);
children.push(
  numbered(
    "Tap that task — it takes you to /inspection/v2 — walk through the doctor flow with any chilli photo (real or test)."
  )
);
children.push(numbered("After diagnosis, you'll see a 5-day follow-up will appear in your tasks tomorrow."));
children.push(
  numberedMix(
    "Bottom nav → ",
    { b: "Pact" },
    " → see the price benchmark (\"you sold at RM 3.80, others got RM 4.20\") and two open group buys."
  )
);
children.push(
  numberedMix(
    "Tap the Mancozeb group buy started by Pak Hassan → tap ",
    { b: "Join" },
    " with quantity 2."
  )
);
children.push(
  numberedMix(
    "Back to Pact → tap ",
    { b: "+ Start one" },
    " → create your own group buy."
  )
);
children.push(
  numberedMix(
    "FAB (the + button at bottom centre) → ",
    { b: "Scan Receipt" },
    " → upload any image of a Malaysian agri receipt → watch it scan and land in inventory."
  )
);
children.push(
  numberedMix("Bottom nav → ", { b: "Books" }, " → see the new inventory entry.")
);
children.push(
  numberedMix("Settings → ", { b: "Reset demo data" }, " when you want to start fresh again.")
);
children.push(
  numberedMix({ b: "Sign Out" }, " — back to landing — repeat as needed.")
);

children.push(p(""));
children.push(
  pmix({ i: "End of manual. AgroSim 2.0 — Stop farming alone." })
);

// ─── Document ───────────────────────────────────────────────────

const doc = new Document({
  creator: "AgroSim",
  title: "AgroSim — The Full User Manual",
  description: "Plain-English walk-through of every AgroSim 2.0 screen and feature.",
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } }, // 12pt default
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1f2937" },
        paragraph: {
          spacing: { before: 360, after: 200 },
          outlineLevel: 0,
        },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "047857" },
        paragraph: {
          spacing: { before: 240, after: 120 },
          outlineLevel: 1,
        },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 720, hanging: 360 } },
            },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 720, hanging: 360 } },
            },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: {
            width: 12240, // 8.5"
            height: 15840, // 11"
            orientation: PageOrientation.PORTRAIT,
          },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    },
  ],
});

// Ensure output directory exists
const outDir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

Packer.toBuffer(doc)
  .then((buf) => {
    fs.writeFileSync(OUTPUT_PATH, buf);
    console.log(`✓ Wrote ${OUTPUT_PATH} (${buf.length.toLocaleString()} bytes)`);
  })
  .catch((err) => {
    console.error("Failed to build document:", err);
    process.exit(1);
  });
