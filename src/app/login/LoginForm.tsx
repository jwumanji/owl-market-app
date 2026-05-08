"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = useMemo(() => searchParams.get("redirect") || "/admin/inventory", [searchParams]);
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
    <form onSubmit={onSubmit} className="mx-auto max-w-md rounded-lg border border-border bg-surface p-6">
      <div className="mb-6">
        <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Internal Login</p>
        <h1 className="text-3xl font-bold tracking-tight text-text">OWL Market</h1>
        <p className="mt-2 text-sm text-text-2">Sign in to access internal inventory tools.</p>
      </div>

      <label className="block">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="mt-2 w-full rounded-md border border-border bg-deep px-4 py-3 text-text outline-none focus:border-owl"
        />
      </label>

      <label className="mt-4 block">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="mt-2 w-full rounded-md border border-border bg-deep px-4 py-3 text-text outline-none focus:border-owl"
        />
      </label>

      {error && <div className="mt-4 rounded-md border border-loss/30 bg-loss/10 p-3 text-sm text-text">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-md bg-owl px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light disabled:cursor-wait disabled:bg-surf3 disabled:text-text-3"
      >
        {loading ? "Signing in..." : "Login"}
      </button>
    </form>
  );
}
