import Link from "next/link";
import { redirect } from "next/navigation";

import { PaymentStatusBadge } from "@/components/dashboard/payment-status-badge";
import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { toEuro } from "@/lib/payments/calculations";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { confirmCashPaymentReceivedAction } from "./actions";

type StudentRow = {
  id: string;
  run_id: string;
  first_name: string;
  last_name: string;
  class_name: string;
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

type SponsorshipEntry = {
  pledgeId: string;
  runId: string;
  runTitle: string;
  runDate: string;
  studentName: string;
  className: string;
  sponsorName: string;
  amountCents: number;
  status: "pending" | "notified" | "paid";
  paymentMethod: "cash" | "stripe" | null;
  paidAt: string | null;
  expiresAt: string | null;
};

type SearchParams = {
  runId?: string;
  view?: string;
  className?: string;
  status?: string;
  paymentMethod?: string;
};

function formatEuroFromCents(cents: number): string {
  return `${toEuro(cents).toFixed(2)} EUR`;
}

function getView(view: string | undefined): "overview" | "cash" | "list" {
  if (view === "cash" || view === "list") {
    return view;
  }

  return "overview";
}

export default async function DashboardSponsoringPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
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

  const validRunId = resolvedSearchParams.runId && allowedRuns.some((run) => run.id === resolvedSearchParams.runId)
    ? resolvedSearchParams.runId
    : null;
  const visibleRuns = validRunId ? allowedRuns.filter((run) => run.id === validRunId) : allowedRuns;
  const view = getView(resolvedSearchParams.view);

  const runIds = visibleRuns.map((run) => run.id);

  let students: StudentRow[] = [];
  if (runIds.length > 0) {
    const { data, error } = await adminSupabase
      .from("students")
      .select("id, run_id, first_name, last_name, class_name")
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

  const entries: SponsorshipEntry[] = pledges
    .map((pledge) => {
      const student = studentById.get(pledge.student_id);

      if (!student) {
        return null;
      }

      const run = runById.get(student.run_id);
      const paymentLink = paymentLinkByPledgeId.get(pledge.id);

      return {
        pledgeId: pledge.id,
        runId: student.run_id,
        runTitle: run?.title ?? "Unbekannter Lauf",
        runDate: run?.date ?? "",
        studentName: `${student.first_name} ${student.last_name}`,
        className: student.class_name,
        sponsorName: pledge.sponsor_name,
        amountCents: paymentLink?.amount_cents ?? 0,
        status: pledge.status,
        paymentMethod: pledge.payment_method_choice,
        paidAt: paymentLink?.paid_at ?? null,
        expiresAt: paymentLink?.expires_at ?? null,
      };
    })
    .filter((entry): entry is SponsorshipEntry => entry != null)
    .sort((a, b) => new Date(b.runDate).getTime() - new Date(a.runDate).getTime());

  const openCashEntries = entries.filter((entry) => entry.paymentMethod === "cash" && entry.status !== "paid");

  const totalSponsors = entries.length;
  const uniqueStudents = new Set(entries.map((entry) => `${entry.runId}:${entry.studentName}`)).size;
  const pendingCount = entries.filter((entry) => entry.status === "pending").length;
  const notifiedCount = entries.filter((entry) => entry.status === "notified").length;
  const paidCount = entries.filter((entry) => entry.status === "paid").length;

  const expectedTotalCents = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
  const paidTotalCents = entries.reduce((sum, entry) => (entry.status === "paid" ? sum + entry.amountCents : sum), 0);
  const openTotalCents = Math.max(expectedTotalCents - paidTotalCents, 0);

  const classOptions = [...new Set(entries.map((entry) => entry.className).filter(Boolean))].sort((left, right) => left.localeCompare(right));

  const selectedClass = resolvedSearchParams.className && resolvedSearchParams.className !== "all" ? resolvedSearchParams.className : "all";
  const selectedStatus =
    resolvedSearchParams.status && ["pending", "notified", "paid"].includes(resolvedSearchParams.status)
      ? resolvedSearchParams.status
      : "all";
  const selectedPaymentMethod =
    resolvedSearchParams.paymentMethod && ["cash", "stripe"].includes(resolvedSearchParams.paymentMethod)
      ? resolvedSearchParams.paymentMethod
      : "all";

  const filteredEntries = entries.filter((entry) => {
    if (selectedClass !== "all" && entry.className !== selectedClass) {
      return false;
    }

    if (selectedStatus !== "all" && entry.status !== selectedStatus) {
      return false;
    }

    if (selectedPaymentMethod !== "all" && entry.paymentMethod !== selectedPaymentMethod) {
      return false;
    }

    return true;
  });

  const activeRunLabel = validRunId ? allowedRuns.find((run) => run.id === validRunId)?.title ?? "Gewaehlter Event" : "Alle Events";

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Sponsoring</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Uebersicht</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Verwalte offene Barzahlungen, sieh alle Sponsoring-Eintraege und filtere nach Klasse, Status oder Zahlungsart.
          </p>
          <p className="mt-2 text-xs text-zinc-500">Aktiver Filter: {activeRunLabel}</p>
        </header>

        {view === "overview" ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Erwartet</p>
                <p className="mt-2 text-2xl font-bold text-zinc-900">{formatEuroFromCents(expectedTotalCents)}</p>
                <p className="mt-1 text-xs text-zinc-500">Alle Sponsoring-Eintraege</p>
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
                <p className="mt-2 text-2xl font-bold text-zinc-900">
                  {totalSponsors} / {uniqueStudents}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Eintraege insgesamt</p>
              </article>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Schnellzugriff</h2>
                  <p className="mt-1 text-sm text-zinc-600">Spring direkt zu offenen Barzahlungen oder zur vollstaendigen Liste.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/dashboard/sponsoring${validRunId ? `?runId=${validRunId}&view=cash` : "?view=cash"}`} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">
                    Barzahlungen
                  </Link>
                  <Link href={`/dashboard/sponsoring${validRunId ? `?runId=${validRunId}&view=list` : "?view=list"}`} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
                    Liste
                  </Link>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {view === "cash" ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Barzahlungen</p>
                <h2 className="text-lg font-semibold text-zinc-900">Offene Barzahlungen</h2>
                <p className="mt-1 text-sm text-zinc-600">Diese Eintraege sind auf Barzahlung gesetzt und koennen von der Lehrkraft bestaetigt werden.</p>
              </div>
              <p className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{openCashEntries.length} offen</p>
            </div>

            {openCashEntries.length === 0 ? (
              <p className="text-sm text-zinc-600">Aktuell keine offenen Barzahlungen.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.1em] text-zinc-500">
                      <th className="px-2 py-3">Sponsor / Schueler</th>
                      <th className="px-2 py-3">Klasse</th>
                      <th className="px-2 py-3">Event</th>
                      <th className="px-2 py-3">Betrag</th>
                      <th className="px-2 py-3">Status</th>
                      <th className="px-2 py-3">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openCashEntries.map((entry) => (
                      <tr key={entry.pledgeId} className="border-b border-zinc-100 align-top">
                        <td className="px-2 py-3">
                          <p className="font-medium text-zinc-900">{entry.sponsorName}</p>
                          <p className="text-sm text-zinc-600">{entry.studentName}</p>
                        </td>
                        <td className="px-2 py-3 text-zinc-700">{entry.className}</td>
                        <td className="px-2 py-3 text-zinc-700">{entry.runTitle}</td>
                        <td className="px-2 py-3 font-medium text-zinc-900">{formatEuroFromCents(entry.amountCents)}</td>
                        <td className="px-2 py-3 text-xs text-zinc-600">
                          <PaymentStatusBadge status={entry.status} paymentMethod="cash" />
                        </td>
                        <td className="px-2 py-3">
                          <form action={confirmCashPaymentReceivedAction}>
                            <input type="hidden" name="pledgeId" value={entry.pledgeId} />
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
        ) : null}

        {view === "list" ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Liste</p>
                <h2 className="text-lg font-semibold text-zinc-900">Alle Sponsoring-Eintraege</h2>
                <p className="mt-1 text-sm text-zinc-600">Filtere nach Klasse, Status und Zahlungsart.</p>
              </div>
              <p className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">{filteredEntries.length} Treffer</p>
            </div>

            <form method="get" className="mb-5 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 lg:grid-cols-4">
              <input type="hidden" name="view" value="list" />
              {validRunId ? <input type="hidden" name="runId" value={validRunId} /> : null}

              <label className="space-y-1 text-sm text-zinc-700">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Klasse</span>
                <select name="className" defaultValue={selectedClass} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-500">
                  <option value="all">Alle Klassen</option>
                  {classOptions.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-zinc-700">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Status</span>
                <select name="status" defaultValue={selectedStatus} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-500">
                  <option value="all">Alle Stati</option>
                  <option value="pending">Pending</option>
                  <option value="notified">Notified</option>
                  <option value="paid">Paid</option>
                </select>
              </label>

              <label className="space-y-1 text-sm text-zinc-700">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Zahlungsart</span>
                <select name="paymentMethod" defaultValue={selectedPaymentMethod} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-500">
                  <option value="all">Alle</option>
                  <option value="cash">Bar</option>
                  <option value="stripe">Stripe</option>
                </select>
              </label>

              <div className="flex items-end gap-2">
                <button type="submit" className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700">
                  Filtern
                </button>
                <Link
                  href={`/dashboard/sponsoring${validRunId ? `?runId=${validRunId}&view=list` : "?view=list"}`}
                  className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Zuruecksetzen
                </Link>
              </div>
            </form>

            {filteredEntries.length === 0 ? (
              <p className="text-sm text-zinc-600">Keine Sponsoring-Eintraege fuer diese Filter gefunden.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.1em] text-zinc-500">
                      <th className="px-2 py-3">Event</th>
                      <th className="px-2 py-3">Klasse</th>
                      <th className="px-2 py-3">Schueler</th>
                      <th className="px-2 py-3">Sponsor</th>
                      <th className="px-2 py-3">Betrag</th>
                      <th className="px-2 py-3">Zahlung</th>
                      <th className="px-2 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => (
                      <tr key={entry.pledgeId} className="border-b border-zinc-100 align-top">
                        <td className="px-2 py-3">
                          <p className="font-medium text-zinc-900">{entry.runTitle}</p>
                          <p className="text-xs text-zinc-500">{entry.runDate ? new Intl.DateTimeFormat("de-DE").format(new Date(entry.runDate)) : ""}</p>
                        </td>
                        <td className="px-2 py-3 text-zinc-700">{entry.className}</td>
                        <td className="px-2 py-3 text-zinc-700">{entry.studentName}</td>
                        <td className="px-2 py-3">
                          <p className="font-medium text-zinc-900">{entry.sponsorName}</p>
                        </td>
                        <td className="px-2 py-3 font-medium text-zinc-900">{formatEuroFromCents(entry.amountCents)}</td>
                        <td className="px-2 py-3 text-xs text-zinc-600">
                          <PaymentStatusBadge status={entry.status} paymentMethod={entry.paymentMethod} />
                        </td>
                        <td className="px-2 py-3 text-xs text-zinc-600">
                          <PaymentStatusBadge status={entry.status} paymentMethod={entry.paymentMethod} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {view === "overview" ? null : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Wechseln</h2>
                <p className="mt-1 text-sm text-zinc-600">Spring in eine andere Sponsoring-Ansicht.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/dashboard/sponsoring${validRunId ? `?runId=${validRunId}&view=overview` : "?view=overview"}`} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
                  Uebersicht
                </Link>
                <Link href={`/dashboard/sponsoring${validRunId ? `?runId=${validRunId}&view=cash` : "?view=cash"}`} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
                  Barzahlungen
                </Link>
                <Link href={`/dashboard/sponsoring${validRunId ? `?runId=${validRunId}&view=list` : "?view=list"}`} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
                  Liste
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
