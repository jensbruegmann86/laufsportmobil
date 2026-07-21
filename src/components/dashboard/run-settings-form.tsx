"use client";

import { useState, useTransition } from "react";

import { updateRunSettingsAction } from "@/app/actions/runs";

type Props = {
  runId: string;
  initialTitle: string;
  initialDate: string;
  initialTeacherEmail: string;
  canEditTeacherEmail?: boolean;
};

export function RunSettingsForm({ runId, initialTitle, initialDate, initialTeacherEmail, canEditTeacherEmail = true }: Props) {
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

        const formData = new FormData(event.currentTarget);
        const title = String(formData.get("title") ?? "");
        const date = String(formData.get("date") ?? "");
        const teacherEmail = String(formData.get("teacherEmail") ?? "");

        startTransition(async () => {
          const result = await updateRunSettingsAction({ runId, title, date, teacherEmail });

          if (!result.ok) {
            setError(result.error.message);
            return;
          }

          setMessage("Event-Einstellungen gespeichert. Lehrer-Einladung wurde aktualisiert.");
        });
      }}
    >
      <div>
        <label htmlFor="title" className="text-sm font-medium text-zinc-700">Event-Name</label>
        <input
          id="title"
          name="title"
          defaultValue={initialTitle}
          required
          className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label htmlFor="date" className="text-sm font-medium text-zinc-700">Datum</label>
        <input
          id="date"
          name="date"
          type="date"
          defaultValue={initialDate}
          required
          className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label htmlFor="teacherEmail" className="text-sm font-medium text-zinc-700">Lehrer-E-Mail</label>
        <input
          id="teacherEmail"
          name="teacherEmail"
          type="email"
          defaultValue={initialTeacherEmail}
          required
          readOnly={!canEditTeacherEmail}
          className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
        />
        {!canEditTeacherEmail ? (
          <p className="mt-1 text-xs text-zinc-500">Nur Admins koennen die Lehrer-E-Mail aendern.</p>
        ) : null}
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {isPending ? "Speichert ..." : "Einstellungen speichern"}
      </button>
    </form>
  );
}
