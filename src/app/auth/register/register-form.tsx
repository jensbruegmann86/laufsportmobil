"use client";

import { useState, useTransition } from "react";

import { registerAction } from "@/app/auth/actions";

export function RegisterForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setMessage(null);

        const form = event.currentTarget;
        const formData = new FormData(form);
        const email = String(formData.get("email") ?? "");
        const password = String(formData.get("password") ?? "");

        startTransition(async () => {
          const result = await registerAction({ email, password });

          if (!result.ok) {
            setError(result.message);
            return;
          }

          setMessage(result.message ?? "Registrierung erfolgreich.");
          form.reset();
        });
      }}
    >
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-zinc-800">E-Mail</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium text-zinc-800">Passwort (min. 8 Zeichen)</label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
        />
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {isPending ? "Registrierung ..." : "Account erstellen"}
      </button>
    </form>
  );
}
