import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { diagnoseWithAnswers } from "@/services/ai/diseaseDetection";

export async function POST(request: Request) {
  try {
    const { farm_id, plot_id, photo_base64s, crop_name, farmer_answers } =
      await request.json();

    if (!farm_id || !plot_id || !photo_base64s || !crop_name || !farmer_answers) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    const photos = (photo_base64s as { base64: string; mime_type: string }[]).map(
      (p) => ({
        base64: p.base64,
        mimeType: p.mime_type || "image/jpeg",
      })
    );

    const result = await diagnoseWithAnswers(photos, crop_name, farmer_answers);

    const today = new Date().toISOString().split("T")[0];
    const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    if (result.outcome === "confirmed") {
      // Insert disease event
      await supabase.from("plot_events").insert({
        plot_id,
        farm_id,
        event_type: "inspection_disease",
        disease_name: result.diagnosis,
        severity: result.severity,
        treatment: result.treatment_steps
          ? { steps: result.treatment_steps }
          : null,
        gemini_result: result,
      });

      // Update plot warning
      await supabase
        .from("plots")
        .update({
          warning_level: "red",
          warning_reason: result.diagnosis || "Disease confirmed",
          days_since_checked: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", plot_id);

      // Auto-create treatment tasks
      if (result.treatment_steps) {
        const treatmentTasks = result.treatment_steps.slice(0, 3).map((step) => ({
          farm_id,
          plot_id,
          title: step.length > 60 ? step.slice(0, 57) + "..." : step,
          description: step,
          task_type: "treatment",
          priority: "urgent",
          due_date: today,
          completed: false,
          auto_generated: true,
          triggered_by: "inspection_result",
        }));

        await supabase.from("tasks").insert(treatmentTasks);
      }
    } else if (result.outcome === "uncertain") {
      // Insert suspicious event
      await supabase.from("plot_events").insert({
        plot_id,
        farm_id,
        event_type: "inspection_suspicious",
        gemini_result: result,
      });

      // Update plot to orange warning
      await supabase
        .from("plots")
        .update({
          warning_level: "orange",
          warning_reason:
            result.diagnosis
              ? `Possible ${result.diagnosis} — needs expert verification`
              : "Uncertain condition — needs expert verification",
          days_since_checked: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", plot_id);

      // Auto-create expert verification task
      await supabase.from("tasks").insert({
        farm_id,
        plot_id,
        title: "Get expert verification",
        description: `AI is uncertain about this diagnosis. Show plot to an agricultural extension officer within 3 days.`,
        task_type: "inspection",
        priority: "urgent",
        due_date: threeDaysLater,
        completed: false,
        auto_generated: true,
        triggered_by: "inspection_result",
      });
    } else {
      // cannot_determine — expert referral
      await supabase.from("plot_events").insert({
        plot_id,
        farm_id,
        event_type: "inspection_referred",
        gemini_result: result,
      });

      // Insert expert referral
      await supabase.from("expert_referrals").insert({
        plot_id,
        case_package_json: {
          crop_name,
          farmer_answers,
          confidence: result.confidence,
          photo_count: photos.length,
        },
        status: "pending",
      });

      // Update plot to orange
      await supabase
        .from("plots")
        .update({
          warning_level: "orange",
          warning_reason: "Referred to expert — awaiting response",
          days_since_checked: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", plot_id);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Diagnose error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
