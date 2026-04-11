"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ThumbsUp,
  Minus,
  ThumbsDown,
  Clock,
  Stethoscope,
  AlertTriangle,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";
import toast from "react-hot-toast";

interface MonitoringEntry {
  id: string;
  check_date: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface DiagnosisSession {
  id: string;
  plot_id: string;
  diagnosis_name: string | null;
  final_confidence: number | null;
  final_outcome: string;
  treatment_plan: string[] | null;
  follow_up_status: string;
  follow_up_due: string | null;
  created_at: string;
  plots: { label: string; crop_name: string } | null;
  treatment_monitoring: MonitoringEntry[];
}

const STATUS_ICON = {
  better: { icon: ThumbsUp, color: "bg-green-500", label: "Better" },
  same: { icon: Minus, color: "bg-amber-500", label: "Same" },
  worse: { icon: ThumbsDown, color: "bg-red-500", label: "Worse" },
};

export default function DiagnosisPage() {
  const router = useRouter();
  const farmId = useFarmStore((s) => s.farm?.id);
  const [sessions, setSessions] = useState<DiagnosisSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/diagnosis?farm_id=${farmId}`);
      if (res.ok) setSessions(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [farmId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const submitFollowUp = async (sessionId: string, status: "better" | "same" | "worse") => {
    setSubmitting(sessionId);
    try {
      const res = await fetch("/api/diagnosis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, status }),
      });

      if (res.ok) {
        if (status === "better") {
          toast.success("Treatment worked! Case closed.");
        } else if (status === "same") {
          toast("3-day recheck scheduled", { icon: "🔄" });
        } else {
          toast.error("Escalating to expert referral");
        }
        fetchSessions();
      }
    } catch {
      toast.error("Failed to submit");
    } finally {
      setSubmitting(null);
    }
  };

  const dueToday = sessions.filter((s) => {
    if (!s.follow_up_due) return false;
    const today = new Date().toISOString().split("T")[0];
    return s.follow_up_due <= today && s.follow_up_status === "pending";
  });

  const upcoming = sessions.filter((s) => {
    if (!s.follow_up_due) return false;
    const today = new Date().toISOString().split("T")[0];
    return s.follow_up_due > today;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title="Treatment Monitoring"
        breadcrumbs={[{ label: "Today", href: "/home" }, { label: "Treatments" }]}
        action={dueToday.length > 0 ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-600">{dueToday.length} due</span> : undefined}
      />

      <div className="px-4 mt-4 space-y-4">
        {loading ? (
          [1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))
        ) : sessions.length === 0 ? (
          <div className="text-center text-gray-400 mt-12">
            <Stethoscope size={48} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No active treatments</p>
            <p className="text-xs mt-1">After a diagnosis, follow-ups appear here</p>
          </div>
        ) : (
          <>
            {/* Due today section */}
            {dueToday.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-red-600 flex items-center gap-1">
                  <AlertTriangle size={14} /> Follow-up Due Today
                </h2>
                {dueToday.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isDue
                    submitting={submitting}
                    onSubmit={submitFollowUp}
                  />
                ))}
              </>
            )}

            {/* Upcoming section */}
            {upcoming.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-1">
                  <Clock size={14} /> Upcoming Follow-ups
                </h2>
                {upcoming.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isDue={false}
                    submitting={submitting}
                    onSubmit={submitFollowUp}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  isDue,
  submitting,
  onSubmit,
}: {
  session: DiagnosisSession;
  isDue: boolean;
  submitting: string | null;
  onSubmit: (id: string, s: "better" | "same" | "worse") => void;
}) {
  const [expanded, setExpanded] = useState(isDue);

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden ${isDue ? "ring-2 ring-amber-300" : ""}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full p-4 text-left">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
            <span className="text-sm font-bold text-teal-700">
              {session.plots?.label || "?"}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">
              {session.diagnosis_name || "Treatment in progress"}
            </p>
            <p className="text-xs text-gray-500">
              {session.plots?.crop_name} &middot;{" "}
              {session.follow_up_due
                ? `Follow-up: ${new Date(session.follow_up_due).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}`
                : "Monitoring"}
            </p>
          </div>
          {session.final_confidence && (
            <span className="text-xs font-medium text-gray-400">
              {Math.round(session.final_confidence * 100)}%
            </span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="border-t border-gray-100 px-4 pb-4"
          >
            {/* Treatment plan */}
            {session.treatment_plan && session.treatment_plan.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-gray-600">Treatment Plan</p>
                {session.treatment_plan.map((step, i) => (
                  <p key={i} className="text-xs text-gray-500 pl-3">
                    {i + 1}. {step}
                  </p>
                ))}
              </div>
            )}

            {/* Past monitoring entries */}
            {session.treatment_monitoring.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-gray-600">History</p>
                {session.treatment_monitoring.map((m) => {
                  const s = STATUS_ICON[m.status as keyof typeof STATUS_ICON];
                  return (
                    <div key={m.id} className="flex items-center gap-2 text-xs text-gray-500">
                      <span className={`w-5 h-5 rounded-full ${s?.color || "bg-gray-300"} flex items-center justify-center`}>
                        {s && <s.icon size={10} className="text-white" />}
                      </span>
                      <span>{s?.label} — {new Date(m.check_date).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Follow-up buttons */}
            {isDue && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-700 mb-2">
                  Did the treatment work?
                </p>
                <div className="flex gap-2">
                  {(["better", "same", "worse"] as const).map((status) => {
                    const s = STATUS_ICON[status];
                    const Icon = s.icon;
                    return (
                      <button
                        key={status}
                        disabled={submitting === session.id}
                        onClick={() => onSubmit(session.id, status)}
                        className={`flex-1 ${s.color} text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50`}
                      >
                        <Icon size={16} />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
