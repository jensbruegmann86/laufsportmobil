"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { createRunAction } from "@/app/actions/runs";

export function CreateRunForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createdRunId, setCreatedRunId] = useState<string | null>(null);

  if (createdRunId) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Erfolgreich</p>
        <h2 className="mt-2 text-lg font-semibold">Event angelegt</h2>
        <p className="mt-2">Das Event wurde gespeichert. Im naechsten Schritt kannst du Teilnehmer erfassen.</p>
        <div className="mt-4">
          <Link
            href={`/dashboard/students/new?runId=${createdRunId}`}
            className="inline-flex rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
          >
            Zu den Teilnehmern
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

        const formData = new FormData(event.currentTarget);
        const title = String(formData.get("title") ?? "");
        const date = String(formData.get("date") ?? "");
        const teacherEmail = String(formData.get("teacherEmail") ?? "");
        const lapDistanceRaw = String(formData.get("lapDistanceKm") ?? "");
        const lapDistanceKm = lapDistanceRaw ? Number(lapDistanceRaw) : null;
        const status = String(formData.get("status") ?? "draft") as "draft" | "active" | "completed";

        startTransition(async () => {
          try {
            const result = await createRunAction({ title, date, teacherEmail, lapDistanceKm, status });

            if (!result.ok) {
              setError(result.error.message);
              return;
            }

            setCreatedRunId(result.data.id);
          } catch {
            setError("Event konnte nicht erstellt werden. Bitte Seite neu laden und erneut versuchen.");
          }
        });
      }}
    >
      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">1. Event anlegen</p>
        <input
          id="title"
          name="title"
          required
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-zinc-500"
          placeholder="Event-Titel"
        />
        <input
          id="date"
          name="date"
          type="date"
          required
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-zinc-500"
        />
        <input
          id="teacherEmail"
          name="teacherEmail"
          type="email"
          required
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-zinc-500"
          placeholder="Lehrer-E-Mail"
        />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">2. Streckendaten</p>
        <input
          id="lapDistanceKm"
          name="lapDistanceKm"
          type="number"
          min="0.01"
          step="0.01"
          className="mt-3 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-sm outline-none focus:border-zinc-500"
          placeholder="Km pro Runde, z. B. 0,40"
        />
        <p className="mt-1 text-xs text-zinc-500">Optional. Wenn gesetzt, werden Kilometer aus den gelaufenen Runden automatisch berechnet.</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">3. Status</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { value: "draft", label: "Entwurf", hint: "Vorbereitung" },
            { value: "active", label: "Aktiv", hint: "Laufend" },
            { value: "completed", label: "Abgeschlossen", hint: "Nachbereitung" },
          ].map((item) => (
            <label key={item.value} className="cursor-pointer">
              <input type="radio" name="status" value={item.value} defaultChecked={item.value === "draft"} className="peer sr-only" />
              <span className="block rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm transition peer-checked:border-zinc-900 peer-checked:bg-zinc-900 peer-checked:text-white hover:border-zinc-400">
                <span className="block font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs text-zinc-500 peer-checked:text-zinc-300">{item.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-zinc-900 px-4 py-3.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {isPending ? "Erstelle Event ..." : "Event erstellen"}
      </button>
    </form>
  );
}
