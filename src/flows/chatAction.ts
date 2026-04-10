import { z } from "genkit";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import {
  weatherTool,
  plotsTool,
  marketPricesTool,
  getFarmContextTool,
  inventoryTool,
} from "@/lib/tools";

const ActionSchema = z.object({
  action_type: z.enum([
    "create_task",
    "create_inspection",
    "schedule_watering",
    "reorder_item",
    "create_alert",
    "none",
  ]),
  task_title: z.string().nullable().optional(),
  task_description: z.string().nullable().optional(),
  task_type: z.string().nullable().optional(),
  priority: z.enum(["urgent", "normal", "low"]).nullable().optional(),
  plot_label: z.string().nullable().optional(),
  item_name: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

const OutputSchema = z.object({
  reply: z.string(),
  action: ActionSchema.nullable(),
  used_tools: z.array(z.string()).optional(),
});

export type ChatActionOutput = z.infer<typeof OutputSchema>;

export const chatActionFlow = ai.defineFlow(
  {
    name: "chatAction",
    inputSchema: z.object({
      farmId: z.string(),
      message: z.string(),
      systemContext: z.string(),
      history: z.array(z.object({ role: z.string(), content: z.string() })),
    }),
    outputSchema: OutputSchema,
  },
  async ({ farmId, message, systemContext, history }) => {
    // Gather live context via tools
    const [farm, plots, weather, marketPrices, inventory] = await Promise.all([
      getFarmContextTool({ farmId }),
      plotsTool({ farmId }),
      weatherTool({ farmId }),
      marketPricesTool({}),
      inventoryTool({ farmId }),
    ]);

    const toolContext = `
LIVE DATA (from tools):
Farm: ${farm.name || "My Farm"}, ${farm.district}, ${farm.state}, ${farm.area_acres} acres
Weather: ${weather.condition}, ${weather.temp_celsius}°C, humidity ${weather.humidity_pct}%, rain ${weather.rainfall_mm}mm
Plots: ${plots.map((p) => `${p.label}: ${p.crop_name} (${p.growth_stage}), warning: ${p.warning_level}`).join("; ")}
Inventory: ${inventory.length > 0 ? inventory.map((i) => `${i.item_name}: ${i.current_quantity} ${i.unit}`).join(", ") : "No items tracked"}
Market: ${marketPrices.slice(0, 5).map((m) => `${m.item_name}: RM${m.price_per_kg.toFixed(2)} (${m.trend})`).join(", ")}`;

    const chatHistory = history.map((msg) => ({
      role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
      content: [{ text: msg.content }],
    }));

    const systemPrompt = `You are AgroBot, an AI farming advisor that can TAKE ACTIONS for Malaysian smallholder farmers.

${systemContext}

${toolContext}

CRITICAL: You are not just a chatbot. When a farmer asks you to DO something (create a task, schedule watering, check inventory, etc.), you MUST return an action alongside your reply.

Available actions:
- create_task: Create a new task in the farmer's to-do list
- create_inspection: Schedule an inspection for a specific plot
- schedule_watering: Create a watering task with specific quantities
- reorder_item: Flag an inventory item for reordering
- create_alert: Create a farm alert
- none: No action needed (just information/advice)

ALWAYS respond with JSON:
{
  "reply": "Your conversational reply (2-3 short paragraphs max, simple English)",
  "action": {
    "action_type": "create_task|create_inspection|schedule_watering|reorder_item|create_alert|none",
    "task_title": "string or null",
    "task_description": "string or null",
    "task_type": "inspection|watering|fertilizing|treatment|harvesting|replanting|farm_wide or null",
    "priority": "urgent|normal|low or null",
    "plot_label": "A1 or null",
    "item_name": "string or null (for reorder)",
    "quantity": number or null,
    "unit": "string or null"
  },
  "used_tools": ["getWeather", "getPlots"] (list which tools you used)
}

Examples:
- "Water my paddy" → action: schedule_watering with calculated quantity
- "Is plot A1 okay?" → action: create_inspection for A1
- "I need more fertilizer" → action: reorder_item
- "What's the weather?" → action: none (just information)
- "Remind me to harvest tomorrow" → action: create_task`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      system: systemPrompt,
      messages: [
        ...chatHistory,
        { role: "user" as const, content: [{ text: message }] },
      ],
      output: { schema: OutputSchema },
      config: { temperature: 0.4 },
    });

    if (output) {
      return {
        ...output,
        used_tools: output.used_tools || ["getFarmContext", "getPlots", "getWeather", "getMarketPrices", "getInventory"],
      };
    }

    return {
      reply: "I'm not sure how to help with that. Could you rephrase?",
      action: null,
      used_tools: [],
    };
  }
);
