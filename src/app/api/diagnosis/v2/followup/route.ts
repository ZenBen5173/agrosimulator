/**
 * AgroSim 2.0 — Treatment follow-up confirmation endpoint.
 *
 * POST /api/diagnosis/v2/followup
 * Body: { followupId: string, status: "better"|"same"|"worse", notes?: string }
 *
 * The pg_cron job creates the task and sends the notification 5 days after
 * the diagnosis. This endpoint records the farmer's tap response and
 * triggers downstream behaviour:
 *   - better → close the diagnosis session
 *   - same   → schedule a 3-day recheck
 *   - worse  → escalate to a real human (MARDI extension officer)
 */

import { NextResponse } from "next/server";
import { applyFollowupResult } from "@/services/diagnosis/persistence";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: { followupId?: string; status?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.followupId) {
    return NextResponse.json({ error: "followupId required" }, { status: 400 });
  }
  if (body.status !== "better" && body.status !== "same" && body.status !== "worse") {
    return NextResponse.json(
      { error: "status must be one of better|same|worse" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await applyFollowupResult(supabase, {
      followupId: body.followupId,
      status: body.status,
      notes: body.notes,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Follow-up error:", err);
    return NextResponse.json(
      {
        error: "Follow-up update failed",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
