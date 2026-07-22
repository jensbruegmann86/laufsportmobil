import { redirect } from "next/navigation";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile, hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { LapInputForm } from "@/app/dashboard/runs/[runId]/results/lap-input-form";

type SearchParams = {
  runId?: string;
};

export default async function ResultsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { runId } = await searchParams;
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

  const { data: runs, error } = await getAccessibleRunsForProfile({ supabase: adminSupabase, profile, userId: user.id });
  if (error) {
    redirect("/dashboard");
  }

  const selectedRun = runs.find((run) => run.id === runId) ?? runs[0];
  if (!selectedRun) {
    redirect("/dashboard/runs/new");
  }

  if (!hasRunAccess({ profile, run: selectedRun, userId: user.id })) {
    redirect("/dashboard");
  }

  const { data: students, error: studentsError } = await adminSupabase
    .from("students")
    .select("id, first_name, last_name, class_name, start_number, run_results(laps_completed)")
    .eq("run_id", selectedRun.id)
    .order("start_number", { ascending: true, nullsFirst: false })
    .order("class_name", { ascending: true })
    .order("last_name", { ascending: true });

  if (studentsError) {
    redirect("/dashboard");
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
    <main className="min-h-screen bg-zinc-100 p-[calc(var(--spacing)*1)]">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Ergebnisse</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Runden eintragen</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Event: {selectedRun.title} ({new Intl.DateTimeFormat("de-DE").format(new Date(selectedRun.date))})
          </p>
          {selectedRun.lap_distance_km ? (
            <p className="mt-2 text-xs text-zinc-500">1 Runde = {new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(selectedRun.lap_distance_km)} km</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <LapInputForm runId={selectedRun.id} students={studentItems} lapDistanceKm={selectedRun.lap_distance_km} />
        </section>
      </div>
    </main>
  );
}
