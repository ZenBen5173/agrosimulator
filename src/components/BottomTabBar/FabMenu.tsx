"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stethoscope,
  Receipt,
  Users,
  CloudSun,
  TrendingUp,
  Settings,
} from "lucide-react";
import { useFarmStore } from "@/stores/farmStore";

interface FabMenuProps {
  open: boolean;
  onClose: () => void;
}

interface FabAction {
  key: string;
  label: string;
  icon: typeof Stethoscope;
  href: string;
  color: string;
  needsPlot?: boolean;
}

// AgroSim 2.0 quick actions — one per layer, plus weather context.
const FAB_GROUPS: { label: string; items: FabAction[] }[] = [
  {
    label: "Care",
    items: [
      { key: "inspect", label: "Inspect Plant", icon: Stethoscope, href: "/inspection/v2", color: "bg-emerald-500", needsPlot: true },
    ],
  },
  {
    label: "Inventory",
    items: [
      { key: "scan_receipt", label: "Scan Receipt", icon: Receipt, href: "/receipts", color: "bg-violet-500" },
    ],
  },
  {
    label: "Co-op",
    items: [
      { key: "groupbuy", label: "Group Buys", icon: Users, href: "/market", color: "bg-amber-500" },
      { key: "prices", label: "Price Check", icon: TrendingUp, href: "/market", color: "bg-indigo-500" },
    ],
  },
  {
    label: "Info",
    items: [
      { key: "weather", label: "Weather", icon: CloudSun, href: "/weather", color: "bg-sky-500" },
    ],
  },
];

const groupVariants = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { delay: i * 0.06, staggerChildren: 0.03 },
  }),
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.9 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, damping: 25, stiffness: 350 } },
  exit: { opacity: 0, y: 12, scale: 0.9, transition: { duration: 0.1 } },
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
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const focusable = menuRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) focusable[0].focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !menuRef.current) return;
      const items = menuRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", trap);
    return () => window.removeEventListener("keydown", trap);
  }, [open]);

  const handleAction = useCallback(
    (action: FabAction) => {
      if (action.needsPlot) {
        const urgent = plots.find((p) => p.warning_level === "red" || p.warning_level === "orange");
        const target = urgent || plots[0];
        if (target) router.push(`${action.href}?plot_id=${target.id}`);
        else router.push(action.href);
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
          />

          {/* Menu card */}
          <motion.div
            key="fab-menu"
            ref={menuRef}
            role="menu"
            aria-label="Quick actions"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring" as const, damping: 25, stiffness: 300 }}
            className="fixed bottom-20 left-4 right-4 z-50 rounded-2xl bg-white shadow-2xl overflow-hidden"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Grouped sections */}
            {FAB_GROUPS.map((group, gi) => (
              <motion.div
                key={group.label}
                custom={gi}
                variants={groupVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={gi > 0 ? "border-t border-gray-100" : ""}
              >
                {/* Section header */}
                <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest font-bold text-gray-400">
                  {group.label}
                </p>

                {/* Action row */}
                <div className="flex px-2 pb-2">
                  {group.items.map((action) => {
                    const Icon = action.icon;
                    return (
                      <motion.button
                        key={action.key}
                        role="menuitem"
                        variants={itemVariants}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleAction(action)}
                        className="flex flex-1 flex-col items-center gap-1.5 rounded-xl py-2 px-1 transition-colors active:bg-gray-50"
                      >
                        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${action.color} shadow-sm`}>
                          <Icon size={18} className="text-white" />
                        </span>
                        <span className="text-[11px] font-medium text-gray-600 leading-tight text-center">
                          {action.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            ))}

            {/* Settings footer */}
            <motion.div
              custom={FAB_GROUPS.length}
              variants={groupVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="border-t border-gray-100"
            >
              <button
                role="menuitem"
                onClick={() => { router.push("/settings"); onClose(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <Settings size={16} />
                <span className="font-medium">Settings</span>
              </button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
