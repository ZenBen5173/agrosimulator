import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, district, state")
      .eq("id", user.id)
      .single();

    // Fetch farm
    const { data: farm } = await supabase
      .from("farms")
      .select("id, name, area_acres, soil_type, water_source, grid_size")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    // Fetch notification preferences (may not exist yet)
    const { data: preferences } = await supabase
      .from("notification_preferences")
      .select("weather_alerts, harvest_reminders, task_reminders")
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({
      profile: profile || {
        full_name: null,
        phone: null,
        district: null,
        state: null,
      },
      farm: farm || null,
      preferences: preferences || {
        weather_alerts: true,
        harvest_reminders: true,
        task_reminders: true,
      },
      email: user.email || user.phone || null,
    });
  } catch (err) {
    console.error("Profile GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { full_name, phone } = body;

    const updates: Record<string, string> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) updates.phone = phone;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: updated, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select("full_name, phone, district, state")
      .single();

    if (error) {
      console.error("Profile update error:", error);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: updated });
  } catch (err) {
    console.error("Profile PUT error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
