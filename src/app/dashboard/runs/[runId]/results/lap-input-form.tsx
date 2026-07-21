"use client";

import { useState, useTransition } from "react";

import { saveLapResultsAction } from "@/app/dashboard/runs/[runId]/results/actions";

type StudentItem = {
  id: string;
  firstName: string;
  lastName: string;
  className: string;
  lapsCompleted: number;
};

type LapInputFormProps = {
  runId: string;
  students: StudentItem[];
};

export function LapInputForm({ runId, students }: LapInputFormProps) {
  const [isPending, startTransition] = useTransition();
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      action={(formData) => {
        setResultMessage(null);
        setErrorMessage(null);

        const entries = students.map((student) => {
          const rawValue = formData.get(`laps_${student.id}`);
          const parsedValue = typeof rawValue === "string" ? Number(rawValue) : student.lapsCompleted;

          return {
            studentId: student.id,
            lapsCompleted: Number.isFinite(parsedValue) && parsedValue >= 0 ? Math.floor(parsedValue) : 0,
          };
        });

        startTransition(async () => {
          const result = await saveLapResultsAction({ runId, entries });

          if (!result.ok) {
            setErrorMessage(result.error.message);
            return;
          }

          setResultMessage(
            `Runden gespeichert. ${result.notifications.length} Sponsoren-Benachrichtigungen wurden vorbereitet.`,
          );
        });
      }}
    >
      <div className="space-y-3">
        {students.map((student) => (
          <div key={student.id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="font-semibold text-zinc-900">
              {student.firstName} {student.lastName}
            </p>
            <p className="text-sm text-zinc-600">Klasse {student.className}</p>

            <div className="mt-3">
              <label htmlFor={`laps_${student.id}`} className="text-sm font-medium text-zinc-700">
                Gelaufene Runden
              </label>
              <input
                id={`laps_${student.id}`}
                name={`laps_${student.id}`}
                type="number"
                min={0}
                defaultValue={student.lapsCompleted}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              />
            </div>
          </div>
        ))}
      </div>

      {errorMessage ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}
      {resultMessage ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{resultMessage}</p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
      >
        {isPending ? "Speichert ..." : "Runden speichern und Sponsoren berechnen"}
      </button>
    </form>
  );
}
