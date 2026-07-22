"use client";

import { useState, useTransition } from "react";

import { createTeacherAccessLinkAction } from "@/app/actions/runs";
import { useToast } from "@/components/ui/toast-provider";

type Props = {
  runId: string;
  runTitle: string;
};

export function TeacherAccessCard({ runId, runTitle }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accessUrl, setAccessUrl] = useState<string | null>(null);
  const { pushToast } = useToast();

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Lehrerzugang per Link</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Der Link ist fuer das Modul Teilnehmer gedacht und standardmaessig bis zum Eventende gueltig. Event: {runTitle}
      </p>

      <button
        type="button"
        onClick={() => {
          setError(null);

          startTransition(async () => {
            const result = await createTeacherAccessLinkAction({ runId });

            if (!result.ok) {
              setError(result.error.message);
              pushToast({ tone: "error", title: "Link fehlgeschlagen", message: result.error.message });
              return;
            }

            setAccessUrl(result.data.accessUrl);
            pushToast({ tone: "success", title: "Link erstellt", message: `Lehrer-Link ist fuer ca. ${result.data.expiresInHours} Stunden gueltig.` });
          });
        }}
        disabled={isPending}
        className="mt-4 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {isPending ? "Erzeuge ..." : "Lehrer-Link erstellen"}
      </button>

      {accessUrl ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Zugangslink</p>
          <p className="mt-1 break-all text-sm text-zinc-800">{accessUrl}</p>
        </div>
      ) : null}

      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
