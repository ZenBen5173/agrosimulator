import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatActionFlow } from "@/flows/chatAction";
import { sendPushToUser } from "@/lib/pushNotify";

export async function POST(request: Request) {
  try {
    const { farm_id, message } = await request.json();

    if (!farm_id || !message) {
      return NextResponse.json(
        { error: "farm_id and message are required" },
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

    // Fetch farm details for context
    const { data: farm } = await supabase
      .from("farms")
      .select("id, name, soil_type, water_source, district, state, area_acres")
      .eq("id", farm_id)
      .single();

    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    // Fetch plots
    const { data: plots } = await supabase
      .from("plots")
      .select(
        "id, label, crop_name, growth_stage, planted_date, expected_harvest, warning_level, warning_reason, days_since_checked"
      )
      .eq("farm_id", farm_id);

    // Fetch weather
    const { data: weatherSnap } = await supabase
      .from("weather_snapshots")
      .select("condition, temp_celsius, humidity_pct, rainfall_mm, wind_kmh")
      .eq("farm_id", farm_id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    // Fetch pending tasks
    const { data: recentTasks } = await supabase
      .from("tasks")
      .select("title, task_type, priority, due_date")
      .eq("farm_id", farm_id)
      .eq("completed", false)
      .order("priority")
      .limit(10);

    // Fetch chat history
    const { data: chatHistory } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("farm_id", farm_id)
      .order("created_at", { ascending: true })
      .limit(10);

    // Build context
    const contextParts: string[] = [];
    contextParts.push(`Farm: ${farm.name || "Unnamed"}, ${farm.area_acres} acres, ${farm.district || "?"}, ${farm.state || "?"}`);
    contextParts.push(`Soil: ${farm.soil_type || "?"}, Water: ${farm.water_source || "?"}`);
    if (weatherSnap) {
      contextParts.push(`Weather: ${weatherSnap.condition}, ${weatherSnap.temp_celsius}°C, humidity ${weatherSnap.humidity_pct}%`);
    }
    if (plots && plots.length > 0) {
      contextParts.push(`Plots: ${plots.map((p) => `${p.label}: ${p.crop_name} (${p.growth_stage})${p.warning_level !== "none" ? ` [${p.warning_level}]` : ""}`).join(", ")}`);
    }
    if (recentTasks && recentTasks.length > 0) {
      contextParts.push(`Pending tasks: ${recentTasks.map((t) => `[${t.priority}] ${t.title}`).join(", ")}`);
    }

    const history = (chatHistory || []).map((msg) => ({
      role: msg.role as string,
      content: msg.content as string,
    }));

    // Call Genkit chat-action flow
    const result = await chatActionFlow({
      farmId: farm_id,
      message,
      systemContext: contextParts.join("\n"),
      history,
    });

    // Execute action if present
    let actionResult: { type: string; details: string } | null = null;

    if (result.action && result.action.action_type !== "none") {
      const action = result.action;
      const today = new Date().toISOString().split("T")[0];

      // Map plot label to ID
      const labelToId: Record<string, string> = {};
      for (const p of plots || []) {
        labelToId[p.label] = p.id;
      }
      const plotId = action.plot_label ? labelToId[action.plot_label] || null : null;

      switch (action.action_type) {
        case "create_task":
        case "create_inspection":
        case "schedule_watering": {
          const taskType =
            action.action_type === "create_inspection"
              ? "inspection"
              : action.action_type === "schedule_watering"
                ? "watering"
                : action.task_type || "farm_wide";

          const { data: task } = await supabase.from("tasks").insert({
            farm_id,
            plot_id: plotId,
            title: action.task_title || `${taskType} task`,
            description: action.task_description || "",
            task_type: taskType,
            priority: action.priority || "normal",
            due_date: today,
            completed: false,
            auto_generated: true,
            triggered_by: "chat",
            resource_item: action.item_name || null,
            resource_quantity: action.quantity || null,
            resource_unit: action.unit || null,
          }).select().single();

          actionResult = {
            type: action.action_type,
            details: `Created task: "${action.task_title}"${plotId ? ` for plot ${action.plot_label}` : ""}`,
          };

          // Send push notification
          sendPushToUser(user.id, {
            title: "AgroBot Action",
            body: `Task created: ${action.task_title}`,
            url: "/home",
            tag: "chat-action",
          }).catch(() => {});
          break;
        }

        case "reorder_item": {
          if (action.item_name) {
            await supabase.from("purchase_requests").insert({
              farm_id,
              item_name: action.item_name,
              quantity: action.quantity || 1,
              unit: action.unit || "kg",
              status: "pending",
            });
            actionResult = {
              type: "reorder_item",
              details: `Reorder request created: ${action.item_name} (${action.quantity || 1} ${action.unit || "kg"})`,
            };
          }
          break;
        }

        case "create_alert": {
          await supabase.from("farm_alerts").insert({
            farm_id,
            alert_type: "general",
            title: action.task_title || "Chat-generated alert",
            summary: action.task_description || message,
            severity: action.priority === "urgent" ? "high" : "medium",
            recommended_action: action.task_description || null,
            source_type: "news",
          });
          actionResult = {
            type: "create_alert",
            details: `Alert created: "${action.task_title}"`,
          };
          break;
        }
      }
    }

    // Save messages to chat_messages
    await supabase.from("chat_messages").insert({
      farm_id,
      role: "user",
      content: message,
    });

    const replyWithAction = actionResult
      ? `${result.reply}\n\n✅ **Action taken:** ${actionResult.details}`
      : result.reply;

    await supabase.from("chat_messages").insert({
      farm_id,
      role: "assistant",
      content: replyWithAction,
      metadata: {
        action: result.action,
        used_tools: result.used_tools,
        action_result: actionResult,
      },
    });

    return NextResponse.json({
      reply: replyWithAction,
      action: actionResult,
      used_tools: result.used_tools,
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const farm_id = searchParams.get("farm_id");

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

    const { data: messages, error } = await supabase
      .from("chat_messages")
      .select("id, farm_id, role, content, metadata, created_at")
      .eq("farm_id", farm_id)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    return NextResponse.json({ messages: messages || [] });
  } catch (err) {
    console.error("Chat GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
