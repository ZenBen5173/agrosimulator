/**
 * AgroSim 2.0 — Diagnosis report PDF endpoint.
 *
 * POST /api/diagnosis/v2/pdf
 * Body: { session: DiagnosisSession }   — must contain session.result
 *
 * Returns: application/pdf stream + Content-Disposition with a filename
 * derived from the case reference (so the farmer's download folder gets
 * "AgroSim-AS-20260513-AB12.pdf" not "report.pdf").
 *
 * The PDF generator runs ENTIRELY in code (pdf-lib) — no second AI call.
 * The AI's contribution was already made: it produced the diagnosis,
 * differential, observations, and reasoning that now live on the session.
 * This route just lays them out.
 *
 * Optionally enriches the report with the farmer's name + district,
 * pulled from the authenticated user's farm row (best-effort: any
 * Supabase failure falls through silently and the report ships without
 * those fields).
 */

import { NextResponse } from "next/server";
import { buildDiagnosisReportPdf } from "@/lib/diagnosis/pdfReport";
import { createClient } from "@/lib/supabase/server";
import type { DiagnosisSession } from "@/lib/diagnosis/types";

export async function POST(request: Request) {
  let body: { session?: DiagnosisSession };
  try {
    body = (await request.json()) as { session?: DiagnosisSession };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const session = body.session;
  if (!session) {
    return NextResponse.json({ error: "`session` required" }, { status: 400 });
  }
  if (!session.result) {
    return NextResponse.json(
      { error: "Session has no result yet — finalise the diagnosis first" },
      { status: 400 }
    );
  }

  // Best-effort: enrich with the user's name + district. Any failure here
  // is non-fatal — we just build the PDF without those optional fields.
  let farmerName: string | undefined;
  let farmDistrict: string | undefined;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      farmerName =
        (user.user_metadata?.full_name as string | undefined) ??
        user.email?.split("@")[0];
      const { data: farm } = await supabase
        .from("farms")
        .select("district")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      farmDistrict = farm?.district ?? undefined;
    }
  } catch {
    // swallow — optional data
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildDiagnosisReportPdf(session, {
      farmerName,
      farmDistrict,
    });
  } catch (err) {
    console.error("PDF generation failed:", err);
    return NextResponse.json(
      {
        error: "PDF generation failed",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }

  // Filename: AgroSim-AS-YYYYMMDD-XXXX.pdf so the farmer's download
  // folder stays organised across multiple diagnoses.
  const d = new Date(session.startedAt);
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const tail = session.sessionId.replace(/-/g, "").slice(-4).toUpperCase();
  const filename = `AgroSim-AS-${yyyymmdd}-${tail}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBytes.length),
      "Cache-Control": "no-store",
    },
  });
}
