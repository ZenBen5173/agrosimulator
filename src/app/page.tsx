"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function WelcomePage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    router.push(`/auth/verify?email=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo */}
        <div>
          <h1 className="text-4xl font-bold text-green-800">AgroSimulator</h1>
          <p className="mt-3 text-lg text-green-700">
            Your AI farm advisor, built for Malaysian farmers
          </p>
        </div>

        {/* Email Form */}
        <form onSubmit={handleSendOTP} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-left text-sm font-medium text-gray-700"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              placeholder="farmer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-4 text-lg outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              autoComplete="email"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-400"
          >
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </form>

        {/* Dev-only instant login (bypasses email) */}
        {process.env.NODE_ENV !== "production" && (
          <button
            onClick={async () => {
              const trimmed = email.trim().toLowerCase();
              if (!trimmed || !trimmed.includes("@")) {
                setError("Enter an email first");
                return;
              }
              setLoading(true);
              setError("");
              const res = await fetch("/api/auth/dev-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: trimmed }),
              });
              const data = await res.json();
              setLoading(false);
              if (data.error) {
                setError(data.error);
                return;
              }
              router.push(data.callbackUrl);
            }}
            disabled={loading}
            className="w-full rounded-lg border border-dashed border-gray-400 py-3 text-sm text-gray-500 hover:bg-gray-100"
          >
            Dev: Instant Login (skip email)
          </button>
        )}
      </div>
    </div>
  );
}
