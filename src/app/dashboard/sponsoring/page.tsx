import Link from "next/link";
import { redirect } from "next/navigation";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { toEuro } from "@/lib/payments/calculations";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { confirmCashPaymentReceivedAction } from "./actions";

type RunRow = {
  id: string;
  title: string;
  date: string;
  status: "draft" | "active" | "completed";
  created_by: string;
  school_id: string;
};

type StudentRow = {
  id: string;
  run_id: string;
  first_name: string;
  last_name: string;
};

type PledgeRow = {
  id: string;
  student_id: string;
  sponsor_name: string;
  status: "pending" | "notified" | "paid";
  payment_method_choice: "cash" | "stripe" | null;
};

type PaymentLinkRow = {
  pledge_id: string;
  amount_cents: number;
  paid_at: string | null;
  expires_at: string;
};

type RunAggregate = {
  run: RunRow;
  pledgeCount: number;
  sponsorCount: number;
  notifiedCount: number;
  paidCount: number;
  pendingCount: number;
  expectedCents: number;
  paidCents: number;
};

type CashOpenRow = {
  pledgeId: string;
  sponsorName: string;
  studentName: string;
  runTitle: string;
  amountCents: number;
  expiresAt: string;
  status: "pending" | "notified" | "paid";
};

type SearchParams = {
  runId?: string;
};

function formatEuroFromCents(cents: number): string {
  return `${toEuro(cents).toFixed(2)} EUR`;
}

