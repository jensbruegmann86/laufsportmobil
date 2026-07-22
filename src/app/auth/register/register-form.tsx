"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { registerAction } from "@/app/auth/actions";

export function RegisterForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (message) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Fast geschafft</p>
        <h2 className="mt-2 text-lg font-semibold">Registrierung eingetragen</h2>
        <p className="mt-2">{message}</p>
        <p className="mt-2">Bitte E-Mail bestaetigen. Danach kannst du dich einloggen.</p>
        <div className="mt-4">
          <Link href="/auth/login" className="inline-flex rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700">
            Zum Login
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

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
        });
      }}
    >
      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Zugang anlegen</p>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={initialEmail}
          required
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-zinc-500"
          placeholder="E-Mail"
        />
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-zinc-500"
          placeholder="Passwort mit mindestens 8 Zeichen"
        />
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-zinc-900 px-4 py-3.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {isPending ? "Registrierung ..." : "Account erstellen"}
      </button>
    </form>
  );
}
