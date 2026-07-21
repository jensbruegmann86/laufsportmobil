import { notFound } from "next/navigation";
import { z } from "zod";

import { verifyTeacherRunAccessToken } from "@/lib/security/teacher-run-access-token";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { StudentsManagement } from "./students-management";

type PageParams = {
  runId: string;
};

type SearchParams = {
  access?: string;
};

const RunIdSchema = z.uuid();

export default async function RunStudentsManagementPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<SearchParams>;
}) {
  const { runId } = await params;
  const { access } = await searchParams;

  if (!RunIdSchema.safeParse(runId).success) {
    notFound();
  }

  const supabase = await createServerComponentSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, title, school_id, created_by")
    .eq("id", runId)
    .maybeSingle();

  if (runError || !run) {
    notFound();
  }

  if (user) {
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("role, school_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      notFound();
    }

    const hasAccess =
      (profile.role === "admin" && profile.school_id === run.school_id) ||
      (profile.role === "teacher" && run.created_by === user.id);

    if (!hasAccess) {
      notFound();
    }
  } else {
    if (!access) {
      notFound();
    }

    let tokenPayload: ReturnType<typeof verifyTeacherRunAccessToken>;

    try {
      tokenPayload = verifyTeacherRunAccessToken(access);
    } catch {
      notFound();
    }

    if (tokenPayload.runId !== runId || tokenPayload.teacherId !== run.created_by) {
      notFound();
    }
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Schuelerverwaltung</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">{run.title}</h1>
          <p className="mt-1 text-sm text-zinc-600">Schueler einzeln oder als Bulk erfassen.</p>
        </header>

        <StudentsManagement runId={run.id} runTitle={run.title} initialAccessToken={access} />
      </div>
    </main>
  );
}
