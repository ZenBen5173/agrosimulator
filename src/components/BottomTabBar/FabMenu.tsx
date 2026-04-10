"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  MapPlus,
  PenLine,
  User,
  BarChart3,
  CloudSun,
  ClipboardCheck,
  Package,
  Wrench,
} from "lucide-react";
import { useFarmStore } from "@/stores/farmStore";

interface FabMenuProps {
  open: boolean;
  onClose: () => void;
}

const FAB_ACTIONS = [
  { key: "prep", label: "Prep List", icon: ClipboardCheck, href: "/prep", color: "bg-green-600", needsPlot: false },
  { key: "scan", label: "Scan Crop", icon: Search, href: "/inspection", color: "bg-green-500", needsPlot: true },
  { key: "inventory", label: "Inventory", icon: Package, href: "/inventory", color: "bg-purple-500", needsPlot: false },
  { key: "weather", label: "Weather", icon: CloudSun, href: "/weather", color: "bg-sky-500", needsPlot: false },
  { key: "market", label: "Market", icon: BarChart3, href: "/market", color: "bg-indigo-500", needsPlot: false },
  { key: "equipment", label: "Equipment", icon: Wrench, href: "/equipment", color: "bg-amber-500", needsPlot: false },
  { key: "add-farm", label: "Add Farm", icon: MapPlus, href: "/onboarding", color: "bg-blue-500", needsPlot: false },
  { key: "redraw", label: "Edit Map", icon: PenLine, href: "/farm/redraw", color: "bg-teal-500", needsPlot: false },
  { key: "profile", label: "Profile", icon: User, href: "/profile", color: "bg-gray-500", needsPlot: false },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
  exit: {
    opacity: 0,
    transition: { staggerChildren: 0.03, staggerDirection: -1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.8 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, damping: 25, stiffness: 350 } },
  exit: { opacity: 0, y: 20, scale: 0.8, transition: { duration: 0.15 } },
};

export default function FabMenu({ open, onClose }: FabMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const plots = useFarmStore((s) => s.plots);

  // Close on route change
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const focusable = menuRef.current.querySelectorAll<HTMLElement>(
      'button, [href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !menuRef.current) return;
      const items = menuRef.current.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => window.removeEventListener("keydown", trap);
  }, [open]);

  const handleAction = useCallback(
    (action: (typeof FAB_ACTIONS)[number]) => {
      if (action.needsPlot) {
        const urgent = plots.find(
          (p) => p.warning_level === "red" || p.warning_level === "orange"
        );
        const target = urgent || plots[0];
        if (target) {
          router.push(`${action.href}?plot_id=${target.id}`);
        } else {
          router.push(action.href);
        }
      } else {
        router.push(action.href);
      }
      onClose();
    },
    [plots, router, onClose]
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="fab-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Menu card */}
          <motion.div
            key="fab-menu"
            ref={menuRef}
            role="menu"
            aria-label="Quick actions"
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: "spring" as const, damping: 25, stiffness: 300 }}
            className="fixed bottom-20 left-4 right-4 z-50 rounded-2xl bg-white p-2 shadow-2xl"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="grid grid-cols-3 gap-1"
            >
              {FAB_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <motion.button
                    key={action.key}
                    role="menuitem"
                    variants={itemVariants}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleAction(action)}
                    className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-1 transition-colors active:bg-gray-100"
                  >
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-full ${action.color} shadow-sm`}
                    >
                      <Icon size={20} className="text-white" />
                    </span>
                    <span className="text-[11px] font-medium text-gray-700 leading-tight text-center">
                      {action.label}
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
