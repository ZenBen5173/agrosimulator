import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import webpush from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    "mailto:agrosim@example.com",
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

export async function POST(request: Request) {
  try {
    const { user_id, title, body, url, tag } = await request.json();

    if (!user_id || !title) {
      return NextResponse.json(
        { error: "user_id and title required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get all subscriptions for this user
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys_p256dh, keys_auth")
      .eq("user_id", user_id);

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, reason: "no_subscriptions" });
    }

    const payload = JSON.stringify({
      title,
      body: body || "",
      url: url || "/home",
      tag: tag || "default",
    });

    let sent = 0;
    const failed: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys_p256dh,
              auth: sub.keys_auth,
            },
          },
          payload
        );
        sent++;
      } catch (err: unknown) {
        const pushErr = err as { statusCode?: number };
        // Remove expired subscriptions
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
        }
        failed.push(sub.endpoint.slice(-20));
      }
    }

    return NextResponse.json({ sent, failed: failed.length });
  } catch (err) {
    console.error("Push send error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
