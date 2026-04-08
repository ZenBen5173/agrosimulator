import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

let initialized = false;

function ensureInit() {
  if (initialized || !VAPID_PUBLIC || !VAPID_PRIVATE) return;
  webpush.setVapidDetails(
    "mailto:agrosim@example.com",
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
  initialized = true;
}

/**
 * Send a push notification to a user.
 * Fails silently — push is non-critical.
 */
export async function sendPushToUser(
  userId: string,
  notification: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
  }
) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  ensureInit();

  try {
    const supabase = await createClient();
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys_p256dh, keys_auth")
      .eq("user_id", userId);

    if (!subs || subs.length === 0) return;

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: notification.url || "/home",
      tag: notification.tag || "default",
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
          },
          payload
        );
      } catch (err: unknown) {
        const pushErr = err as { statusCode?: number };
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
        }
      }
    }
  } catch {
    // Push is best-effort, never block the main flow
  }
}
