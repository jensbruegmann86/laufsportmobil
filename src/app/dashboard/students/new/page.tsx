import { redirect } from "next/navigation";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile, hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { StudentsManagement } from "@/app/dashboard/runs/[runId]/students/students-management";

type SearchParams = {
  runId?: string;
};

export default async function NewStudentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Teilnehmer</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Neue Teilnehmer</h1>
          <p className="mt-1 text-sm text-zinc-600">Einzelnen Teilnehmer eintragen oder per CSV importieren.</p>
        </header>

        <StudentsManagement
          runId={selectedRun.id}
          runTitle={selectedRun.title}
          showTeacherLink={false}
          showSingleForm={true}
          showPdfSection={false}
          showBulkSection={false}
        />
      </div>
    </main>
  );
}
