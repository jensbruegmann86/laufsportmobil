import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

export default async function RunsPage() {
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: runs, error } = await supabase
    .from("runs")
    .select("id, title, date, status")
    .order("date", { ascending: false });

  if (error) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Events / Laeufe</h1>
            <p className="text-sm text-zinc-600">Verwalte Event, Schueler, Ergebnisse und Zahlungsprozess.</p>
          </div>
          <Link href="/dashboard/runs/new" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">
            Neues Event
          </Link>
        </header>

        <section className="space-y-3">
          {(runs ?? []).map((run) => (
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
                    href="/dashboard/students"
                    className="rounded-xl border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    QR/Links
                  </Link>
                </div>
              </div>
            </article>
          ))}

          {(runs ?? []).length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
              Noch keine Events angelegt.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
