import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GridJson } from "@/types/farm";

const SYSTEM_INSTRUCTION =
  "You are a Malaysian agricultural planning expert. Return ONLY valid JSON. No prose, no markdown, no explanation outside the JSON.";

function buildPrompt(
  district: string,
  state: string,
  areaAcres: number,
  gridSize: number,
  soilType: string,
  waterSource: string
): string {
  return `Design an optimal crop layout for a Malaysian smallholder farm with these characteristics:
- Location: ${district}, ${state}, Malaysia
- Total area: ${areaAcres.toFixed(1)} acres
- Grid: ${gridSize}x${gridSize} cells
- Soil type: ${soilType}
- Water source: ${waterSource}

Assign each grid cell to a plot. Use 'out' for cells that are outside the farm boundary (approximately 15-20% of cells in the corners to simulate a realistic farm shape). Group adjacent cells into plots for the same crop — larger contiguous areas for crops that need space (paddy), smaller separated areas for crops that benefit from isolation (chilli).

Return JSON exactly matching this schema:
{
  "grid": 2D array of ${gridSize}x${gridSize} strings, each cell is a plot label ('A1', 'B1', etc.) or 'out',
  "plots": object where each key is a plot label and value is:
    {
      "crop": string (Malaysian crop name e.g. Paddy, Chilli, Kangkung, Banana, Sweet Potato, Corn),
      "colour": hex colour string (distinct colour per plot, use greens/yellows/reds),
      "reason": string (max 1 sentence, plain English, why this crop suits this plot position)
    }
}

Rules:
- Every non-'out' cell must have a plot label that exists in the 'plots' object
- Use 3-5 distinct plots for a realistic farm
- Label plots A1, A2, B1, B2, C1 etc.
- Colours must be visually distinct from each other`;
}

function validate(data: unknown, gridSize: number): GridJson | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  // Check grid exists and is correct size
  if (!Array.isArray(d.grid) || d.grid.length !== gridSize) return null;
  for (const row of d.grid) {
    if (!Array.isArray(row) || row.length !== gridSize) return null;
  }

  // Check plots object
  if (!d.plots || typeof d.plots !== "object" || Array.isArray(d.plots))
    return null;

  const plots = d.plots as Record<string, unknown>;

  // Validate each plot has required fields
  for (const [, value] of Object.entries(plots)) {
    if (!value || typeof value !== "object") return null;
    const p = value as Record<string, unknown>;
    if (typeof p.crop !== "string") return null;
    if (typeof p.colour !== "string") return null;
    if (typeof p.reason !== "string") return null;
  }

  // Validate every non-'out' cell references a valid plot
  const grid = d.grid as string[][];
  for (const row of grid) {
    for (const cell of row) {
      if (typeof cell !== "string") return null;
      if (cell !== "out" && !(cell in plots)) return null;
    }
  }

  return { grid, plots: plots as GridJson["plots"] };
}

function getFallbackGrid(gridSize: number): GridJson {
  const grid: string[][] = [];
  for (let r = 0; r < gridSize; r++) {
    const row: string[] = [];
    for (let c = 0; c < gridSize; c++) {
      // Corner cells are 'out'
      const isCorner =
        (r === 0 && c === 0) ||
        (r === 0 && c === gridSize - 1) ||
        (r === gridSize - 1 && c === 0) ||
        (r === gridSize - 1 && c === gridSize - 1);
      if (isCorner) {
        row.push("out");
      } else if (r < gridSize / 2) {
        row.push("A1");
      } else {
        row.push("B1");
      }
    }
    grid.push(row);
  }

  return {
    grid,
    plots: {
      A1: {
        crop: "Paddy",
        colour: "#4ADE80",
        reason: "Paddy is the staple crop and suits the upper section with better water access.",
      },
      B1: {
        crop: "Kangkung",
        colour: "#F59E0B",
        reason: "Kangkung grows quickly and suits the lower section as a complementary crop.",
      },
    },
  };
}

export async function generatePlotLayout(
  gridSize: number,
  areaAcres: number,
  soilType: string,
  waterSource: string,
  district: string,
  state: string
): Promise<GridJson> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("GEMINI_API_KEY not set, using fallback grid");
    return getFallbackGrid(gridSize);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const prompt = buildPrompt(
    district || "Unknown",
    state || "Unknown",
    areaAcres,
    gridSize,
    soilType || "loam",
    waterSource || "rain_fed"
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      const validated = validate(parsed, gridSize);
      if (validated) return validated;

      console.warn(`Plot layout validation failed (attempt ${attempt + 1})`);
    } catch (err) {
      // Retry after 2s on rate limit (429) before giving up
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt === 0) {
        console.warn("Gemini 429 rate limit, retrying in 2s...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.error(`Plot layout Gemini call failed (attempt ${attempt + 1}):`, err);
    }
  }

  console.warn("Gemini plot layout failed after retries, using fallback");
  return getFallbackGrid(gridSize);
}
