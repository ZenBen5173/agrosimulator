import { createBrowserClient } from "@supabase/ssr";
import { createDemoClient } from "./demo-client";

/**
 * Supabase browser client. When NEXT_PUBLIC_DEMO_MODE=true, returns an
 * in-memory mock that reads seed data and persists writes to sessionStorage.
 * See `demo-client.ts` for the rationale and full explanation.
 */
export function createClient() {
  const realClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://demo.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "demo-key"
  );
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return createDemoClient() as unknown as typeof realClient;
  }
  return realClient;
}
