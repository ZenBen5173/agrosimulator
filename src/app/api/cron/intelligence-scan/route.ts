import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { intelligenceScanFlow } from "@/flows/intelligenceScan";

/**
 * Vercel Cron Job — runs every 6 hours.
 * Scans for agricultural threats and creates targeted farm alerts.
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret in production
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // Get all distinct regions and crops from active farms
    const { data: farms } = await supabase
      .from("farms")
      .select("id, district, state");

    if (!farms || farms.length === 0) {
      return NextResponse.json({ message: "No farms to scan" });
    }

    const { data: plots } = await supabase
      .from("plots")
      .select("farm_id, crop_name")
      .eq("is_active", true);

    const farmCrops = new Map<string, Set<string>>();
    for (const p of plots || []) {
      if (!farmCrops.has(p.farm_id)) farmCrops.set(p.farm_id, new Set());
      if (p.crop_name) farmCrops.get(p.farm_id)!.add(p.crop_name);
    }

    // Run intelligence scan
    const allCrops = [...new Set((plots || []).map((p) => p.crop_name).filter(Boolean))];
    const regions = [...new Set(farms.map((f) => f.state).filter(Boolean))];

    const result = await intelligenceScanFlow({
      region: regions.join(", "),
      crops: allCrops,
    });

    let alertsCreated = 0;

    // Match alerts to affected farms
    for (const alert of result.alerts) {
      for (const farm of farms) {
        // Check if farm is in affected region
        const regionMatch =
          alert.affected_regions.length === 0 ||
          alert.affected_regions.some(
            (r) =>
              farm.state?.toLowerCase().includes(r.toLowerCase()) ||
              farm.district?.toLowerCase().includes(r.toLowerCase())
          );

        // Check if farm grows affected crops
        const crops = farmCrops.get(farm.id) || new Set();
        const cropMatch =
          alert.affected_crops.length === 0 ||
          alert.affected_crops.some((c) =>
            [...crops].some((fc) => fc.toLowerCase().includes(c.toLowerCase()))
          );

        if (regionMatch && cropMatch) {
          // Dedup: don't send same alert within 7 days
          const dedupKey = `${alert.title}:${farm.id}`;
          const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

          const { data: existing } = await supabase
            .from("farm_alerts")
            .select("id")
            .eq("dedup_key", dedupKey)
            .gte("created_at", sevenDaysAgo)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from("farm_alerts").insert({
              farm_id: farm.id,
              alert_type: alert.source_type === "news" ? "general" : "weather_warning",
              title: alert.title,
              summary: alert.summary,
              severity: alert.severity,
              affected_crops: alert.affected_crops,
              recommended_action: alert.recommended_action,
              source_type: alert.source_type,
              dedup_key: dedupKey,
            });
            alertsCreated++;
          }
        }
      }
    }

    return NextResponse.json({
      alerts_found: result.alerts.length,
      alerts_created: alertsCreated,
      scan_timestamp: result.scan_timestamp,
    });
  } catch (err) {
    console.error("Intelligence scan cron error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
