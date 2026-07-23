"use client";

import { useState, useTransition } from "react";

import { updateRunSettingsAction } from "@/app/actions/runs";
import { useToast } from "@/components/ui/toast-provider";

type Props = {
  runId: string;
  initialTitle: string;
  initialDate: string;
  initialTeacherEmail: string;
  initialLapDistanceKm?: number | null;
  canEditTeacherEmail?: boolean;
};

export function RunSettingsForm({ runId, initialTitle, initialDate, initialTeacherEmail, initialLapDistanceKm = null, canEditTeacherEmail = true }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { pushToast } = useToast();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        const formData = new FormData(event.currentTarget);
        const title = String(formData.get("title") ?? "");
        const date = String(formData.get("date") ?? "");
        const teacherEmail = String(formData.get("teacherEmail") ?? "");
        const lapDistanceRaw = String(formData.get("lapDistanceKm") ?? "");
        const lapDistanceKm = lapDistanceRaw ? Number(lapDistanceRaw) : null;

        startTransition(async () => {
          const result = await updateRunSettingsAction({ runId, title, date, teacherEmail, lapDistanceKm });

          if (!result.ok) {
            setError(result.error.message);
            pushToast({ tone: "error", title: "Speichern fehlgeschlagen", message: result.error.message });
            return;
          }

          pushToast({ tone: "success", title: "Gespeichert", message: "Event-Einstellungen wurden aktualisiert." });
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
          className="mt-1 block w-full min-w-0 rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none [appearance:none] focus:border-zinc-500"
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

      <div>
        <label htmlFor="lapDistanceKm" className="text-sm font-medium text-zinc-700">Km pro Runde</label>
        <input
          id="lapDistanceKm"
          name="lapDistanceKm"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={initialLapDistanceKm ?? ""}
          className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          placeholder="z. B. 0.40"
        />
        <p className="mt-1 text-xs text-zinc-500">Damit koennen Kilometer aus den eingetragenen Runden automatisch berechnet werden.</p>
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

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
