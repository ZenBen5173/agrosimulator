import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET — list chat threads for a farm */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");
    if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data } = await supabase
      .from("chat_threads")
      .select("*")
      .eq("farm_id", farmId)
      .eq("is_active", true)
      .order("last_message_at", { ascending: false });

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("Chat threads GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST — create a new chat thread */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { farm_id, title } = await request.json();
    if (!farm_id) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

    const { data, error } = await supabase
      .from("chat_threads")
      .insert({ farm_id, title: title || "New Chat" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    console.error("Chat threads POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
