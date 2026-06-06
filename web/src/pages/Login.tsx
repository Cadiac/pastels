import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { CredentialsSchema } from "shared";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";

export function Login() {
  const { user, loading, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = CredentialsSchema.safeParse({ username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setBusy(true);
    try {
      await (mode === "login" ? login : register)(parsed.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-stone-50">Oil Pastels</h1>
        <p className="mb-6 text-center text-sm text-stone-300">
          {mode === "login" ? "Sign in to your inventory" : "Create an account"}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-[#f3ebd5] p-5 text-stone-800 shadow-md ring-1 ring-black/5">
          <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              className="rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-base text-stone-900 outline-none focus:border-stone-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-base text-stone-900 outline-none focus:border-stone-500"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy || loading}
            className="mt-1 rounded-lg bg-stone-800 py-2.5 font-semibold text-stone-50 disabled:opacity-50 active:scale-[0.99]"
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Register"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="text-center text-sm text-stone-500 underline-offset-2 hover:underline"
          >
            {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
