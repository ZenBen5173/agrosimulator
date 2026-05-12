"use client";

/**
 * AgroSim 2.0 — Doctor-style diagnosis UI.
 *
 * Self-contained multi-step page. Calls /api/diagnosis/v2 with the current
 * session and the requested step; renders the differential ladder, history
 * questions, physical confirmation test prompt, and final diagnosis.
 *
 * No Supabase persistence yet — session lives in component state. Persistence
 * gets wired in once we settle the 2.0 schema.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Camera, ImagePlus, Stethoscope, X } from "lucide-react";
import type {
  CropName,
  DiagnosisResult,
  DiagnosisSession,
  DifferentialCandidate,
  HistoryQuestion,
  PhysicalTestPrompt,
  SpreadPattern,
} from "@/lib/diagnosis/types";

type Stage =
  | "crop"
  | "pattern"
  | "photo"
  | "history"
  | "test"
  | "result";

/**
 * Which API step is currently in flight. Drives the progress loader so it
 * shows realistic step-by-step labels and an honest expected duration —
 * "photo" is the slow one (Gemini Vision call, typically 8-15s); the rest
 * are deterministic and return in under a second.
 */
type LoadingStep =
  | "start"
  | "pattern"
  | "photo"
  | "history"
  | "test"
  | "finalise";

const PATTERN_OPTIONS: {
  value: SpreadPattern;
  label: string;
  emoji: string;
  hint: string;
}[] = [
  { value: "one_plant", label: "Just one plant", emoji: "🟢", hint: "isolated case" },
  { value: "few_plants", label: "A few plants in a row", emoji: "🟡", hint: "spreading" },
  { value: "whole_plot", label: "The whole plot", emoji: "🔴", hint: "uniform" },
  { value: "multiple_crops", label: "Different crops too", emoji: "🟣", hint: "likely abiotic" },
];

