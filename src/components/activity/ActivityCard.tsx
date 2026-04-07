"use client";

import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Card from "@/components/ui/Card";
import type { ActivityItem } from "@/types/farm";

interface ActivityCardProps {
  item: ActivityItem;
}

/* ── icon + colour config by event type ── */
const EVENT_CONFIG: Record<
  string,
  { icon: string; bg: string; ring: string }
> = {
  inspection_clean: {
    icon: "\uD83D\uDD0D",
    bg: "bg-green-100",
    ring: "ring-green-200",
  },
  inspection_disease: {
    icon: "\uD83E\uDDA0",
    bg: "bg-red-100",
    ring: "ring-red-200",
  },
  inspection_suspicious: {
    icon: "\uD83D\uDD0D",
    bg: "bg-yellow-100",
    ring: "ring-yellow-200",
  },
  inspection_referred: {
    icon: "\uD83D\uDD0D",
    bg: "bg-orange-100",
    ring: "ring-orange-200",
  },
  treatment_applied: {
    icon: "\uD83D\uDC8A",
    bg: "bg-blue-100",
    ring: "ring-blue-200",
  },
  harvested: {
    icon: "\uD83C\uDF3E",
    bg: "bg-amber-100",
    ring: "ring-amber-200",
  },
  watered: {
    icon: "\uD83D\uDCA7",
    bg: "bg-blue-100",
    ring: "ring-blue-200",
  },
  fertilized: {
    icon: "\uD83C\uDF31",
    bg: "bg-green-100",
    ring: "ring-green-200",
  },
  weather_stress: {
    icon: "\u26C8\uFE0F",
    bg: "bg-orange-100",
    ring: "ring-orange-200",
  },
  financial: {
    icon: "\uD83D\uDCB0",
    bg: "bg-purple-100",
    ring: "ring-purple-200",
  },
  planting: {
    icon: "\uD83C\uDF31",
    bg: "bg-green-100",
    ring: "ring-green-200",
  },
  replanted: {
    icon: "\uD83C\uDF31",
    bg: "bg-green-100",
    ring: "ring-green-200",
  },
};

const DEFAULT_CONFIG = {
  icon: "\uD83D\uDCCB",
  bg: "bg-gray-100",
  ring: "ring-gray-200",
};

export default function ActivityCard({ item }: ActivityCardProps) {
  const config = EVENT_CONFIG[item.event_type] || DEFAULT_CONFIG;

  const relativeTime = formatDistanceToNow(new Date(item.created_at), {
    addSuffix: true,
  });

  return (
    <Card variant="default" className="p-3">
      <div className="flex items-start gap-3">
        {/* left: icon circle */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 ${config.bg} ${config.ring}`}
        >
          <span className="text-lg leading-none">{config.icon}</span>
        </div>

        {/* center: content */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {item.title}
          </p>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
              {item.description}
            </p>
          )}
          <p className="mt-1 text-[11px] text-gray-400">{relativeTime}</p>
        </div>

        {/* right: optional photo thumbnail */}
        {item.photo_url && (
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
            <Image
              src={item.photo_url}
              alt="Activity photo"
              fill
              className="object-cover"
              sizes="48px"
            />
          </div>
        )}
      </div>
    </Card>
  );
}
