"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  assignStudentStartNumberAction,
  autoAssignStudentStartNumbersAction,
} from "@/app/actions/students";

type StudentItem = {
  id: string;
  firstName: string;
  lastName: string;
  className: string;
  startNumber: number | null;
};

type Props = {
  runId: string;
  runTitle: string;
  students: StudentItem[];
};

export function StartNumberManagement({ runId, runTitle, students }: Props) {
  const router = useRouter();
  const [isAutoPending, startAutoTransition] = useTransition();
  const [manualPendingId, setManualPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignedCount = students.filter((student) => student.startNumber != null).length;
  const unassignedCount = students.length - assignedCount;
  const highestStartNumber = students.reduce((maxValue, student) => {
    if (student.startNumber == null) {
      return maxValue;
    }

    return Math.max(maxValue, student.startNumber);
  }, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Teilnehmer</p>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900">Startnummern zuordnen</h1>
            <p className="mt-2 text-sm text-zinc-600">Event: {runTitle}</p>
          </div>

          <div className="grid min-w-[240px] gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Teilnehmer</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{students.length}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Zugeordnet</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{assignedCount}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Offen</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{unassignedCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Automatische Vergabe</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Vergibt nur an Teilnehmer ohne Startnummer neue Nummern nach Klassen sortiert, beginnend bei der naechsten freien Nummer.
            </p>
            <p className="mt-2 text-xs text-zinc-500">Aktuell hoechste vergebene Startnummer: {highestStartNumber || "keine"}</p>
          </div>

          <button
            type="button"
            disabled={isAutoPending || students.length === 0}
            onClick={() => {
              setError(null);
              setMessage(null);

              startAutoTransition(async () => {
                const result = await autoAssignStudentStartNumbersAction({ runId });

                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }

                setMessage(
                  result.data.updatedCount > 0
                    ? `${result.data.updatedCount} Teilnehmer haben automatisch Startnummern erhalten.`
                    : "Alle vorhandenen Teilnehmer haben bereits eine Startnummer.",
                );
                router.refresh();
              });
            }}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {isAutoPending ? "Vergabe laeuft ..." : "Fehlende Startnummern automatisch vergeben"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Manuelle Zuordnung</h2>
          <p className="mt-1 text-sm text-zinc-600">Hier kannst du je Teilnehmer eine Startnummer setzen oder aendern.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.1em] text-zinc-500">
                <th className="px-2 py-3">Startnr.</th>
                <th className="px-2 py-3">Nachname</th>
                <th className="px-2 py-3">Vorname</th>
                <th className="px-2 py-3">Klasse</th>
                <th className="px-2 py-3">Speichern</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b border-zinc-100 align-top">
                  <td className="px-2 py-3">
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setError(null);
                        setMessage(null);

                        const formData = new FormData(event.currentTarget);
                        const raw = Number(formData.get("startNumber") ?? 0);

                        setManualPendingId(student.id);

                        void assignStudentStartNumberAction({
                          studentId: student.id,
                          startNumber: raw,
                        }).then((result) => {
                          setManualPendingId(null);

                          if (!result.ok) {
                            setError(result.error.message);
                            return;
                          }

                          setMessage(`Startnummer fuer ${student.firstName} ${student.lastName} gespeichert.`);
                          router.refresh();
                        });
                      }}
                    >
                      <input
                        name="startNumber"
                        type="number"
                        min={1}
                        defaultValue={student.startNumber ?? ""}
                        placeholder="z. B. 12"
                        className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                      />
                      <button
                        type="submit"
                        disabled={manualPendingId === student.id}
                        className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        {manualPendingId === student.id ? "Speichert ..." : "Speichern"}
                      </button>
                    </form>
                  </td>
                  <td className="px-2 py-3 text-zinc-900">{student.lastName}</td>
                  <td className="px-2 py-3 text-zinc-900">{student.firstName}</td>
                  <td className="px-2 py-3 text-zinc-700">{student.className}</td>
                  <td className="px-2 py-3 text-zinc-500">
                    {student.startNumber ? `Aktuell ${student.startNumber}` : "Noch offen"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
