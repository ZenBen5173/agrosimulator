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
    "create_rfq",
    "confirm_purchase",
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
  unit_price_rm: z.number().nullable().optional(),
  supplier_name: z.string().nullable().optional(),
  rfq_id: z.string().nullable().optional(),
  items: z.array(z.object({
    item_name: z.string(),
    item_type: z.string(),
    quantity: z.number(),
    unit: z.string(),
    unit_price_rm: z.number(),
  })).nullable().optional(),
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

CRITICAL: You are not just a chatbot. When a farmer asks you to DO something, you MUST return an action alongside your reply.

Available actions:
- create_task: Create a new task in the farmer's to-do list
- create_inspection: Schedule an inspection for a specific plot
- schedule_watering: Create a watering task with specific quantities
- reorder_item: Flag an inventory item for reordering
- create_rfq: Create a Request for Quotation to purchase supplies. Use when farmer says "restock", "buy", "order", "need more". Look up current stock from inventory, find the last supplier, estimate quantity needed (2-4 weeks supply), and use last purchase price. Include items array with details.
- confirm_purchase: Convert an RFQ to Purchase Order + GRN + Bill. Use when farmer says "ok", "confirm", "yes", "go ahead" AFTER a create_rfq action was just taken. Include the rfq_id from the previous action.
- create_alert: Create a farm alert
- none: No action needed (just information/advice)

PURCHASE FLOW:
1. Farmer: "I need more Baja Hijau" → You: check inventory (currently 4.5kg, uses ~1.2kg/week), recommend 15kg restock from Kedai Ah Kow at RM3/kg. action: create_rfq with items.
2. Farmer: "ok" or "confirm" → You: convert RFQ to PO+GRN+Bill, inventory updated. action: confirm_purchase with rfq_id.

ALWAYS respond with JSON:
{
  "reply": "Your conversational reply (2-3 short paragraphs max, simple English)",
  "action": {
    "action_type": "create_task|create_inspection|schedule_watering|reorder_item|create_rfq|confirm_purchase|create_alert|none",
    "task_title": "string or null",
    "task_description": "string or null",
    "task_type": "inspection|watering|fertilizing|treatment|harvesting|replanting|farm_wide or null",
    "priority": "urgent|normal|low or null",
    "plot_label": "A1 or null",
    "item_name": "string or null",
    "quantity": number or null,
    "unit": "string or null",
    "unit_price_rm": number or null,
    "supplier_name": "string or null",
    "rfq_id": "string or null (for confirm_purchase, use the ID from previous create_rfq)",
    "items": [{"item_name": "string", "item_type": "fertilizer|pesticide|seed|other", "quantity": number, "unit": "string", "unit_price_rm": number}] or null
  },
  "used_tools": ["getWeather", "getPlots"] (list which tools you used)
}

Examples:
- "Water my paddy" → action: schedule_watering with calculated quantity
- "Is plot A1 okay?" → action: create_inspection for A1
- "I need more fertilizer" → action: create_rfq (check inventory, find supplier, draft RFQ with items)
- "Restock Baja Hijau" → action: create_rfq (specific item, check stock level, recommend quantity)
- "ok" / "confirm" / "yes go ahead" (after RFQ was created) → action: confirm_purchase
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
