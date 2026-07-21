"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createRunAction } from "@/app/actions/runs";

export function CreateRunForm() {
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
        const title = String(formData.get("title") ?? "");
        const date = String(formData.get("date") ?? "");
        const status = String(formData.get("status") ?? "draft") as "draft" | "active" | "completed";

        startTransition(async () => {
          const result = await createRunAction({ title, date, status });

          if (!result.ok) {
            setError(result.error.message);
            return;
          }

          router.push(`/dashboard/runs/${result.data.id}/students`);
          router.refresh();
        });
      }}
    >
      <div>
        <label htmlFor="title" className="text-sm font-medium text-zinc-700">Event-Titel</label>
        <input
          id="title"
          name="title"
          required
          className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          placeholder="Sponsorenlauf 2026"
        />
      </div>

      <div>
        <label htmlFor="date" className="text-sm font-medium text-zinc-700">Datum</label>
        <input
          id="date"
          name="date"
          type="date"
          required
          className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label htmlFor="status" className="text-sm font-medium text-zinc-700">Status</label>
        <select
          id="status"
          name="status"
          defaultValue="draft"
          className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {isPending ? "Erstelle Event ..." : "Event erstellen"}
      </button>
    </form>
  );
}
