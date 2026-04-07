"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  differenceInDays,
  addDays,
  format,
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  eachWeekOfInterval,
} from "date-fns";
import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import PlotBottomSheet from "@/components/PlotBottomSheet";
import type { PlotData } from "@/types/farm";

/* ── colour by growth stage ── */
const STAGE_COLORS: Record<string, string> = {
  seedling: "#84cc16",
  growing: "#22c55e",
  mature: "#10b981",
  harvest_ready: "#f59e0b",
  harvested: "#9ca3af",
};

const STAGE_LABELS: Record<string, string> = {
  seedling: "Seedling",
  growing: "Growing",
  mature: "Mature",
  harvest_ready: "Harvest Ready",
  harvested: "Harvested",
};

/* ── helpers ── */
const DAY_PX = 6; // pixels per day in the timeline
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 48;
const PADDING_DAYS = 14;

export default function CalendarPage() {
  const { farm, plots, setFarm, setPlots, selectedPlot, setSelectedPlot } =
    useFarmStore();
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  /* ── fetch from Supabase if store is empty ── */
  useEffect(() => {
    async function load() {
      if (farm && plots.length > 0) {
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch farm
      if (!farm) {
        const { data: farmRow } = await supabase
          .from("farms")
          .select(
            "id, name, area_acres, grid_size, soil_type, water_source, polygon_geojson, bounding_box"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (farmRow) setFarm(farmRow);
      }

      // Fetch plots
      const farmId = farm?.id;
      if (farmId || plots.length === 0) {
        const resolvedFarmId =
          farmId ??
          (
            await supabase
              .from("farms")
              .select("id")
              .eq("user_id", user.id)
              .limit(1)
              .single()
          ).data?.id;
        if (resolvedFarmId) {
          const { data: plotRows } = await supabase
            .from("plots")
            .select(
              "id, label, crop_name, growth_stage, warning_level, colour_hex, planted_date, expected_harvest, photo_url"
            )
            .eq("farm_id", resolvedFarmId)
            .eq("is_active", true)
            .order("label");
          if (plotRows) setPlots(plotRows as PlotData[]);
        }
      }

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── compute timeline bounds ── */
  const { timelineStart, timelineEnd, totalDays, months, weeks } =
    useMemo(() => {
      const activePlots = plots.filter(
        (p) => p.planted_date && p.expected_harvest
      );
      if (activePlots.length === 0) {
        const now = new Date();
        const s = addDays(now, -PADDING_DAYS);
        const e = addDays(now, PADDING_DAYS);
        return {
          timelineStart: s,
          timelineEnd: e,
          totalDays: differenceInDays(e, s),
          months: eachMonthOfInterval({ start: s, end: e }),
          weeks: eachWeekOfInterval({ start: s, end: e }),
        };
      }

      const dates = activePlots.flatMap((p) => [
        new Date(p.planted_date!),
        new Date(p.expected_harvest!),
      ]);
      const earliest = new Date(
        Math.min(...dates.map((d) => d.getTime()))
      );
      const latest = new Date(
        Math.max(...dates.map((d) => d.getTime()))
      );

      const s = addDays(earliest, -PADDING_DAYS);
      const e = addDays(latest, PADDING_DAYS);
      return {
        timelineStart: s,
        timelineEnd: e,
        totalDays: differenceInDays(e, s),
        months: eachMonthOfInterval({ start: s, end: e }),
        weeks: eachWeekOfInterval({ start: s, end: e }),
      };
    }, [plots]);

  /* ── scroll to today on mount ── */
  useEffect(() => {
    if (!loading && scrollRef.current) {
      const todayOffset = differenceInDays(new Date(), timelineStart) * DAY_PX;
      scrollRef.current.scrollLeft = Math.max(0, todayOffset - 120);
    }
  }, [loading, timelineStart]);

  const scrollToToday = () => {
    if (!scrollRef.current) return;
    const todayOffset = differenceInDays(new Date(), timelineStart) * DAY_PX;
    scrollRef.current.scrollTo({
      left: Math.max(0, todayOffset - 120),
      behavior: "smooth",
    });
  };

  const timelineWidth = totalDays * DAY_PX;
  const todayOffset = differenceInDays(new Date(), timelineStart) * DAY_PX;

  /* ── loading state ── */
  if (loading) {
    return (
      <div className="flex h-screen flex-col bg-gray-50">
        <div className="flex h-14 items-center justify-between border-b border-gray-100 bg-white px-4">
          <h1 className="text-lg font-bold text-gray-900">Crop Calendar</h1>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
        </div>
      </div>
    );
  }

  /* ── empty state ── */
  const activePlots = plots.filter(
    (p) => p.planted_date && p.expected_harvest
  );

  if (activePlots.length === 0) {
    return (
      <div className="flex h-screen flex-col bg-gray-50">
        <div className="flex h-14 items-center justify-between border-b border-gray-100 bg-white px-4">
          <h1 className="text-lg font-bold text-gray-900">Crop Calendar</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <CalendarDays size={48} className="text-gray-300" />
          <p className="text-lg font-semibold text-gray-500">
            No crops planted yet
          </p>
          <p className="text-sm text-gray-400">
            Plant crops on your plots to see the growing timeline here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* ── header ── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4">
        <h1 className="text-lg font-bold text-gray-900">Crop Calendar</h1>
        <button
          onClick={scrollToToday}
          className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100"
        >
          Today
        </button>
      </div>

      {/* ── legend ── */}
      <div className="flex shrink-0 gap-3 overflow-x-auto border-b border-gray-100 bg-white px-4 py-2">
        {Object.entries(STAGE_LABELS).map(([stage, label]) => (
          <div key={stage} className="flex shrink-0 items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: STAGE_COLORS[stage] }}
            />
            <span className="text-[11px] text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* ── gantt area ── */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* plot labels (fixed left column) */}
        <div
          className="shrink-0 overflow-hidden border-r border-gray-200 bg-white"
          style={{ width: 100 }}
        >
          {/* spacer for header row */}
          <div
            className="border-b border-gray-200 bg-gray-50"
            style={{ height: HEADER_HEIGHT }}
          />
          {activePlots.map((plot) => (
            <div
              key={plot.id}
              className="flex items-center border-b border-gray-50 px-3"
              style={{ height: ROW_HEIGHT }}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-800">
                  {plot.label}
                </p>
                <p className="truncate text-[10px] text-gray-400">
                  {plot.crop_name}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* scrollable timeline */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto">
          <div
            className="relative"
            style={{
              width: timelineWidth,
              height: HEADER_HEIGHT + activePlots.length * ROW_HEIGHT,
            }}
          >
            {/* ── month labels ── */}
            <div
              className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50"
              style={{ height: HEADER_HEIGHT, width: timelineWidth }}
            >
              {months.map((month) => {
                const monthStart = startOfMonth(month);
                const monthEnd = endOfMonth(month);
                const offsetLeft =
                  Math.max(0, differenceInDays(monthStart, timelineStart)) *
                  DAY_PX;
                const width =
                  (differenceInDays(monthEnd, monthStart) + 1) * DAY_PX;
                return (
                  <div
                    key={month.toISOString()}
                    className="absolute top-0 flex h-full items-center border-l border-gray-200 px-2"
                    style={{ left: offsetLeft, width }}
                  >
                    <span className="text-[11px] font-semibold text-gray-500">
                      {format(month, "MMM yyyy")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ── week grid lines ── */}
            {weeks.map((week) => {
              const offset = differenceInDays(week, timelineStart) * DAY_PX;
              if (offset < 0 || offset > timelineWidth) return null;
              return (
                <div
                  key={week.toISOString()}
                  className="absolute top-0 bottom-0 border-l border-gray-100"
                  style={{ left: offset }}
                />
              );
            })}

            {/* ── today line ── */}
            {todayOffset >= 0 && todayOffset <= timelineWidth && (
              <div
                ref={todayRef}
                className="absolute top-0 bottom-0 z-20 w-px"
                style={{
                  left: todayOffset,
                  borderLeft: "2px dashed #ef4444",
                }}
              />
            )}

            {/* ── plot bars ── */}
            {activePlots.map((plot, i) => {
              const plantedDate = new Date(plot.planted_date!);
              const harvestDate = new Date(plot.expected_harvest!);
              const barLeft =
                differenceInDays(plantedDate, timelineStart) * DAY_PX;
              const barWidth =
                differenceInDays(harvestDate, plantedDate) * DAY_PX;
              const top = HEADER_HEIGHT + i * ROW_HEIGHT + 10;
              const barColor =
                STAGE_COLORS[plot.growth_stage] || "#9ca3af";

              return (
                <motion.div
                  key={plot.id}
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{
                    duration: 0.4,
                    delay: i * 0.06,
                    ease: "easeOut",
                  }}
                  style={{
                    position: "absolute",
                    left: barLeft,
                    top,
                    width: Math.max(barWidth, 8),
                    height: ROW_HEIGHT - 20,
                    backgroundColor: barColor,
                    transformOrigin: "left center",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                  className="flex items-center px-2 shadow-sm hover:brightness-110 active:brightness-95"
                  onClick={() => setSelectedPlot(plot)}
                >
                  <span
                    className="truncate text-[10px] font-semibold text-white drop-shadow-sm"
                    style={{ maxWidth: Math.max(barWidth - 16, 0) }}
                  >
                    {barWidth > 50
                      ? `${plot.label} - ${plot.crop_name}`
                      : plot.label}
                  </span>
                </motion.div>
              );
            })}

            {/* ── row dividers ── */}
            {activePlots.map((_, i) => (
              <div
                key={`row-${i}`}
                className="absolute left-0 right-0 border-b border-gray-50"
                style={{ top: HEADER_HEIGHT + (i + 1) * ROW_HEIGHT }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── plot bottom sheet ── */}
      <PlotBottomSheet
        plot={selectedPlot}
        onClose={() => setSelectedPlot(null)}
      />
    </div>
  );
}
