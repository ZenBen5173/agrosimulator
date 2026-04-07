import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const farm_id = searchParams.get("farm_id");
    const period = searchParams.get("period") || "all";

    if (!farm_id) {
      return NextResponse.json(
        { error: "farm_id is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify farm ownership
    const { data: farm } = await supabase
      .from("farms")
      .select("id")
      .eq("id", farm_id)
      .single();

    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    // Build query
    let query = supabase
      .from("financial_records")
      .select("*")
      .eq("farm_id", farm_id)
      .order("record_date", { ascending: false });

    if (period === "month") {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      query = query.gte("record_date", firstOfMonth);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error("Failed to fetch financial records:", error);
      return NextResponse.json(
        { error: "Failed to fetch records" },
        { status: 500 }
      );
    }

    // Compute summary
    const rows = records || [];
    let total_income = 0;
    let total_expenses = 0;
    const categoryMap: Record<string, number> = {};

    for (const r of rows) {
      if (r.record_type === "income") {
        total_income += r.amount;
      } else {
        total_expenses += r.amount;
      }

      const key = r.category || "Other";
      categoryMap[key] = (categoryMap[key] || 0) + r.amount;
    }

    const by_category = Object.entries(categoryMap).map(
      ([category, amount]) => ({ category, amount })
    );

    return NextResponse.json({
      records: rows,
      summary: {
        total_income,
        total_expenses,
        net: total_income - total_expenses,
        by_category,
      },
    });
  } catch (err) {
    console.error("Financial GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { farm_id, plot_id, record_type, category, amount, description, record_date } = body;

    // Validate required fields
    if (!farm_id) {
      return NextResponse.json({ error: "farm_id is required" }, { status: 400 });
    }
    if (!record_type || !["expense", "income"].includes(record_type)) {
      return NextResponse.json(
        { error: "record_type must be 'expense' or 'income'" },
        { status: 400 }
      );
    }
    if (!category || typeof category !== "string") {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    // Verify farm ownership
    const { data: farm } = await supabase
      .from("farms")
      .select("id")
      .eq("id", farm_id)
      .single();

    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    // Insert financial record
    const { data: record, error: insertError } = await supabase
      .from("financial_records")
      .insert({
        farm_id,
        plot_id: plot_id || null,
        record_type,
        category,
        amount,
        description: description || null,
        record_date: record_date || new Date().toISOString().split("T")[0],
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Failed to insert financial record:", insertError);
      return NextResponse.json(
        { error: "Failed to create record" },
        { status: 500 }
      );
    }

    // Also insert into plot_events as a financial event for activity tracking
    await supabase.from("plot_events").insert({
      farm_id,
      plot_id: plot_id || null,
      event_type: "financial",
      notes: `${record_type === "income" ? "Income" : "Expense"}: ${category} - RM${amount.toFixed(2)}${description ? ` (${description})` : ""}`,
    });

    return NextResponse.json({ record });
  } catch (err) {
    console.error("Financial POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