export default async function DashboardSponsoringPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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

  const selectedRunId = allowedRuns.some((run) => run.id === runId) ? runId : (allowedRuns[0]?.id ?? null);
  const visibleRuns = selectedRunId ? allowedRuns.filter((run) => run.id === selectedRunId) : allowedRuns;

  const runIds = [...new Set(visibleRuns.map((run) => run.id))];

  let students: StudentRow[] = [];
  if (runIds.length > 0) {
    const { data, error } = await adminSupabase
      .from("students")
      .select("id, run_id, first_name, last_name")
      .in("run_id", runIds);

    if (error) {
      console.error("Failed to load students for sponsoring dashboard", error);
      redirect("/dashboard");
    }

    students = (data ?? []) as StudentRow[];
  }

  const studentIds = students.map((student) => student.id);

  let pledges: PledgeRow[] = [];
  if (studentIds.length > 0) {
    const { data, error } = await adminSupabase
      .from("pledges")
      .select("id, student_id, sponsor_name, status, payment_method_choice")
      .in("student_id", studentIds);

    if (error) {
      console.error("Failed to load pledges for sponsoring dashboard", error);
      redirect("/dashboard");
    }

    pledges = (data ?? []) as PledgeRow[];
  }

  const pledgeIds = pledges.map((pledge) => pledge.id);

  let paymentLinks: PaymentLinkRow[] = [];
  if (pledgeIds.length > 0) {
    const { data, error } = await adminSupabase
      .from("sponsor_payment_links")
      .select("pledge_id, amount_cents, paid_at, expires_at")
      .in("pledge_id", pledgeIds);

    if (error) {
      console.error("Failed to load payment links for sponsoring dashboard", error);
      redirect("/dashboard");
    }

    paymentLinks = (data ?? []) as PaymentLinkRow[];
  }

  const studentById = new Map(students.map((student) => [student.id, student]));
  const runById = new Map(visibleRuns.map((run) => [run.id, run]));
  const paymentLinkByPledgeId = new Map(paymentLinks.map((link) => [link.pledge_id, link]));

  const totalSponsors = pledges.length;
  const uniqueSponsoredStudents = new Set(pledges.map((pledge) => pledge.student_id)).size;
  const notifiedCount = pledges.filter((pledge) => pledge.status === "notified").length;
  const paidCount = pledges.filter((pledge) => pledge.status === "paid").length;
  const pendingCount = pledges.filter((pledge) => pledge.status === "pending").length;

  const expectedTotalCents = paymentLinks.reduce((sum, link) => sum + link.amount_cents, 0);
  const paidTotalCents = pledges.reduce((sum, pledge) => {
    if (pledge.status !== "paid") {
      return sum;
    }

    const link = paymentLinkByPledgeId.get(pledge.id);
    return sum + (link?.amount_cents ?? 0);
  }, 0);

  const openTotalCents = Math.max(expectedTotalCents - paidTotalCents, 0);

  const cashOpenRows: CashOpenRow[] = pledges
    .filter((pledge) => pledge.payment_method_choice === "cash" && pledge.status !== "paid")
    .map((pledge) => {
      const student = studentById.get(pledge.student_id);
      const run = student ? runById.get(student.run_id) : null;
      const link = paymentLinkByPledgeId.get(pledge.id);

      return {
        pledgeId: pledge.id,
        sponsorName: pledge.sponsor_name,
        studentName: student ? `${student.first_name} ${student.last_name}` : "Unbekannter Schueler",
        runTitle: run?.title ?? "Unbekannter Lauf",
        amountCents: link?.amount_cents ?? 0,
        expiresAt: link?.expires_at ?? "",
        status: pledge.status,
      };
    })
    .sort((a, b) => b.amountCents - a.amountCents);

  const runAggregates = new Map<string, RunAggregate>();

  for (const run of visibleRuns) {
    runAggregates.set(run.id, {
      run,
      pledgeCount: 0,
      sponsorCount: 0,
      notifiedCount: 0,
      paidCount: 0,
      pendingCount: 0,
      expectedCents: 0,
      paidCents: 0,
    });
  }

  const sponsorNamesByRunId = new Map<string, Set<string>>();

  for (const pledge of pledges) {
    const student = studentById.get(pledge.student_id);

    if (!student) {
      continue;
    }

    const aggregate = runAggregates.get(student.run_id);

    if (!aggregate) {
      continue;
    }

    aggregate.pledgeCount += 1;

    if (pledge.status === "paid") {
      aggregate.paidCount += 1;
    } else if (pledge.status === "notified") {
      aggregate.notifiedCount += 1;
    } else {
      aggregate.pendingCount += 1;
    }

    const link = paymentLinkByPledgeId.get(pledge.id);
    if (link) {
      aggregate.expectedCents += link.amount_cents;
      if (pledge.status === "paid") {
        aggregate.paidCents += link.amount_cents;
      }
    }

    if (!sponsorNamesByRunId.has(student.run_id)) {
      sponsorNamesByRunId.set(student.run_id, new Set());
    }

    sponsorNamesByRunId.get(student.run_id)?.add(pledge.sponsor_name.toLowerCase());
  }

  for (const [runId, sponsorSet] of sponsorNamesByRunId.entries()) {
    const aggregate = runAggregates.get(runId);
    if (aggregate) {
      aggregate.sponsorCount = sponsorSet.size;
    }
  }

  const aggregateRows = [...runAggregates.values()].sort(
    (a, b) => new Date(b.run.date).getTime() - new Date(a.run.date).getTime(),
  );
  const runFilterQuery = selectedRunId ? `?runId=${selectedRunId}` : "";

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Finanzen</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Sponsoring-Uebersicht</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Hier siehst du erwartete und bezahlte Betraege, offene Zahlungen und den Status der letzten Stripe-Webhooks.
          </p>
          {visibleRuns[0] ? (
            <p className="mt-2 text-xs text-zinc-500">
              Aktiver Event-Filter: {visibleRuns[0].title} ({new Intl.DateTimeFormat("de-DE").format(new Date(visibleRuns[0].date))})
            </p>
          ) : null}
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Erwartet</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{formatEuroFromCents(expectedTotalCents)}</p>
            <p className="mt-1 text-xs text-zinc-500">Aus berechneten Sponsoring-Links</p>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Bezahlt</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{formatEuroFromCents(paidTotalCents)}</p>
            <p className="mt-1 text-xs text-zinc-500">Status paid</p>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Offen</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{formatEuroFromCents(openTotalCents)}</p>
            <p className="mt-1 text-xs text-zinc-500">Noch nicht bezahlt</p>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Sponsoren / Schueler</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{totalSponsors} / {uniqueSponsoredStudents}</p>
            <p className="mt-1 text-xs text-zinc-500">Pledges insgesamt</p>
          </article>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
            <p className="text-zinc-600">Pending</p>
            <p className="text-xl font-bold text-zinc-900">{pendingCount}</p>
          </article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
            <p className="text-zinc-600">Notified</p>
            <p className="text-xl font-bold text-zinc-900">{notifiedCount}</p>
          </article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
            <p className="text-zinc-600">Paid</p>
            <p className="text-xl font-bold text-zinc-900">{paidCount}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Offene Barzahlungen</h2>
            <p className="text-xs text-zinc-500">Nur als cash gewaehlte Pledges</p>
          </div>

          {cashOpenRows.length === 0 ? (
            <p className="text-sm text-zinc-600">Aktuell keine offenen Barzahlungen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.1em] text-zinc-500">
                    <th className="px-2 py-3">Sponsor</th>
                    <th className="px-2 py-3">Schueler</th>
                    <th className="px-2 py-3">Lauf</th>
                    <th className="px-2 py-3">Betrag</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="px-2 py-3">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {cashOpenRows.map((row) => (
                    <tr key={row.pledgeId} className="border-b border-zinc-100">
                      <td className="px-2 py-3 text-zinc-900">{row.sponsorName}</td>
                      <td className="px-2 py-3 text-zinc-800">{row.studentName}</td>
                      <td className="px-2 py-3 text-zinc-800">{row.runTitle}</td>
                      <td className="px-2 py-3 font-medium text-zinc-900">{formatEuroFromCents(row.amountCents)}</td>
                      <td className="px-2 py-3 text-xs text-zinc-600">
                        {row.status}
                        {row.expiresAt ? (
                          <span className="block text-[11px] text-zinc-500">
                            Link bis {new Intl.DateTimeFormat("de-DE").format(new Date(row.expiresAt))}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">
                        <form action={confirmCashPaymentReceivedAction}>
                          <input type="hidden" name="pledgeId" value={row.pledgeId} />
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
                          >
                            Als erhalten markieren
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Pro Event</h2>
            <Link
              href={`/dashboard/runs${runFilterQuery}`}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Zu Events / Rundeneingabe
            </Link>
          </div>

          {aggregateRows.length === 0 ? (
            <p className="text-sm text-zinc-600">Noch keine Events mit Sponsoring-Daten vorhanden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.1em] text-zinc-500">
                    <th className="px-2 py-3">Event</th>
                    <th className="px-2 py-3">Pledges</th>
                    <th className="px-2 py-3">Sponsoren</th>
                    <th className="px-2 py-3">Erwartet</th>
                    <th className="px-2 py-3">Bezahlt</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="px-2 py-3">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregateRows.map((row) => (
                    <tr key={row.run.id} className="border-b border-zinc-100 align-top">
                      <td className="px-2 py-3">
                        <p className="font-medium text-zinc-900">{row.run.title}</p>
                        <p className="text-xs text-zinc-500">
                          {new Intl.DateTimeFormat("de-DE").format(new Date(row.run.date))} · {row.run.status}
                        </p>
                      </td>
                      <td className="px-2 py-3 text-zinc-800">{row.pledgeCount}</td>
                      <td className="px-2 py-3 text-zinc-800">{row.sponsorCount}</td>
                      <td className="px-2 py-3 text-zinc-800">{formatEuroFromCents(row.expectedCents)}</td>
                      <td className="px-2 py-3 text-emerald-700">{formatEuroFromCents(row.paidCents)}</td>
                      <td className="px-2 py-3 text-xs text-zinc-600">
                        {row.pendingCount} pending · {row.notifiedCount} notified · {row.paidCount} paid
                      </td>
                      <td className="px-2 py-3">
                        <Link
                          href={`/dashboard/runs/${row.run.id}/results`}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                        >
                          Runden eingeben
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
