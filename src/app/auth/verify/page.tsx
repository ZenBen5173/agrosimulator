"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const OTP_LENGTH = 8;
const RESEND_COOLDOWN = 30;

function VerifyForm() {
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const supabase = createClient();

  // Redirect if no email param
  useEffect(() => {
    if (!email) router.replace("/");
  }, [email, router]);

  // Resend countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setSubmitted(false);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pasted.length === 0) return;

    const next = [...otp];
    for (let i = 0; i < OTP_LENGTH; i++) {
      next[i] = pasted[i] || "";
    }
    setOtp(next);

    const focusIndex = Math.min(pasted.length, OTP_LENGTH) - 1;
    inputRefs.current[focusIndex]?.focus();
  }

  const handleVerify = useCallback(
    async (code: string) => {
      if (!email || code.length !== OTP_LENGTH) return;

      setError("");
      setLoading(true);

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });

      if (verifyError || !data.session) {
        setLoading(false);
        setError("Invalid code. Please try again.");
        return;
      }

      const user = data.session.user;

      // Ensure profile exists
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!profile) {
        await supabase
          .from("profiles")
          .insert({ id: user.id, phone: user.phone });
      }

      // Check if user has a completed farm
      const { data: farms } = await supabase
        .from("farms")
        .select("id")
        .eq("onboarding_done", true)
        .limit(1);

      if (farms && farms.length > 0) {
        router.replace("/home");
      } else {
        router.replace("/onboarding");
      }
    },
    [email, supabase, router]
  );

  // Auto-submit when all digits filled (only once)
  useEffect(() => {
    const code = otp.join("");
    if (code.length === OTP_LENGTH && !loading && !submitted) {
      setSubmitted(true);
      handleVerify(code);
    }
  }, [otp, loading, submitted, handleVerify]);

  async function handleResend() {
    if (countdown > 0 || !email) return;
    setError("");
    const { error: resendError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (resendError) {
      setError(resendError.message);
    } else {
      setCountdown(RESEND_COOLDOWN);
    }
  }

  if (!email) return null;

  return (
    <div className="w-full max-w-sm space-y-8 text-center">
      <div>
        <h1 className="text-2xl font-bold text-green-800">Enter OTP</h1>
        <p className="mt-2 text-gray-600">
          We sent an 8-digit code to{" "}
          <span className="font-medium">{email}</span>
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleVerify(otp.join(""));
        }}
        className="space-y-6"
      >
        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="h-11 w-9 rounded-lg border border-gray-300 text-center text-lg font-bold outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || otp.join("").length !== OTP_LENGTH}
          className="w-full rounded-lg bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-400"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>

      <div>
        {countdown > 0 ? (
          <p className="text-sm text-gray-500">
            Resend code in {countdown}s
          </p>
        ) : (
          <button
            onClick={handleResend}
            className="text-sm font-medium text-green-700 hover:text-green-800"
          >
            Resend code
          </button>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-green-50 px-4">
      <Suspense
        fallback={
          <p className="text-lg text-green-700">Loading...</p>
        }
      >
        <VerifyForm />
      </Suspense>
    </div>
  );
}
