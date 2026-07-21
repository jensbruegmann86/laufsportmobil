import Link from "next/link";
import { redirect } from "next/navigation";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { toEuro } from "@/lib/payments/calculations";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type SearchParams = {
  runId?: string;
};

type RunRow = {
  id: string;
  title: string;
  date: string;
  status: "draft" | "active" | "completed";
};

type StudentRow = {
  id: string;
  run_id: string;
};

type RunResultRow = {
  student_id: string;
  laps_completed: number;
};

type PledgeRow = {
  id: string;
  student_id: string;
  status: "pending" | "notified" | "paid";
  payment_method_choice: "cash" | "stripe" | null;
};

type PaymentLinkRow = {
  pledge_id: string;
  amount_cents: number;
  paid_at: string | null;
};

type RunProgress = {
  totalStudents: number;
  studentsWithResults: number;
  lapsCompletionPercent: number;
  pledgesTotal: number;
  paidPledges: number;
  cashOpenPledges: number;
  expectedCents: number;
  paidCents: number;
};

function formatEuro(cents: number): string {
  return `${toEuro(cents).toFixed(2)} EUR`;
}

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

  let runs: RunRow[] = [];

  if (profile.role === "admin") {
    const { data, error } = await adminSupabase
      .from("runs")
      .select("id, title, date, status")
      .eq("school_id", profile.school_id)
      .order("date", { ascending: false });

    if (error) {
      redirect("/dashboard");
    }

    runs = (data ?? []) as RunRow[];
  } else if (profile.role === "teacher") {
    const { data, error } = await adminSupabase
      .from("runs")
      .select("id, title, date, status")
      .eq("created_by", user.id)
      .order("date", { ascending: false });

    if (error) {
      redirect("/dashboard");
    }

    runs = (data ?? []) as RunRow[];
  }

  const selectedRunId = runs.some((run) => run.id === runId) ? runId : (runs[0]?.id ?? null);
  const visibleRuns = selectedRunId ? runs.filter((run) => run.id === selectedRunId) : runs;
  const runFilterQuery = selectedRunId ? `?runId=${selectedRunId}` : "";

  const visibleRunIds = visibleRuns.map((run) => run.id);

  let students: StudentRow[] = [];
  if (visibleRunIds.length > 0) {
    const { data, error } = await adminSupabase
      .from("students")
      .select("id, run_id")
      .in("run_id", visibleRunIds);

    if (error) {
      redirect("/dashboard");
    }

    students = (data ?? []) as StudentRow[];
  }

  const studentIds = students.map((student) => student.id);

  let runResults: RunResultRow[] = [];
  if (studentIds.length > 0) {
    const { data, error } = await adminSupabase
      .from("run_results")
      .select("student_id, laps_completed")
      .in("student_id", studentIds);

    if (error) {
      redirect("/dashboard");
    }

    runResults = (data ?? []) as RunResultRow[];
  }

  let pledges: PledgeRow[] = [];
  if (studentIds.length > 0) {
    const { data, error } = await adminSupabase
      .from("pledges")
      .select("id, student_id, status, payment_method_choice")
      .in("student_id", studentIds);

    if (error) {
      redirect("/dashboard");
    }

    pledges = (data ?? []) as PledgeRow[];
  }

  const pledgeIds = pledges.map((pledge) => pledge.id);

  let paymentLinks: PaymentLinkRow[] = [];
  if (pledgeIds.length > 0) {
    const { data, error } = await adminSupabase
      .from("sponsor_payment_links")
      .select("pledge_id, amount_cents, paid_at")
      .in("pledge_id", pledgeIds);

    if (error) {
      redirect("/dashboard");
    }

    paymentLinks = (data ?? []) as PaymentLinkRow[];
  }

  const runIdByStudentId = new Map(students.map((student) => [student.id, student.run_id]));
  const paymentLinkByPledgeId = new Map(paymentLinks.map((link) => [link.pledge_id, link]));

  const progressByRunId = new Map<string, RunProgress>();
  for (const run of visibleRuns) {
    progressByRunId.set(run.id, {
      totalStudents: 0,
      studentsWithResults: 0,
      lapsCompletionPercent: 0,
      pledgesTotal: 0,
      paidPledges: 0,
      cashOpenPledges: 0,
      expectedCents: 0,
      paidCents: 0,
    });
  }

  for (const student of students) {
    const progress = progressByRunId.get(student.run_id);
    if (progress) {
      progress.totalStudents += 1;
    }
  }

  for (const result of runResults) {
    const runIdForStudent = runIdByStudentId.get(result.student_id);
    if (!runIdForStudent) {
      continue;
    }

    const progress = progressByRunId.get(runIdForStudent);
    if (!progress) {
      continue;
    }

    progress.studentsWithResults += 1;
  }

  for (const pledge of pledges) {
    const runIdForStudent = runIdByStudentId.get(pledge.student_id);
    if (!runIdForStudent) {
      continue;
    }

    const progress = progressByRunId.get(runIdForStudent);
    if (!progress) {
      continue;
    }

    progress.pledgesTotal += 1;
    if (pledge.status === "paid") {
      progress.paidPledges += 1;
    }
    if (pledge.payment_method_choice === "cash" && pledge.status !== "paid") {
      progress.cashOpenPledges += 1;
    }

    const link = paymentLinkByPledgeId.get(pledge.id);
    if (link) {
      progress.expectedCents += link.amount_cents;
      if (pledge.status === "paid" || link.paid_at) {
        progress.paidCents += link.amount_cents;
      }
    }
  }

  for (const progress of progressByRunId.values()) {
    progress.lapsCompletionPercent =
      progress.totalStudents > 0
        ? Math.round((progress.studentsWithResults / progress.totalStudents) * 100)
        : 0;
  }

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
                  <a
                    href={`/api/runs/${run.id}/qr-pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    QR-PDF (A4)
                  </a>
                </div>
              </div>

              {(() => {
                const progress = progressByRunId.get(run.id);
                if (!progress) {
                  return null;
                }

                return (
                  <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="grid gap-2 text-xs text-zinc-700 sm:grid-cols-4">
                      <p>Schueler: <span className="font-semibold text-zinc-900">{progress.totalStudents}</span></p>
                      <p>Runden erfasst: <span className="font-semibold text-zinc-900">{progress.studentsWithResults}/{progress.totalStudents}</span></p>
                      <p>Pledges bezahlt: <span className="font-semibold text-zinc-900">{progress.paidPledges}/{progress.pledgesTotal}</span></p>
                      <p>Bar offen: <span className="font-semibold text-zinc-900">{progress.cashOpenPledges}</span></p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                        <span>Event-Fortschritt (Rundeneingabe)</span>
                        <span>{progress.lapsCompletionPercent}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${progress.lapsCompletionPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2 text-xs text-zinc-700 sm:grid-cols-2">
                      <p>Erwartet: <span className="font-semibold text-zinc-900">{formatEuro(progress.expectedCents)}</span></p>
                      <p>Bezahlt: <span className="font-semibold text-emerald-700">{formatEuro(progress.paidCents)}</span></p>
                    </div>
                  </div>
                );
              })()}
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
