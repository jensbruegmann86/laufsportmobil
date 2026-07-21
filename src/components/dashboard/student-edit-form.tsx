"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateStudentAction } from "@/app/actions/students";

type Props = {
  studentId: string;
  initialClassName: string;
  initialFirstName: string;
  initialLastName: string;
  backHref: string;
};

export function StudentEditForm({
  studentId,
  initialClassName,
  initialFirstName,
  initialLastName,
  backHref,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        const formData = new FormData(event.currentTarget);
        const className = String(formData.get("className") ?? "");
        const firstName = String(formData.get("firstName") ?? "");
        const lastName = String(formData.get("lastName") ?? "");

        startTransition(async () => {
          const result = await updateStudentAction({
            studentId,
            className,
            firstName,
            lastName,
          });

          if (!result.ok) {
            setError(result.error.message);
            return;
          }

          router.push(backHref);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="className" className="text-sm font-medium text-zinc-700">Klasse</label>
          <input
            id="className"
            name="className"
            defaultValue={initialClassName}
            required
            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label htmlFor="firstName" className="text-sm font-medium text-zinc-700">Vorname</label>
          <input
            id="firstName"
            name="firstName"
            defaultValue={initialFirstName}
            required
            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label htmlFor="lastName" className="text-sm font-medium text-zinc-700">Nachname</label>
          <input
            id="lastName"
            name="lastName"
            defaultValue={initialLastName}
            required
            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          />
        </div>
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
        >
          {isPending ? "Speichert ..." : "Aenderungen speichern"}
        </button>

        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}
