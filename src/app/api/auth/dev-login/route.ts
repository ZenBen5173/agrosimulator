import { getOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// DEV ONLY — generates a magic link that bypasses email delivery
// Remove this route before production deployment
export async function POST(request: Request) {
    const limited = rateLimit(request, "auth"); if (limited) return limited;

  // Allow dev login if SUPABASE_SERVICE_ROLE_KEY is set (needed for demo/hackathon)
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const { email } = await request.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${getOrigin(request)}/auth/callback`,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // The action_link is the full Supabase URL with token
  // We need to extract token_hash from it — it's in the hash fragment
  const actionLink = data.properties.action_link;
  const linkUrl = new URL(actionLink);

  // Supabase puts params in the URL hash fragment: #token_hash=xxx&type=magiclink
  // OR as query params depending on the flow
  let tokenHash = linkUrl.searchParams.get("token_hash");
  let type = linkUrl.searchParams.get("type");

  // Check hash fragment if not in query params
  if (!tokenHash && linkUrl.hash) {
    const hashParams = new URLSearchParams(linkUrl.hash.slice(1));
    tokenHash = hashParams.get("token_hash");
    type = hashParams.get("type");
  }

  // If still no token_hash, use the hashed_token from properties directly
  if (!tokenHash) {
    tokenHash = data.properties.hashed_token;
    type = "magiclink";
  }

  const callbackUrl = `/auth/callback?token_hash=${tokenHash}&type=${type}`;
  return NextResponse.json({ callbackUrl });
}
