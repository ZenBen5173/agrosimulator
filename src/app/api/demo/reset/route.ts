/**
 * AgroSim 2.0 — Demo data reset.
 *
 * POST /api/demo/reset
 *
 * Wipes the demo user's data and reseeds it back to the baseline. Designed
 * for the "login → test → reset → repeat" demo flow. Only the demo account
 * itself can call this — protected by the email check below.
 *
 * Uses the service-role client so it can bypass RLS to delete cleanly.
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import {
  ALL_FIXTURE_EMAILS,
  DEMO_EMAIL,
  NEIGHBOUR_EMAIL,
  seedDemoData,
  wipeAllFixtureData,
} from "@/services/demo/seed";

export async function POST() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Reset disabled — SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 503 }
    );
  }

  // Two valid callers:
  //   (a) authed session whose email is the demo user — used by the
  //       in-session "Reset demo data" button in /settings
  //   (b) anyone — used by the landing page's "Reset demo data" button
  //       BEFORE sign-in. Safe because this endpoint can only ever touch
  //       the hardcoded demo + neighbour fixtures (looked up by email
  //       below). It cannot be abused to reset any other user.
  const authClient = await createAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (user && user.email !== DEMO_EMAIL) {
    return NextResponse.json(
      { error: `Reset only allowed for ${DEMO_EMAIL}` },
      { status: 403 }
    );
  }

  // Service-role client for the actual wipe + seed
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Look up ALL fixture user ids by email — these are the only accounts
  // this endpoint will ever touch.
  const { data: userLookup } = await svc.auth.admin.listUsers();
  const fixtureUsers = (userLookup?.users ?? []).filter((u) =>
    u.email ? ALL_FIXTURE_EMAILS.includes(u.email) : false
  );
  const demoUser = fixtureUsers.find((u) => u.email === DEMO_EMAIL);
  const neighbour = fixtureUsers.find((u) => u.email === NEIGHBOUR_EMAIL);
  if (!demoUser) {
    return NextResponse.json(
      {
        error: `Demo fixture user ${DEMO_EMAIL} not found in auth.users — create it once and retry`,
      },
      { status: 500 }
    );
  }
  if (!neighbour) {
    return NextResponse.json(
      {
        error: `Neighbour fixture user ${NEIGHBOUR_EMAIL} not found in auth.users — create it once and retry`,
      },
      { status: 500 }
    );
  }

  try {
    // Single wipe across ALL fixture users — this is the only correct way to
    // avoid duplicate group buys when neighbours' farms get re-seeded with
    // new UUIDs. Wiping a subset leaves stale rows behind.
    const wiped = await wipeAllFixtureData(
      svc,
      fixtureUsers.map((u) => u.id)
    );

    const seeded = await seedDemoData(svc, {
      demoUserId: demoUser.id,
      neighbourUserId: neighbour.id,
    });

    return NextResponse.json({
      ok: true,
      wiped: {
        rowsAffected: wiped.rowsAffected,
        fixtureUsers: fixtureUsers.length,
      },
      seeded: {
        demoFarmId: seeded.demoFarmId,
        plots: seeded.plotIds.length,
        inventoryItems: seeded.inventoryItemIds.length,
        movements: seeded.movementsCount,
        diagnoses: seeded.diagnosisSessionIds.length,
        groupBuys: seeded.groupBuyIds.length,
        groupBuyItems: seeded.groupBuyItemCount,
        farmerSales: seeded.farmerSalesCount,
        tasks: seeded.tasksCount,
        plotEvents: seeded.plotEventsCount,
        // 2.1 additions
        restockChats: seeded.restockRequestCount,
        restockMessages: seeded.restockMessageCount,
        restockDocuments: seeded.restockDocumentCount,
        journalEntries: seeded.journalEntryCount,
        journalLines: seeded.journalLineCount,
      },
    });
  } catch (err) {
    console.error("Demo reset error:", err);
    return NextResponse.json(
      {
        error: "Reset failed",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
