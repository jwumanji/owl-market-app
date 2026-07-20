"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MoonMarketLogo from "@/components/brand/MoonMarketLogo";

export default function LoginForm() {
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

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        email,
        password,
        redirectTo,
      }),
    });
    const payload = await response.json().catch(() => null) as { error?: string; redirectTo?: string } | null;

    setLoading(false);

    if (!response.ok) {
      setError(payload?.error ?? "Sign in failed.");
      return;
    }

    window.location.assign(payload?.redirectTo ?? redirectTo);
  }

  return (
    <div className="flex w-full max-w-[440px] flex-col items-center">
      {/* ── Hero lockup ── */}
      <div className="mb-10">
        <MoonMarketLogo className="h-auto max-w-full" width={387} height={90} priority />
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
          Sign in to Moon Market
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
