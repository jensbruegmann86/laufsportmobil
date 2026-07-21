"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteStudentAction } from "@/app/actions/students";

type Props = {
  studentId: string;
  studentName: string;
  publicLink: string;
  runFilterQuery: string;
};

export function StudentRowActions({ studentId, studentName, publicLink, runFilterQuery }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/dashboard/students/${studentId}/edit${runFilterQuery}`}
          title="Teilnehmer bearbeiten"
          aria-label="Teilnehmer bearbeiten"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
            <path d="M4 20h4l10-10a2 2 0 0 0-4-4L4 16v4z" />
            <path d="M12.5 7.5l4 4" />
          </svg>
        </Link>

        <button
          type="button"
          title="Teilnehmer loeschen"
          aria-label="Teilnehmer loeschen"
          disabled={isPending}
          onClick={() => {
            setError(null);

            const confirmed = window.confirm(`Teilnehmer ${studentName} wirklich loeschen?`);
            if (!confirmed) {
              return;
            }

            startTransition(async () => {
              const result = await deleteStudentAction({ studentId });

              if (!result.ok) {
                setError(result.error.message);
                return;
              }

              router.refresh();
            });
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M7 6l1 14h8l1-14" />
            <path d="M10 10v7" />
            <path d="M14 10v7" />
          </svg>
        </button>

        <Link
          href={publicLink}
          target="_blank"
          rel="noopener noreferrer"
          title="Sponsoring-Link oeffnen"
          aria-label="Sponsoring-Link oeffnen"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
            <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66L11.5 6.8" />
            <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66L12.5 17.2" />
          </svg>
        </Link>
      </div>

      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
