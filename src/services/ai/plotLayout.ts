/**
 * Plot layout generation service — retrofitted to use Genkit.
 * Keeps the same exported interface so API routes don't change.
 */
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import { z } from "genkit";
import type { GridJson } from "@/types/farm";

const PlotInfoSchema = z.object({
  crop: z.string(),
  colour: z.string(),
  reason: z.string(),
});

const OutputSchema = z.object({
  grid: z.array(z.array(z.string())),
  plots: z.record(PlotInfoSchema),
});

// ─── Genkit Flow ────────────────────────────────────────────

export const generatePlotLayoutFlow = ai.defineFlow(
  {
    name: "generatePlotLayout",
    inputSchema: z.object({
      gridSize: z.number(),
      areaAcres: z.number(),
      soilType: z.string(),
      waterSource: z.string(),
      district: z.string(),
      state: z.string(),
    }),
    outputSchema: OutputSchema,
  },
  async ({ gridSize, areaAcres, soilType, waterSource, district, state }) => {
    const prompt = `Design an optimal crop layout for a Malaysian smallholder farm:
- Location: ${district}, ${state}, Malaysia
- Total area: ${areaAcres.toFixed(1)} acres
- Grid: ${gridSize}x${gridSize} cells
- Soil type: ${soilType}
- Water source: ${waterSource}

Assign each grid cell to a plot. Use 'out' for cells outside the farm boundary (~15-20% corners). Group adjacent cells into plots.

Return JSON:
{
  "grid": 2D array of ${gridSize}x${gridSize} strings (plot labels or 'out'),
  "plots": { "A1": { "crop": "Paddy", "colour": "#4ADE80", "reason": "..." } }
}

Rules: 3-5 distinct plots, labels A1/A2/B1/B2/C1, visually distinct colours.`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt,
      output: { schema: OutputSchema },
      config: { temperature: 0.4 },
    });

    if (output) {
      // Validate grid dimensions
      if (output.grid.length === gridSize && output.grid.every((r) => r.length === gridSize)) {
        return output;
      }
    }

    return getFallbackGrid(gridSize);
  }
);

// ─── Fallback ───────────────────────────────────────────────

function getFallbackGrid(gridSize: number): GridJson {
  const grid: string[][] = [];
  for (let r = 0; r < gridSize; r++) {
    const row: string[] = [];
    for (let c = 0; c < gridSize; c++) {
      const isCorner =
        (r === 0 && c === 0) || (r === 0 && c === gridSize - 1) ||
        (r === gridSize - 1 && c === 0) || (r === gridSize - 1 && c === gridSize - 1);
      if (isCorner) row.push("out");
      else if (r < gridSize / 2) row.push("A1");
      else row.push("B1");
    }
    grid.push(row);
  }
  return {
    grid,
    plots: {
      A1: { crop: "Paddy", colour: "#4ADE80", reason: "Paddy suits the upper section with better water access." },
      B1: { crop: "Kangkung", colour: "#F59E0B", reason: "Kangkung grows quickly as a complementary crop." },
    },
  };
}

// ─── Public API (unchanged signature) ───────────────────────

export async function generatePlotLayout(
  gridSize: number,
  areaAcres: number,
  soilType: string,
  waterSource: string,
  district: string,
  state: string
): Promise<GridJson> {
  try {
    const result = await generatePlotLayoutFlow({
      gridSize,
      areaAcres,
      soilType: soilType || "loam",
      waterSource: waterSource || "rain_fed",
      district: district || "Unknown",
      state: state || "Unknown",
    });
    return result as GridJson;
  } catch (err) {
    console.warn("Genkit plotLayout failed, using fallback:", err);
    return getFallbackGrid(gridSize);
  }
}
