import { redirect } from "next/navigation";

import { RunSettingsForm } from "@/components/dashboard/run-settings-form";
import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile, hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type SearchParams = {
  runId?: string;
};

export default async function EventSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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

  const { data: runs, error } = await getAccessibleRunsForProfile({
    supabase: adminSupabase,
    profile,
    userId: user.id,
  });

  if (error) {
    redirect("/dashboard");
  }

  const selectedRun = runs.find((run) => run.id === runId) ?? runs[0];

  if (!selectedRun) {
    redirect("/dashboard/runs/new");
  }

  if (!hasRunAccess({ profile, run: selectedRun, userId: user.id })) {
    redirect(`/dashboard?${new URLSearchParams({ runId: runId ?? "" }).toString()}`);
  }

  const { data: invite } = await adminSupabase
    .from("teacher_invites")
    .select("email")
    .eq("run_id", selectedRun.id)
    .maybeSingle();

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Event</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Einstellungen</h1>
          <p className="mt-2 text-sm text-zinc-600">Passe Event-Namen, Datum und die zugeordnete Lehrkraft fuer das ausgewaehlte Event an.</p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <RunSettingsForm
            runId={selectedRun.id}
            initialTitle={selectedRun.title}
            initialDate={selectedRun.date}
            initialTeacherEmail={invite?.email ?? ""}
            initialLapDistanceKm={selectedRun.lap_distance_km}
            canEditTeacherEmail={profile.role === "admin"}
          />
        </section>
      </div>
    </main>
  );
}
