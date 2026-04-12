"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ChevronRight } from "lucide-react";

interface TourStep {
  target: string; // data-tour attribute value
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "ai-summary",
    title: "AI Daily Briefing",
    description:
      "Every morning, AI analyzes your farm data, weather, and crop schedules to generate a personalized briefing.",
  },
  {
    target: "quick-links",
    title: "Quick Access",
    description:
      "Jump to any feature — scan documents, check market prices, manage inventory, view weather forecasts.",
  },
  {
    target: "weather",
    title: "Hourly Weather",
    description:
      "Real-time weather with hourly temperature curve. AI uses this to adjust your tasks and spray schedules.",
  },
  {
    target: "resources",
    title: "Resource Planning",
    description:
      "Exact quantities of fertilizer, pesticide, and water needed today — calculated from MARDI crop profiles.",
  },
  {
    target: "tasks",
    title: "Smart Task List",
    description:
      "AI-generated tasks based on crop growth stage, weather conditions, and your farm schedule.",
  },
  {
    target: "nav-chat",
    title: "AI Chat Assistant",
    description:
      "Ask the AI to reorder supplies, create tasks, or answer farming questions. It writes to the database, not just chat.",
    position: "top",
  },
  {
    target: "nav-fab",
    title: "Quick Actions",
    description:
      "Scan a receipt or bill with your camera. AI reads it and auto-creates business documents.",
    position: "top",
  },
  {
    target: "nav-accounts",
    title: "Full Business Suite",
    description:
      "Sales orders, purchase orders, invoices, inventory, equipment depreciation — like AutoCount, but AI-powered.",
    position: "top",
  },
];

interface CoachMarksProps {
  onComplete: () => void;
}

export default function CoachMarks({ onComplete }: CoachMarksProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  const measureTarget = useCallback(() => {
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect(r);
      // Scroll into view if needed
      if (r.top < 0 || r.bottom > window.innerHeight - 80) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          setRect(el.getBoundingClientRect());
        }, 350);
      }
    } else {
      // Target not found — auto-skip to next step
      setRect(null);
      if (!isLast) {
        setTimeout(() => setStep((s) => s + 1), 100);
      } else {
        onComplete();
      }
    }
  }, [current.target, isLast, onComplete]);

  useEffect(() => {
    // Small delay to let page render
    const timer = setTimeout(() => {
      measureTarget();
      setVisible(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [step, measureTarget]);

  // Re-measure on scroll/resize
  useEffect(() => {
    const handler = () => measureTarget();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [measureTarget]);

  const next = () => {
    if (isLast) {
      onComplete();
    } else {
      setVisible(false);
      setTimeout(() => setStep((s) => s + 1), 150);
    }
  };

  const skip = () => onComplete();

  if (!visible || !rect) return null;

  // Calculate tooltip position
  const pad = 12;
  const pos = current.position || (rect.top > window.innerHeight / 2 ? "top" : "bottom");

  let tooltipStyle: React.CSSProperties = {};
  if (pos === "top") {
    tooltipStyle = {
      bottom: window.innerHeight - rect.top + pad,
      left: Math.max(16, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 296)),
    };
  } else {
    tooltipStyle = {
      top: rect.bottom + pad,
      left: Math.max(16, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 296)),
    };
  }

  return (
    <div className="fixed inset-0 z-[100]" onClick={skip}>
      {/* Backdrop with spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={rect.left - 6}
              y={rect.top - 4}
              width={rect.width + 12}
              height={rect.height + 8}
              rx="10"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: "auto" }}
        />
      </svg>

      {/* Spotlight border ring */}
      <div
        className="absolute rounded-[10px] ring-2 ring-green-400 ring-offset-2"
        style={{
          left: rect.left - 6,
          top: rect.top - 4,
          width: rect.width + 12,
          height: rect.height + 8,
          pointerEvents: "none",
        }}
      />

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          ref={tooltipRef}
          initial={{ opacity: 0, y: pos === "top" ? 10 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: pos === "top" ? 10 : -10 }}
          transition={{ duration: 0.2 }}
          className="absolute w-[280px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
          style={tooltipStyle}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Step counter + skip */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold text-green-600 uppercase tracking-wider">
              {step + 1} / {TOUR_STEPS.length}
            </span>
            <button
              onClick={skip}
              className="text-[10px] text-gray-400 hover:text-gray-600 font-medium flex items-center gap-0.5"
            >
              Skip tour <X size={10} />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 pb-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {current.title}
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              {current.description}
            </p>
          </div>

          {/* Action */}
          <div className="px-4 pb-3">
            <button
              onClick={next}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 py-2.5 text-xs font-semibold text-white hover:bg-gray-800 transition-colors"
            >
              {isLast ? (
                <>Get Started <ArrowRight size={13} /></>
              ) : (
                <>Next <ChevronRight size={13} /></>
              )}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
