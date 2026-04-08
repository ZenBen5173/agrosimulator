"use client";

import { useEffect, useState, useCallback } from "react";
import { useServiceWorker } from "./useServiceWorker";

type PushPermission = "default" | "granted" | "denied";

export function usePushNotifications() {
  const { registration, isReady } = useServiceWorker();
  const [permission, setPermission] = useState<PushPermission>("default");
  const [subscription, setSubscription] =
    useState<PushSubscription | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission as PushPermission);
    }
  }, []);

  // Check existing subscription
  useEffect(() => {
    if (!registration) return;

    registration.pushManager.getSubscription().then((sub) => {
      if (sub) setSubscription(sub);
    });
  }, [registration]);

  const subscribe = useCallback(async () => {
    if (!registration) return null;

    // Request permission
    const perm = await Notification.requestPermission();
    setPermission(perm as PushPermission);

    if (perm !== "granted") return null;

    try {
      // Get VAPID public key from server
      const res = await fetch("/api/push/vapid-key");
      if (!res.ok) return null;
      const { publicKey } = await res.json();

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      // Save subscription to server
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      setSubscription(sub);
      return sub;
    } catch (err) {
      console.error("Push subscription failed:", err);
      return null;
    }
  }, [registration]);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;

    await subscription.unsubscribe();
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    setSubscription(null);
  }, [subscription]);

  return {
    isSupported: isReady && "Notification" in globalThis,
    permission,
    subscription,
    subscribe,
    unsubscribe,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
