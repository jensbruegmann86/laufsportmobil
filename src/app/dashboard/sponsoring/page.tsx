import Link from "next/link";
import { redirect } from "next/navigation";

import { PaymentStatusBadge } from "@/components/dashboard/payment-status-badge";
import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { toCents, toEuro } from "@/lib/payments/calculations";
import { getAccessibleRunsForProfile } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { confirmCashPaymentReceivedAction } from "./actions";

type StudentRow = {
  id: string;
  run_id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  run_results: { laps_completed: number } | { laps_completed: number }[] | null;
};

type PledgeRow = {
  id: string;
  student_id: string;
  sponsor_name: string;
  status: "pending" | "notified" | "paid";
  payment_method_choice: "cash" | "stripe" | null;
  type: "per_lap" | "fixed_amount";
  amount_per_lap: number | null;
  fixed_amount: number | null;
};

type PaymentLinkRow = {
  pledge_id: string;
  amount_cents: number;
  paid_at: string | null;
  expires_at: string;
  stripe_payment_method_type: string | null;
  stripe_card_brand: string | null;
};

type SponsorshipEntry = {
  pledgeId: string;
  runId: string;
  runTitle: string;
  runDate: string;
  studentName: string;
  className: string;
  sponsorName: string;
  pledgeType: "per_lap" | "fixed_amount";
  pledgeValueEuro: number | null;
  pledgeLabel: string;
  finalAmountCents: number | null;
  status: "pending" | "notified" | "paid";
  paymentMethod: "cash" | "stripe" | null;
  paidAt: string | null;
  expiresAt: string | null;
  stripeMethodType: string | null;
  stripeCardBrand: string | null;
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

function formatEuroValue(value: number | null): string {
  if (value == null) {
    return "-";
  }

  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} EUR`;
}

function getView(view: string | undefined): "overview" | "cash" | "list" {
  if (view === "cash" || view === "list") {
    return view;
  }

  return "overview";
}

function getLapsCompleted(value: StudentRow["run_results"]): number | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return typeof value[0]?.laps_completed === "number" ? value[0].laps_completed : null;
  }

  return typeof value.laps_completed === "number" ? value.laps_completed : null;
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
      .select("id, run_id, first_name, last_name, class_name, run_results(laps_completed)")
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
      .select("id, student_id, sponsor_name, status, payment_method_choice, type, amount_per_lap, fixed_amount")
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
      .select("pledge_id, amount_cents, paid_at, expires_at, stripe_payment_method_type, stripe_card_brand")
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
      const lapsCompleted = getLapsCompleted(student.run_results);

      const pledgeValueEuro = pledge.type === "fixed_amount" ? pledge.fixed_amount : pledge.amount_per_lap;
      const pledgeLabel =
        pledge.type === "fixed_amount"
          ? `${formatEuroValue(pledge.fixed_amount)} fest`
          : `${formatEuroValue(pledge.amount_per_lap)} pro Runde`;

      let finalAmountCents: number | null = paymentLink?.amount_cents ?? null;

      if (finalAmountCents == null) {
        if (pledge.type === "fixed_amount" && pledge.fixed_amount != null) {
          finalAmountCents = toCents(pledge.fixed_amount);
        } else if (pledge.type === "per_lap" && pledge.amount_per_lap != null && lapsCompleted != null) {
          finalAmountCents = toCents(pledge.amount_per_lap * lapsCompleted);
        }
      }

      return {
        pledgeId: pledge.id,
        runId: student.run_id,
        runTitle: run?.title ?? "Unbekannter Lauf",
        runDate: run?.date ?? "",
        studentName: `${student.first_name} ${student.last_name}`,
        className: student.class_name,
        sponsorName: pledge.sponsor_name,
        pledgeType: pledge.type,
        pledgeValueEuro,
        pledgeLabel,
        finalAmountCents,
        status: pledge.status,
        paymentMethod: pledge.payment_method_choice,
        paidAt: paymentLink?.paid_at ?? null,
        expiresAt: paymentLink?.expires_at ?? null,
        stripeMethodType: paymentLink?.stripe_payment_method_type ?? null,
        stripeCardBrand: paymentLink?.stripe_card_brand ?? null,
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

  const expectedTotalCents = entries.reduce((sum, entry) => sum + (entry.finalAmountCents ?? 0), 0);
  const paidTotalCents = entries.reduce(
    (sum, entry) => (entry.status === "paid" ? sum + (entry.finalAmountCents ?? 0) : sum),
    0,
  );
  const openTotalCents = Math.max(expectedTotalCents - paidTotalCents, 0);

  const cashPaidCents = entries.reduce(
    (sum, entry) => (entry.status === "paid" && entry.paymentMethod === "cash" ? sum + (entry.finalAmountCents ?? 0) : sum),
    0,
  );

  const stripePaidCents = entries.reduce(
    (sum, entry) => (entry.status === "paid" && entry.paymentMethod === "stripe" ? sum + (entry.finalAmountCents ?? 0) : sum),
    0,
  );

  const stripeBreakdown = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status !== "paid" || entry.paymentMethod !== "stripe") {
      continue;
    }

    const methodLabel = (entry.stripeCardBrand ?? entry.stripeMethodType ?? "Unbekannt").toUpperCase();
    stripeBreakdown.set(methodLabel, (stripeBreakdown.get(methodLabel) ?? 0) + (entry.finalAmountCents ?? 0));
  }

  const highestEntry = entries.reduce<SponsorshipEntry | null>((current, entry) => {
    if (!entry.finalAmountCents) {
      return current;
    }

    if (!current || (entry.finalAmountCents ?? 0) > (current.finalAmountCents ?? 0)) {
      return entry;
    }

    return current;
  }, null);

  const sponsorCountByStudent = new Map<string, { label: string; count: number }>();

  for (const entry of entries) {
    const key = `${entry.runId}:${entry.studentName}`;
    const label = `${entry.studentName} (${entry.className})`;
    const current = sponsorCountByStudent.get(key);
    sponsorCountByStudent.set(key, { label, count: (current?.count ?? 0) + 1 });
  }

  let topStudent: { label: string; count: number } | null = null;
  for (const value of sponsorCountByStudent.values()) {
    if (!topStudent || value.count > topStudent.count) {
      topStudent = value;
    }
  }

  const classOptions = [...new Set(entries.map((entry) => entry.className).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );

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
    <main className="min-h-screen bg-zinc-100 p-[calc(var(--spacing)*1)]">
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

            <section className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-900">Zahlungsarten</h2>
                <div className="mt-3 space-y-2 text-sm">
                  <p className="flex items-center justify-between">
                    <span className="text-zinc-600">Summe Barzahlungen</span>
                    <span className="font-semibold text-zinc-900">{formatEuroFromCents(cashPaidCents)}</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="text-zinc-600">Summe Stripe</span>
                    <span className="font-semibold text-zinc-900">{formatEuroFromCents(stripePaidCents)}</span>
                  </p>
                </div>

                {stripeBreakdown.size > 0 ? (
                  <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Stripe nach Kartenart</p>
                    <div className="mt-2 space-y-1 text-sm">
                      {[...stripeBreakdown.entries()].map(([label, cents]) => (
                        <p key={label} className="flex items-center justify-between">
                          <span className="text-zinc-700">{label}</span>
                          <span className="font-medium text-zinc-900">{formatEuroFromCents(cents)}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-zinc-500">Noch keine Stripe-Zahlungen mit Karteninfos vorhanden.</p>
                )}
              </article>

              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-900">Top-Werte</h2>
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <p className="text-zinc-600">Hoechster Sponsoringbetrag</p>
                    <p className="font-semibold text-zinc-900">
                      {highestEntry?.finalAmountCents ? formatEuroFromCents(highestEntry.finalAmountCents) : "Noch nicht berechnet"}
                    </p>
                    {highestEntry ? <p className="text-xs text-zinc-500">{highestEntry.sponsorName} fuer {highestEntry.studentName}</p> : null}
                  </div>
                  <div>
                    <p className="text-zinc-600">Teilnehmer mit den meisten Sponsoren</p>
                    <p className="font-semibold text-zinc-900">{topStudent ? `${topStudent.label} (${topStudent.count})` : "Keine Daten"}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-center">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Pending</p>
                      <p className="text-lg font-semibold text-zinc-900">{pendingCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Notified</p>
                      <p className="text-lg font-semibold text-zinc-900">{notifiedCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Paid</p>
                      <p className="text-lg font-semibold text-zinc-900">{paidCount}</p>
                    </div>
                  </div>
                </div>
              </article>
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
                      <th className="px-2 py-3">Zusage</th>
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
                        <td className="px-2 py-3 text-zinc-700">{entry.pledgeLabel}</td>
                        <td className="px-2 py-3 font-medium text-zinc-900">
                          {entry.finalAmountCents != null ? formatEuroFromCents(entry.finalAmountCents) : "-"}
                        </td>
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
                      <th className="px-2 py-3">Klasse</th>
                      <th className="px-2 py-3">Schueler</th>
                      <th className="px-2 py-3">Sponsor</th>
                      <th className="px-2 py-3">Zusage</th>
                      <th className="px-2 py-3">Betrag</th>
                      <th className="px-2 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => (
                      <tr key={entry.pledgeId} className="border-b border-zinc-100 align-top">
                        <td className="px-2 py-3 text-zinc-700">{entry.className}</td>
                        <td className="px-2 py-3 text-zinc-700">{entry.studentName}</td>
                        <td className="px-2 py-3">
                          <p className="font-medium text-zinc-900">{entry.sponsorName}</p>
                        </td>
                        <td className="px-2 py-3 text-zinc-700">{entry.pledgeLabel}</td>
                        <td className="px-2 py-3 font-medium text-zinc-900">
                          {entry.finalAmountCents != null ? formatEuroFromCents(entry.finalAmountCents) : "Noch offen"}
                        </td>
                        <td className="px-2 py-3 text-xs text-zinc-600">
                          <PaymentStatusBadge status={entry.status} paymentMethod={entry.paymentMethod} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
