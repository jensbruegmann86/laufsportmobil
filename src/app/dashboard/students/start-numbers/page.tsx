import { redirect } from "next/navigation";

import { StartNumberManagement } from "@/components/dashboard/start-number-management";
import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile, hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type SearchParams = {
  runId?: string;
};

export default async function StudentStartNumbersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
    redirect("/dashboard");
  }

  const { data: students, error: studentsError } = await adminSupabase
    .from("students")
    .select("id, first_name, last_name, class_name, start_number")
    .eq("run_id", selectedRun.id)
    .order("class_name", { ascending: true })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (studentsError) {
    redirect("/dashboard");
  }

  const items = (students ?? []).map((student) => ({
    id: student.id,
    firstName: student.first_name,
    lastName: student.last_name,
    className: student.class_name,
    startNumber: student.start_number,
  }));

  return (
    <main className="min-h-screen bg-zinc-100 p-[calc(var(--spacing)*1)]">
      <div className="mx-auto w-full max-w-6xl">
        <StartNumberManagement runId={selectedRun.id} runTitle={selectedRun.title} students={items} />
      </div>
    </main>
  );
}
