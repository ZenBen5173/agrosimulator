"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import ActivityCard from "@/components/activity/ActivityCard";
import { SkeletonLine } from "@/components/ui/Skeleton";
import type { ActivityItem } from "@/types/farm";

/* ── filter tabs ── */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "inspection", label: "Inspections" },
  { key: "planting", label: "Planting" },
  { key: "harvest", label: "Harvest" },
  { key: "weather", label: "Weather" },
  { key: "financial", label: "Financial" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const PAGE_LIMIT = 20;

export default function ActivityPage() {
  const { farm, setFarm } = useFarmStore();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  /* ── resolve farm id ── */
  useEffect(() => {
    async function resolveFarm() {
      if (farm) return;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
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
    resolveFarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── fetch activity ── */
  const fetchActivity = useCallback(
    async (pageNum: number, filter: FilterKey, append = false) => {
      if (!farm?.id) return;
      if (!append) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({
          farm_id: farm.id,
          page: String(pageNum),
          limit: String(PAGE_LIMIT),
          filter,
        });
        const res = await fetch(`/api/activity?${params}`);
        if (!res.ok) throw new Error("Failed to fetch activity");
        const data = await res.json();

        if (append) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setHasMore(data.hasMore);
      } catch (err) {
        console.error("Activity fetch error:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [farm?.id]
  );

  /* ── re-fetch on filter or farm change ── */
  useEffect(() => {
    if (farm?.id) {
      setPage(1);
      fetchActivity(1, activeFilter);
    }
  }, [farm?.id, activeFilter, fetchActivity]);

  /* ── load more ── */
  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchActivity(nextPage, activeFilter, true);
  };

  /* ── filter change ── */
  const handleFilterChange = (filter: FilterKey) => {
    setActiveFilter(filter);
    setPage(1);
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* ── header ── */}
      <div className="flex h-14 shrink-0 items-center border-b border-gray-100 bg-white px-4">
        <h1 className="text-lg font-bold text-gray-900">Activity</h1>
      </div>

      {/* ── filter tabs ── */}
      <div className="shrink-0 border-b border-gray-100 bg-white">
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 scrollbar-hide">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => handleFilterChange(f.key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeFilter === f.key
                  ? "bg-green-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── content ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {/* loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3"
              >
                <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <SkeletonLine className="h-3.5 w-2/3" />
                  <SkeletonLine className="h-3 w-full" />
                  <SkeletonLine className="h-2.5 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* empty state */}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 pt-20 text-center">
            <Activity size={48} className="text-gray-300" />
            <p className="text-lg font-semibold text-gray-500">
              No activity yet
            </p>
            <p className="text-sm text-gray-400">
              Activities from inspections, planting, and other events will appear
              here.
            </p>
          </div>
        )}

        {/* activity list */}
        {!loading && items.length > 0 && (
          <div className="space-y-3">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: Math.min(i * 0.04, 0.4),
                  ease: "easeOut",
                }}
              >
                <ActivityCard item={item} />
              </motion.div>
            ))}

            {/* load more */}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white py-3 text-center text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                    Loading...
                  </span>
                ) : (
                  "Load more"
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
