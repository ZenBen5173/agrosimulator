"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  Map,
  MessageCircle,
  BookOpen,
  Plus,
} from "lucide-react";
import FabMenu from "./FabMenu";

const LEFT_TABS = [
  { key: "home", label: "Today", icon: CalendarCheck, href: "/home" },
  { key: "farm", label: "Farm", icon: Map, href: "/farm" },
];

const RIGHT_TABS = [
  { key: "chat", label: "Chat", icon: MessageCircle, href: "/chat" },
  { key: "accounts", label: "Accounts", icon: BookOpen, href: "/dashboard" },
];

const ALL_TABS = [...LEFT_TABS, ...RIGHT_TABS];

export default function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [fabOpen, setFabOpen] = useState(false);

  const activeTab =
    ALL_TABS.find((t) => pathname.startsWith(t.href))?.key || "home";

  const renderTab = (tab: (typeof ALL_TABS)[number]) => {
    const isActive = activeTab === tab.key;
    const Icon = tab.icon;
    return (
      <button
        key={tab.key}
        onClick={() => router.push(tab.href)}
        className="relative flex flex-1 flex-col items-center justify-center gap-1 py-1"
      >
        <div className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors ${isActive ? "bg-green-50" : ""}`}>
          <Icon
            size={18}
            className={isActive ? "text-green-600" : "text-gray-400 transition-colors"}
            strokeWidth={isActive ? 2.2 : 1.6}
          />
        </div>
        <span className={`text-[10px] leading-none ${isActive ? "text-green-600 font-semibold" : "text-gray-400 font-medium"}`}>
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-40 bg-white border-t border-gray-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-16 items-center justify-around px-2">
        {LEFT_TABS.map(renderTab)}

        {/* Center FAB */}
        <div className="relative flex flex-1 items-center justify-center">
          <motion.button
            onClick={() => setFabOpen((prev) => !prev)}
            aria-label="Quick actions"
            aria-haspopup="true"
            aria-expanded={fabOpen}
            className={`absolute -top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 shadow-md transition-all hover:bg-gray-800 ${
              fabOpen ? "z-50 rotate-45" : ""
            }`}
          >
            <Plus size={22} className="text-white" strokeWidth={2} />
          </motion.button>
        </div>

        {RIGHT_TABS.map(renderTab)}
      </div>

      <FabMenu open={fabOpen} onClose={() => setFabOpen(false)} />
    </nav>
  );
}
