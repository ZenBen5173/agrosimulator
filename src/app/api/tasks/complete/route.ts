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

    // Auto-deduct inventory when task with resource_item is completed
    if (task.resource_item && task.resource_quantity && task.farm_id) {
      try {
        // Find matching inventory item
        const { data: invItem } = await supabase
          .from("inventory_items")
          .select("id, current_quantity")
          .eq("farm_id", task.farm_id)
          .ilike("item_name", `%${task.resource_item}%`)
          .limit(1)
          .single();

        if (invItem) {
          const newQty = Math.max(0, (invItem.current_quantity || 0) - task.resource_quantity);

          await supabase
            .from("inventory_items")
            .update({ current_quantity: newQty, updated_at: new Date().toISOString() })
            .eq("id", invItem.id);

          // Record movement
          await supabase.from("inventory_movements").insert({
            farm_id: task.farm_id,
            item_id: invItem.id,
            movement_type: "usage",
            quantity: task.resource_quantity,
            unit: task.resource_unit || "unit",
            plot_id: task.plot_id || null,
            task_id: task.id,
            notes: `Auto-deducted: ${task.title}`,
          });
        }
      } catch (invErr) {
        // Non-critical — don't fail the task completion
        console.warn("Inventory deduction failed:", invErr);
      }
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
