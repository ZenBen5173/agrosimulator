"use client";

import { useEffect, useState } from "react";

export function useServiceWorker() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        setRegistration(reg);
        setIsReady(true);
      })
      .catch((err) => {
        console.warn("SW registration failed:", err);
      });
  }, []);

  return { registration, isReady };
}
