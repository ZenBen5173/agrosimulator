"use client";

import { motion } from "framer-motion";
import { Sprout, AlertTriangle, Wheat, CloudRain } from "lucide-react";
import { useFarmStore } from "@/stores/farmStore";

export default function SummaryCards() {
  const plots = useFarmStore((s) => s.plots);
  const weather = useFarmStore((s) => s.weather);

  const totalPlots = plots.length;
  const harvestReady = plots.filter(
    (p) => p.growth_stage === "harvest_ready"
  ).length;
  const alerts = plots.filter(
    (p) => p.warning_level === "orange" || p.warning_level === "red"
  ).length;

  const cards = [
    {
      label: "Plots",
      value: totalPlots,
      icon: Sprout,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Harvest",
      value: harvestReady,
      icon: Wheat,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Alerts",
      value: alerts,
      icon: AlertTriangle,
      color: alerts > 0 ? "text-red-500" : "text-gray-400",
      bg: alerts > 0 ? "bg-red-50" : "bg-gray-50",
    },
    {
      label: "Rain",
      value: weather ? `${weather.rainfall_mm}mm` : "—",
      icon: CloudRain,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar" role="region" aria-label="Farm summary">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className={`flex min-w-[80px] flex-1 flex-col items-center rounded-xl ${card.bg} px-3 py-2.5`}
          >
            <Icon size={18} className={card.color} strokeWidth={2} aria-hidden="true" />
            <span className={`mt-1 text-lg font-bold ${card.color}`}>
              {card.value}
            </span>
            <span className="text-[10px] font-medium text-gray-600">
              {card.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
