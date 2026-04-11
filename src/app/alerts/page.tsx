"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  AlertTriangle,
  CloudRain,
  Bug,
  Newspaper,
  X,
  ChevronRight,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";

interface FarmAlert {
  id: string;
  alert_type: string;
  title: string;
  summary: string;
  severity: string;
  affected_crops: string[];
  recommended_action: string | null;
  source_type: string | null;
  read: boolean;
  created_at: string;
}

const SEVERITY_STYLE: Record<string, { bg: string; border: string; icon: string }> = {
  critical: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-500" },
  high: { bg: "bg-orange-50", border: "border-orange-200", icon: "text-orange-500" },
  medium: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-500" },
  low: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-500" },
};

const TYPE_ICON: Record<string, typeof AlertTriangle> = {
  disease_outbreak: Bug,
  weather_warning: CloudRain,
  pest_invasion: Bug,
  market_alert: Newspaper,
  recall: AlertTriangle,
  general: Bell,
};

export default function AlertsPage() {
  const router = useRouter();
  const farmId = useFarmStore((s) => s.farm?.id);
  const [alerts, setAlerts] = useState<FarmAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts?farm_id=${farmId}`);
      if (res.ok) setAlerts(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [farmId]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const dismissAlert = async (alertId: string) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_id: alertId, dismissed: true }),
    });
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const markRead = async (alertId: string) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_id: alertId, read: true }),
    });
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, read: true } : a));
  };

  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title="Farm Alerts"
        breadcrumbs={[{ label: "Today", href: "/home" }, { label: "Alerts" }]}
        action={unread > 0 ? <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600">{unread} new</span> : undefined}
      />

      <div className="px-4 mt-4 space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))
        ) : alerts.length === 0 ? (
          <div className="text-center text-gray-400 mt-12">
            <Bell size={48} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No alerts</p>
            <p className="text-xs mt-1">AI scans for threats every 6 hours</p>
          </div>
        ) : (
          <AnimatePresence>
            {alerts.map((alert) => {
              const style = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.low;
              const Icon = TYPE_ICON[alert.alert_type] || Bell;
              const isExpanded = expandedId === alert.id;

              return (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className={`rounded-xl border-2 overflow-hidden ${style.bg} ${style.border} ${
                    !alert.read ? "ring-2 ring-offset-1 ring-red-300" : ""
                  }`}
                >
                  <button
                    className="w-full p-4 flex items-start gap-3 text-left"
                    onClick={() => {
                      setExpandedId(isExpanded ? null : alert.id);
                      if (!alert.read) markRead(alert.id);
                    }}
                  >
                    <Icon size={20} className={`mt-0.5 ${style.icon}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${style.bg} ${style.icon}`}>
                          {alert.severity}
                        </span>
                        {!alert.read && (
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-800 mt-1">{alert.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(alert.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <ChevronRight size={16} className={`text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="border-t border-gray-200 px-4 pb-4 space-y-3"
                      >
                        <p className="text-sm text-gray-700 mt-3">{alert.summary}</p>

                        {alert.affected_crops && alert.affected_crops.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {alert.affected_crops.map((crop) => (
                              <span key={crop} className="text-xs bg-white px-2 py-0.5 rounded-full border border-gray-200">
                                {crop}
                              </span>
                            ))}
                          </div>
                        )}

                        {alert.recommended_action && (
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <p className="text-xs font-semibold text-gray-600 mb-1">Recommended Action</p>
                            <p className="text-sm text-gray-800">{alert.recommended_action}</p>
                          </div>
                        )}

                        <button
                          onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"
                        >
                          <X size={14} /> Dismiss
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
