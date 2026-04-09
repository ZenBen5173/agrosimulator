"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Home,
  BarChart3,
  MessageCircle,
  CalendarDays,
  Plus,
} from "lucide-react";
import FabMenu from "./FabMenu";

const LEFT_TABS = [
  { key: "home", label: "Home", icon: Home, href: "/home" },
  { key: "dashboard", label: "Dashboard", icon: BarChart3, href: "/dashboard" },
];

const RIGHT_TABS = [
  { key: "chat", label: "AI Chat", icon: MessageCircle, href: "/chat" },
  { key: "calendar", label: "Calendar", icon: CalendarDays, href: "/calendar" },
];

const ALL_TABS = [...LEFT_TABS, ...RIGHT_TABS];

export default function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [fabOpen, setFabOpen] = useState(false);

  const activeTab =
    ALL_TABS.find((t) => pathname.startsWith(t.href))?.key || "home";

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-40 border-t border-gray-100 bg-white/80 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-14 items-center justify-around">
        {/* Left tabs */}
        {LEFT_TABS.map((tab) => {
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

        {/* Center FAB button */}
        <div className="relative flex flex-1 items-center justify-center">
          <motion.button
            onClick={() => setFabOpen((prev) => !prev)}
            aria-label="Quick actions"
            aria-haspopup="true"
            aria-expanded={fabOpen}
            className={`absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 shadow-lg shadow-green-600/30 transition-shadow hover:shadow-xl ${
              fabOpen ? "z-50" : ""
            }`}
          >
            <motion.div
              animate={{ rotate: fabOpen ? 45 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Plus size={26} className="text-white" strokeWidth={2.5} />
            </motion.div>
          </motion.button>
        </div>

        {/* Right tabs */}
        {RIGHT_TABS.map((tab) => {
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

      {/* FAB overflow menu */}
      <FabMenu open={fabOpen} onClose={() => setFabOpen(false)} />
    </nav>
  );
}
