import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const farm_id = searchParams.get("farm_id");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const filter = searchParams.get("filter") || "all";

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

    // Verify farm ownership
    const { data: farm } = await supabase
      .from("farms")
      .select("id")
      .eq("id", farm_id)
      .eq("user_id", user.id)
      .single();

    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    const offset = (page - 1) * limit;

    // Build event type filters based on the filter parameter
    const filterMap: Record<string, string[]> = {
      inspection: [
        "inspection_clean",
        "inspection_disease",
        "inspection_suspicious",
        "inspection_referred",
      ],
      planting: ["planting", "replanted"],
      harvest: ["harvested"],
      weather: ["weather_stress"],
      financial: ["financial"],
    };

    // Fetch from activity_feed table
    let activityQuery = supabase
      .from("activity_feed")
      .select("id, farm_id, plot_id, event_type, title, description, photo_url, metadata, created_at")
      .eq("farm_id", farm_id);

    if (filter !== "all" && filterMap[filter]) {
      activityQuery = activityQuery.in("event_type", filterMap[filter]);
    }

    const { data: activityItems, error: activityError } = await activityQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);

    // Fetch from plot_events table
    let plotEventsQuery = supabase
      .from("plot_events")
      .select("id, farm_id, plot_id, event_type, photo_url, disease_name, severity, notes, created_at")
      .eq("farm_id", farm_id);

    if (filter !== "all" && filterMap[filter]) {
      plotEventsQuery = plotEventsQuery.in("event_type", filterMap[filter]);
    }

    const { data: plotEvents, error: plotEventsError } = await plotEventsQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);

    // Normalise plot_events into ActivityItem shape
    const normalisedPlotEvents = (plotEvents || []).map((pe) => ({
      id: pe.id,
      farm_id: pe.farm_id,
      plot_id: pe.plot_id,
      event_type: pe.event_type,
      title: buildPlotEventTitle(pe.event_type, pe.disease_name),
      description: pe.notes || buildPlotEventDescription(pe.event_type, pe.severity),
      photo_url: pe.photo_url,
      metadata: {} as Record<string, unknown>,
      created_at: pe.created_at,
    }));

    // Combine, deduplicate by id, sort by created_at desc
    const seenIds = new Set<string>();
    const combined = [...(activityItems || []), ...normalisedPlotEvents]
      .filter((item) => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    // Paginate the combined result
    const paginated = combined.slice(0, limit);
    const hasMore = combined.length > limit;

    return NextResponse.json({ items: paginated, hasMore });
  } catch (err) {
    console.error("Activity fetch error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ── helper: readable title from plot event type ── */
function buildPlotEventTitle(eventType: string, diseaseName?: string | null): string {
  const titles: Record<string, string> = {
    inspection_clean: "Inspection: All Clear",
    inspection_disease: diseaseName
      ? `Disease Detected: ${diseaseName}`
      : "Disease Detected",
    inspection_suspicious: "Suspicious Finding",
    inspection_referred: "Referred to Expert",
    treatment_applied: "Treatment Applied",
    watered: "Plot Watered",
    fertilized: "Fertilizer Applied",
    harvested: "Crop Harvested",
    replanted: "Crop Replanted",
    weather_stress: "Weather Stress Event",
    ai_risk_recalc: "Risk Score Updated",
  };
  return titles[eventType] || eventType.replace(/_/g, " ");
}

/* ── helper: description from plot event metadata ── */
function buildPlotEventDescription(
  eventType: string,
  severity?: string | null
): string {
  if (severity) return `Severity: ${severity}`;
  const descs: Record<string, string> = {
    inspection_clean: "No issues found during inspection.",
    watered: "Plot was watered.",
    fertilized: "Fertilizer was applied.",
    harvested: "Crop was harvested successfully.",
    replanted: "New crop was planted.",
    weather_stress: "Adverse weather conditions affected this plot.",
  };
  return descs[eventType] || "";
}
