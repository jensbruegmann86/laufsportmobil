import { notFound } from "next/navigation";
import { z } from "zod";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { hasRunAccess } from "@/lib/runs/access";
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
    .select("id, title, school_id, created_by, teacher_id")
    .eq("id", runId)
    .maybeSingle();

  if (runError || !run) {
    notFound();
  }

  if (user) {
    const profile = await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });

    if (!profile) {
      notFound();
    }

    const hasAccess = hasRunAccess({ profile, run, userId: user.id });

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

    if (tokenPayload.runId !== runId) {
      notFound();
    }
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-[calc(var(--spacing)*1)]">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Schuelerverwaltung</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">{run.title}</h1>
          <p className="mt-1 text-sm text-zinc-600">Schueler einzeln oder als Bulk erfassen.</p>
        </header>

        <StudentsManagement
          runId={run.id}
          runTitle={run.title}
          initialAccessToken={access}
          showTeacherLink={false}
          showSingleForm={true}
          showPdfSection={false}
          showBulkSection={false}
        />
      </div>
    </main>
  );
}
