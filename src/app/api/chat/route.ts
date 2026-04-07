import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatWithAdvisor } from "@/services/ai/chatAdvisor";

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

    // Fetch farm details
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
        "label, crop_name, growth_stage, planted_date, expected_harvest, warning_level, warning_reason, days_since_checked"
      )
      .eq("farm_id", farm_id);

    // Fetch latest weather
    const { data: weatherSnap } = await supabase
      .from("weather_snapshots")
      .select(
        "condition, temp_celsius, humidity_pct, rainfall_mm, wind_kmh"
      )
      .eq("farm_id", farm_id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    // Fetch recent tasks (incomplete)
    const { data: recentTasks } = await supabase
      .from("tasks")
      .select("title, task_type, priority, due_date, completed")
      .eq("farm_id", farm_id)
      .eq("completed", false)
      .order("priority")
      .limit(10);

    // Fetch last 10 chat messages for conversation history
    const { data: chatHistory } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("farm_id", farm_id)
      .order("created_at", { ascending: true })
      .limit(10);

    // Build context string
    const contextParts: string[] = [];

    contextParts.push(
      `Farm: ${farm.name || "Unnamed"}, ${farm.area_acres} acres, ${farm.district || "unknown district"}, ${farm.state || "unknown state"}`
    );
    contextParts.push(
      `Soil: ${farm.soil_type || "unknown"}, Water: ${farm.water_source || "unknown"}`
    );

    if (weatherSnap) {
      contextParts.push(
        `Current weather: ${weatherSnap.condition}, ${weatherSnap.temp_celsius}°C, humidity ${weatherSnap.humidity_pct}%, rainfall ${weatherSnap.rainfall_mm}mm`
      );
    }

    if (plots && plots.length > 0) {
      contextParts.push(`\nPlots (${plots.length} total):`);
      for (const p of plots) {
        const warning =
          p.warning_level && p.warning_level !== "none"
            ? ` [WARNING: ${p.warning_level} - ${p.warning_reason || "check needed"}]`
            : "";
        contextParts.push(
          `- ${p.label}: ${p.crop_name} (${p.growth_stage}), planted ${p.planted_date || "N/A"}, harvest ${p.expected_harvest || "N/A"}, last checked ${p.days_since_checked ?? "?"} days ago${warning}`
        );
      }
    }

    if (recentTasks && recentTasks.length > 0) {
      contextParts.push(`\nPending tasks:`);
      for (const t of recentTasks) {
        contextParts.push(
          `- [${t.priority}] ${t.title} (${t.task_type}, due ${t.due_date})`
        );
      }
    }

    const systemContext = contextParts.join("\n");

    // Build history array for the AI
    const history = (chatHistory || []).map((msg) => ({
      role: msg.role as string,
      content: msg.content as string,
    }));

    // Call the AI advisor
    const reply = await chatWithAdvisor(systemContext, history, message);

    // Save user message to chat_messages
    await supabase.from("chat_messages").insert({
      farm_id,
      role: "user",
      content: message,
    });

    // Save assistant response to chat_messages
    await supabase.from("chat_messages").insert({
      farm_id,
      role: "assistant",
      content: reply,
    });

    return NextResponse.json({ reply });
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
      .select("id, farm_id, role, content, created_at")
      .eq("farm_id", farm_id)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("Failed to fetch chat messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({ messages: messages || [] });
  } catch (err) {
    console.error("Chat GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
