import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analysePhotos } from "@/services/ai/diseaseDetection";

export async function POST(request: Request) {
  try {
    const { farm_id, plot_id, photo_base64s, crop_name, plot_label } =
      await request.json();

    if (!farm_id || !plot_id || !photo_base64s || !crop_name) {
      return NextResponse.json(
        { error: "farm_id, plot_id, photo_base64s, and crop_name are required" },
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

    const result = await analysePhotos(
      photos,
      crop_name,
      plot_label || "unknown"
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("Analyse error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
