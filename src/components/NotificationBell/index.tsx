"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFarmStore } from "@/stores/farmStore";

const TYPE_ICON: Record<string, string> = {
  weather: "🌧️",
  harvest: "🌾",
  risk: "⚠️",
  task: "📋",
  info: "ℹ️",
};

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const notifications = useFarmStore((s) => s.notifications);
  const markNotificationRead = useFarmStore((s) => s.markNotificationRead);
  const clearNotifications = useFarmStore((s) => s.clearNotifications);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications, none unread"}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative rounded-full bg-white/80 p-2 shadow backdrop-blur-sm"
      >
        <Bell size={18} className="text-gray-700" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              role="menu"
              aria-label="Notifications"
              className="fixed right-4 top-14 z-50 w-72 rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">
                  Notifications
                </h3>
                {notifications.length > 0 && (
                  <button
                    onClick={() => {
                      clearNotifications();
                      setOpen(false);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Link to alerts page */}
              <button
                onClick={() => { setOpen(false); router.push("/alerts"); }}
                className="w-full px-4 py-2 text-xs text-purple-600 font-medium bg-purple-50 hover:bg-purple-100 text-center"
              >
                View Farm Alerts &rarr;
              </button>

              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <button
                      key={n.id}
                      role="menuitem"
                      onClick={() => {
                        markNotificationRead(n.id);
                      }}
                      className={`w-full px-4 py-3 text-left border-b border-gray-50 last:border-0 transition-colors ${
                        n.read ? "bg-white" : "bg-green-50/50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-sm mt-0.5">
                          {TYPE_ICON[n.type] || "📌"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">
                            {n.title}
                          </p>
                          <p className="text-[11px] text-gray-500 line-clamp-2">
                            {n.message}
                          </p>
                        </div>
                        {!n.read && (
                          <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
