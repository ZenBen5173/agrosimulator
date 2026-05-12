/**
 * AgroSim 2.0 — Receipt scanning API.
 *
 * POST /api/receipts/scan
 * Body: { photoBase64: string, photoMimeType: string }
 * Returns: { receipt: ParsedReceipt, warnings: string[] }
 *
 * Confirmation + inventory write happen in a separate POST /api/receipts/apply
 * once the farmer has reviewed the parsed result. Splitting these endpoints
 * keeps the scan idempotent and side-effect-free.
 */

import { NextResponse } from "next/server";
import { scanAndParseReceipt } from "@/services/receipts/orchestrator";

export async function POST(request: Request) {
  let body: { photoBase64?: string; photoMimeType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.photoBase64 || !body.photoMimeType) {
    return NextResponse.json(
      { error: "photoBase64 and photoMimeType required" },
      { status: 400 }
    );
  }

  try {
    const result = await scanAndParseReceipt({
      photoBase64: body.photoBase64,
      photoMimeType: body.photoMimeType,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Receipt scan error:", err);
    return NextResponse.json(
      {
        error: "Receipt scan failed",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
