import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET — get active diagnosis sessions for a farm */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");
    if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("diagnosis_sessions")
      .select(`
        *,
        plots (label, crop_name),
        treatment_monitoring (id, check_date, status, notes, created_at)
      `)
      .eq("farm_id", farmId)
      .is("closed_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    console.error("Diagnosis GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST — create a diagnosis session after inspection */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      farm_id, plot_id, plot_event_id, layer_reached, final_confidence,
      final_outcome, diagnosis_name, treatment_plan,
    } = body;

    if (!farm_id || !plot_id) {
      return NextResponse.json({ error: "farm_id, plot_id required" }, { status: 400 });
    }

    // Auto-create follow-up in 5 days
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 5);

    const { data, error } = await supabase
      .from("diagnosis_sessions")
      .insert({
        farm_id,
        plot_id,
        plot_event_id: plot_event_id || null,
        layer_reached: layer_reached || 1,
        final_confidence,
        final_outcome,
        diagnosis_name,
        treatment_plan,
        follow_up_status: "pending",
        follow_up_due: followUpDate.toISOString().split("T")[0],
      })
      .select()
      .single();

    if (error) throw error;

    // Create follow-up task
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("tasks").insert({
      farm_id,
      plot_id,
      title: `Follow-up: Did treatment work?`,
      description: `Check if ${diagnosis_name || "treatment"} has improved. Tap Better/Same/Worse.`,
      task_type: "inspection",
      priority: "urgent",
      due_date: followUpDate.toISOString().split("T")[0],
      completed: false,
      auto_generated: true,
      triggered_by: "inspection_result",
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("Diagnosis POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH — record treatment monitoring follow-up */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { session_id, status, notes } = body;

    if (!session_id || !status) {
      return NextResponse.json({ error: "session_id, status required" }, { status: 400 });
    }

    // Get session
    const { data: session } = await supabase
      .from("diagnosis_sessions")
      .select("id, farm_id, plot_id, diagnosis_name")
      .eq("id", session_id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Record monitoring entry
    await supabase.from("treatment_monitoring").insert({
      diagnosis_session_id: session_id,
      farm_id: session.farm_id,
      check_date: new Date().toISOString().split("T")[0],
      status,
      notes,
    });

    if (status === "better") {
      // Close the session, clear warning
      await supabase
        .from("diagnosis_sessions")
        .update({
          follow_up_status: "better",
          closed_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      await supabase
        .from("plots")
        .update({ warning_level: "none", warning_reason: "Treatment successful" })
        .eq("id", session.plot_id);
    } else if (status === "same") {
      // Create 3-day recheck
      const recheckDate = new Date();
      recheckDate.setDate(recheckDate.getDate() + 3);

      await supabase
        .from("diagnosis_sessions")
        .update({
          follow_up_status: "same",
          follow_up_due: recheckDate.toISOString().split("T")[0],
        })
        .eq("id", session_id);

      await supabase.from("tasks").insert({
        farm_id: session.farm_id,
        plot_id: session.plot_id,
        title: `Recheck: ${session.diagnosis_name || "Treatment"}`,
        description: "Previous treatment showed no improvement. Recheck in 3 days.",
        task_type: "inspection",
        priority: "urgent",
        due_date: recheckDate.toISOString().split("T")[0],
        completed: false,
        auto_generated: true,
        triggered_by: "inspection_result",
      });
    } else if (status === "worse") {
      // Escalate — mark as needing expert
      await supabase
        .from("diagnosis_sessions")
        .update({
          follow_up_status: "worse",
          final_outcome: "expert_referred",
        })
        .eq("id", session_id);

      await supabase
        .from("plots")
        .update({ warning_level: "red", warning_reason: "Treatment not working — expert referral needed" })
        .eq("id", session.plot_id);

      await supabase.from("tasks").insert({
        farm_id: session.farm_id,
        plot_id: session.plot_id,
        title: "URGENT: Contact agricultural expert",
        description: `Treatment for ${session.diagnosis_name || "disease"} is not working. Contact MARDI/DOA extension officer.`,
        task_type: "treatment",
        priority: "urgent",
        due_date: new Date().toISOString().split("T")[0],
        completed: false,
        auto_generated: true,
        triggered_by: "inspection_result",
      });
    }

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error("Diagnosis PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