export default function DoctorDiagnosisPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("crop");
  const [session, setSession] = useState<DiagnosisSession | null>(null);
  const [crop, setCrop] = useState<CropName>("chilli");
  const [observations, setObservations] = useState<string[]>([]);
  const [pendingHistoryQuestion, setPendingHistoryQuestion] =
    useState<HistoryQuestion | null>(null);
  const [physicalTest, setPhysicalTest] = useState<PhysicalTestPrompt | null>(
    null
  );
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callApi(payload: Record<string, unknown>) {
    const step = (payload.step as LoadingStep) ?? "start";
    setLoading(true);
    setLoadingStep(step);
    setError(null);
    try {
      const res = await fetch("/api/diagnosis/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
      setLoadingStep(null);
    }
  }

  async function startSession() {
    const data = await callApi({ step: "start", crop });
    setSession(data.session);
    setStage("pattern");
  }

  async function pickPattern(pattern: SpreadPattern) {
    if (!session) return;
    const data = await callApi({ step: "pattern", session, pattern });
    setSession(data.session);
    setStage("photo");
  }

  async function uploadPhoto(file: File) {
    if (!session) return;
    const base64 = await fileToBase64(file);
    const data = await callApi({
      step: "photo",
      session,
      photoBase64: base64,
      photoMimeType: file.type,
    });
    setSession(data.session);
    setObservations(data.observations || []);
    if (data.nextHistoryQuestions && data.nextHistoryQuestions.length > 0) {
      setPendingHistoryQuestion(data.nextHistoryQuestions[0]);
      setStage("history");
    } else {
      // Skip to physical test
      const test = await getPhysicalTest(data.session);
      if (test) {
        setPhysicalTest(test);
        setStage("test");
      } else {
        await finalise(data.session);
      }
    }
  }

  async function answerHistory(answer: string) {
    if (!session || !pendingHistoryQuestion) return;
    const data = await callApi({
      step: "history",
      session,
      questionId: pendingHistoryQuestion.id,
      question: pendingHistoryQuestion.text,
      answer,
    });
    setSession(data.session);
    if (data.nextHistoryQuestions && data.nextHistoryQuestions.length > 0) {
      setPendingHistoryQuestion(data.nextHistoryQuestions[0]);
    } else if (data.physicalTest) {
      setPhysicalTest(data.physicalTest);
      setStage("test");
    } else {
      await finalise(data.session);
    }
  }

  async function answerTest(value: string) {
    if (!session) return;
    const data = await callApi({ step: "test", session, testResult: value });
    setSession(data.session);
    setResult(data.result);
    setStage("result");
  }

  async function getPhysicalTest(s: DiagnosisSession) {
    // Side-channel: ask server for next physical test by re-running history
    // step with no new question — simplest is to call finalise check.
    // For now: just return the physical test from session if present.
    void s;
    return null;
  }

  async function finalise(s: DiagnosisSession) {
    const data = await callApi({ step: "finalise", session: s });
    setResult(data.result);
    setStage("result");
  }

  function reset() {
    setStage("crop");
    setSession(null);
    setObservations([]);
    setPendingHistoryQuestion(null);
    setPhysicalTest(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <DoctorAvatar />
          <div>
            <h1 className="text-lg font-semibold text-stone-900">
              Plant doctor
            </h1>
            <p className="text-[11px] leading-none text-stone-500">
              Rules out alternatives, asks for one confirmation test, admits
              when it doesn&apos;t know.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading && loadingStep && <ProgressLoader step={loadingStep} />}

        {stage === "crop" && (
          <CropPicker crop={crop} onChange={setCrop} onContinue={startSession} />
        )}

        {stage === "pattern" && (
          <PatternStep
            options={PATTERN_OPTIONS}
            onPick={pickPattern}
            disabled={loading}
          />
        )}

        {/*
          The differential is only meaningful AFTER the photo has been analysed.
          Before the photo step, every candidate carries a uniform 5% prior —
          showing that to the farmer makes the doctor look like it's already
          guessing when it hasn't even seen the plant. So we gate the ladder on
          stages that come AFTER analysePhoto has run.
        */}
        {session &&
          (stage === "history" || stage === "test" || stage === "result") && (
            <DifferentialLadder candidates={session.candidates} />
          )}

        {stage === "photo" && <PhotoStep onUpload={uploadPhoto} disabled={loading} />}

        {stage === "history" && pendingHistoryQuestion && (
          <HistoryStep
            question={pendingHistoryQuestion}
            onAnswer={answerHistory}
            disabled={loading}
            observations={observations}
          />
        )}

        {stage === "test" && physicalTest && (
          <PhysicalTestStep
            test={physicalTest}
            onAnswer={answerTest}
            disabled={loading}
          />
        )}

        {stage === "result" && result && (
          <ResultStep result={result} onReset={reset} />
        )}
      </main>
    </div>
  );
}

// ─── Doctor avatar (with graceful fallback) ─────────────────────

/**
 * Shows the pixel-art doctor at /plant-doctor.png. If the file isn't there
 * yet (or fails to load), falls back to a clean stethoscope tile so the
 * page never shows a broken-image icon.
 */
function DoctorAvatar() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-emerald-50">
      {failed ? (
        <div className="flex h-full w-full items-center justify-center">
          <Stethoscope size={20} className="text-emerald-700" />
        </div>
      ) : (
        <Image
          src="/plant-doctor.png"
          alt="Plant doctor"
          fill
          sizes="40px"
          style={{ imageRendering: "pixelated", objectFit: "contain" }}
          onError={() => setFailed(true)}
          unoptimized
        />
      )}
    </div>
  );
}

// ─── Stage components ──────────────────────────────────────────

