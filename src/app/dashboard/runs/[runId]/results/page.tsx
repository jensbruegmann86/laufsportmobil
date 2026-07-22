import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
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
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });

  if (!profile) {
    redirect("/onboarding");
  }

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, title, date, lap_distance_km, status, created_by, school_id, teacher_id")
    .eq("id", runId)
    .maybeSingle();

  if (runError) {
    console.error("Failed to load run for results page", runError);
    notFound();
  }

  if (!run) {
    redirect("/dashboard/runs");
  }

  const hasAccess = hasRunAccess({ profile, run, userId: user.id });

  if (!hasAccess) {
    redirect("/dashboard/runs");
  }

  const { data: students, error: studentsError } = await adminSupabase
    .from("students")
    .select("id, first_name, last_name, class_name, start_number, run_results(laps_completed)")
    .eq("run_id", runId)
    .order("start_number", { ascending: true, nullsFirst: false })
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
    startNumber: student.start_number,
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
          {run.lap_distance_km ? (
            <p className="mt-2 text-xs text-zinc-500">1 Runde = {new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(run.lap_distance_km)} km</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <LapInputForm runId={run.id} students={studentItems} lapDistanceKm={run.lap_distance_km} />
        </section>
      </div>
    </main>
  );
}
