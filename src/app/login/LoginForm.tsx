"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = useMemo(
    () => searchParams.get("redirect") || "/admin/inventory",
    [searchParams]
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-[440px] flex-col items-center">
      {/* ── Hero lockup ── */}
      <div className="mb-10 flex items-center gap-[10px]">
        <svg
          width="64"
          height="64"
          viewBox="0 0 120 120"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="owl-mark-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF6BB8" />
              <stop offset="50%" stopColor="#FF4936" />
              <stop offset="100%" stopColor="#E89512" />
            </linearGradient>
            <mask id="owl-mark-moon">
              <rect width="120" height="120" fill="white" />
              <circle cx="70" cy="56" r="20" fill="black" />
            </mask>
          </defs>
          <circle cx="60" cy="60" r="52" fill="url(#owl-mark-grad)" stroke="#1A0F08" strokeWidth="5" />
          <circle cx="60" cy="60" r="38" fill="#1A0F08" />
          <circle cx="58" cy="60" r="26" fill="#FFF5E4" mask="url(#owl-mark-moon)" />
          <g transform="translate(80 60)">
            <path
              d="M 0,-11 Q 1.65,-1.65 11,0 Q 1.65,1.65 0,11 Q -1.65,1.65 -11,0 Q -1.65,-1.65 0,-11 Z"
              fill="#FFF5E4"
            />
          </g>
        </svg>
        <span
          className="font-grotesk"
          style={{
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1,
            color: "var(--ink)",
            fontSize: "56px",
            display: "inline-flex",
            alignItems: "baseline",
          }}
        >
          Owl
          <em
            className="font-script"
            style={{
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "72px",
              marginLeft: "-4px",
              paddingRight: "18px",
              paddingBottom: "6px",
              display: "inline-block",
              background: "var(--grad-brand)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            Market
          </em>
        </span>
      </div>

      {/* ── Auth card ── */}
      <form
        onSubmit={onSubmit}
        className="w-full rounded-[14px] border-[1.5px] p-9"
        style={{
          backgroundColor: "var(--bg-2)",
          borderColor: "var(--ink)",
        }}
      >
        <p
          className="font-mono-2 text-center"
          style={{
            fontWeight: 600,
            fontSize: "11px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
            marginBottom: "10px",
          }}
        >
          Internal Login
        </p>
        <h1
          className="font-grotesk text-center"
          style={{
            fontWeight: 700,
            fontSize: "26px",
            letterSpacing: "-0.02em",
            color: "var(--ink)",
            lineHeight: 1.1,
            marginBottom: "8px",
          }}
        >
          Sign in to OwlMarket
        </h1>
        <p
          className="font-mono-2 text-center"
          style={{
            fontWeight: 600,
            fontSize: "13px",
            color: "var(--ink-2)",
            marginBottom: "28px",
          }}
        >
          Internal inventory tools access
        </p>

        {/* Email */}
        <label className="block">
          <span
            className="font-mono-2"
            style={{
              display: "block",
              fontWeight: 600,
              fontSize: "11px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              marginBottom: "6px",
            }}
          >
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="font-grotesk w-full outline-none transition-shadow focus:[box-shadow:0_0_0_3px_rgba(255,73,54,0.18)]"
            style={{
              fontWeight: 500,
              fontSize: "16px",
              color: "var(--ink)",
              backgroundColor: "var(--bg-2)",
              border: "1.5px solid var(--ink)",
              borderRadius: "var(--r-sm)",
              padding: "12px 14px",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--coral)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--ink)")}
          />
        </label>

        {/* Password */}
        <label className="mt-4 block">
          <span
            className="font-mono-2"
            style={{
              display: "block",
              fontWeight: 600,
              fontSize: "11px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              marginBottom: "6px",
            }}
          >
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="font-grotesk w-full outline-none transition-shadow focus:[box-shadow:0_0_0_3px_rgba(255,73,54,0.18)]"
            style={{
              fontWeight: 500,
              fontSize: "16px",
              color: "var(--ink)",
              backgroundColor: "var(--bg-2)",
              border: "1.5px solid var(--ink)",
              borderRadius: "var(--r-sm)",
              padding: "12px 14px",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--coral)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--ink)")}
          />
        </label>

        {/* Error */}
        {error && (
          <div
            className="font-mono-2 mt-4"
            style={{
              fontWeight: 500,
              fontSize: "13px",
              color: "var(--loss-2)",
              border: "1.5px solid var(--loss-2)",
              backgroundColor: "rgba(224, 78, 78, 0.08)",
              borderRadius: "var(--r-sm)",
              padding: "10px 14px",
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="font-grotesk mt-6 w-full transition-transform hover:-translate-y-[1px] active:translate-y-0 disabled:cursor-wait disabled:opacity-60"
          style={{
            fontWeight: 700,
            fontSize: "15px",
            color: "var(--bg)",
            background: "var(--grad-brand)",
            border: "none",
            borderRadius: "var(--r-pill)",
            padding: "14px 0",
            letterSpacing: "0.02em",
          }}
        >
          {loading ? "Signing in..." : "Sign in →"}
        </button>
      </form>

      {/* Footer line */}
      <p
        className="font-mono-2 mt-6"
        style={{
          fontWeight: 600,
          fontSize: "11px",
          color: "var(--ink-3)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Need access? Contact ops.
      </p>
    </div>
  );
}