function CropPicker({
  crop,
  onChange,
  onContinue,
}: {
  crop: CropName;
  onChange: (c: CropName) => void;
  onContinue: () => void;
}) {
  const supportedCrops: { value: CropName; label: string }[] = [
    { value: "chilli", label: "Chilli (cili)" },
    { value: "paddy", label: "Paddy (padi)" },
  ];
  return (
    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="font-medium">What crop are we looking at?</h2>
      <div className="flex flex-col gap-2">
        {supportedCrops.map((c) => (
          <label key={c.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="crop"
              value={c.value}
              checked={crop === c.value}
              onChange={() => onChange(c.value)}
            />
            {c.label}
          </label>
        ))}
      </div>
      <button
        onClick={onContinue}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-white"
      >
        Start inspection
      </button>
    </section>
  );
}

function PatternStep({
  options,
  onPick,
  disabled,
}: {
  options: typeof PATTERN_OPTIONS;
  onPick: (p: SpreadPattern) => void;
  disabled: boolean;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="font-medium">Before any photo — where is the problem?</h2>
      <p className="text-xs text-stone-500">
        This single question splits real disease from drainage / herbicide /
        water damage in one tap. Most other apps skip it.
      </p>
      <div className="grid gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            disabled={disabled}
            onClick={() => onPick(opt.value)}
            className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-3 text-left hover:border-emerald-400 disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              <span className="text-xl">{opt.emoji}</span>
              <span>{opt.label}</span>
            </span>
            <span className="text-xs text-stone-400">{opt.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function DifferentialLadder({
  candidates,
}: {
  candidates: DifferentialCandidate[];
}) {
  const inPlay = candidates.filter((c) => !c.ruledOut);
  const ruledOut = candidates.filter((c) => c.ruledOut);

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="font-medium">Differential</h2>
      {inPlay.length > 0 && (
        <ul className="space-y-1 text-sm">
          {inPlay.map((c) => (
            <li
              key={c.diseaseId}
              className="flex items-center justify-between rounded bg-emerald-50 px-2 py-1"
            >
              <span>{c.name}</span>
              <span className="font-mono text-xs">
                {Math.round(c.probability * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
      {ruledOut.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-500">
            {ruledOut.length} ruled out
          </summary>
          <ul className="mt-2 space-y-2">
            {ruledOut.map((c) => (
              <li
                key={c.diseaseId}
                className="rounded border border-stone-200 px-2 py-1 text-stone-500"
              >
                <div className="line-through">{c.name}</div>
                {c.ruleOutReason && (
                  <div className="mt-1 text-xs italic">{c.ruleOutReason}</div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PhotoStep({
  onUpload,
  disabled,
}: {
  onUpload: (file: File) => void;
  disabled: boolean;
}) {
  // Local state so we can show a thumbnail + name BEFORE submitting to the
  // model. Two hidden inputs (camera vs gallery) so the visible UI is just
  // styled buttons — the native file picker chrome never shows.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  function acceptFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPendingFile(file);
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function submit() {
    if (pendingFile) onUpload(pendingFile);
  }

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="font-medium">Take a photo of the problem</h2>
      <p className="text-xs text-stone-500">
        Frame the affected leaf or fruit. Try to fit a healthy leaf in the same
        shot for comparison.
      </p>

      {/* Hidden native inputs — triggered by the styled buttons below */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />

      {previewUrl ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Photo preview"
              className="block max-h-72 w-full object-contain"
            />
            <button
              type="button"
              onClick={clearFile}
              disabled={disabled}
              aria-label="Remove photo"
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white hover:bg-black/70 disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={disabled}
              className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:border-emerald-400 disabled:opacity-50"
            >
              Choose another
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={disabled}
              className="flex-[2] rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {disabled ? "Analysing…" : "Analyse this photo"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? "border-emerald-500 bg-emerald-50"
                : "border-stone-300 bg-stone-50"
            }`}
          >
            <ImagePlus size={28} className="text-stone-400" />
            <div className="text-sm text-stone-600">
              Drag a photo here, or pick one below
            </div>
            <div className="text-[11px] text-stone-400">
              JPG / PNG / HEIC, up to ~10 MB
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled}
              className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Camera size={16} />
              Use camera
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={disabled}
              className="flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-3 text-sm text-stone-700 hover:border-emerald-400 disabled:opacity-50"
            >
              <ImagePlus size={16} />
              From gallery
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function HistoryStep({
  question,
  onAnswer,
  disabled,
  observations,
}: {
  question: HistoryQuestion;
  onAnswer: (value: string) => void;
  disabled: boolean;
  observations: string[];
}) {
  return (
    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      {observations.length > 0 && (
        <div className="rounded bg-stone-50 p-2 text-xs text-stone-600">
          <span className="font-medium">What I see in the photo:</span>
          <ul className="mt-1 list-inside list-disc">
            {observations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      <h2 className="font-medium">{question.text}</h2>
      <div className="grid gap-2">
        {question.options.map((opt) => (
          <button
            key={opt.value}
            disabled={disabled}
            onClick={() => onAnswer(opt.value)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-left hover:border-emerald-400 disabled:opacity-50"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function PhysicalTestStep({
  test,
  onAnswer,
  disabled,
}: {
  test: PhysicalTestPrompt;
  onAnswer: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h2 className="font-medium">Physical confirmation test</h2>
      <p className="text-sm">{test.instruction}</p>
      <div className="grid gap-2">
        {test.options.map((opt) => (
          <button
            key={opt.value}
            disabled={disabled}
            onClick={() => onAnswer(opt.value)}
            className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-3 text-left hover:border-emerald-500 disabled:opacity-50"
          >
            {opt.emoji && <span className="text-xl">{opt.emoji}</span>}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ResultStep({
  result,
  onReset,
}: {
  result: DiagnosisResult;
  onReset: () => void;
}) {
  const outcomeColour =
    result.outcome === "confirmed"
      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
      : result.outcome === "uncertain"
      ? "bg-amber-50 border-amber-300 text-amber-900"
      : "bg-stone-50 border-stone-300 text-stone-700";

  return (
    <section className="space-y-4">
      <div className={`space-y-2 rounded-xl border p-4 ${outcomeColour}`}>
        <div className="text-xs uppercase tracking-wide">{result.outcome}</div>
        <h2 className="text-xl font-semibold">
          {result.diagnosis?.name ?? "I'm not sure enough to name a diagnosis"}
        </h2>
        <div className="text-sm">
          Confidence: {Math.round(result.confidence * 100)}%
        </div>
        {result.diagnosis?.scientificName && (
          <div className="text-xs italic">{result.diagnosis.scientificName}</div>
        )}
      </div>

      {result.reasoning.whatRuledOut.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="font-medium">What I ruled out</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {result.reasoning.whatRuledOut.map((item, i) => (
              <li key={i}>
                <div className="font-medium line-through text-stone-500">
                  {item.name}
                </div>
                <div className="text-xs text-stone-600">{item.because}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.reasoning.whatStillUncertain.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-medium">What I&apos;m NOT sure about</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {result.reasoning.whatStillUncertain.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {result.prescription && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="font-medium">Treatment</h3>
          <div className="mt-2 space-y-3 text-sm">
            <div>
              <div className="font-medium">Stop it now</div>
              {result.prescription.controlNow.chemical ? (
                <div className="mt-1 rounded bg-stone-50 p-2 text-xs">
                  <div>
                    <span className="font-medium">
                      {result.prescription.controlNow.chemical.name}
                    </span>
                    {result.prescription.controlNow.chemical.brand && (
                      <span className="text-stone-500">
                        {" "}
                        ({result.prescription.controlNow.chemical.brand})
                      </span>
                    )}
                  </div>
                  <div>Dose: {result.prescription.controlNow.chemical.dose}</div>
                  <div>
                    Frequency: {result.prescription.controlNow.chemical.frequency}
                  </div>
                  {result.prescription.controlNow.chemical.estCostRm && (
                    <div className="text-emerald-700">
                      ≈ RM {result.prescription.controlNow.chemical.estCostRm}{" "}
                      (generic)
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs italic text-stone-500">
                  No chemical control — see cultural steps below
                </div>
              )}
              <ul className="mt-2 list-inside list-disc text-xs">
                {result.prescription.controlNow.cultural.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium">Stop it coming back</div>
              <ul className="mt-1 list-inside list-disc text-xs">
                {result.prescription.preventRecurrence.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {result.escalation?.suggested && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-medium">Want a human expert to look?</h3>
          <p className="mt-1 text-xs text-blue-900">{result.escalation.reason}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {result.escalation.options.includes("doa_lab") && (
              <span className="rounded bg-white px-2 py-1">
                Submit to DOA lab
              </span>
            )}
            {result.escalation.options.includes("mardi_officer") && (
              <span className="rounded bg-white px-2 py-1">
                Message MARDI officer
              </span>
            )}
            {result.escalation.options.includes("neighbour_vote") && (
              <span className="rounded bg-white px-2 py-1">
                Anonymous neighbour vote
              </span>
            )}
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm"
      >
        Start a new inspection
      </button>
    </section>
  );
}

// ─── Progress loader ───────────────────────────────────────────

/**
 * Honest-ish progress bar. We can't actually measure how far through the
 * Gemini Vision call we are (it's a single fetch — no streaming chunks
 * exposed by Genkit yet), so we model expected duration with an asymptotic
 * curve: pct = 95 * (1 - exp(-elapsed / TAU)). It rises quickly then slows
 * as it approaches 95%, never touching 100% until the response actually
 * lands and the loader unmounts. That avoids the classic "stuck at 100%
 * for 20 seconds" lie while still giving the farmer real motion to watch.
 *
 * TAU is the characteristic time per step — the photo step (Gemini Vision)
 * takes 8-15s in practice; the others are pure deterministic logic and
 * resolve in well under a second.
 */
const STEP_TAU_MS: Record<LoadingStep, number> = {
  photo: 6000,
  start: 400,
  pattern: 400,
  history: 400,
  test: 400,
  finalise: 800,
};

const STEP_LABELS: Record<LoadingStep, { at: number; text: string }[]> = {
  // Labels are picked by current pct — first one whose `at` ≤ current pct wins
  // (iterating from highest `at` down). Keep them concrete so the farmer
  // knows what the doctor is actually doing right now.
  photo: [
    { at: 0, text: "Compressing your photo…" },
    { at: 12, text: "Sending to the plant doctor…" },
    { at: 28, text: "Looking at the leaves and fruit…" },
    { at: 55, text: "Ruling out alternatives…" },
    { at: 78, text: "Writing the report…" },
    { at: 92, text: "Almost done — being thorough…" },
  ],
  start: [{ at: 0, text: "Starting inspection…" }],
  pattern: [{ at: 0, text: "Updating the differential…" }],
  history: [{ at: 0, text: "Recording your answer…" }],
  test: [{ at: 0, text: "Recording the test result…" }],
  finalise: [
    { at: 0, text: "Putting it all together…" },
    { at: 60, text: "Writing the prescription…" },
  ],
};

function ProgressLoader({ step }: { step: LoadingStep }) {
  const [pct, setPct] = useState(0);
  const tau = STEP_TAU_MS[step];
  const labels = STEP_LABELS[step];

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      // Asymptotic curve approaching 95
      const next = 95 * (1 - Math.exp(-elapsed / tau));
      setPct(next);
    };
    tick(); // first frame immediately so we don't flash 0%
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [step, tau]);

  const currentLabel =
    [...labels].reverse().find((l) => pct >= l.at)?.text ?? labels[0].text;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${currentLabel} ${Math.round(pct)} percent`}
      className="rounded-xl border border-stone-200 bg-white p-3"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-stone-700">{currentLabel}</span>
        <span className="font-mono text-xs text-stone-500">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-100 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
