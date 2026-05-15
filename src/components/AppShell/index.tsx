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

// Inside a chat thread we hide the global tab bar — the compose bar takes
// the bottom slot and the back arrow handles navigation, same as WhatsApp,
// Claude, and ChatGPT inside an open conversation.
function isChatThread(pathname: string): boolean {
  // /chats/<id> but NOT /chats (the inbox keeps the tab bar)
  return /^\/chats\/[^/]+/.test(pathname);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const showTabs =
    pathname !== "/" &&
    !HIDE_TAB_PATTERNS.some(
      (p) => p !== "/" && pathname.startsWith(p)
    ) &&
    !isChatThread(pathname);

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
