import Link from "next/link";
import { redirect } from "next/navigation";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type SearchParams = {
  runId?: string;
};

export default async function RunsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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

  let runs: { id: string; title: string; date: string; status: string }[] = [];

  if (profile.role === "admin") {
    const { data, error } = await adminSupabase
      .from("runs")
      .select("id, title, date, status")
      .eq("school_id", profile.school_id)
      .order("date", { ascending: false });

    if (error) {
      redirect("/dashboard");
    }

    runs = data ?? [];
  } else if (profile.role === "teacher") {
    const { data, error } = await adminSupabase
      .from("runs")
      .select("id, title, date, status")
      .eq("created_by", user.id)
      .order("date", { ascending: false });

    if (error) {
      redirect("/dashboard");
    }

    runs = data ?? [];
  }

  const selectedRunId = runs.some((run) => run.id === runId) ? runId : (runs[0]?.id ?? null);
  const visibleRuns = selectedRunId ? runs.filter((run) => run.id === selectedRunId) : runs;
  const runFilterQuery = selectedRunId ? `?runId=${selectedRunId}` : "";

  const activeRuns = visibleRuns.filter((run) => run.status === "active").length;
  const completedRuns = visibleRuns.filter((run) => run.status === "completed").length;
  const draftRuns = visibleRuns.filter((run) => run.status === "draft").length;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Events / Laeufe</h1>
            <p className="text-sm text-zinc-600">Verwalte Event, Schueler, Ergebnisse und Zahlungsprozess.</p>
          </div>
          <Link href={`/dashboard/runs/new${runFilterQuery}`} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">
            Neues Event
          </Link>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Gesamt</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{visibleRuns.length}</p>
          </article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Aktiv</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{activeRuns}</p>
          </article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Abgeschlossen / Entwurf</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{completedRuns} / {draftRuns}</p>
          </article>
        </section>

        <section className="space-y-3">
          {visibleRuns.map((run) => (
            <article key={run.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">{run.title}</h2>
                  <p className="text-sm text-zinc-600">
                    {new Intl.DateTimeFormat("de-DE").format(new Date(run.date))} · Status: {run.status}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Link
                    href={`/dashboard/runs/${run.id}/students`}
                    className="rounded-xl border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    Schueler
                  </Link>
                  <Link
                    href={`/dashboard/runs/${run.id}/results`}
                    className="rounded-xl border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    Runden
                  </Link>
                  <Link
                    href={`/dashboard/students?runId=${run.id}`}
                    className="rounded-xl border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    QR/Links
                  </Link>
                </div>
              </div>
            </article>
          ))}

          {visibleRuns.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
              Kein Event fuer den aktuell ausgewaehlten Filter sichtbar.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
