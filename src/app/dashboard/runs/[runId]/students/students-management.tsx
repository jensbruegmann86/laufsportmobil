"use client";

import { useState, useTransition } from "react";

import { addStudentToRunAction, addStudentsToRunAction } from "@/app/actions/students";
import { createTeacherAccessLinkAction } from "@/app/actions/runs";

type Props = {
  runId: string;
  runTitle: string;
  initialAccessToken?: string;
};

export function StudentsManagement({ runId, runTitle, initialAccessToken }: Props) {
  const [isPendingSingle, startSingle] = useTransition();
  const [isPendingBulk, startBulk] = useTransition();
  const [isPendingLink, startLink] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessUrl, setAccessUrl] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Lehrerzugang per Link</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Erzeugt einen sicheren Link fuer Lehrkraefte ohne Login. Lauf: {runTitle}
        </p>

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);

            const formData = new FormData(event.currentTarget);
            const expiresInHours = Number(formData.get("expiresInHours") ?? "24");

            startLink(async () => {
              try {
                const result = await createTeacherAccessLinkAction({ runId, expiresInHours });

                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }

                setAccessUrl(result.data.accessUrl);
                setMessage(`Lehrer-Link erstellt (gueltig fuer ${result.data.expiresInHours}h).`);
              } catch {
                setError("Lehrer-Link konnte nicht erstellt werden.");
              }
            });
          }}
        >
          <div>
            <label htmlFor="expiresInHours" className="text-sm font-medium text-zinc-700">Gueltigkeit (Stunden)</label>
            <input
              id="expiresInHours"
              name="expiresInHours"
              type="number"
              min={1}
              max={168}
              defaultValue={24}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
            />
          </div>
          <button
            type="submit"
            disabled={isPendingLink}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {isPendingLink ? "Erzeuge ..." : "Lehrer-Link erstellen"}
          </button>
        </form>

        {accessUrl ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Zugangslink</p>
            <p className="mt-1 break-all text-sm text-zinc-800">{accessUrl}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Einzelnen Schueler eintragen</h2>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);

            const formData = new FormData(event.currentTarget);
            const className = String(formData.get("className") ?? "");
            const firstName = String(formData.get("firstName") ?? "");
            const lastName = String(formData.get("lastName") ?? "");
            const accessToken = String(formData.get("accessToken") ?? initialAccessToken ?? "") || undefined;

            startSingle(async () => {
              try {
                const result = await addStudentToRunAction({
                  runId,
                  accessToken,
                  student: { className, firstName, lastName },
                });

                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }

                setMessage(`Schueler gespeichert (${result.data.createdCount}).`);
                event.currentTarget.reset();
              } catch {
                setError("Schueler konnte nicht gespeichert werden.");
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="className" placeholder="Klasse" required className="rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500" />
            <input name="firstName" placeholder="Vorname" required className="rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500" />
            <input name="lastName" placeholder="Nachname" required className="rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500" />
          </div>
          <input
            name="accessToken"
            placeholder="Optional: Lehrer-Link Token"
            defaultValue={initialAccessToken ?? ""}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={isPendingSingle}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {isPendingSingle ? "Speichert ..." : "Schueler speichern"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Bulk-Eingabe</h2>
        <p className="mt-1 text-sm text-zinc-600">Format je Zeile: Klasse;Vorname;Nachname</p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);

            const formData = new FormData(event.currentTarget);
            const raw = String(formData.get("bulkInput") ?? "");
            const accessToken = String(formData.get("accessToken") ?? initialAccessToken ?? "") || undefined;

            const students = raw
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [className = "", firstName = "", lastName = ""] = line.split(";").map((part) => part.trim());
                return { className, firstName, lastName };
              });

            startBulk(async () => {
              try {
                const result = await addStudentsToRunAction({ runId, accessToken, students });

                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }

                setMessage(`Bulk gespeichert (${result.data.createdCount} Schueler).`);
              } catch {
                setError("Bulk-Import konnte nicht gespeichert werden.");
              }
            });
          }}
        >
          <textarea
            name="bulkInput"
            rows={8}
            required
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
            placeholder="5a;Anna;Mueller\n5a;Ben;Schmidt"
          />
          <input
            name="accessToken"
            placeholder="Optional: Lehrer-Link Token"
            defaultValue={initialAccessToken ?? ""}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={isPendingBulk}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {isPendingBulk ? "Speichert ..." : "Bulk speichern"}
          </button>
        </form>
      </section>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
