"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function QuestionsPage() {
  const router = useRouter();

  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>(
    []
  );
  const [textInput, setTextInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("analysis_result");
    if (!raw) {
      router.replace("/home");
      return;
    }
    const result = JSON.parse(raw);
    setQuestions(result.what_i_need_to_know || []);
  }, [router]);

  const isYesNo = useCallback((q: string) => {
    const lower = q.toLowerCase();
    return (
      lower.includes("do you") ||
      lower.includes("have you") ||
      lower.includes("is the") ||
      lower.includes("are the") ||
      lower.includes("did you") ||
      lower.includes("can you see") ||
      lower.includes("is there")
    );
  }, []);

  const getMultipleChoice = useCallback((q: string): string[] | null => {
    // Detect "X or Y" patterns
    const orMatch = q.match(/\b(\w+)\s+or\s+(\w+)\b/i);
    if (orMatch) {
      return [orMatch[1], orMatch[2]];
    }
    return null;
  }, []);

  const submitAnswer = useCallback(
    (answer: string) => {
      const newAnswers = [
        ...answers,
        { question: questions[currentQ], answer },
      ];
      setAnswers(newAnswers);
      setTextInput("");

      if (currentQ < questions.length - 1) {
        setCurrentQ((q) => q + 1);
      } else {
        // All questions answered — send to diagnose
        handleDiagnose(newAnswers);
      }
    },
    [answers, currentQ, questions]
  );

  const skipQuestion = useCallback(() => {
    const newAnswers = [
      ...answers,
      { question: questions[currentQ], answer: "Skipped" },
    ];
    setAnswers(newAnswers);

    if (currentQ < questions.length - 1) {
      setCurrentQ((q) => q + 1);
    } else {
      handleDiagnose(newAnswers);
    }
  }, [answers, currentQ, questions]);

  const handleDiagnose = async (
    finalAnswers: { question: string; answer: string }[]
  ) => {
    setSubmitting(true);

    const inspectionData = sessionStorage.getItem("inspection_data");
    if (!inspectionData) {
      router.replace("/home");
      return;
    }

    const data = JSON.parse(inspectionData);

    try {
      const res = await fetch("/api/inspection/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: data.farm_id,
          plot_id: data.plot_id,
          photo_base64s: data.photo_base64s,
          crop_name: data.crop_name,
          farmer_answers: finalAnswers,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        sessionStorage.setItem("diagnosis_result", JSON.stringify(result));
        router.replace("/inspection/result");
      } else {
        setSubmitting(false);
      }
    } catch {
      setSubmitting(false);
    }
  };

  if (submitting) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-green-50">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div className="absolute h-full w-full animate-pulse rounded-full bg-green-100" />
          <span className="relative text-5xl" aria-hidden="true">🌿</span>
        </div>
        <p className="mt-6 text-lg font-medium text-green-800">
          Sending your answers...
        </p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-green-50">
        <p className="text-green-700">Loading questions...</p>
      </div>
    );
  }

  const q = questions[currentQ];
  const yesNo = isYesNo(q);
  const choices = !yesNo ? getMultipleChoice(q) : null;

  return (
    <div className="flex min-h-screen flex-col bg-white px-5 py-6">
      {/* Progress */}
      <div className="mb-2 text-sm text-gray-500">
        Question {currentQ + 1} of {questions.length}
      </div>
      <div
        className="mb-8 flex gap-1"
        role="progressbar"
        aria-valuenow={currentQ + 1}
        aria-valuemin={1}
        aria-valuemax={questions.length}
        aria-label={`Question ${currentQ + 1} of ${questions.length}`}
      >
        {questions.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < currentQ
                ? "bg-green-500"
                : i === currentQ
                  ? "bg-green-300"
                  : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      {/* Question */}
      <div className="mb-8 flex-1">
        <p className="text-xl font-semibold text-gray-900 leading-relaxed">
          {q}
        </p>
      </div>

      {/* Answer options */}
      <div className="space-y-3">
        {yesNo ? (
          <>
            <button
              onClick={() => submitAnswer("Yes")}
              className="w-full rounded-2xl bg-green-50 py-4 text-center text-base font-medium text-green-700 transition-colors hover:bg-green-100"
            >
              Yes
            </button>
            <button
              onClick={() => submitAnswer("No")}
              className="w-full rounded-2xl bg-gray-50 py-4 text-center text-base font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              No
            </button>
          </>
        ) : choices ? (
          <>
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => submitAnswer(c)}
                className="w-full rounded-2xl bg-green-50 py-4 text-center text-base font-medium capitalize text-green-700 transition-colors hover:bg-green-100"
              >
                {c}
              </button>
            ))}
          </>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your answer..."
              aria-label="Your answer"
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-green-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && textInput.trim()) {
                  submitAnswer(textInput.trim());
                }
              }}
            />
            <button
              onClick={() => {
                if (textInput.trim()) submitAnswer(textInput.trim());
              }}
              disabled={!textInput.trim()}
              className="rounded-xl bg-green-600 px-5 py-3 text-sm font-medium text-white disabled:bg-gray-300"
            >
              Send
            </button>
          </div>
        )}

        {/* Skip */}
        <button
          onClick={skipQuestion}
          className="mt-2 w-full py-2 text-center text-xs text-gray-600 underline"
        >
          Skip this question
        </button>
      </div>
    </div>
  );
}
