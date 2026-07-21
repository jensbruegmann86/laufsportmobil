import { redirect } from "next/navigation";

import { TeacherAccessCard } from "@/components/dashboard/teacher-access-card";
import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type SearchParams = {
  runId?: string;
};

export default async function EventTeacherAccessPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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

  if (profile.role !== "admin") {
    redirect(`/dashboard?${new URLSearchParams({ runId: runId ?? "" }).toString()}`);
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

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Event</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Lehrerzugang per Link</h1>
          <p className="mt-2 text-sm text-zinc-600">Dieser Link oeffnet nur das Modul Teilnehmer fuer das aktuell ausgewaehlte Event.</p>
        </header>

        <TeacherAccessCard runId={selectedRun.id} runTitle={selectedRun.title} />
      </div>
    </main>
  );
}
