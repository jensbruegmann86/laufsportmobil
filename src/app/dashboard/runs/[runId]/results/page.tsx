import { notFound } from "next/navigation";
import { z } from "zod";

import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { LapInputForm } from "./lap-input-form";

type PageParams = {
  runId: string;
};

const RunIdSchema = z.uuid();

export default async function RunResultsPage({ params }: { params: Promise<PageParams> }) {
  const { runId } = await params;

  if (!RunIdSchema.safeParse(runId).success) {
    notFound();
  }

  const supabase = await createServerComponentSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, title, date, status")
    .eq("id", runId)
    .maybeSingle();

  if (runError) {
    console.error("Failed to load run for results page", runError);
    notFound();
  }

  if (!run) {
    notFound();
  }

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, first_name, last_name, class_name, run_results(laps_completed)")
    .eq("run_id", runId)
    .order("class_name", { ascending: true })
    .order("last_name", { ascending: true });

  if (studentsError) {
    console.error("Failed to load students for run results", studentsError);
    notFound();
  }

  const studentItems = (students ?? []).map((student) => ({
    id: student.id,
    firstName: student.first_name,
    lastName: student.last_name,
    className: student.class_name,
    lapsCompleted: student.run_results?.laps_completed ?? 0,
  }));

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Post-Run</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Runden eintragen</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Lauf: {run.title} ({new Intl.DateTimeFormat("de-DE").format(new Date(run.date))})
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <LapInputForm runId={run.id} students={studentItems} />
        </section>
      </div>
    </main>
  );
}
