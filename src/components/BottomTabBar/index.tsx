"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Home,
  BarChart3,
  MessageCircle,
  CalendarDays,
  User,
} from "lucide-react";

const TABS = [
  { key: "home", label: "Home", icon: Home, href: "/home" },
  { key: "dashboard", label: "Dashboard", icon: BarChart3, href: "/dashboard" },
  { key: "chat", label: "AI Chat", icon: MessageCircle, href: "/chat" },
  { key: "calendar", label: "Calendar", icon: CalendarDays, href: "/calendar" },
  { key: "profile", label: "Profile", icon: User, href: "/profile" },
];

export default function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();

  const activeTab =
    TABS.find((t) => pathname.startsWith(t.href))?.key || "home";

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-40 border-t border-gray-100 bg-white/80 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-14 items-center justify-around">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => router.push(tab.href)}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5"
            >
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute -top-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-green-600"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                size={20}
                className={
                  isActive
                    ? "text-green-600"
                    : "text-gray-400 transition-colors"
                }
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span
                className={`text-[10px] font-medium ${
                  isActive ? "text-green-600" : "text-gray-400"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
