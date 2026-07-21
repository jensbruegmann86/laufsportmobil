import Link from "next/link";
import { redirect } from "next/navigation";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  token: string;
  run_id: string;
};

type RunRow = {
  id: string;
  title: string;
  date: string;
  status: "draft" | "active" | "completed";
};

type SearchParams = {
  runId?: string;
};

export default async function DashboardStudentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { runId } = await searchParams;
  const supabase = await createServerComponentSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    redirect("/onboarding");
  }

  let allowedRuns: RunRow[] = [];

  if (profile.role === "admin") {
    const { data: runs, error: runsError } = await adminSupabase
      .from("runs")
      .select("id, title, date, status")
      .eq("school_id", profile.school_id)
      .order("date", { ascending: false });

    if (runsError) {
      console.error("Failed to load school runs for dashboard students", runsError);
      redirect("/dashboard");
    }

    allowedRuns = (runs ?? []) as RunRow[];
  } else if (profile.role === "teacher") {
    const { data: runs, error: runsError } = await adminSupabase
      .from("runs")
      .select("id, title, date, status")
      .eq("created_by", user.id)
      .order("date", { ascending: false });

    if (runsError) {
      console.error("Failed to load teacher runs for dashboard students", runsError);
      redirect("/dashboard");
    }

    allowedRuns = (runs ?? []) as RunRow[];
  }

  const selectedRunId = allowedRuns.some((run) => run.id === runId) ? runId : (allowedRuns[0]?.id ?? null);
  const visibleRuns = selectedRunId ? allowedRuns.filter((run) => run.id === selectedRunId) : allowedRuns;
  const runIds = [...new Set(visibleRuns.map((run) => run.id))];
  let typedStudents: StudentRow[] = [];

  if (runIds.length > 0) {
    const { data: students, error: studentsError } = await adminSupabase
      .from("students")
      .select("id, first_name, last_name, class_name, token, run_id")
      .in("run_id", runIds)
      .order("class_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (studentsError) {
      console.error("Failed to load students for dashboard", studentsError);
      redirect("/dashboard");
    }

    typedStudents = (students ?? []) as StudentRow[];
  }

  const runsById = new Map(visibleRuns.map((run) => [run.id, run]));
  const runFilterQuery = selectedRunId ? `?runId=${selectedRunId}` : "";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Dashboard</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Schueler und Sponsoring-Links</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Hier kannst du fuer jeden Schueler den oeffentlichen Sponsoring-Link aufrufen oder den QR-Code
            herunterladen und teilen.
          </p>
          {visibleRuns[0] ? (
            <p className="mt-2 text-xs text-zinc-500">
              Aktiver Event-Filter: {visibleRuns[0].title} ({new Intl.DateTimeFormat("de-DE").format(new Date(visibleRuns[0].date))})
            </p>
          ) : null}
        </header>

        {typedStudents.length === 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            Noch keine Schueler vorhanden.
          </section>
        ) : (
          <section className="space-y-4">
            {typedStudents.map((student) => {
              const run = runsById.get(student.run_id);
              const studentName = `${student.first_name} ${student.last_name}`;
              const publicLink = `${appUrl}/s/${student.token}`;

              return (
                <article
                  key={student.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900">{studentName}</h2>
                      <p className="text-sm text-zinc-600">Klasse {student.class_name}</p>
                      {run ? (
                        <p className="mt-1 text-sm text-zinc-600">
                          {run.title} ({new Intl.DateTimeFormat("de-DE").format(new Date(run.date))})
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
                      <Link
                        href={publicLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
                      >
                        Sponsoring-Link
                      </Link>
                      <Link
                        href={`/dashboard/students/${student.id}/qr${runFilterQuery}`}
                        className="rounded-xl bg-zinc-900 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-zinc-700"
                      >
                        QR anzeigen
                      </Link>
                      <Link
                        href={publicLink}
                        className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-center text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                      >
                        Teilen
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
