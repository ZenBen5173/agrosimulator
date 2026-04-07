import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");

    if (!farmId) {
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

    // Fetch farm (verify ownership via RLS)
    const { data: farm } = await supabase
      .from("farms")
      .select(
        "id, name, area_acres, district, state, soil_type, water_source, grid_size"
      )
      .eq("id", farmId)
      .single();

    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    // Fetch plots
    const { data: plots } = await supabase
      .from("plots")
      .select(
        "id, label, crop_name, growth_stage, planted_date, expected_harvest, warning_level, warning_reason, is_active"
      )
      .eq("farm_id", farmId)
      .eq("is_active", true)
      .order("label");

    // Fetch latest weather snapshot
    const { data: weather } = await supabase
      .from("weather_snapshots")
      .select(
        "condition, temp_celsius, humidity_pct, rainfall_mm, wind_kmh, fetched_at"
      )
      .eq("farm_id", farmId)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    // Fetch recent plot events (last 20)
    const { data: events } = await supabase
      .from("plot_events")
      .select(
        "id, event_type, notes, disease_name, severity, created_at, plot_id"
      )
      .eq("farm_id", farmId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch financial records if they exist
    const { data: financials } = await supabase
      .from("financial_records")
      .select("record_type, amount")
      .eq("farm_id", farmId);

    // Calculate financial summary
    let totalIncome = 0;
    let totalExpenses = 0;
    if (financials && financials.length > 0) {
      for (const r of financials) {
        if (r.record_type === "income") totalIncome += r.amount;
        else if (r.record_type === "expense") totalExpenses += r.amount;
      }
    }
    const hasFinancials = financials && financials.length > 0;

    // Map plot IDs to labels for events
    const plotLabelMap: Record<string, string> = {};
    if (plots) {
      for (const p of plots) {
        plotLabelMap[p.id] = p.label;
      }
    }

    const generatedAt = new Date().toLocaleString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
      dateStyle: "full",
      timeStyle: "short",
    });

    // Build HTML report
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Farm Report - ${escapeHtml(farm.name || "My Farm")}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a1a;
      line-height: 1.6;
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 3px solid #16a34a;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 24px;
      color: #16a34a;
      margin-bottom: 4px;
    }
    .header p {
      color: #666;
      font-size: 13px;
    }
    .section {
      margin-bottom: 28px;
    }
    .section h2 {
      font-size: 16px;
      color: #16a34a;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 6px;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 24px;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
    }
    .info-label {
      color: #666;
      font-size: 13px;
    }
    .info-value {
      font-weight: 600;
      font-size: 13px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      background: #f0fdf4;
      color: #166534;
      text-align: left;
      padding: 8px 10px;
      font-weight: 600;
      border-bottom: 2px solid #bbf7d0;
    }
    td {
      padding: 7px 10px;
      border-bottom: 1px solid #f3f4f6;
    }
    tr:hover td { background: #fafafa; }
    .warning-none { color: #22c55e; }
    .warning-yellow { color: #eab308; }
    .warning-orange { color: #f97316; }
    .warning-red { color: #ef4444; font-weight: 600; }
    .financial-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
    }
    .financial-card {
      text-align: center;
      padding: 14px;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
    }
    .financial-card.income { background: #f0fdf4; border-color: #bbf7d0; }
    .financial-card.expense { background: #fef2f2; border-color: #fecaca; }
    .financial-card.net { background: #f0f9ff; border-color: #bae6fd; }
    .financial-card .amount {
      font-size: 20px;
      font-weight: 700;
    }
    .financial-card .label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .event-item {
      display: flex;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid #f3f4f6;
      font-size: 12px;
    }
    .event-date {
      color: #888;
      white-space: nowrap;
      min-width: 80px;
    }
    .event-type {
      background: #f3f4f6;
      color: #374151;
      padding: 1px 8px;
      border-radius: 4px;
      font-size: 11px;
      white-space: nowrap;
    }
    .event-desc { color: #555; flex: 1; }
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #999;
      font-size: 11px;
    }
    @media print {
      body { padding: 12px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>AgroSimulator Farm Report</h1>
    <p>${escapeHtml(farm.name || "My Farm")} &mdash; ${generatedAt}</p>
  </div>

  <div class="section">
    <h2>Farm Overview</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Farm Name</span>
        <span class="info-value">${escapeHtml(farm.name || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Area</span>
        <span class="info-value">${farm.area_acres ? farm.area_acres.toFixed(1) + " acres" : "—"}</span>
      </div>
      <div class="info-item">
        <span class="info-label">District</span>
        <span class="info-value">${escapeHtml(farm.district || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">State</span>
        <span class="info-value">${escapeHtml(farm.state || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Soil Type</span>
        <span class="info-value">${escapeHtml(formatLabel(farm.soil_type || "—"))}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Water Source</span>
        <span class="info-value">${escapeHtml(formatLabel(farm.water_source || "—"))}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Grid Size</span>
        <span class="info-value">${farm.grid_size ? farm.grid_size + "x" + farm.grid_size : "—"}</span>
      </div>
      ${
        weather
          ? `<div class="info-item">
              <span class="info-label">Latest Weather</span>
              <span class="info-value">${escapeHtml(formatLabel(weather.condition))} (${weather.temp_celsius}&deg;C, ${weather.humidity_pct}% humidity)</span>
            </div>`
          : ""
      }
    </div>
  </div>

  ${
    plots && plots.length > 0
      ? `<div class="section">
    <h2>Plot Summary (${plots.length} plots)</h2>
    <table>
      <thead>
        <tr>
          <th>Plot</th>
          <th>Crop</th>
          <th>Stage</th>
          <th>Planted</th>
          <th>Expected Harvest</th>
          <th>Warning</th>
        </tr>
      </thead>
      <tbody>
        ${plots
          .map(
            (p) => `
        <tr>
          <td>${escapeHtml(p.label)}</td>
          <td>${escapeHtml(p.crop_name || "—")}</td>
          <td>${escapeHtml(formatLabel(p.growth_stage || "—"))}</td>
          <td>${p.planted_date ? formatDate(p.planted_date) : "—"}</td>
          <td>${p.expected_harvest ? formatDate(p.expected_harvest) : "—"}</td>
          <td class="warning-${p.warning_level || "none"}">${escapeHtml(formatLabel(p.warning_level || "none"))}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`
      : `<div class="section">
    <h2>Plot Summary</h2>
    <p style="color: #888; font-size: 13px;">No active plots found.</p>
  </div>`
  }

  ${
    hasFinancials
      ? `<div class="section">
    <h2>Financial Summary</h2>
    <div class="financial-grid">
      <div class="financial-card income">
        <div class="amount" style="color: #16a34a;">RM ${totalIncome.toFixed(2)}</div>
        <div class="label">Total Income</div>
      </div>
      <div class="financial-card expense">
        <div class="amount" style="color: #dc2626;">RM ${totalExpenses.toFixed(2)}</div>
        <div class="label">Total Expenses</div>
      </div>
      <div class="financial-card net">
        <div class="amount" style="color: ${totalIncome - totalExpenses >= 0 ? "#0ea5e9" : "#dc2626"};">RM ${(totalIncome - totalExpenses).toFixed(2)}</div>
        <div class="label">Net Profit</div>
      </div>
    </div>
  </div>`
      : ""
  }

  ${
    events && events.length > 0
      ? `<div class="section">
    <h2>Recent Activity (${events.length} events)</h2>
    ${events
      .map(
        (e) => `
    <div class="event-item">
      <span class="event-date">${formatDate(e.created_at)}</span>
      <span class="event-type">${escapeHtml(formatLabel(e.event_type))}</span>
      <span class="event-desc">${escapeHtml(
        e.notes ||
          (e.disease_name
            ? e.disease_name + (e.severity ? " (" + e.severity + ")" : "")
            : "") ||
          (e.plot_id && plotLabelMap[e.plot_id]
            ? "Plot " + plotLabelMap[e.plot_id]
            : "—")
      )}</span>
    </div>`
      )
      .join("")}
  </div>`
      : ""
  }

  <div class="footer">
    <p>Generated by AgroSimulator on ${generatedAt}</p>
    <p>This report is for informational purposes only.</p>
  </div>
</body>
</html>`;

    return NextResponse.json({ html });
  } catch (err) {
    console.error("Export report error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLabel(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
