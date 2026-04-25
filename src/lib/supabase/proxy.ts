import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createDemoClient } from "./demo-client";

/**
 * Supabase middleware/proxy client. When DEMO_MODE=true, returns a mock
 * client that always reports the demo user as logged in. See `demo-client.ts`
 * for the full rationale.
 */
export function createClient(request: NextRequest) {
  let response = NextResponse.next({ request });

  const realClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://demo.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "demo-key",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  if (process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return { supabase: createDemoClient() as unknown as typeof realClient, response: () => response };
  }

  return { supabase: realClient, response: () => response };
}
