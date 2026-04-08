"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useFarmStore } from "@/stores/farmStore";

export default function FarmSwitcher() {
  const { farm, farms, setFarm } = useFarmStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Only render if user has more than one farm
  if (farms.length <= 1) return null;

  const handleSwitch = (farmId: string) => {
    const target = farms.find((f) => f.id === farmId);
    if (target && target.id !== farm?.id) {
      setFarm(target);
      setOpen(false);
      // Reload the page so that all farm-dependent data (plots, weather, tasks, etc.) is re-fetched
      window.location.reload();
    } else {
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Switch farm, currently ${farm?.name || "Unnamed Farm"}`}
        className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-gray-600 shadow backdrop-blur-sm transition-colors hover:bg-white"
      >
        Switch farm
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-white shadow-lg ring-1 ring-black/5 overflow-hidden" role="listbox">
          {farms.map((f) => (
            <button
              key={f.id}
              onClick={() => handleSwitch(f.id)}
              role="option"
              aria-selected={f.id === farm?.id}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 ${
                f.id === farm?.id
                  ? "bg-green-50 font-semibold text-green-700"
                  : "text-gray-700"
              }`}
            >
              <span
                className={`h-2 w-2 flex-shrink-0 rounded-full ${
                  f.id === farm?.id ? "bg-green-500" : "bg-gray-300"
                }`}
              />
              <span className="truncate">{f.name || "Unnamed Farm"}</span>
              <span className="ml-auto flex-shrink-0 text-[10px] text-gray-600">
                {f.area_acres}ac
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
