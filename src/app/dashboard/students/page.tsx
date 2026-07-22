import Link from "next/link";
import { redirect } from "next/navigation";

import { StudentRowActions } from "@/components/dashboard/student-row-actions";
import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  start_number: number | null;
  token: string;
  run_id: string;
};

type SearchParams = {
  runId?: string;
  className?: string;
};

export default async function DashboardStudentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { runId, className } = await searchParams;
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

  const selectedRunId = allowedRuns.some((run) => run.id === runId) ? runId : (allowedRuns[0]?.id ?? null);
  const visibleRuns = selectedRunId ? allowedRuns.filter((run) => run.id === selectedRunId) : allowedRuns;
  const runIds = [...new Set(visibleRuns.map((run) => run.id))];
  let typedStudents: StudentRow[] = [];

  if (runIds.length > 0) {
    const { data: students, error: studentsError } = await adminSupabase
      .from("students")
      .select("id, first_name, last_name, class_name, start_number, token, run_id")
      .in("run_id", runIds)
      .order("start_number", { ascending: true, nullsFirst: false })
      .order("class_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (studentsError) {
      console.error("Failed to load students for dashboard", studentsError);
      redirect("/dashboard");
    }

    typedStudents = (students ?? []) as StudentRow[];
  }

  const runFilterQuery = selectedRunId ? `?runId=${selectedRunId}` : "";

  const availableClasses = [...new Set(typedStudents.map((student) => student.class_name))].sort((a, b) =>
    a.localeCompare(b, "de", { sensitivity: "base" }),
  );
  const selectedClass = availableClasses.includes(className ?? "") ? (className as string) : null;

  const filteredStudents = selectedClass
    ? typedStudents.filter((student) => student.class_name === selectedClass)
    : typedStudents;

  const baseQuery = new URLSearchParams();
  if (selectedRunId) {
    baseQuery.set("runId", selectedRunId);
  }

  const allClassesQuery = baseQuery.toString();
  const classPdfUrl = selectedRunId
    ? `/api/runs/${selectedRunId}/qr-pdf?${new URLSearchParams({
        groupByClass: "true",
        ...(selectedClass ? { className: selectedClass } : {}),
      }).toString()}`
    : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Dashboard</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Schueler und Sponsoring-Links</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Hier kannst du Teilnehmer bearbeiten, loeschen und den oeffentlichen Sponsoring-Link oeffnen.
          </p>
          {visibleRuns[0] ? (
            <p className="mt-2 text-xs text-zinc-500">
              Aktiver Event-Filter: {visibleRuns[0].title} ({new Intl.DateTimeFormat("de-DE").format(new Date(visibleRuns[0].date))})
            </p>
          ) : null}

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Klassenfilter</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={allClassesQuery ? `/dashboard/students?${allClassesQuery}` : "/dashboard/students"}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  selectedClass
                    ? "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                    : "bg-zinc-900 text-white"
                }`}
              >
                Alle Klassen
              </Link>

              {availableClasses.map((item) => {
                const params = new URLSearchParams(baseQuery.toString());
                params.set("className", item);
                const isActive = selectedClass === item;

                return (
                  <Link
                    key={item}
                    href={`/dashboard/students?${params.toString()}`}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      isActive
                        ? "bg-zinc-900 text-white"
                        : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    Klasse {item}
                  </Link>
                );
              })}
            </div>
          </div>

          {classPdfUrl ? (
            <div className="mt-3">
              <a
                href={classPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                {selectedClass ? `QR-PDF fuer Klasse ${selectedClass}` : "QR-PDF nach Klassen"}
              </a>
            </div>
          ) : null}
        </header>

        {filteredStudents.length === 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            Keine Schueler fuer den aktuellen Klassenfilter vorhanden.
          </section>
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.1em] text-zinc-500">
                    <th className="px-2 py-3">Startnr.</th>
                    <th className="px-2 py-3">Nachname</th>
                    <th className="px-2 py-3">Vorname</th>
                    <th className="px-2 py-3">Gruppe / Klasse</th>
                    <th className="px-2 py-3">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => {
                    const publicLink = `${appUrl}/s/${student.token}`;

                    return (
                      <tr key={student.id} className="border-b border-zinc-100">
                        <td className="px-2 py-3 text-zinc-700">{student.start_number ?? "-"}</td>
                        <td className="px-2 py-3 text-zinc-900">{student.last_name}</td>
                        <td className="px-2 py-3 text-zinc-900">{student.first_name}</td>
                        <td className="px-2 py-3 text-zinc-700">{student.class_name}</td>
                        <td className="px-2 py-3">
                          <StudentRowActions
                            studentId={student.id}
                            studentName={`${student.first_name} ${student.last_name}`}
                            publicLink={publicLink}
                            runFilterQuery={runFilterQuery}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
