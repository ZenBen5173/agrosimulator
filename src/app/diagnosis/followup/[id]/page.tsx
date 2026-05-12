"use client";

/**
 * AgroSim 2.0 — Treatment follow-up screen.
 *
 * The 5-day pg_cron job creates a task linked here. Farmer taps Better /
 * Same / Worse. The API:
 *   - better → closes the diagnosis session, plot warning cleared
 *   - same   → schedules a 3-day recheck
 *   - worse  → escalates to MARDI extension officer with the case package
 */

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ThumbsUp, Minus, ThumbsDown, Loader2 } from "lucide-react";

type Status = "better" | "same" | "worse";

export default function TreatmentFollowupPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(props.params);
  const router = useRouter();

  const [picked, setPicked] = useState<Status | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    closedSession: boolean;
    scheduledRecheckId: string | null;
    escalated: boolean;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!picked) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/diagnosis/v2/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followupId: id,
          status: picked,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      setResult(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <ResultView
        status={picked!}
        result={result}
        onHome={() => router.push("/home")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b bg-white px-4 py-3 flex items-center gap-2">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-semibold">How are the plants?</h1>
          <p className="text-[11px] text-stone-500">
            Five days after treatment — quick honest answer.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <PickButton
            picked={picked === "better"}
            onClick={() => setPicked("better")}
            colour="emerald"
            icon={<ThumbsUp size={20} />}
            label="Better"
          />
          <PickButton
            picked={picked === "same"}
            onClick={() => setPicked("same")}
            colour="amber"
            icon={<Minus size={20} />}
            label="Same"
          />
          <PickButton
            picked={picked === "worse"}
            onClick={() => setPicked("worse")}
            colour="red"
            icon={<ThumbsDown size={20} />}
            label="Worse"
          />
        </div>

        <label className="block text-xs">
          <span className="block text-stone-500 mb-1">
            Notes (optional — what changed?)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            placeholder="e.g. fewer spots but new ones appearing"
          />
        </label>

        {err && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {err}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!picked || submitting}
          className="w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
          {submitting ? "Saving…" : "Submit"}
        </button>
      </main>
    </div>
  );
}

function PickButton({
  picked,
  onClick,
  colour,
  icon,
  label,
}: {
  picked: boolean;
  onClick: () => void;
  colour: "emerald" | "amber" | "red";
  icon: React.ReactNode;
  label: string;
}) {
  const styles = picked
    ? {
        emerald: "bg-emerald-100 border-emerald-500 text-emerald-900",
        amber: "bg-amber-100 border-amber-500 text-amber-900",
        red: "bg-red-100 border-red-500 text-red-900",
      }[colour]
    : "bg-white border-stone-200 text-stone-600";

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border-2 py-4 text-sm font-medium transition ${styles}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ResultView({
  status,
  result,
  onHome,
}: {
  status: Status;
  result: { closedSession: boolean; scheduledRecheckId: string | null; escalated: boolean };
  onHome: () => void;
}) {
  const messages: Record<Status, { title: string; body: string; colour: string }> = {
    better: {
      title: "Great news",
      body:
        "The treatment worked. We've closed the case and cleared the plot's warning. Keep monitoring weekly.",
      colour: "bg-emerald-50 border-emerald-300 text-emerald-900",
    },
    same: {
      title: "We'll recheck in 3 days",
      body:
        "If the symptoms haven't improved, we'll suggest adjusting the treatment or escalating. A reminder is set.",
      colour: "bg-amber-50 border-amber-300 text-amber-900",
    },
    worse: {
      title: "Escalating to a real expert",
      body:
        "We've packaged your photos, history, and the AI's reasoning and flagged the case for a MARDI extension officer to look at.",
      colour: "bg-red-50 border-red-300 text-red-900",
    },
  };

  const msg = messages[status];

  return (
    <div className="min-h-screen bg-stone-50 p-4 space-y-4">
      <section className={`rounded-xl border p-4 space-y-2 ${msg.colour}`}>
        <h2 className="font-semibold">{msg.title}</h2>
        <p className="text-sm">{msg.body}</p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-600 space-y-1">
        <p>
          <strong>Closed session:</strong> {result.closedSession ? "yes" : "no"}
        </p>
        <p>
          <strong>Recheck scheduled:</strong>{" "}
          {result.scheduledRecheckId ? "yes (in 3 days)" : "no"}
        </p>
        <p>
          <strong>Escalated to expert:</strong> {result.escalated ? "yes" : "no"}
        </p>
      </section>

      <button
        onClick={onHome}
        className="w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm text-white"
      >
        Back to today
      </button>
    </div>
  );
}
