import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");
    const showCompleted = url.searchParams.get("completed") === "true";

    if (!farmId) {
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

    let query = supabase
      .from("tasks")
      .select("*")
      .eq("farm_id", farmId)
      .order("priority")
      .order("created_at", { ascending: false });

    if (!showCompleted) {
      query = query.eq("completed", false);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("Failed to fetch tasks:", error);
      return NextResponse.json(
        { error: "Failed to fetch tasks" },
        { status: 500 }
      );
    }

    // Fetch plots to add labels
    const { data: plots } = await supabase
      .from("plots")
      .select("id, label")
      .eq("farm_id", farmId);

    const idToLabel: Record<string, string> = {};
    for (const p of plots || []) {
      idToLabel[p.id] = p.label;
    }

    const tasksWithLabels = (tasks || []).map((t) => ({
      ...t,
      plot_label: t.plot_id ? idToLabel[t.plot_id] || null : null,
    }));

    return NextResponse.json({ tasks: tasksWithLabels });
  } catch (err) {
    console.error("Task list error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
