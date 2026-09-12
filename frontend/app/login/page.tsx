"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginRequest, registerRequest, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await registerRequest(email, password);
      }
      await loginRequest(email, password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-lg font-semibold text-ash-50">Promo Trader</div>
          <div className="mt-1 text-sm text-ash-400">Binance Spot promotional volume, done carefully.</div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 border border-ink-600 bg-ink-800 rounded p-6">
          <div className="flex gap-1 rounded bg-ink-900 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded py-1.5 ${mode === "login" ? "bg-ink-700 text-ash-50" : "text-ash-400"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 rounded py-1.5 ${mode === "register" ? "bg-ink-700 text-ash-50" : "text-ash-400"}`}
            >
              Create account
            </button>
          </div>

          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" />
          </Field>
          <Field label="Password" hint={mode === "register" ? "At least 8 characters" : undefined}>
            <Input type="password" required minLength={8} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </Field>

          {error && <p className="text-sm text-market-down">{error}</p>}

          <Button type="submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
