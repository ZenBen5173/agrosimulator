import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/origin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getOrigin(request);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const tour = searchParams.get("tour");
  const reset = searchParams.get("reset");

  const supabase = await createClient();

  // Handle PKCE code exchange (magic link redirect)
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Handle token hash (email OTP link)
  if (token_hash && type) {
    await supabase.auth.verifyOtp({
      token_hash,
      type: type as "email" | "magiclink",
    });
  }

  // Check auth state and route accordingly
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  // Ensure profile exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    await supabase
      .from("profiles")
      .insert({ id: user.id, phone: user.phone });
  }

  // Check if user has a completed farm
  const { data: farms } = await supabase
    .from("farms")
    .select("id")
    .eq("onboarding_done", true)
    .limit(1);

  const params = new URLSearchParams();
  if (tour === "1") params.set("tour", "1");
  if (reset === "1") params.set("reset", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";

  if (farms && farms.length > 0) {
    return NextResponse.redirect(`${origin}/home${qs}`);
  }

  // No farm yet — but if reset=1, go to /home so the reset can run + seed
  if (reset === "1") {
    return NextResponse.redirect(`${origin}/home${qs}`);
  }

  return NextResponse.redirect(`${origin}/onboarding`);
}
