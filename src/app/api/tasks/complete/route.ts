import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { task_id } = await request.json();

    if (!task_id) {
      return NextResponse.json(
        { error: "task_id is required" },
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

    const { data: task, error } = await supabase
      .from("tasks")
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq("id", task_id)
      .select("*")
      .single();

    if (error || !task) {
      return NextResponse.json(
        { error: "Task not found or update failed" },
        { status: 404 }
      );
    }

    return NextResponse.json({ task });
  } catch (err) {
    console.error("Task completion error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
