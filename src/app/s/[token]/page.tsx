import { notFound } from "next/navigation";
import { z } from "zod";

import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { SponsorshipForm } from "./sponsorship-form";

type PageParams = {
  token: string;
};

type StudentPublicData = {
  student_id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  run_title: string;
  run_date: string;
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

export default async function PublicSponsorshipPage({ params }: { params: Promise<PageParams> }) {
  const { token } = await params;

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-emerald-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Sponsorenlauf
          </p>
          <h1 className="text-2xl font-bold text-zinc-900">Jetzt fuer {fullName} sponsoren</h1>
          <div className="mt-4 space-y-1 text-sm text-zinc-700">
            <p>
              <span className="font-semibold">Schueler/in:</span> {fullName}
            </p>
            <p>
              <span className="font-semibold">Klasse:</span> {student.class_name}
            </p>
            <p>
              <span className="font-semibold">Lauf:</span> {student.run_title}
            </p>
            <p>
              <span className="font-semibold">Datum:</span> {formatGermanDate(student.run_date)}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Sponsoring eintragen</h2>
          <SponsorshipForm token={token} />
        </section>
      </div>
    </main>
  );
}
