"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  Stethoscope,
  Users,
  BookOpen,
  Plus,
} from "lucide-react";
import FabMenu from "./FabMenu";

// AgroSim 2.0 navigation. Three layers of the spec → three primary tabs
// flanking the FAB; Today is the home base.
const LEFT_TABS = [
  { key: "home", label: "Today", icon: CalendarCheck, href: "/home" },
  { key: "care", label: "Inspect", icon: Stethoscope, href: "/inspection/v2" },
];

const RIGHT_TABS = [
  { key: "pact", label: "Co-op", icon: Users, href: "/market" },
  { key: "books", label: "Inventory", icon: BookOpen, href: "/inventory" },
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
        data-tour={`nav-${tab.key}`}
        onClick={() => router.push(tab.href)}
        className="relative flex flex-1 flex-col items-center justify-center gap-1 py-1"
      >
        <div
          className={`flex h-7 w-10 items-center justify-center rounded-full transition-colors ${
            isActive ? "bg-emerald-50" : ""
          }`}
        >
          <Icon
            size={18}
            className={isActive ? "text-emerald-700" : "text-stone-400 transition-colors"}
            strokeWidth={isActive ? 2.2 : 1.6}
          />
        </div>
        <span
          className={`text-[10px] leading-none ${
            isActive ? "font-semibold text-emerald-700" : "font-medium text-stone-400"
          }`}
        >
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-40 border-t border-stone-200 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-16 max-w-xl items-center justify-around px-2">
        {LEFT_TABS.map(renderTab)}

        {/* Center FAB */}
        <div className="relative flex flex-1 items-center justify-center">
          <motion.button
            data-tour="nav-fab"
            onClick={() => setFabOpen((prev) => !prev)}
            aria-label="Quick actions"
            aria-haspopup="true"
            aria-expanded={fabOpen}
            className={`absolute -top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 shadow-md transition-all hover:bg-stone-800 ${
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
