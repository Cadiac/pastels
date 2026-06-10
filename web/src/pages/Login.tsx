import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { CredentialsSchema } from "shared";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";
import { RainbowRibbon, RAINBOW_CONIC, RAINBOW_GRADIENT } from "../components/Rainbow";

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
    <div className="relative flex min-h-full items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0">
        <RainbowRibbon />
      </div>
      {/* the whole range as a big, slowly turning wash of pigment behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        {/* 150vmax keeps the circle's rim past the viewport diagonal (~142vmax) at
            any aspect ratio, and the radial mask dissolves the wash towards the
            screen edges so it never reads as a shape. */}
        <div
          style={{
            background: RAINBOW_CONIC,
            maskImage: "radial-gradient(circle, black 15vmax, transparent 55vmax)",
            WebkitMaskImage: "radial-gradient(circle, black 15vmax, transparent 55vmax)",
          }}
          className="h-[150vmax] w-[150vmax] animate-[spin_90s_linear_infinite] rounded-full opacity-40 blur-3xl"
        />
      </div>
      <div className="relative w-full max-w-sm">
        <h1 className="mb-1 text-center font-display text-3xl font-bold text-stone-900">
          Oil Pastels
        </h1>
        <p className="mb-5 text-center text-sm text-stone-500">
          {mode === "login" ? "Sign in to your inventory" : "Create an account"}
        </p>
        <div
          style={{ background: RAINBOW_GRADIENT }}
          className="mx-auto mb-6 h-1.5 w-48 rounded-full"
          aria-hidden
        />

        <form onSubmit={submit} className="flex flex-col gap-3 rounded-card bg-white p-5 text-stone-800 shadow-md ring-1 ring-black/5">
          <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              className="rounded-card border border-stone-300 bg-stone-50 px-3 py-2 text-base text-stone-900 outline-none focus:border-stone-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="rounded-card border border-stone-300 bg-stone-50 px-3 py-2 text-base text-stone-900 outline-none focus:border-stone-500"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy || loading}
            className="mt-1 rounded-card bg-stone-800 py-2.5 font-semibold text-stone-50 disabled:opacity-50 active:scale-[0.99]"
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
