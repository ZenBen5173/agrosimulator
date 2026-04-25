import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createDemoClient } from "./demo-client";

/**
 * Supabase server client. When DEMO_MODE=true, returns an in-memory mock
 * that bypasses authentication and serves seed data. See `demo-client.ts`
 * for the rationale and full explanation.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const realClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://demo.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "demo-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from Server Components where cookies can't be set.
          }
        },
      },
    }
  );

  if (process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return createDemoClient() as unknown as typeof realClient;
  }
  return realClient;
}
