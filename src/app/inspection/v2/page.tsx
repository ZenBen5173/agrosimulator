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
import {
  ArrowLeft,
  Camera,
  Check,
  ImagePlus,
  AlertTriangle,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import type {
  CropName,
  DiagnosisResult,
  DiagnosisSession,
  DifferentialCandidate,
  ExtraPhotoKind,
  ExtraPhotoRequest,
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
  | "result"
  | "wrong_crop"   // photo shows a different plant than the chosen crop
  | "extra_photos" // Layer 2: collecting targeted close-ups
  | "result_duo";  // Layer 2 final result with confidence diff

interface CropMismatch {
  detected: boolean;
  actualPlant: string | null;
  note: string | null;
}

/**
 * Which API step is currently in flight. Drives the progress loader so it
 * shows realistic step-by-step labels and an honest expected duration —
 * "photo" / "extra_photo" are the slow ones (Gemini Vision call, typically
 * 8-15s); the rest are deterministic and return in under a second.
 */
type LoadingStep =
  | "start"
  | "pattern"
  | "photo"
  | "history"
  | "test"
  | "finalise"
  | "layer_two_plan"
  | "extra_photo"
  | "finalise_duo"
  | "reference_verdict";

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
  const [cropMismatch, setCropMismatch] = useState<CropMismatch | null>(null);
  // Layer 2 state — only populated when the farmer chooses "get a clearer
  // answer" from the Layer 1 result page. The Layer 1 result is preserved
  // so the result_duo screen can show the confidence diff.
  const [layerOneResult, setLayerOneResult] = useState<DiagnosisResult | null>(
    null
  );
  const [extraPhotoRequests, setExtraPhotoRequests] = useState<
    ExtraPhotoRequest[]
  >([]);
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

  // When the model flags cropMismatch, we still get back nextHistoryQuestions
  // so the override path can resume the normal flow. Cache them here so the
  // "It IS a chilli" override button can pick up where uploadPhoto would.
  const [pendingNextQuestions, setPendingNextQuestions] = useState<
    HistoryQuestion[]
  >([]);

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
    setPendingNextQuestions(data.nextHistoryQuestions || []);
    // Crop mismatch is a SOFT warning — show the wrong-crop screen first,
    // but the differential is intact in the session and the farmer can
    // override ("It IS a chilli — diagnose anyway") to continue the normal
    // flow. The farmer always knows their crop better than the AI.
    if (data.cropMismatch?.detected) {
      setCropMismatch(data.cropMismatch);
      setStage("wrong_crop");
      return;
    }
    proceedAfterPhoto(data.session, data.nextHistoryQuestions || []);
  }

  /**
   * Continue the normal flow after a photo has been analysed. Extracted so
   * both the regular path and the cropMismatch override path can reuse it.
   */
  async function proceedAfterPhoto(
    s: DiagnosisSession,
    nextQuestions: HistoryQuestion[]
  ) {
    if (nextQuestions.length > 0) {
      setPendingHistoryQuestion(nextQuestions[0]);
      setStage("history");
    } else {
      const test = await getPhysicalTest(s);
      if (test) {
        setPhysicalTest(test);
        setStage("test");
      } else {
        await finalise(s);
      }
    }
  }

  /**
   * Override the cropMismatch warning. The session already has the model's
   * differential probabilities — just dismiss the warning and resume the
   * normal flow with the cached next-questions. No extra API call needed.
   */
  function overrideCropMismatch() {
    if (!session) return;
    setCropMismatch(null);
    proceedAfterPhoto(session, pendingNextQuestions);
  }

  /**
   * Reference-comparison verdict (yes/no on textbook signs). Sends to
   * server which either boosts the candidate (yes) or rules it out and
   * re-ranks (no), then refreshes the result.
   */
  async function submitReferenceVerdict(matches: boolean) {
    if (!session || !result?.diagnosis) return;
    const data = await callApi({
      step: "reference_verdict",
      session,
      referenceDiseaseId: result.diagnosis.diseaseId,
      referenceMatches: matches,
    });
    setSession(data.session);
    setResult(data.result);
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

  // ─── Layer 2: duo-layer diagnosis ───────────────────────────────

  /**
   * Triggered by the "Get a clearer answer" CTA on the Layer 1 result
   * page. Asks the API which extra photos would actually help, snapshots
   * the Layer 1 result (so we can show the diff later), then advances to
   * the extra_photos stage.
   */
  async function startLayerTwo() {
    if (!session || !result) return;
    const data = await callApi({ step: "layer_two_plan", session });
    setLayerOneResult(data.layerOneResult ?? result);
    setExtraPhotoRequests(data.requests ?? []);
    setStage("extra_photos");
  }

  /**
   * Upload one extra Layer-2 photo. Kind is optional — when undefined, the
   * photo goes through as a generic close-up (no kind hint to the model).
   * The request list is left intact (suggestions can be tapped multiple
   * times); the new UI doesn't gate on per-request completion.
   */
  async function uploadExtraPhoto(
    kind: ExtraPhotoKind | undefined,
    file: File
  ) {
    if (!session) return;
    const base64 = await fileToBase64(file);
    const data = await callApi({
      step: "extra_photo",
      session,
      extraPhotoKind: kind,
      photoBase64: base64,
      photoMimeType: file.type,
    });
    setSession(data.session);
  }

  /**
   * Farmer's done with extra photos (could be after 1, 2 or 3). Compute
   * the Layer 2 result with lifted ceilings and show the diff.
   */
  async function finishLayerTwo() {
    if (!session) return;
    const data = await callApi({ step: "finalise_duo", session });
    setResult(data.result);
    setStage("result_duo");
  }

  function reset() {
    setStage("crop");
    setSession(null);
    setObservations([]);
    setPendingHistoryQuestion(null);
    setPendingNextQuestions([]);
    setPhysicalTest(null);
    setResult(null);
    setCropMismatch(null);
    setLayerOneResult(null);
    setExtraPhotoRequests([]);
    setError(null);
  }

  /**
   * Re-take photo only — keep the chosen crop and pattern answer, just go
   * back to the photo picker. The session is preserved so we don't burn an
   * extra API roundtrip on start/pattern.
   */
  function retakePhoto() {
    setObservations([]);
    setCropMismatch(null);
    setStage("photo");
  }

  /**
   * Different crop — full reset back to crop pick. Used when the photo
   * actually shows a different species the farmer wants to inspect properly.
   */
  function changeCrop() {
    reset();
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
          (stage === "history" ||
            stage === "test" ||
            stage === "result" ||
            stage === "extra_photos" ||
            stage === "result_duo") && (
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

        {stage === "wrong_crop" && cropMismatch && (
          <WrongCropStep
            chosenCrop={crop}
            mismatch={cropMismatch}
            onRetake={retakePhoto}
            onChangeCrop={changeCrop}
            onOverride={overrideCropMismatch}
            disabled={loading}
          />
        )}

        {stage === "result" && result && (
          <ResultStep
            result={result}
            session={session ?? undefined}
            onReset={reset}
            onStartLayerTwo={
              shouldOfferLayerTwo(result) ? startLayerTwo : undefined
            }
            onReferenceVerdict={
              session?.referenceVerdict ? undefined : submitReferenceVerdict
            }
          />
        )}

        {stage === "extra_photos" && (
          <ExtraPhotosStep
            requests={extraPhotoRequests}
            onUpload={uploadExtraPhoto}
            onFinish={finishLayerTwo}
            disabled={loading}
          />
        )}

        {stage === "result_duo" && result && (
          <ResultStep
            result={result}
            session={session ?? undefined}
            onReset={reset}
            duoLayer={{ layerOneResult: layerOneResult ?? null }}
          />
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
    { value: "chilli", label: "Pepper / Chilli (lada / cili)" },
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
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  function acceptFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPendingFile(file);
    setQualityWarning(null);
    // Run a quick client-side quality pre-check so the farmer gets
    // feedback BEFORE we burn a Gemini call. We only WARN — we never
    // block; the farmer might genuinely have a dim shot of a real
    // disease, and the model can still make a reasonable call.
    void analyzePhotoQuality(file).then((res) => {
      if (res.warning) setQualityWarning(res.warning);
    });
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setQualityWarning(null);
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
          {qualityWarning && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-medium">Photo quality check: </span>
              {qualityWarning}
              {" "}
              <span className="text-amber-700">
                You can still analyse it — the doctor will tell you if it&apos;s
                too poor to work with.
              </span>
            </div>
          )}
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
  // Free-text answer state. Reset whenever the question changes (so the box
  // doesn't carry text across questions).
  const [freeText, setFreeText] = useState("");
  useEffect(() => {
    setFreeText("");
  }, [question.id]);

  function submitFreeText() {
    const trimmed = freeText.trim();
    if (!trimmed || disabled) return;
    onAnswer(trimmed);
  }

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

      {/* Predefined options — fastest path, one tap. */}
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

      {/* Free-text fallback — for nuance the buttons can't capture.
          The orchestrator runs typed answers through normaliseHistoryAnswer
          (keyword match, BM + English) so the same probability boosts fire
          as if the farmer tapped a button. The full typed text is preserved
          in the historyAnswers log so reasoning stays transparent. */}
      <div className="border-t border-stone-100 pt-3">
        <label className="block text-[11px] uppercase tracking-wide text-stone-400 mb-1.5">
          Or describe in your own words
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitFreeText();
            }}
            disabled={disabled}
            placeholder="e.g. heavy rain Mon-Wed then sun"
            className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus:border-emerald-400 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submitFreeText}
            disabled={disabled || !freeText.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
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

/**
 * Shown when the vision model SUSPECTS the photo isn't actually the chosen
 * crop. This is a SOFT warning — the farmer always knows their crop better
 * than the AI does (lookalike vegetables, disease-distorted plants, etc.
 * fool the model regularly), so we never block them. Three actions:
 *   1. Retake the photo (most common — bad framing)
 *   2. Pick a different crop (they actually grabbed the wrong plant)
 *   3. "It IS a [crop] — diagnose anyway" — override and proceed with the
 *      differential the model produced behind the warning. Costs zero
 *      extra API calls because the analysis is already in the session.
 */
function WrongCropStep({
  chosenCrop,
  mismatch,
  onRetake,
  onChangeCrop,
  onOverride,
  disabled,
}: {
  chosenCrop: CropName;
  mismatch: CropMismatch;
  onRetake: () => void;
  onChangeCrop: () => void;
  onOverride: () => void;
  disabled: boolean;
}) {
  const actual = mismatch.actualPlant?.trim();
  return (
    <section className="space-y-4">
      <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-center gap-2 text-amber-900">
          <AlertTriangle size={18} />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Hmm — this might not be {chosenCrop}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-stone-900">
          {actual
            ? `I think this is a ${actual}, not ${chosenCrop}.`
            : `I'm not sure this is a ${chosenCrop} plant.`}
        </h2>
        {mismatch.note && (
          <p className="text-sm text-stone-700">{mismatch.note}</p>
        )}
        <p className="text-xs text-stone-500">
          Disease can change how a plant looks, and lookalike vegetables fool
          me sometimes. If you&apos;re sure it&apos;s {chosenCrop}, hit
          &quot;diagnose anyway&quot; — you know your crop better than I do.
        </p>
      </div>

      <div className="grid gap-2">
        <button
          onClick={onOverride}
          disabled={disabled}
          className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          It IS a {chosenCrop} — diagnose anyway
        </button>
        <button
          onClick={onRetake}
          disabled={disabled}
          className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-700 hover:border-emerald-400 disabled:opacity-50"
        >
          Retake photo of {chosenCrop}
        </button>
        <button
          onClick={onChangeCrop}
          disabled={disabled}
          className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-500 hover:border-emerald-400 disabled:opacity-50"
        >
          Actually, pick a different crop
        </button>
      </div>
    </section>
  );
}

// ─── MARDI officer case package (#9) ────────────────────────────

import { buildExpertCasePackage } from "@/lib/diagnosis/decisionLogic";

/**
 * One-tap copy of the full BM/English case package to the clipboard, so
 * the farmer can paste into Telegram / SMS / email when reaching out to
 * a MARDI officer for a second opinion. The package includes the photo
 * count, every history answer, the AI's leading diagnosis, ruled-out
 * candidates with reasoning, and what the AI is still uncertain about.
 *
 * Photos themselves are NOT in the clipboard payload (text only) — the
 * follow-up dialog reminds the farmer to attach them separately.
 */
function CasePackageCopyButton({ session }: { session: DiagnosisSession }) {
  const [copied, setCopied] = useState(false);
  const [showAttachReminder, setShowAttachReminder] = useState(false);

  function handleCopy() {
    const payload = buildExpertCasePackage(session);
    navigator.clipboard
      .writeText(payload)
      .then(() => {
        setCopied(true);
        setShowAttachReminder(true);
        window.setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => {
        // Fallback for embedded WebViews where clipboard is restricted
        window.prompt("Copy this case package and send to your MARDI officer:", payload);
        setShowAttachReminder(true);
      });
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleCopy}
        className={`w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          copied
            ? "bg-blue-700 text-white"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {copied ? <Check size={14} /> : <Sparkles size={14} />}
        {copied ? "Copied — paste to MARDI officer" : "Copy case for MARDI officer"}
      </button>
      {showAttachReminder && (
        <p className="text-[11px] text-blue-900">
          Don&apos;t forget to attach the photo
          {(session.extraPhotos?.length ?? 0) > 0
            ? `s (${1 + (session.extraPhotos?.length ?? 0)} total)`
            : ""}{" "}
          when you send the message.
        </p>
      )}
    </div>
  );
}

// ─── Reference comparison card (#1) ─────────────────────────────

import { ruleById } from "@/lib/diagnosis/malaysiaRules";

/**
 * Side-by-side textbook comparison. Pulls the `signsPositive` array from
 * the malaysiaRules table for the leading diagnosis and shows it as a
 * checklist. Farmer taps "yes that matches" or "no that doesn't" — both
 * answers are valuable signal. The orchestrator's applyReferenceVerdict
 * either boosts the candidate (yes) or rules it out and re-ranks (no).
 *
 * For the demo we use TEXT descriptions of the textbook signs (which
 * already live in the rules table). When a real photo asset bundle is
 * available, swap in actual images — the schema below already accepts
 * that path.
 */
function ReferenceComparisonCard({
  diagnosis,
  onVerdict,
}: {
  diagnosis: NonNullable<DiagnosisResult["diagnosis"]>;
  onVerdict: (matches: boolean) => void;
}) {
  const rule = ruleById(diagnosis.diseaseId);
  const [submitted, setSubmitted] = useState<"yes" | "no" | null>(null);

  if (!rule) return null;

  function tap(matches: boolean) {
    setSubmitted(matches ? "yes" : "no");
    onVerdict(matches);
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles size={14} className="mt-0.5 text-emerald-600" />
        <div>
          <h3 className="text-sm font-semibold text-stone-900">
            Compare against textbook {diagnosis.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-stone-500">
            Look at your plant. Do these signs match what you actually see?
            Your answer helps the doctor confirm or reconsider.
          </p>
        </div>
      </div>

      <ul className="space-y-1.5 rounded-lg bg-stone-50 p-3">
        {rule.signsPositive.slice(0, 5).map((sign, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-xs text-stone-700"
          >
            <span className="mt-0.5 text-emerald-600">✓</span>
            <span>{sign}</span>
          </li>
        ))}
      </ul>

      {submitted ? (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            submitted === "yes"
              ? "bg-emerald-50 text-emerald-900"
              : "bg-amber-50 text-amber-900"
          }`}
        >
          {submitted === "yes"
            ? "Confirmed — boosting confidence on this diagnosis."
            : "Noted — ruling this out and re-ranking. Refresh to see the new differential."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => tap(true)}
            className="rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            ✓ Yes, matches
          </button>
          <button
            onClick={() => tap(false)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium text-stone-700 hover:border-amber-400"
          >
            ✗ No, mine looks different
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Layer 2: when to surface the "Get a clearer answer" CTA ───

/**
 * Predicate for showing the Layer 2 CTA on the Layer 1 result page. The
 * gating is conservative: only offer Layer 2 when the answer is genuinely
 * uncertain AND we know what extra photos would help (the orchestrator's
 * `getExtraPhotoRequests` returns ≥1 request for our candidates). For the
 * UI predicate we approximate with confidence < 0.85 — the API call to
 * layer_two_plan will return an empty `requests` array if no targeted
 * photos help, in which case startLayerTwo will surface a placeholder.
 */
function shouldOfferLayerTwo(result: DiagnosisResult): boolean {
  return result.outcome !== "confirmed" || result.confidence < 0.85;
}

// ─── Layer 2 photo upload UI ───────────────────────────────────

/**
 * One uploaded Layer-2 photo, tracked in component state for thumbnails.
 * The actual photos are sent to the server via onUpload and stored in
 * `session.extraPhotos`; this is just for the local thumbnail strip.
 */
interface UploadedExtra {
  id: string;
  previewUrl: string;
  kind?: ExtraPhotoKind; // optional hint if the farmer chose a suggested type
  uploading: boolean;
}

/**
 * Layer 2 UI. Old design forced the farmer to upload into specific labelled
 * slots ("stem cross-section", "stem in water", etc.) which (a) required
 * reading and (b) had a stuck-button bug. New design:
 *   - Single big "Add another photo" upload area
 *   - Uploaded photos appear as a thumbnail strip below
 *   - Suggested photo types live in a collapsible "💡 Tip" panel for users
 *     who DO want to be specific (tap a suggestion to attach a kind hint)
 *   - Big "Show diagnosis" button enabled once any photo is uploaded
 *
 * The suggestions still drive the kind hint sent to Gemini when the farmer
 * picks one — that's how the wilt/virus ceiling lifts in
 * `finaliseDuoLayer` get unlocked. But the default path is friction-free.
 */
function ExtraPhotosStep({
  requests,
  onUpload,
  onFinish,
  disabled,
}: {
  requests: ExtraPhotoRequest[];
  onUpload: (kind: ExtraPhotoKind | undefined, file: File) => void;
  onFinish: () => void;
  disabled: boolean;
}) {
  const [uploaded, setUploaded] = useState<UploadedExtra[]>([]);
  const [pendingKind, setPendingKind] = useState<ExtraPhotoKind | undefined>(
    undefined
  );
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Accept one OR many files (multi-select from gallery, drag-drop, or
   * camera one-at-a-time). Each file becomes its own thumbnail + its own
   * server upload. The pendingKind hint, if set, is applied to ALL files
   * in this batch (one tag per batch, not per file — keeps the UX simple).
   */
  function handleFiles(files: FileList | File[] | null | undefined) {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    const kindForBatch = pendingKind;
    const newOnes: UploadedExtra[] = list.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      previewUrl: URL.createObjectURL(f),
      kind: kindForBatch,
      uploading: true,
    }));
    setUploaded((prev) => [...prev, ...newOnes]);
    // Fire each upload in parallel so the user can keep adding while they run
    list.forEach((f, idx) => {
      onUpload(kindForBatch, f);
      const id = newOnes[idx].id;
      window.setTimeout(() => {
        setUploaded((prev) =>
          prev.map((u) => (u.id === id ? { ...u, uploading: false } : u))
        );
      }, 600);
    });
    setPendingKind(undefined); // suggestion consumed
  }

  /**
   * onChange handler shared by both inputs. CRITICAL: resets the input's
   * value AFTER reading the files, so the next pick — even of the SAME
   * file — fires onChange again. Without this, picking the same filename
   * twice (or re-using the input after a remove) silently does nothing.
   */
  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    handleFiles(files);
    // Defer the reset so React has read the files before we clear the
    // underlying DOM input value.
    e.target.value = "";
  }

  function removeUpload(id: string) {
    setUploaded((prev) => {
      const target = prev.find((u) => u.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((u) => u.id !== id);
    });
    // Note: we don't try to undo the server-side merge — once a photo has
    // been sent, its evidence is folded into the differential. The
    // thumbnail removal is purely visual cleanup.
  }

  const photosUploaded = uploaded.length;
  const canProceed = !disabled && photosUploaded > 0;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2 text-emerald-900">
          <Sparkles size={14} />
          <h2 className="text-sm font-semibold">
            Layer 2 — add more photos for a clearer answer
          </h2>
        </div>
        <p className="mt-1 text-xs text-emerald-800">
          Upload one or more close-ups. A real plant doctor would ask for
          more views to confirm the diagnosis.
        </p>
      </div>

      {/* Hidden inputs. Camera stays single-file (you can only take one
          shot at a time anyway). Gallery is `multiple` so the farmer can
          batch-select 3 close-ups in one trip to the picker. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onInputChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onInputChange}
      />

      {/* Single upload area */}
      <div className="rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 p-5 space-y-3">
        <div className="flex flex-col items-center text-center gap-1.5">
          <ImagePlus size={28} className="text-stone-400" />
          <div className="text-sm font-medium text-stone-700">
            Add another photo
          </div>
          {pendingKind ? (
            // Selected hint — whole chip is click-to-clear (bigger tap target
            // than the tiny × button), with the × also still visible so the
            // intent is obvious.
            <button
              type="button"
              onClick={() => setPendingKind(undefined)}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-200 transition-colors"
              aria-label="Clear tag"
            >
              Tagged as: {labelForKind(pendingKind)}
              <X size={11} />
            </button>
          ) : requests.length > 0 ? (
            <p className="text-[11px] text-stone-400">
              Optional: tap a hint below first to tell the doctor what
              you&apos;re shooting
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled}
            className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Camera size={14} /> Use camera
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={disabled}
            className="flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 hover:border-emerald-400 disabled:opacity-50"
          >
            <ImagePlus size={14} /> From gallery
          </button>
        </div>
      </div>

      {/* Uploaded thumbnails */}
      {uploaded.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-stone-400">
            {uploaded.length} extra photo{uploaded.length === 1 ? "" : "s"} added
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {uploaded.map((u) => (
              <div
                key={u.id}
                className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u.previewUrl}
                  alt="Extra photo"
                  className={`h-full w-full object-cover ${u.uploading ? "opacity-60" : ""}`}
                />
                {u.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-[10px] font-medium text-white">
                    …
                  </div>
                )}
                <button
                  onClick={() => removeUpload(u.id)}
                  className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Remove"
                >
                  <X size={11} />
                </button>
                {u.kind && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[9px] text-white truncate">
                    {labelForKind(u.kind)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible "what would help most" panel — entirely optional.
          Tapping an already-selected suggestion toggles it OFF (no need to
          hunt for the × on the chip). */}
      {requests.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white">
          <button
            onClick={() => setSuggestionsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left"
          >
            <span className="text-xs font-medium text-stone-700">
              💡 Optional hints — what would help most ({requests.length})
            </span>
            <span className="text-xs text-stone-400">
              {suggestionsOpen ? "−" : "+"}
            </span>
          </button>
          {suggestionsOpen && (
            <div className="border-t border-stone-100 p-3 space-y-2">
              <p className="text-[11px] text-stone-500">
                Optional. Tap a hint to tag your next photo with extra
                context for the doctor. Tap again to unselect.
              </p>
              {requests.map((req) => {
                const isSelected = pendingKind === req.kind;
                return (
                  <button
                    key={req.kind}
                    onClick={() => setPendingKind(isSelected ? undefined : req.kind)}
                    disabled={disabled}
                    aria-pressed={isSelected}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-stone-200 bg-white hover:border-emerald-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-stone-900">
                        {req.title}
                      </div>
                      {isSelected && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                          Selected · tap to unselect
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-stone-500">
                      {req.why}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Proceed button */}
      <button
        onClick={onFinish}
        disabled={!canProceed}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {photosUploaded === 0
          ? "Add at least one photo to continue"
          : `Show me the refined diagnosis (${photosUploaded} extra photo${photosUploaded === 1 ? "" : "s"})`}
      </button>
    </section>
  );
}

/**
 * Friendly human label for an ExtraPhotoKind, used in the thumbnail tag
 * and the "tagged as" chip. Mirrors the titles in
 * `getExtraPhotoRequests` so the same vocabulary is used everywhere.
 */
function labelForKind(kind: ExtraPhotoKind): string {
  switch (kind) {
    case "stem_cross_section":
      return "Stem cross-section";
    case "stem_in_water":
      return "Stem in clear water";
    case "new_growth_close_up":
      return "New growth close-up";
    case "fruit_close_up":
      return "Fruit close-up";
    case "fruit_cut_open":
      return "Cut fruit";
    case "leaf_underside":
      return "Leaf underside";
    case "root_close_up":
      return "Roots";
    case "whole_plant_pattern":
      return "Whole plant";
    case "side_by_side_healthy":
      return "Side-by-side healthy";
  }
}

function ResultStep({
  result,
  session,
  onReset,
  onStartLayerTwo,
  duoLayer,
  onReferenceVerdict,
}: {
  result: DiagnosisResult;
  /** Optional: full session, only needed for the "Copy MARDI case" button. */
  session?: DiagnosisSession;
  onReset: () => void;
  /** When set, the Layer 1 result page shows the "Get a clearer answer" CTA. */
  onStartLayerTwo?: () => void;
  /** When set, this result IS Layer 2 — show the confidence diff vs Layer 1. */
  duoLayer?: { layerOneResult: DiagnosisResult | null };
  /** When set, shows the textbook reference card with yes/no buttons. */
  onReferenceVerdict?: (matches: boolean) => void;
}) {
  const outcomeColour =
    result.outcome === "confirmed"
      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
      : result.outcome === "uncertain"
      ? "bg-amber-50 border-amber-300 text-amber-900"
      : "bg-stone-50 border-stone-300 text-stone-700";

  // Duo-layer diff banner — shown only on the result_duo screen, summarises
  // how Layer 2 changed the picture (was 70% wilt → now 88% Verticillium,
  // etc.). Pure presentation; the actual computation happened server-side.
  const layerOne = duoLayer?.layerOneResult ?? null;
  const layerTwoUplift = layerOne
    ? Math.round((result.confidence - layerOne.confidence) * 100)
    : 0;

  return (
    <section className="space-y-4">
      {layerOne && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center gap-2 text-emerald-900">
            <Sparkles size={14} />
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              Layer 2 result
            </span>
          </div>
          <p className="mt-1 text-xs text-emerald-900">
            Was{" "}
            <span className="font-semibold">
              {layerOne.diagnosis?.name ?? "uncertain"}{" "}
              {Math.round(layerOne.confidence * 100)}%
            </span>{" "}
            after the leaf photo. Your extra photos refined this to{" "}
            <span className="font-semibold">
              {result.diagnosis?.name ?? "uncertain"}{" "}
              {Math.round(result.confidence * 100)}%
            </span>
            {layerTwoUplift !== 0 && (
              <>
                {" "}
                ({layerTwoUplift > 0 ? "+" : ""}
                {layerTwoUplift}% confidence).
              </>
            )}
          </p>
        </div>
      )}
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

      {/* Textbook reference card — farmer can verify the AI got it right
          by comparing the photo to the canonical signs. Only shown for
          Layer 1 (where it most matters); Layer 2 already has corroboration. */}
      {onReferenceVerdict && result.diagnosis && (
        <ReferenceComparisonCard
          diagnosis={result.diagnosis}
          onVerdict={onReferenceVerdict}
        />
      )}

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
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <div>
            <h3 className="font-medium text-blue-900">
              Want a human expert to look?
            </h3>
            <p className="mt-1 text-xs text-blue-900">{result.escalation.reason}</p>
          </div>
          {session && (
            <CasePackageCopyButton session={{ ...session, result }} />
          )}
          <div className="flex flex-wrap gap-2 text-[11px] text-blue-900">
            {result.escalation.options.includes("doa_lab") && (
              <span className="rounded bg-white px-2 py-1">
                Or submit to DOA lab
              </span>
            )}
            {result.escalation.options.includes("neighbour_vote") && (
              <span className="rounded bg-white px-2 py-1">
                Or get an anonymous neighbour vote
              </span>
            )}
          </div>
        </div>
      )}

      {/* Layer 2 CTA — only shown on the Layer 1 result page when the
          parent decided we should offer it (uncertain / non-confirmed). */}
      {onStartLayerTwo && (
        <button
          onClick={onStartLayerTwo}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 flex items-center justify-center gap-2"
        >
          <Sparkles size={14} />
          Get a clearer answer (Layer 2)
        </button>
      )}

      {/* Always offer the formal PDF — farmers can show it to the kedai
          for the right chemical, or to a MARDI officer for a second
          opinion. The PDF is 100% generated by code from the session
          data; no extra Gemini call.

          Pass `result` separately so DownloadPdfButton can merge it into
          the session before POSTing. The component-level session state
          doesn't have .result attached (result lives in a sibling state
          slot), so without this merge the PDF API would return
          "no result yet — finalise the diagnosis first" even on the
          result page. */}
      {session && <DownloadPdfButton session={session} result={result} />}

      <button
        onClick={onReset}
        className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm"
      >
        Start a new inspection
      </button>
    </section>
  );
}

/**
 * One-tap "save the diagnosis as a formal PDF report" button. POSTs the
 * session (with result merged in) to /api/diagnosis/v2/pdf, gets back an
 * application/pdf blob, triggers a browser download with the case-
 * reference filename. Loading + error states inline so the farmer
 * never gets a silent failure.
 *
 * The merge step is critical: the React `session` state slot doesn't
 * have `.result` set (result lives in its own state slot, sibling to
 * session). Without merging, the API returns "no result yet" even on
 * a fully-completed result page.
 */
function DownloadPdfButton({
  session,
  result,
}: {
  session: DiagnosisSession;
  result: DiagnosisResult;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadPdf() {
    setBusy(true);
    setError(null);
    try {
      // Merge result into session so the API has everything it needs.
      const sessionForPdf: DiagnosisSession = { ...session, result };
      const res = await fetch("/api/diagnosis/v2/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: sessionForPdf }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `PDF generation failed (HTTP ${res.status})`);
      }
      // Pull the filename from Content-Disposition if present, else fall back
      const dispo = res.headers.get("content-disposition") ?? "";
      const match = dispo.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? "AgroSim-diagnosis.pdf";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={downloadPdf}
        disabled={busy}
        className="w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-800 hover:border-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? (
          <>Generating PDF…</>
        ) : (
          <>📄 Download formal report (PDF)</>
        )}
      </button>
      {error && (
        <p className="text-[11px] text-red-700 text-center">
          Couldn&apos;t generate PDF: {error}
        </p>
      )}
    </div>
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
  layer_two_plan: 600,
  extra_photo: 6000,
  finalise_duo: 800,
  reference_verdict: 400,
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
  layer_two_plan: [
    { at: 0, text: "Working out what extra photos would help…" },
  ],
  extra_photo: [
    { at: 0, text: "Compressing your close-up…" },
    { at: 15, text: "Sending to the plant doctor…" },
    { at: 35, text: "Comparing against the leading candidates…" },
    { at: 65, text: "Updating the differential…" },
    { at: 88, text: "Almost done…" },
  ],
  finalise_duo: [
    { at: 0, text: "Combining the evidence…" },
    { at: 50, text: "Writing the final diagnosis…" },
  ],
  reference_verdict: [
    { at: 0, text: "Recording your verdict…" },
  ],
};

/**
 * Defensive defaults — when a NEW LoadingStep is added but somebody forgets
 * to add it to STEP_TAU_MS / STEP_LABELS (the bug that crashed
 * ProgressLoader before this guard was added). Keeps the loader rendering
 * a generic spinner instead of throwing "labels is not iterable" and
 * white-screening the whole page.
 */
const FALLBACK_TAU_MS = 800;
const FALLBACK_LABELS: { at: number; text: string }[] = [
  { at: 0, text: "Working…" },
];

function ProgressLoader({ step }: { step: LoadingStep }) {
  const [pct, setPct] = useState(0);
  // Fall back gracefully if a new LoadingStep is added without updating
  // STEP_TAU_MS / STEP_LABELS — without this guard, [...undefined].reverse()
  // throws "labels is not iterable" and white-screens the whole page.
  const tau = STEP_TAU_MS[step] ?? FALLBACK_TAU_MS;
  const labels = STEP_LABELS[step] ?? FALLBACK_LABELS;

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

/**
 * Quick client-side photo-quality pre-check. Runs in the browser via the
 * Canvas API — no upload required. Returns a friendly warning string if
 * the photo is likely too dark, too bright, or too blurry to give Gemini
 * a clear shot at the diagnosis.
 *
 * We INTENTIONALLY only WARN, never block. A genuinely poor-light shot of
 * a real disease can still beat a no-diagnosis. The user-facing copy
 * makes the trade-off clear: "you can still analyse, but consider
 * retaking."
 *
 * Heuristics (tuned conservatively to avoid false alarms on legitimate
 * field photos):
 *   - very dark    → mean luminance < 40 (range 0-255)
 *   - very bright  → mean luminance > 220 (overexposed sun reflection)
 *   - very blurry  → Laplacian-style variance < 80 (sharper images
 *                    have variance well above 200 on a 0-255 scale)
 *   - tiny image   → smaller side < 240 px (camera resampling artefact
 *                    or screenshot-of-a-screenshot)
 */
async function analyzePhotoQuality(
  file: File
): Promise<{ warning: string | null }> {
  try {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    URL.revokeObjectURL(url);

    // Downscale to 256px on the long side for fast pixel processing
    const targetLong = 256;
    const scale = targetLong / Math.max(img.width, img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { warning: null };
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const px = imageData.data;

    // Compute luminance (Rec. 709) per pixel + edge variance
    const lum = new Float32Array(w * h);
    let sumLum = 0;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lum[j] = l;
      sumLum += l;
    }
    const meanLum = sumLum / (w * h);

    // Crude Laplacian: 4-neighbour difference (variance is the proxy for
    // sharpness; a blurry image has very low edge content).
    let edgeSum = 0;
    let edgeSqSum = 0;
    let edgeCount = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const e =
          4 * lum[i] -
          lum[i - 1] -
          lum[i + 1] -
          lum[i - w] -
          lum[i + w];
        edgeSum += e;
        edgeSqSum += e * e;
        edgeCount++;
      }
    }
    const edgeMean = edgeSum / edgeCount;
    const edgeVariance =
      edgeSqSum / edgeCount - edgeMean * edgeMean;

    if (Math.min(img.width, img.height) < 240) {
      return {
        warning:
          "Image is small — the doctor may not see fine detail like spore masses or insect bodies.",
      };
    }
    if (meanLum < 40) {
      return {
        warning:
          "Photo looks dark. Bright daylight (open shade) gives the doctor a much better chance.",
      };
    }
    if (meanLum > 220) {
      return {
        warning:
          "Photo looks washed out / overexposed. Try shading the leaf with your hand and re-shoot.",
      };
    }
    if (edgeVariance < 80) {
      return {
        warning:
          "Photo looks blurry. Hold steady, tap to focus on the affected area, and try again.",
      };
    }
    return { warning: null };
  } catch {
    // If anything fails (CORS, decode error), silently skip — we'd rather
    // let the photo through than block on an internal error.
    return { warning: null };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
