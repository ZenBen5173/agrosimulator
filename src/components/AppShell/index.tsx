"use client";

import { usePathname } from "next/navigation";
import BottomTabBar from "@/components/BottomTabBar";
import { Toaster } from "react-hot-toast";

// Surfaces that genuinely need the full screen: the landing page, auth flow,
// and onboarding (map drawing). Everything else keeps the bottom tab bar so
// the user can always navigate away.
const HIDE_TAB_PATTERNS = [
  "/",
  "/auth",
  "/onboarding",
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const showTabs =
    pathname !== "/" &&
    !HIDE_TAB_PATTERNS.some(
      (p) => p !== "/" && pathname.startsWith(p)
    );

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          className: "!rounded-xl !text-sm !shadow-lg",
          duration: 4000,
        }}
      />
      <div className={showTabs ? "pb-[72px]" : ""}>{children}</div>
      {showTabs && <BottomTabBar />}
    </>
  );
}
