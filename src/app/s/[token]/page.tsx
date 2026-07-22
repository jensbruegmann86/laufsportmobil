import { notFound } from "next/navigation";
import { z } from "zod";

import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { SponsorshipForm } from "./sponsorship-form";

type PageParams = {
  token: string;
};

type SearchParams = {
  submitted?: string;
};

type StudentPublicData = {
  student_id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  run_title: string;
  run_date: string;
  start_number?: number | null;
};

const TokenSchema = z.uuid();

function formatGermanDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default async function PublicSponsorshipPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { token } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!TokenSchema.safeParse(token).success) {
    notFound();
  }

  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_student_by_token", {
    p_student_token: token,
  });

  if (error) {
    console.error("Failed to load student by token", error);
    notFound();
  }

  const student = (data?.[0] ?? null) as StudentPublicData | null;

  if (!student) {
    notFound();
  }

  const fullName = `${student.first_name} ${student.last_name}`;
  const submissionConfirmed = resolvedSearchParams?.submitted === "1";

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-emerald-50 p-[calc(var(--spacing)*1)]">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Sponsorenlauf</p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Jetzt fuer {fullName} sponsoren</h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Teilnehmer</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{fullName}</p>
              <p className="mt-1 text-sm text-zinc-600">Klasse {student.class_name}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Event</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{student.run_title}</p>
              <p className="mt-1 text-sm text-zinc-600">{formatGermanDate(student.run_date)}</p>
            </div>
          </div>
        </section>

        {submissionConfirmed ? (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Erfolgreich gespeichert</p>
            <h2 className="mt-2 text-2xl font-bold text-emerald-950">Danke, dein Sponsoring wurde eingetragen.</h2>
            <p className="mt-3 text-sm text-emerald-900">
              Du kannst dieses Fenster jetzt schliessen. Wenn du noch etwas aendern moechtest, oeffne die Seite einfach erneut.
            </p>
          </section>
        ) : (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Sponsoring eintragen</h2>
            <p className="mb-4 text-sm text-zinc-500">Wenige Angaben, klare Auswahl, fertig.</p>
            <SponsorshipForm token={token} />
          </section>
        )}
      </div>
    </main>
  );
}
