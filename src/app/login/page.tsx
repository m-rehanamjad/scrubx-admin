"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <form
        className="w-full max-w-md space-y-5 rounded-xl border border-line bg-surface p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = new FormData(e.currentTarget);
          try {
            const result = await authClient.signIn.email({
              email: String(data.get("email")),
              password: String(data.get("password")),
            });
            if (result.error) {
              setError(result.error.message || "Sign in failed.");
              return;
            }
            const session = await authClient.getSession();
            if (
              session.data?.user &&
              "role" in session.data.user &&
              session.data.user.role === "admin"
            )
              window.location.assign("/");
            else {
              await authClient.signOut();
              setError(
                "Administrator access required. Contact your store owner.",
              );
            }
          } catch {
            setError("Unable to sign in. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-2xl font-semibold">ScrubX Admin</h1>
        <p className="text-sm text-ink-muted">
          Sign in with your administrator account. Customer accounts cannot
          access this panel.
        </p>
        <label className="block">
          Email
          <input
            className="mt-1 w-full rounded border p-3"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </label>
        <label className="block">
          Password
          <input
            className="mt-1 w-full rounded border p-3"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="w-full rounded bg-teal-700 p-3 text-white disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
