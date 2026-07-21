"use client";

import { useState, useTransition } from "react";

import { bootstrapAdminAction } from "@/app/auth/actions";

export function OnboardingForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        const formData = new FormData(event.currentTarget);
        const schoolName = String(formData.get("schoolName") ?? "");

        startTransition(async () => {
          try {
            const result = await bootstrapAdminAction({ schoolName });

            if (!result.ok) {
              setError(result.message);
              return;
            }

            window.location.assign("/dashboard");
          } catch {
            setError("Onboarding konnte nicht abgeschlossen werden. Bitte Seite neu laden und erneut versuchen.");
          }
        });
      }}
    >
      <div>
        <label htmlFor="schoolName" className="text-sm font-medium text-zinc-700">Name der Schule</label>
        <input
          id="schoolName"
          name="schoolName"
          required
          className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          placeholder="z. B. Grundschule Musterstadt"
        />
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {isPending ? "Wird eingerichtet ..." : "Schule + Admin einrichten"}
      </button>
    </form>
  );
}
