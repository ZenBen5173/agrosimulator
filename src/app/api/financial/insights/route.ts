import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import { shouldUseRealGemini } from "@/lib/gemini-budget";
import { z } from "genkit";

const InsightSchema = z.object({
  insights: z.array(
    z.object({
      type: z.enum(["cost_alert", "opportunity", "trend", "recommendation"]),
      title: z.string(),
      description: z.string(),
      impact_rm: z.number().nullable(),
      priority: z.enum(["high", "medium", "low"]),
    })
  ),
  cost_per_kg: z.array(
    z.object({
      crop: z.string(),
      total_input_cost_rm: z.number(),
      estimated_yield_kg: z.number(),
      cost_per_kg_rm: z.number(),
      market_price_per_kg_rm: z.number().nullable(),
      profit_per_kg_rm: z.number().nullable(),
    })
  ),
  cash_flow_projection: z.object({
    next_8_weeks: z.array(
      z.object({
        week: z.number(),
        projected_income_rm: z.number(),
        projected_expense_rm: z.number(),
        net_rm: z.number(),
      })
    ),
  }),
  summary: z.string(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");
    if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch all financial data
    const [recordsRes, plotsRes, pricesRes, equipmentRes, inventoryRes] = await Promise.all([
      supabase
        .from("financial_records")
        .select("record_type, category, amount, record_date, description")
        .eq("farm_id", farmId)
        .order("record_date", { ascending: false })
        .limit(100),
      supabase
        .from("plots")
        .select("label, crop_name, growth_stage, planted_date, expected_harvest")
        .eq("farm_id", farmId)
        .eq("is_active", true),
      supabase
        .from("market_prices")
        .select("item_name, price_per_kg, trend, trend_pct")
        .eq("item_type", "crop"),
      supabase
        .from("equipment")
        .select("name, purchase_price_rm, salvage_value_rm, useful_life_years, purchase_date")
        .eq("farm_id", farmId),
      supabase
        .from("inventory_items")
        .select("item_name, current_quantity, unit, last_purchase_price_rm")
        .eq("farm_id", farmId),
    ]);

    const records = recordsRes.data || [];
    const plots = plotsRes.data || [];
    const prices = pricesRes.data || [];
    const equipment = equipmentRes.data || [];
    const inventory = inventoryRes.data || [];

    // Calculate totals
    let totalIncome = 0, totalExpense = 0;
    const expenseByCategory: Record<string, number> = {};

    for (const r of records) {
      if (r.record_type === "income") totalIncome += r.amount;
      else {
        totalExpense += r.amount;
        expenseByCategory[r.category] = (expenseByCategory[r.category] || 0) + r.amount;
      }
    }

    // Equipment depreciation
    const totalMonthlyDep = equipment.reduce((sum, eq) => {
      if (!eq.purchase_price_rm || !eq.useful_life_years) return sum;
      return sum + (eq.purchase_price_rm - (eq.salvage_value_rm || 0)) / eq.useful_life_years / 12;
    }, 0);

    const prompt = `Analyse this Malaysian smallholder farm's finances and provide insights.

Financial summary (all time):
- Total income: RM${totalIncome.toFixed(2)}
- Total expenses: RM${totalExpense.toFixed(2)}
- Net: RM${(totalIncome - totalExpense).toFixed(2)}
- Monthly equipment depreciation: RM${totalMonthlyDep.toFixed(2)}

Expenses by category: ${Object.entries(expenseByCategory).map(([k, v]) => `${k}: RM${v.toFixed(2)}`).join(", ") || "None"}

Active plots: ${plots.map((p) => `${p.label}: ${p.crop_name} (${p.growth_stage})`).join(", ") || "None"}

Market prices: ${prices.map((p) => `${p.item_name}: RM${p.price_per_kg.toFixed(2)}/kg (${p.trend})`).join(", ") || "No data"}

Inventory: ${inventory.map((i) => `${i.item_name}: ${i.current_quantity} ${i.unit}`).join(", ") || "None"}

Recent transactions: ${records.slice(0, 10).map((r) => `${r.record_date}: ${r.record_type} RM${r.amount} (${r.category})`).join("; ") || "None"}

Provide:
1. 2-4 actionable financial insights (cost alerts, opportunities, trends)
2. Cost-per-kg calculation for each active crop (estimate input costs and yield)
3. 8-week cash flow projection based on spending patterns and expected harvests
4. A 1-2 sentence summary

Return JSON matching the schema.`;

    try {
      if (!shouldUseRealGemini("resources")) throw new Error("Budget: skip");
      const { output } = await ai.generate({
        model: DEFAULT_MODEL,
        prompt,
        output: { schema: InsightSchema },
        config: { temperature: 0.3 },
      });

      if (output) {
        return NextResponse.json(output);
      }
    } catch (err) {
      console.warn("Genkit financial insights failed:", err);
    }

    // Fallback: basic calculations
    const cropCosts = plots.map((p) => {
      const marketPrice = prices.find((pr) =>
        pr.item_name.toLowerCase().includes(p.crop_name.toLowerCase())
      );
      const estimatedInputCost = totalExpense / Math.max(plots.length, 1);
      const estimatedYield = p.crop_name.toLowerCase().includes("paddy") ? 600 : 200;

      return {
        crop: p.crop_name,
        total_input_cost_rm: Math.round(estimatedInputCost * 100) / 100,
        estimated_yield_kg: estimatedYield,
        cost_per_kg_rm: Math.round((estimatedInputCost / estimatedYield) * 100) / 100,
        market_price_per_kg_rm: marketPrice?.price_per_kg || null,
        profit_per_kg_rm: marketPrice
          ? Math.round((marketPrice.price_per_kg - estimatedInputCost / estimatedYield) * 100) / 100
          : null,
      };
    });

    return NextResponse.json({
      insights: [
        {
          type: "trend",
          title: "Financial Overview",
          description: `Total income RM${totalIncome.toFixed(2)}, expenses RM${totalExpense.toFixed(2)}. Net position: RM${(totalIncome - totalExpense).toFixed(2)}.`,
          impact_rm: totalIncome - totalExpense,
          priority: totalIncome >= totalExpense ? "low" : "high",
        },
      ],
      cost_per_kg: cropCosts,
      cash_flow_projection: {
        next_8_weeks: Array.from({ length: 8 }, (_, i) => ({
          week: i + 1,
          projected_income_rm: i >= 4 ? Math.round(totalIncome / 8) : 0,
          projected_expense_rm: Math.round(totalExpense / 12),
          net_rm: (i >= 4 ? Math.round(totalIncome / 8) : 0) - Math.round(totalExpense / 12),
        })),
      },
      summary: `Farm has ${plots.length} active plots. ${totalIncome > totalExpense ? "Currently profitable." : "Expenses exceed income — focus on cost reduction."}`,
    });
  } catch (err) {
    console.error("Financial insights error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
