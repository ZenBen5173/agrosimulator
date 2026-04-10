import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET — fetch farm alerts */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");
    if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("farm_alerts")
      .select("*")
      .eq("farm_id", farmId)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    console.error("Alerts GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH — mark alert as read or dismissed */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { alert_id, read, dismissed } = await request.json();
    if (!alert_id) return NextResponse.json({ error: "alert_id required" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (read !== undefined) updates.read = read;
    if (dismissed !== undefined) updates.dismissed = dismissed;

    const { error } = await supabase
      .from("farm_alerts")
      .update(updates)
      .eq("id", alert_id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Alerts PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
