"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { loginAction } from "@/app/auth/actions";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
          const result = await loginAction({ email, password });
          if (!result.ok) {
            setError(result.message);
            return;
          }

          router.push("/dashboard");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Zugang</p>
        <input
          id="email"
          name="email"
          type="email"
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
          placeholder="Passwort"
        />
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-zinc-900 px-4 py-3.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {isPending ? "Anmeldung ..." : "Einloggen"}
      </button>
    </form>
  );
}
