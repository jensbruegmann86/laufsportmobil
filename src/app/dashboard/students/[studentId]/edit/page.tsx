import Link from "next/link";
import { redirect } from "next/navigation";

import { StudentEditForm } from "@/components/dashboard/student-edit-form";
import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type PageParams = {
  studentId: string;
};

type SearchParams = {
  runId?: string;
};

export default async function DashboardStudentEditPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<SearchParams>;
}) {
  const { studentId } = await params;
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

  const { data: allowedRuns, error: runsError } = await getAccessibleRunsForProfile({
    supabase: adminSupabase,
    profile,
    userId: user.id,
  });

  if (runsError) {
    redirect("/dashboard");
  }

  const allowedRunIds = new Set(allowedRuns.map((run) => run.id));

  const { data: student, error: studentError } = await adminSupabase
    .from("students")
    .select("id, class_name, first_name, last_name, run_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student || !allowedRunIds.has(student.run_id)) {
    redirect("/dashboard/students");
  }

  const backParams = new URLSearchParams();
  backParams.set("runId", runId && allowedRunIds.has(runId) ? runId : student.run_id);
  const backHref = `/dashboard/students?${backParams.toString()}`;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Teilnehmer</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Teilnehmer bearbeiten</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Passe Klasse sowie Vor- und Nachnamen an und speichere die Aenderungen.
          </p>
          <Link href={backHref} className="mt-4 inline-flex text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-900">
            Zurueck zur Uebersicht
          </Link>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <StudentEditForm
            studentId={student.id}
            initialClassName={student.class_name}
            initialFirstName={student.first_name}
            initialLastName={student.last_name}
            backHref={backHref}
          />
        </section>
      </div>
    </main>
  );
}
